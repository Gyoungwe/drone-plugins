import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";

interface PdfDocument {
	numPages: number;
	getPage(page: number): Promise<{ getTextContent(): Promise<{ items: { str?: string }[] }> }>;
	destroy?(): Promise<void>;
}

interface PdfModule {
	getDocument(options: {
		data: Uint8Array;
		standardFontDataUrl: string;
		isEvalSupported: boolean;
		useSystemFonts: boolean;
		disableFontFace: boolean;
		useWorkerFetch: boolean;
		stopAtErrors: boolean;
	}): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
}

try {
	let modulePath: string;
	try {
		modulePath = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs");
	} catch {
		const { resourcesPath } = process as NodeJS.Process & { resourcesPath?: string };
		modulePath = createRequire(join(resourcesPath || "", "app.asar/package.json")).resolve(
			"pdfjs-dist/legacy/build/pdf.mjs",
		);
	}
	const { getDocument }: PdfModule = await import(pathToFileURL(modulePath).href);
	const standardFontDataUrl = `${pathToFileURL(join(dirname(modulePath), "../../standard_fonts")).href}/`;
	const data: { bytes: Uint8Array; maxPages?: number } = workerData;
	const loading = getDocument({
		data: new Uint8Array(data.bytes),
		standardFontDataUrl,
		isEvalSupported: false,
		useSystemFonts: false,
		disableFontFace: true,
		useWorkerFetch: false,
		stopAtErrors: true,
	});
	const doc = await loading.promise;
	let text = "";
	const totalPages = doc.numPages;
	const requestedPages = Number.isInteger(data.maxPages) ? Math.max(1, Number(data.maxPages)) : 3;
	const pages = Math.min(totalPages, requestedPages);
	for (let page = 1; page <= pages; page++) {
		const content = await (await doc.getPage(page)).getTextContent();
		const pageText = content.items
			.map((item) => item.str || "")
			.join(" ")
			.slice(0, 3e4);
		text += `[[page:${page}]]
${pageText}
`;
	}
	await (typeof doc.destroy === "function" ? doc.destroy() : loading.destroy());
	parentPort?.postMessage({ text, pages, partial: totalPages > pages });
} catch {
	parentPort?.postMessage({ error: "invalid, encrypted, unsupported or unavailable PDF parser" });
}
