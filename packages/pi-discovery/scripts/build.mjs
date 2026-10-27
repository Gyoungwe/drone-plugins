#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const packageRoot = resolve(import.meta.dirname, "..");
const distRoot = join(packageRoot, "dist");
const outputPath = join(distRoot, "host.mjs");
const check = process.argv.includes("--check");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (!check) {
	await rm(distRoot, { recursive: true, force: true });
	await mkdir(distRoot, { recursive: true });
	const result = await build({
		entryPoints: [join(packageRoot, "src/host.ts")],
		outfile: outputPath,
		bundle: true,
		format: "esm",
		platform: "node",
		packages: "bundle",
		metafile: true,
		logLevel: "silent",
	});
	let output = await readFile(outputPath, "utf8");
	if (!output.startsWith("// @ts-nocheck")) {
		output = `// @ts-nocheck\n${output}`;
		await writeFile(outputPath, output, "utf8");
	}
	const inputs = createHash("sha256");
	for (const input of Object.keys(result.metafile?.inputs ?? {}).sort()) inputs.update(input).update("\0");
	await writeFile(
		join(packageRoot, "build-manifest.json"),
		`${JSON.stringify({ version: 1, generator: "packages/pi-discovery/scripts/build.mjs", inputsSha256: inputs.digest("hex"), outputs: { "dist/host.mjs": sha256(await readFile(outputPath)) } }, null, "\t")}\n`,
	);
}

if (!existsSync(outputPath)) throw new Error("pi-discovery host artifact is missing");
const output = await readFile(outputPath, "utf8");
if (/(?:from|import\s*\(|require\s*\()\s*["'](?:electron|@drone\/backend|@drone\/desktop|@earendil-works\/pi-)/u.test(output))
	throw new Error("pi-discovery host artifact contains a forbidden runtime dependency");
console.log(`pi-discovery artifacts ${check ? "are up to date" : "built"}`);
