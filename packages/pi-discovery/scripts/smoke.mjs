#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "pi-discovery-smoke-"));
try {
	const packed = JSON.parse(
		(
			await exec(
				"npm",
				["pack", "--json", "--ignore-scripts", "--pack-destination", root],
				{
					cwd: fileURLToPath(new URL("..", import.meta.url)),
					maxBuffer: 4 * 1024 * 1024,
				},
			)
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
		],
		{ maxBuffer: 4 * 1024 * 1024 },
	);
	const { discoveryHostLoader } = await import(
		pathToFileURL(
			join(prefix, "node_modules/@gyoungwe/pi-discovery/dist/host.mjs"),
		).href
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
	console.log(
		JSON.stringify({
			package: "@gyoungwe/pi-discovery",
			tarball: packed.filename,
			cleanInstall: true,
			hostLoaded: true,
			readOnly: false,
		}),
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
