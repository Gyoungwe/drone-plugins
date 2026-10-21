#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { build } from "esbuild";

const packageRoot = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const checkOnly = process.argv.includes("--check");
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const manifestPath = join(packageRoot, "plugin.manifest.json");
const buildManifestPath = join(packageRoot, "build-manifest.json");
const artifactOutputs = [
	"dist/index.mjs",
	"dist/host.mjs",
	"dist/host.d.ts",
	"lib/knowledge/runtime/worker.mjs",
];
const outputs = [...artifactOutputs, "lib/knowledge/runtime/.knowledge-worker-manifest.json"];
const expectedSkills = ["research-vault", "research-show-me"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
	throw new Error(`[pi-knowledge build] ${message}`);
};
const ensureFile = async (relativePath) => {
	const path = join(packageRoot, relativePath);
	try {
		if (!(await stat(path)).isFile()) fail(`${relativePath} is not a file`);
	} catch (error) {
		if (error?.code === "ENOENT") fail(`${relativePath} is missing`);
		throw error;
	}
	return path;
};
const collectFiles = async (directory) => {
	const result = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) result.push(...(await collectFiles(path)));
		else result.push(path);
	}
	return result;
};

if (packageJson.name !== "@gyoungwe/pi-knowledge") fail(`unexpected package name: ${packageJson.name}`);
if (packageJson.version !== "0.2.0") fail("pi-knowledge version must be 0.2.0 for P2");
if (packageJson.main !== "./dist/index.mjs") fail("main must point at the bundled extension");
if (packageJson.peerDependencies?.["@earendil-works/pi-coding-agent"] !== ">=1.1.0 <2.0.0")
	fail("Pi peer dependency must remain >=1.1.0 <2.0.0");

if (!checkOnly) {
	await rm(join(packageRoot, "dist"), { recursive: true, force: true });
	await rm(join(packageRoot, "lib"), { recursive: true, force: true });
	await mkdir(join(packageRoot, "dist"), { recursive: true });
	await mkdir(join(packageRoot, "lib/knowledge/runtime"), { recursive: true });
	await build({
		entryPoints: [join(packageRoot, "src/extension/knowledge-extension.ts")],
		bundle: true,
		format: "esm",
		platform: "node",
		target: "node20",
		outfile: join(packageRoot, "dist/index.mjs"),
		sourcemap: false,
		external: ["node:*"],
	});
	await build({
		entryPoints: [join(packageRoot, "src/extension/knowledge-worker.ts")],
		bundle: true,
		format: "esm",
		platform: "node",
		target: "node20",
		outfile: join(packageRoot, "lib/knowledge/runtime/worker.mjs"),
		sourcemap: false,
		external: ["node:*"],
	});
	await build({
		entryPoints: [join(packageRoot, "src/host.ts")],
		bundle: true,
		format: "esm",
		platform: "node",
		target: "node20",
		outfile: join(packageRoot, "dist/host.mjs"),
		sourcemap: false,
		external: ["node:*"],
	});
	const tsc = join(workspaceRoot, "node_modules/.bin/tsc");
	execFileSync(tsc, ["-p", join(packageRoot, "tsconfig.build.json")], { cwd: packageRoot, stdio: "inherit" });
	await cp(join(packageRoot, "dist/types/host.d.ts"), join(packageRoot, "dist/host.d.ts"));
}

for (const relativePath of artifactOutputs) await ensureFile(relativePath);
for (const relativePath of ["dist/index.mjs", "dist/host.mjs", "lib/knowledge/runtime/worker.mjs"]) {
	const text = (await readFile(await ensureFile(relativePath))).toString("utf8");
	if (/from\s+["'](?:electron|@drone\/(?:backend|desktop))["']/.test(text)) fail(`${relativePath} contains a forbidden host import`);
	if (/import\s*\(\s*["'](?:electron|@drone\/(?:backend|desktop))["']/.test(text)) fail(`${relativePath} contains a forbidden dynamic host import`);
	if (/(?:from|import\s*\(|require\s*\()["'](?:\.\/\.\/)+/.test(text)) fail(`${relativePath} contains a package-boundary relative import`);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1) fail("plugin.manifest schemaVersion must be 1");
if (manifest.id !== "drone-pi-knowledge") fail("plugin.manifest id is incorrect");
if (manifest.version !== packageJson.version) fail("plugin.manifest version must match package.json");
if (manifest.entrypoints?.extension !== "./dist/index.mjs") fail("extension entrypoint is incorrect");
if (manifest.entrypoints?.worker !== "./lib/knowledge/runtime/worker.mjs") fail("worker entrypoint is incorrect");
if (manifest.entrypoints?.host !== "./dist/host.mjs") fail("host entrypoint is incorrect");

const skills = [];
for (const name of expectedSkills) {
	const relativePath = `skills/${name}/SKILL.md`;
	await ensureFile(relativePath);
	skills.push(relativePath);
}

const sourceFiles = (await collectFiles(join(packageRoot, "src")))
	.filter((path) => /\.(?:ts|mjs)$/.test(path))
	.sort();
const sourceHashes = {};
for (const path of sourceFiles) sourceHashes[relative(packageRoot, path).replaceAll("\\", "/")] = sha256(await readFile(path));
const sourceDigest = createHash("sha256");
for (const path of sourceFiles) {
	sourceDigest.update(relative(packageRoot, path).replaceAll("\\", "/"));
	sourceDigest.update("\0");
	sourceDigest.update(await readFile(path));
	sourceDigest.update("\0");
}
const knowledgeSourceSha256 = sourceDigest.digest("hex");
const workerPath = await ensureFile("lib/knowledge/runtime/worker.mjs");
const workerManifest = {
	version: 1,
	generator: "packages/pi-knowledge/scripts/build.mjs",
	output: "worker.mjs",
	source: "src/extension/knowledge-worker.ts",
	inputsSha256: knowledgeSourceSha256,
	knowledgeSourceSha256,
	outputSha256: sha256(await readFile(workerPath)),
};
const workerManifestPath = join(packageRoot, "lib/knowledge/runtime/.knowledge-worker-manifest.json");
const currentWorkerManifest = existsSync(workerManifestPath)
	? JSON.parse(await readFile(workerManifestPath, "utf8"))
	: null;
if (checkOnly) {
	if (JSON.stringify(currentWorkerManifest) !== JSON.stringify(workerManifest))
		fail(".knowledge-worker-manifest.json is stale; run npm run build");
} else {
	await writeFile(workerManifestPath, `${JSON.stringify(workerManifest, null, "\t")}\n`);
}
const outputHashes = {};
for (const relativePath of outputs) outputHashes[relativePath] = sha256(await readFile(await ensureFile(relativePath)));
const next = {
	version: 1,
	generator: "packages/pi-knowledge/scripts/build.mjs",
	artifactSource: "source",
	sourceHashes,
	outputs: outputHashes,
	skills,
};
const current = existsSync(buildManifestPath) ? JSON.parse(await readFile(buildManifestPath, "utf8")) : null;
if (checkOnly) {
	if (JSON.stringify(current) !== JSON.stringify(next)) fail("build-manifest.json is stale; run npm run build");
	console.log("pi-knowledge source artifacts are up to date");
} else {
	await writeFile(buildManifestPath, `${JSON.stringify(next, null, "\t")}\n`);
	console.log("built pi-knowledge source artifacts and refreshed build-manifest.json");
}
