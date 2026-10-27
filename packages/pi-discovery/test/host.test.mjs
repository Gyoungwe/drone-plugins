import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { discoveryHostLoader } from "../dist/host.mjs";

test("reads journal arrays and omits persistence timestamps from public projections", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-discovery-host-"));
	try {
		const agentDir = join(root, "runs", ".drone-discovery");
		await mkdir(agentDir, { recursive: true });
		const critic = {
			findingId: "finding-1",
			status: "complete",
			questions: [],
		};
		const multipath = {
			planId: "plan-1",
			findingId: "finding-1",
			grade: "robust",
			intent: "confirmatory",
			attemptCount: 5,
			consistentCount: 5,
			consistency: 1,
		};
		const recordedAt = "2026-01-01T00:00:00.000Z";
		await writeFile(
			join(agentDir, "critics.json"),
			JSON.stringify([{ ...critic, recordedAt }]),
		);
		await writeFile(
			join(agentDir, "multipath.json"),
			JSON.stringify([{ ...multipath, recordedAt }]),
		);
		const host = discoveryHostLoader.create({
			projectId: "demo",
			projectRoot: root,
		});
		assert.equal((await host.status()).projectId, "demo");
		assert.deepEqual(await host.listCriticReviews(), [critic]);
		assert.deepEqual(await host.listMultipathAssessments(), [multipath]);
		assert.deepEqual(await host.listExplorationPlans(), []);
		assert.deepEqual(await host.listEvaluations(), []);
		assert.equal(
			JSON.parse(await readFile(join(agentDir, "critics.json"), "utf8"))[0]
				.recordedAt,
			recordedAt,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("uses only the supplied journal root and never creates project data", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-discovery-scope-"));
	try {
		const journalA = join(root, "journal-a");
		const journalB = join(root, "journal-b");
		await mkdir(journalA);
		await mkdir(journalB);
		await writeFile(
			join(journalA, "evaluations.json"),
			JSON.stringify([{ runId: "run-a" }]),
		);
		await writeFile(
			join(journalB, "evaluations.json"),
			JSON.stringify([{ runId: "run-b" }]),
		);
		const a = discoveryHostLoader.create({
			projectId: "project-a",
			projectRoot: root,
			agentDir: journalA,
		});
		const b = discoveryHostLoader.create({
			projectId: "project-b",
			projectRoot: root,
			agentDir: journalB,
		});
		assert.deepEqual(await a.listEvaluations(), [{ runId: "run-a" }]);
		assert.deepEqual(await b.listEvaluations(), [{ runId: "run-b" }]);
		await assert.rejects(
			readFile(join(root, "runs", ".drone-discovery", "evaluations.json")),
			{ code: "ENOENT" },
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("reports malformed journal content instead of treating it as no records", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-discovery-corrupt-"));
	try {
		const host = discoveryHostLoader.create({
			projectId: "demo",
			projectRoot: root,
			agentDir: root,
		});
		await writeFile(join(root, "plans.json"), "{}");
		await assert.rejects(host.listExplorationPlans(), /not an array/u);
		await writeFile(join(root, "evaluations.json"), "[broken");
		await assert.rejects(host.listEvaluations(), SyntaxError);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
