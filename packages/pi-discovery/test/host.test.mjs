import assert from "node:assert/strict";
import { test } from "node:test";
import { discoveryHostLoader } from "../dist/host.mjs";
import { memoryServices } from "./memory-services.mjs";

test("uses host-provided journals and omits persistence-only timestamps", async () => {
	const critic = { findingId: "finding-1", status: "complete", questions: [] };
	const recordedAt = "2026-01-01T00:00:00.000Z";
	const { services, journals } = memoryServices({
		critics: [{ ...critic, recordedAt }],
	});
	const host = discoveryHostLoader.create({
		projectId: "demo",
		projectRoot: "/tmp/demo",
		services,
	});
	assert.equal((await host.status()).readOnly, false);
	assert.deepEqual(await host.listCriticReviews(), [critic]);
	assert.deepEqual(journals.get("critics"), [{ ...critic, recordedAt }]);
	await host.dispose();
});

test("separate host services isolate project journals and disposed state", async () => {
	const a = discoveryHostLoader.create({
		projectId: "a",
		projectRoot: "/tmp/a",
		...memoryServices({ evaluations: [{ runId: "a" }] }),
	});
	const b = discoveryHostLoader.create({
		projectId: "b",
		projectRoot: "/tmp/b",
		...memoryServices({ evaluations: [{ runId: "b" }] }),
	});
	assert.deepEqual(await a.listEvaluations(), [{ runId: "a" }]);
	assert.deepEqual(await b.listEvaluations(), [{ runId: "b" }]);
	await a.dispose();
	await assert.rejects(a.listEvaluations(), /disposed/);
	await b.dispose();
});

test("native load requires a host and never fabricates execution services", async () => {
	assert.throws(() => discoveryHostLoader.load(), /host-owned services/);
	const host = discoveryHostLoader.create({
		projectId: "demo",
		projectRoot: "/tmp/demo",
		...memoryServices(),
	});
	await assert.rejects(
		host.createKernelSession({
			sessionId: "s",
			language: "python",
			dataClassification: "public",
			runDirectory: "runs/s",
		}),
		/authorization denied/,
	);
	await host.dispose();
});

test("critic enforces independent provider and records read-only review questions", async () => {
	const { services } = memoryServices();
	const questions = [];
	services.inquiry = {
		recordQuestion: async (record) => {
			questions.push(record);
		},
		recordAttempt: async () => {},
	};
	let role;
	services.criticProvider = {
		providerId: "primary",
		review: async () => {
			throw new Error("same provider must not execute");
		},
	};
	const host = discoveryHostLoader.create({
		projectId: "project-1",
		projectRoot: "/tmp/project-1",
		services,
	});
	const request = {
		findingId: "finding-1",
		findingStatement: "Effect requires review",
		artifactIds: [],
		primaryProviderId: "primary",
	};
	assert.equal(
		(await host.runCritic(request)).status,
		"needs-independent-provider",
	);
	services.criticProvider = {
		providerId: "independent",
		review: async (input) => {
			role = input.role;
			return [
				{
					checklistItem: "batch-effect",
					question: "Could batch explain this?",
					severity: "high",
					evidenceArtifactIds: [],
				},
			];
		},
	};
	assert.equal((await host.runCritic(request)).status, "complete");
	assert.equal(role.canWrite, false);
	assert.equal(role.canShell, false);
	assert.equal(questions[0].id, "critic:finding-1:1");
	await host.dispose();
});

test("multipath validates five paths, authorizes execution and records every attempt", async () => {
	const { services } = memoryServices();
	const attempts = [];
	const authorizations = [];
	services.authorize = async (operation) => {
		authorizations.push(operation);
	};
	services.inquiry = {
		recordQuestion: async () => {},
		recordAttempt: async (record) => {
			attempts.push(record);
		},
	};
	const host = discoveryHostLoader.create({
		projectId: "project-1",
		projectRoot: "/tmp/project-1",
		services,
	});
	const plan = {
		id: "plan-1",
		findingId: "finding-1",
		intent: "confirmatory",
		priorRegistered: true,
		paths: Array.from({ length: 5 }, (_, index) => ({
			id: `path-${index}`,
			description: "alternative",
			parameters: { threshold: index },
		})),
	};
	const executor = async () => ({
		outcome: "succeeded",
		signature: "same",
		summary: "same direction",
		consistentWithReference: true,
	});
	await assert.rejects(
		host.runMultipath({
			plan: { ...plan, paths: plan.paths.slice(0, 4) },
			executor,
		}),
		/5 to 10/,
	);
	const assessment = await host.runMultipath({ plan, executor });
	assert.equal(assessment.grade, "robust");
	assert.equal(assessment.intent, "confirmatory");
	assert.equal(attempts.length, 5);
	assert.equal(authorizations.at(-1).kind, "multipath-execution");
	const { recordedAt, ...projection } = assessment;
	assert.deepEqual((await host.listMultipathAssessments())[0], projection);
	await host.dispose();
});

test("evaluation keeps baseline comparison, needs-data and blocked receipts distinct", async () => {
	const { services } = memoryServices();
	services.authorize = async () => {};
	const host = discoveryHostLoader.create({
		projectId: "project-1",
		projectRoot: "/tmp/project-1",
		services,
	});
	await host.putBaseline({
		metric: "bixbench-regression",
		datasetId: "bixbench",
		datasetRevision: "fixture-1",
		value: 0.8,
		unit: "score",
		runId: "baseline-1",
		source: "fixture",
	});
	assert.equal((await host.listBaselines()).length, 1);
	const item = {
		id: "bix-1",
		metric: "bixbench-regression",
		datasetId: "bixbench",
		datasetRevision: "fixture-1",
		datasetStatus: "fixture",
		description: "closed analysis",
	};
	const missing = { ...item, id: "external", datasetStatus: "missing" };
	const result = await host.runEvaluation({
		cases: [item, missing],
		evaluator: async () => ({ value: 0.9 }),
	});
	assert.equal(result.status, "needs-data");
	assert.equal(result.metrics[0].baseline, 0.8);
	assert.deepEqual(result.missingData, ["external"]);
	const blocked = await host.runEvaluation({
		cases: [item],
		evaluator: async () => {
			throw new Error("unavailable evaluator");
		},
	});
	assert.equal(blocked.status, "blocked");
	assert.deepEqual(blocked.blockedCases, ["bix-1"]);
	await host.dispose();
});
