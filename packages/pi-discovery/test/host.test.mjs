import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoveryHostLoader } from "../dist/host.mjs";

const root = await mkdtemp(join(tmpdir(), "pi-discovery-host-"));
try {
	const agentDir = join(root, "runs", ".drone-discovery");
	await mkdir(agentDir, { recursive: true });
	await writeFile(join(agentDir, "critics.json"), JSON.stringify([{ id: "critic-1" }]));
	const host = discoveryHostLoader.create({ projectId: "demo", projectRoot: root });
	assert.equal((await host.status()).projectId, "demo");
	assert.deepEqual(await host.listCriticReviews(), [{ id: "critic-1" }]);
	assert.deepEqual(await host.listMultipathAssessments(), []);
	assert.deepEqual(await host.listExplorationPlans(), []);
	assert.deepEqual(await host.listEvaluations(), []);
	console.log("pi-discovery host read slice passed");
} finally {
	await rm(root, { recursive: true, force: true });
}
