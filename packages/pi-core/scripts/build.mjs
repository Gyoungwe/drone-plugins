#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const packageRoot = resolve(import.meta.dirname, "..");
const distRoot = join(packageRoot, "dist");
const outputPath = join(distRoot, "index.mjs");
const hostOutputPath = join(distRoot, "host.mjs");
const check = process.argv.includes("--check");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function verify() {
	if (!existsSync(outputPath)) throw new Error("pi-core dist/index.mjs is missing");
	const output = await readFile(outputPath, "utf8");
	for (const pattern of [
		/(?:from|import\s*\(|require\s*\()["']electron["']/u,
		/(?:from|import\s*\(|require\s*\()["']@drone\/(?:backend|desktop|shared|tasks)["']/u,
	]) {
		if (pattern.test(output)) throw new Error(`pi-core bundle contains forbidden import: ${pattern}`);
	}
	for (const name of [
		"ask_user",
		"set_status",
		"todo",
		"deliver_files",
		"memory_save",
		"task_plan",
		"task_status",
		"drone-doctor",
		"drone-example",
	])
		if (!output.includes(JSON.stringify(name))) throw new Error(`pi-core bundle is missing ${name}`);
}

if (!check) {
	await rm(distRoot, { recursive: true, force: true });
	await mkdir(distRoot, { recursive: true });
	const buildOptions = { bundle: true, format: "esm", platform: "node", packages: "bundle", metafile: true, sourcemap: false, logLevel: "silent" };
	const result = await build({ ...buildOptions, entryPoints: [join(packageRoot, "src/index.ts")], outfile: outputPath });
	await build({ ...buildOptions, entryPoints: [join(packageRoot, "src/host.ts")], outfile: hostOutputPath });
	const output = await readFile(outputPath, "utf8");
	if (!output.startsWith("// @ts-nocheck")) await writeFile(outputPath, `// @ts-nocheck\n${output}`);
	const inputsSha256 = createHash("sha256");
	for (const input of Object.keys(result.metafile?.inputs ?? {}).sort()) inputsSha256.update(input).update("\0");
	await writeFile(
		join(packageRoot, "build-manifest.json"),
		`${JSON.stringify({version: 1, generator: "packages/pi-core/scripts/build.mjs", inputsSha256: inputsSha256.digest("hex"), outputs: {"dist/index.mjs": sha256(await readFile(outputPath)), "dist/host.mjs": sha256(await readFile(hostOutputPath))}}, null, "\t")}\n`,
	);
}
await verify();
console.log(`pi-core package artifacts ${check ? "are up to date" : "built"}`);
