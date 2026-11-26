#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { installPackedPlugins } from "../../../scripts/packed-plugins.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(join(tmpdir(), "drone-pi-inquiry-smoke-"));
const installRoot = join(temp, "install");
try {
	await mkdir(installRoot);
	const packed = await execFileAsync(
		"npm",
		["pack", "--json", "--ignore-scripts", "--pack-destination", temp],
		{ cwd: packageRoot, maxBuffer: 8 * 1024 * 1024 },
	);
	const metadata = JSON.parse(packed.stdout.trim())[0];
	assert(metadata?.filename?.endsWith(".tgz"), "npm pack did not produce a tarball");
	const tarball = join(temp, metadata.filename);
	await installPackedPlugins(installRoot, [tarball]);
	const packageDir = join(installRoot, "node_modules/@gyoungwe/pi-inquiry");
	const packageJson = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
	const manifest = JSON.parse(await readFile(join(packageDir, "plugin.manifest.json"), "utf8"));
	assert.equal(packageJson.name, "@gyoungwe/pi-inquiry");
	assert.equal(manifest.id, packageJson.name.replace("@gyoungwe/", "drone-"));
	assert.equal(manifest.version, packageJson.version);
	assert.deepEqual(packageJson.pi.extensions, ["./dist/index.mjs"]);
	assert.equal(manifest.entrypoints.extension, packageJson.pi.extensions[0]);
	assert.equal(manifest.entrypoints.desktopRuntime, "./dist/runtime.mjs");
	assert.equal(manifest.entrypoints.ui, "./ui/plugin.json");
	for (const entry of [...Object.values(manifest.entrypoints), "./dist/sql-wasm.wasm"]) {
		assert((await stat(join(packageDir, entry))).isFile(), `Installed entry is not a file: ${entry}`);
	}
	const uiPath = join(packageDir, manifest.entrypoints.ui);
	const ui = JSON.parse(await readFile(uiPath, "utf8"));
	assert.equal(ui.version, packageJson.version);
	assert((await stat(join(dirname(uiPath), ui.main))).isFile(), "Installed UI main is not a file");
	const extension = await import(pathToFileURL(join(packageDir, manifest.entrypoints.extension)).href);
	assert.equal(typeof extension.default, "function");
	const runtime = await import(pathToFileURL(join(packageDir, manifest.entrypoints.desktopRuntime)).href);
	assert.equal(typeof runtime.createInquiryRuntime, "function");
	assert.equal(runtime.default, runtime.createInquiryRuntime);
	console.log(
		JSON.stringify({
			package: packageJson.name,
			tarball: metadata.filename,
			installed: true,
		}),
	);
} finally {
	await rm(temp, { recursive: true, force: true });
}
