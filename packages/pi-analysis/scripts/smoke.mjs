#!/usr/bin/env node

// Pack and install pi-analysis in a clean prefix, then discover the installed
// extension through the real Pi resource loader. No model call or user state
// is used; the temporary directory is removed before the script exits.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const temp = await mkdtemp(join(tmpdir(), "drone-pi-analysis-smoke-"));
const installRoot = join(temp, "install");
await mkdir(installRoot, { recursive: true });

try {
	const packOutput = await execFileAsync(
		"npm",
		["pack", "--json", "--ignore-scripts", "--pack-destination", temp],
		{ cwd: packageRoot, maxBuffer: 8 * 1024 * 1024 },
	);
	const metadata = JSON.parse(packOutput.stdout.trim())[0];
	assert(metadata?.filename?.endsWith(".tgz"), "npm pack did not produce a tarball");
	const tarball = join(temp, metadata.filename);
	const apiTarball = join(workspaceRoot, "vendor", "gyoungwe-plugin-api-1.2.0.tgz");
	await execFileAsync(
		"npm",
		["install", "--prefix", installRoot, "--ignore-scripts", "--no-audit", "--no-fund", apiTarball, tarball],
		{ cwd: workspaceRoot, maxBuffer: 16 * 1024 * 1024 },
	);
	const packageJson = JSON.parse(
		await readFile(join(installRoot, "node_modules/@gyoungwe/pi-analysis/package.json"), "utf8"),
	);
	const packageDir = join(installRoot, "node_modules/@gyoungwe/pi-analysis");
	const manifest = JSON.parse(await readFile(join(packageDir, "plugin.manifest.json"), "utf8"));
	assert.equal(packageJson.name, "@gyoungwe/pi-analysis");
	assert.equal(packageJson.dependencies?.["@gyoungwe/plugin-api"], "^1.2.0");
	assert.equal(packageJson.peerDependencies?.["@earendil-works/pi-coding-agent"], ">=1.1.0 <2.0.0");
	assert.equal(packageJson.dependencies?.["@earendil-works/pi-coding-agent"], undefined);
	const apiPackage = JSON.parse(await readFile(join(installRoot, "node_modules/@gyoungwe/plugin-api/package.json"), "utf8"));
	assert.equal(apiPackage.version, "1.2.0");
	await readFile(join(installRoot, "node_modules/@gyoungwe/pi-analysis/dist/index.d.ts"), "utf8");
	assert.deepEqual(manifest.capabilities, ["analysis", "planning", "evidence-context", "files"]);
	assert.equal(manifest.entrypoints.host, "./dist/host.mjs");
	const extensionPath = join(packageDir, packageJson.pi.extensions[0]);
	const hostPath = join(packageDir, manifest.entrypoints.host);
	const host = await import(pathToFileURL(hostPath).href);
	assert.equal(host.analysisHostLoader.contractVersion, 1);
	assert.equal(host.analysisHostLoader.load().contractVersion, 1);
	assert.deepEqual(
		host.analysisHostLoader.load().registry.list().map((adapter) => adapter.identity.id),
		["assembly", "bulk-rnaseq"],
	);
	const { DefaultResourceLoader, SettingsManager } = await import("@earendil-works/pi-coding-agent");
	const loader = new DefaultResourceLoader({
		cwd: installRoot,
		agentDir: join(installRoot, "agent"),
		settingsManager: SettingsManager.inMemory(),
		noExtensions: true,
		noSkills: true,
		additionalExtensionPaths: [extensionPath],
	});
	await loader.reload();
	const { extensions, errors } = loader.getExtensions();
	assert.deepEqual(errors, [], JSON.stringify(errors));
	const extension = extensions.find((item) => item.path === extensionPath);
	assert(extension, "installed pi-analysis extension was not discovered");
	assert.deepEqual([...extension.tools.keys()], [
		"analysis_list_adapters",
		"analysis_assess_readiness",
		"analysis_prepare_evidence",
	]);
	assert.deepEqual(manifest.tools, [...extension.tools.keys()]);
	console.log(
		JSON.stringify({
			package: packageJson.name,
			version: packageJson.version,
			installed: true,
			loaderDiscovered: true,
			tools: [...extension.tools.keys()],
		}),
	);
} finally {
	await rm(temp, { recursive: true, force: true });
}
