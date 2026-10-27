#!/usr/bin/env node

// Build the portable analysis boundary as one self-contained native Pi
// extension. Host execution, authorization and persistence stay outside this
// bundle; only the public plugin-api contract is embedded.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";

const packageRoot = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const sourceRoot = join(packageRoot, "src");
const distRoot = join(packageRoot, "dist");
const outputPath = join(distRoot, "index.mjs");
const hostOutputPath = join(distRoot, "host.mjs");
const manifestPath = join(packageRoot, "plugin.manifest.json");
const packageJsonPath = join(packageRoot, "package.json");
const buildManifestPath = join(packageRoot, "build-manifest.json");
const checkOnly = process.argv.includes("--check");
const execFileAsync = promisify(execFile);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function validateMetadata() {
	if (packageJson.name !== "@gyoungwe/pi-analysis") throw new Error("unexpected package name");
	if (packageJson.main !== "./dist/index.mjs") throw new Error("main must point at the bundled extension");
	if (packageJson.pi?.extensions?.[0] !== "./dist/index.mjs") throw new Error("Pi extension metadata is incorrect");
	if (packageJson.peerDependencies?.["@earendil-works/pi-coding-agent"] !== ">=1.1.0 <2.0.0")
		throw new Error("Pi coding-agent must remain a peer dependency >=1.1.0 <2.0.0");
	if (manifest.schemaVersion !== 1) throw new Error("plugin manifest schemaVersion must be 1");
	if (manifest.id !== "drone-pi-analysis") throw new Error("plugin manifest id is incorrect");
	if (manifest.version !== packageJson.version) throw new Error("manifest version must match package.json");
	if (manifest.drone?.pluginApi !== 1) throw new Error("manifest plugin API must be 1");
	if (manifest.drone?.resultContract !== "drone-result/v3") throw new Error("manifest result contract is incorrect");
	if (manifest.entrypoints?.extension !== "./dist/index.mjs") throw new Error("extension entrypoint is incorrect");
	if (manifest.entrypoints?.host !== "./dist/host.mjs") throw new Error("host entrypoint is incorrect");
	if (!manifest.hosts?.includes("native-pi")) throw new Error("native-pi host is missing");
}

function validateSource() {
	for (const file of ["assembly.ts", "bulk-rnaseq.ts", "evidence-plan.ts", "host.ts", "index.ts", "registry.ts"]) {
		if (!existsSync(join(sourceRoot, file))) throw new Error(`source file is missing: ${file}`);
	}
}

function validateDeclarations() {
	for (const file of [
		"index.d.ts",
		"host.d.ts",
		"assembly.d.ts",
		"bulk-rnaseq.d.ts",
		"registry.d.ts",
		"analysis-contract.d.ts",
		"evidence-plan.d.ts",
	])
		if (!existsSync(join(distRoot, file))) throw new Error(`declaration output is missing: dist/${file}`);
}

function validateBundle(output, kind) {
	const forbidden = [
		/(?:from|import\s*\(|require\s*\()\s*["']electron["']/u,
		/(?:from|import\s*\(|require\s*\()\s*["']@drone\//u,
		/(?:from|import\s*\(|require\s*\()\s*["']\.\.\/\.\./u,
		/(?:from|import\s*\(|require\s*\()\s*["']@gyoungwe\/plugin-api["']/u,
	];
	for (const pattern of forbidden) {
		if (pattern.test(output)) throw new Error(`bundle contains forbidden import: ${pattern}`);
	}
	const markers =
		kind === "extension"
		? ["analysis_list_adapters", "analysis_assess_readiness", "analysis_prepare_evidence"]
			: ["contractVersion", "bulk-rnaseq", "assembly"];
	for (const marker of markers) {
		if (!output.includes(kind === "extension" ? JSON.stringify(marker) : marker))
			throw new Error(`${kind} bundle is missing ${marker}`);
	}
}

validateMetadata();
validateSource();

if (!checkOnly) {
	await rm(distRoot, { recursive: true, force: true });
	await mkdir(distRoot, { recursive: true });
	const [extensionBuild, hostBuild] = await Promise.all([
		build({
			entryPoints: [join(sourceRoot, "index.ts")],
			outfile: outputPath,
			bundle: true,
			format: "esm",
			platform: "node",
			packages: "bundle",
			metafile: true,
			sourcemap: false,
			logLevel: "silent",
		}),
		build({
			entryPoints: [join(sourceRoot, "host.ts")],
			outfile: hostOutputPath,
			bundle: true,
			format: "esm",
			platform: "node",
			packages: "bundle",
			metafile: true,
			sourcemap: false,
			logLevel: "silent",
		}),
	]);
	await execFileAsync("tsc", ["-p", join(packageRoot, "tsconfig.build.json")], {
		cwd: workspaceRoot,
		maxBuffer: 8 * 1024 * 1024,
	});
	let output = await readFile(outputPath, "utf8");
	if (!output.startsWith("// @ts-nocheck")) {
		output = `// @ts-nocheck\n${output}`;
		await writeFile(outputPath, output, "utf8");
	}
	let hostOutput = await readFile(hostOutputPath, "utf8");
	if (!hostOutput.startsWith("// @ts-nocheck")) {
		hostOutput = `// @ts-nocheck\n${hostOutput}`;
		await writeFile(hostOutputPath, hostOutput, "utf8");
	}
	const inputHash = createHash("sha256");
	for (const input of [
		...new Set([
			...Object.keys(extensionBuild.metafile?.inputs || {}),
			...Object.keys(hostBuild.metafile?.inputs || {}),
		]),
	].sort()) {
		const normalized = input.replaceAll("\\", "/");
		inputHash.update(normalized);
		inputHash.update("\0");
		const candidate = resolve(workspaceRoot, input);
		if (existsSync(candidate)) inputHash.update(await readFile(candidate));
		inputHash.update("\0");
	}
	await writeFile(
		buildManifestPath,
		`${JSON.stringify(
			{
				version: 1,
				generator: "packages/pi-analysis/scripts/build.mjs",
				inputsSha256: inputHash.digest("hex"),
				outputs: {
					"dist/index.mjs": sha256(await readFile(outputPath)),
					"dist/host.mjs": sha256(await readFile(hostOutputPath)),
					"dist/index.d.ts": sha256(await readFile(join(distRoot, "index.d.ts"))),
					"dist/host.d.ts": sha256(await readFile(join(distRoot, "host.d.ts"))),
				},
			},
			null,
			"\t",
		)}\n`,
	);
}

const output = await readFile(outputPath, "utf8");
const hostOutput = await readFile(hostOutputPath, "utf8");
validateDeclarations();
validateBundle(output, "extension");
validateBundle(hostOutput, "host");
console.log(`pi-analysis package artifacts ${checkOnly ? "are present" : "built"}`);
