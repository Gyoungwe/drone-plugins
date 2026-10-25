import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const suiteRoot = resolve("node_modules/@gyoungwe/research-suite");
const extension = join(
	suiteRoot,
	"node_modules/@gyoungwe/pi-research/dist/index.mjs",
);
const require = createRequire(extension);
// Resolve exactly as the installed bundled extension does, never from the source tree.
const { createCanvas } = require("@napi-rs/canvas");
const { default: register } = await import(pathToFileURL(extension));
const tools = new Map();
register({ registerTool: (tool) => tools.set(tool.name, tool) });

const stream = "BT /F1 18 Tf 25 100 Td (Drone PDF acceptance) Tj ET";
const objects = [
	"<< /Type /Catalog /Pages 2 0 R >>",
	"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
	"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
	"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
];
let pdf = "%PDF-1.4\n";
const offsets = [0];
for (const [i, object] of objects.entries()) {
	offsets.push(Buffer.byteLength(pdf));
	pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
for (const offset of offsets.slice(1))
	pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const cwd = resolve("workspace");
await mkdir(cwd);
const file = join(cwd, "source.pdf");
await writeFile(file, pdf);
const ctx = { cwd, sessionId: "packed-suite-pdf" };
const invoke = (name, params) =>
	tools
		.get(name)
		.execute(name, params, new AbortController().signal, () => {}, ctx);
const search = await invoke("research_search_sources", {
	query: "acceptance",
	source_dir: ".",
});
assert.equal(search.details.count, 1);
const read = await invoke("research_read_source", {
	source_id: search.details.hits[0].source_id,
});
assert.match(read.details.content, /Drone PDF acceptance/);
assert.equal(read.details.read_receipt.page_start, 1);
assert.equal(read.details.read_receipt.page_end, 1);
const pdfPath = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
const { getDocument } = await import(pathToFileURL(pdfPath));
const loading = getDocument({
	data: new Uint8Array(await readFile(file)),
	disableFontFace: true,
	standardFontDataUrl: join(
		dirname(require.resolve("pdfjs-dist/package.json")),
		"standard_fonts/",
	),
});
const document = await loading.promise;
try {
	const page = await document.getPage(1);
	const viewport = page.getViewport({ scale: 1 });
	const canvas = createCanvas(viewport.width, viewport.height);
	const context = canvas.getContext("2d");
	await page.render({ canvas: null, canvasContext: context, viewport }).promise;
	const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
	let marked = 0;
	for (let i = 0; i < pixels.length; i += 4)
		if (pixels[i] < 240 && pixels[i + 3] > 0) marked++;
	assert(marked > 100, "PDF render must contain visible text pixels");
	console.log(
		JSON.stringify({
			status: "PASS",
			scope:
				"installed suite PDF text/page receipt and native Canvas rendering",
			page: 1,
			markedPixels: marked,
		}),
	);
} finally {
	await loading.destroy();
}
