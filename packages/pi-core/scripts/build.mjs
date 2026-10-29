#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const packageRoot = resolve(import.meta.dirname, "..");
const distRoot = join(packageRoot, "dist");
const outputPath = join(distRoot, "index.mjs");
const hostOutputPath = join(distRoot, "host.mjs");
const check = process.argv.includes("--check");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function filesBelow(directory, prefix = "") {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory())
			files.push(...(await filesBelow(join(directory, entry.name), path)));
		else files.push(path);
	}
	return files.sort();
}

async function buildReceipt() {
	const inputs = [
		...(await filesBelow(join(packageRoot, "src"))).map(
			(name) => `src/${name}`,
		),
		"package.json",
		"plugin.manifest.json",
		"scripts/build.mjs",
		"tsconfig.json",
		"tsconfig.build.json",
		"tsconfig.ui.json",
		"scripts/build-ui.mjs",
	].sort();
	const inputsSha256 = createHash("sha256");
	for (const input of inputs)
		inputsSha256
			.update(input)
			.update("\0")
			.update(await readFile(join(packageRoot, input)))
			.update("\0");
	const outputs = {};
	for (const output of await filesBelow(distRoot))
		outputs[`dist/${output}`] = sha256(await readFile(join(distRoot, output)));
	return {
		version: 1,
		generator: "packages/pi-core/scripts/build.mjs",
		inputsSha256: inputsSha256.digest("hex"),
		outputs,
	};
}

async function verify() {
	const pkg = JSON.parse(
		await readFile(join(packageRoot, "package.json"), "utf8"),
	);
	const manifest = JSON.parse(
		await readFile(join(packageRoot, "plugin.manifest.json"), "utf8"),
	);
	if (pkg.version !== manifest.version)
		throw new Error("pi-core manifest version must match package.json");
	for (const value of Object.values(pkg.exports)) {
		for (const entry of [value.types, value.import]) {
			if (entry.includes("*")) {
				for (const tool of [
					"ask-user",
					"deliver-files",
					"memory-save",
					"status",
					"todo",
				])
					if (!existsSync(join(packageRoot, entry.replace("*", tool))))
						throw new Error(`Missing public export ${entry}: ${tool}`);
			} else if (!existsSync(join(packageRoot, entry)))
				throw new Error(`Missing public export ${entry}`);
		}
	}

	if (!existsSync(outputPath))
		throw new Error("pi-core dist/index.mjs is missing");
	const output = await readFile(outputPath, "utf8");
	for (const pattern of [
		/(?:from|import\s*\(|require\s*\()["']electron["']/u,
		/(?:from|import\s*\(|require\s*\()["']@drone\/(?:backend|desktop|shared|tasks)["']/u,
	]) {
		if (pattern.test(output))
			throw new Error(`pi-core bundle contains forbidden import: ${pattern}`);
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
		if (!output.includes(JSON.stringify(name)))
			throw new Error(`pi-core bundle is missing ${name}`);
}

if (!check) {
	await rm(distRoot, { recursive: true, force: true });
	await mkdir(distRoot, { recursive: true });
	const buildOptions = {
		bundle: true,
		format: "esm",
		platform: "node",
		packages: "bundle",
		metafile: true,
		sourcemap: false,
		logLevel: "silent",
	};
	await build({
		...buildOptions,
		entryPoints: [join(packageRoot, "src/index.ts")],
		outfile: outputPath,
	});
	await build({
		...buildOptions,
		entryPoints: [join(packageRoot, "src/host.ts")],
		outfile: hostOutputPath,
	});
	await build({
		...buildOptions,
		entryPoints: [join(packageRoot, "src/managed-runtime.ts")],
		outfile: join(distRoot, "managed-runtime.mjs"),
	});
	await build({
		...buildOptions,
		entryPoints: [join(packageRoot, "src/memory.ts")],
		outfile: join(distRoot, "memory.mjs"),
	});
	const toolExports = {
		"ask-user": ["makeAskUserTool"],
		"deliver-files": ["deliverFilesParams", "makeDeliverFilesTool"],
		"memory-save": ["MEMORY_SAVE_TOOL", "makeMemorySaveTool"],
		status: ["makeStatusTool"],
		todo: ["formatTodoList", "makeTodoTool", "normalizeTodos"],
	};
	await mkdir(join(distRoot, "tools"), { recursive: true });
	for (const [name, symbols] of Object.entries(toolExports))
		await writeFile(
			join(distRoot, "tools", `${name}.mjs`),
			`export { ${symbols.join(", ")} } from "../index.mjs";\n`,
		);
	execFileSync("tsc", ["-p", join(packageRoot, "tsconfig.build.json")], {
		stdio: "inherit",
	});
	await mkdir(join(distRoot, "task-runtime"), { recursive: true });
	for (const name of await readdir(join(packageRoot, "src/task-runtime")))
		if (name.endsWith(".d.mts"))
			await cp(
				join(packageRoot, "src/task-runtime", name),
				join(distRoot, "task-runtime", name),
			);
	const output = await readFile(outputPath, "utf8");
	if (!output.startsWith("// @ts-nocheck"))
		await writeFile(outputPath, `// @ts-nocheck\n${output}`);
	await writeFile(
		join(packageRoot, "build-manifest.json"),
		`${JSON.stringify(await buildReceipt(), null, "\t")}\n`,
	);
}
execFileSync(process.execPath, [join(packageRoot, "scripts/build-ui.mjs"), ...(check ? ["--check"] : [])], { stdio: "inherit" });
await verify();
if (check) {
	const recorded = JSON.parse(
		await readFile(join(packageRoot, "build-manifest.json"), "utf8"),
	);
	if (JSON.stringify(recorded) !== JSON.stringify(await buildReceipt()))
		throw new Error("pi-core generated artifacts are stale");
}
console.log(`pi-core package artifacts ${check ? "are up to date" : "built"}`);
