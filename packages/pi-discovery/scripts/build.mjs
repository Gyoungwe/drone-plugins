#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const packageRoot = resolve(import.meta.dirname, "..");
const distRoot = join(packageRoot, "dist");
const check = process.argv.includes("--check");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputs = {};
const outputs = {};

for (const entry of ["host", "index", "runtime"]) {
	const outputPath = join(distRoot, `${entry}.mjs`);
	const result = await build({
		absWorkingDir: packageRoot,
		entryPoints: [join(packageRoot, `src/${entry}.ts`)],
		outfile: outputPath,
		bundle: true,
		format: "esm",
		platform: "node",
		packages: "bundle",
		external: ["@gyoungwe/plugin-api/node/reservations"],
		metafile: true,
		write: false,
		logLevel: "silent",
	});
	const output = `// @ts-nocheck\n${result.outputFiles[0].text}`;
	for (const input of Object.keys(result.metafile.inputs).sort())
		inputs[input] = sha256(await readFile(resolve(packageRoot, input)));
	outputs[`dist/${entry}.mjs`] = sha256(output);
	if (
		/(?:from|import\s*\(|require\s*\()\s*["'](?:electron|@drone\/backend|@drone\/desktop|@earendil-works\/pi-)/u.test(
			output,
		)
	)
		throw new Error(
			`pi-discovery ${entry} artifact contains a forbidden runtime dependency`,
		);
	if (check) {
		if ((await readFile(outputPath, "utf8")) !== output)
			throw new Error(
				`pi-discovery ${entry} artifact is stale; run npm run build`,
			);
	} else {
		await mkdir(distRoot, { recursive: true });
		await writeFile(outputPath, output, "utf8");
	}
}
const manifest = `${JSON.stringify({ version: 1, generator: "packages/pi-discovery/scripts/build.mjs", inputs, outputs }, null, "\t")}\n`;
if (check) {
	if (
		(await readFile(join(packageRoot, "build-manifest.json"), "utf8")) !==
		manifest
	)
		throw new Error("pi-discovery build manifest is stale; run npm run build");
} else await writeFile(join(packageRoot, "build-manifest.json"), manifest);
console.log(`pi-discovery artifacts ${check ? "are up to date" : "built"}`);
