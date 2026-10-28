#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { candidatePluginApi } from "../../../scripts/candidate-plugin-api.mjs";
const api = await candidatePluginApi();
const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "pi-discovery-smoke-"));
try {
	const packed = JSON.parse(
		(
			await exec("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", root], {
				cwd: fileURLToPath(new URL("..", import.meta.url)),
				maxBuffer: 4 * 1024 * 1024,
			})
		).stdout,
	)[0];
	assert.match(packed.filename, /\.tgz$/u);
	const prefix = join(root, "installed");
	await exec(
		"npm",
		[
			"install",
			"--prefix",
			prefix,
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			join(root, packed.filename),
			api.path,
		],
		{ maxBuffer: 4 * 1024 * 1024 },
	);
	const installedRoot = join(prefix, "node_modules/@gyoungwe/pi-discovery");
	const manifest = JSON.parse(await readFile(join(installedRoot, "plugin.manifest.json"), "utf8"));
	const packageJson = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
	assert.deepEqual(manifest.hosts, ["native-pi", "drone-desktop"]);
	assert.deepEqual(packageJson.pi.extensions, ["./dist/index.mjs"]);
	const extension = await import(
		pathToFileURL(join(installedRoot, packageJson.pi.extensions[0])).href
	);
	const registered = new Map();
	const listeners = new Map();
	await extension.default({
		registerTool: (tool) => registered.set(tool.name, tool),
		on: (name, listener) => listeners.set(name, listener),
	});
	assert.deepEqual([...registered.keys()].sort(), [...manifest.tools].sort());
	assert(
		[...registered.values()]
			.filter(
				(tool) =>
					![
						"discovery_bind_workspace",
						"discovery_create_plan",
						"discovery_cancel_execution",
						"discovery_create_kernel",
						"discovery_execute_kernel",
						"discovery_close_kernel",
						"discovery_reconcile_executions",
					].includes(tool.name),
			)
			.every((tool) => tool.drone.readOnly === true),
	);
	const status = await registered
		.get("discovery_status")
		.execute("smoke", {}, undefined, undefined, {
			cwd: root,
			sessionManager: { getSessionId: () => "smoke-native" },
		});
	assert.equal(status.details.status, "unconfigured");
	const { discoveryHostLoader } = await import(
		pathToFileURL(join(prefix, "node_modules/@gyoungwe/pi-discovery/dist/host.mjs")).href
	);
	const { memoryServices } = await import("../test/memory-services.mjs");
	const host = discoveryHostLoader.create({
		...memoryServices(),
		projectId: "smoke",
		projectRoot: root,
	});
	assert.equal((await host.status()).projectId, "smoke");
	assert.deepEqual(await host.listCriticReviews(), []);
	assert.deepEqual(await host.listMultipathAssessments(), []);
	assert.deepEqual(await host.listExplorationPlans(), []);
	assert.deepEqual(await host.listEvaluations(), []);
	await host.dispose();
	await listeners.get("session_shutdown")();
	console.log(
		JSON.stringify({
			package: "@gyoungwe/pi-discovery",
			tarball: packed.filename,
			cleanInstall: true,
			hostLoaded: true,
			readOnly: false,
			hostServices: "in-memory fixture",
			nativeEntry: "registered; empty workspace unconfigured (fixture smoke)",
			formalGui: "NOT_RUN",
		}),
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
