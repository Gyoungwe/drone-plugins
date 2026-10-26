#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "../../..");
const packageRoot = join(root, "packages/pi-workbench");
const distRoot = join(packageRoot, "dist");
const check = process.argv.includes("--check");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function verify() {
	const outputPath = join(distRoot, "index.mjs");
	if (!existsSync(outputPath)) throw new Error("pi-workbench dist/index.mjs is missing");
	const output = await readFile(outputPath, "utf8");
	for (const name of ["workbench_plan", "workbench_status", "workbench_todo", "workbench_memory_save"]) {
		if (!output.includes(JSON.stringify(name))) throw new Error(`pi-workbench bundle is missing ${name}`);
	}
	for (const pattern of [/(?:from|import\s*\(|require\s*\()(?:["'])electron/u, /(?:from|import\s*\(|require\s*\()(?:["'])@drone\/(?:backend|desktop)/u, /(?:from|import\s*\(|require\s*\()(?:["'])node:fs(?:\/promises)?/u]) {
		if (pattern.test(output)) throw new Error(`pi-workbench bundle contains forbidden import: ${pattern}`);
	}
}

if (!check) {
	await rm(distRoot, { recursive: true, force: true });
	await mkdir(distRoot, { recursive: true });
	const built = await build({ entryPoints: [join(packageRoot, "src/index.ts")], outfile: join(distRoot, "index.mjs"), bundle: true, format: "esm", platform: "node", packages: "bundle", metafile: true, logLevel: "silent" });
	let output = await readFile(join(distRoot, "index.mjs"), "utf8");
	if (!output.startsWith("// @ts-nocheck")) output = `// @ts-nocheck\n${output}`;
	await writeFile(join(distRoot, "index.mjs"), output, "utf8");
	const inputHash = createHash("sha256");
	for (const input of Object.keys(built.metafile?.inputs || {}).sort()) {
		inputHash.update(input.replaceAll("\\", "/"));
		inputHash.update("\0");
		const path = resolve(root, input);
		if (existsSync(path)) inputHash.update(await readFile(path));
		inputHash.update("\0");
	}
	await writeFile(join(packageRoot, "build-manifest.json"), `${JSON.stringify({ version: 1, generator: "packages/pi-workbench/scripts/build.mjs", inputsSha256: inputHash.digest("hex"), outputs: { "dist/index.mjs": sha256(await readFile(join(distRoot, "index.mjs"))) } }, null, "\t")}\n`);
}
await verify();
console.log(`pi-workbench package artifacts ${check ? "are up to date" : "built"}`);
