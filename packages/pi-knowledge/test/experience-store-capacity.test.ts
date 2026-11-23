import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createExperienceStore,
	EXPERIENCE_LIMITS,
	type ExperienceInput,
	type ExperienceStore,
} from "../src/core/experience-store.js";

const binding = { vaultId: "0123456789abcdef01234567" };
const roots: string[] = [];

const input = (overrides: Partial<ExperienceInput> = {}): ExperienceInput => ({
	jobId: "job-1",
	featureKey: "nextflow-align",
	summary: "Align reads with the configured workflow and inspect the bounded output manifest.",
	observation: {
		id: "obs-1",
		outcome: "success",
		exitCode: 0,
	},
	provenance: {
		runId: "run-1",
		receiptId: "receipt-1",
		manifestSha256: "a".repeat(64),
	},
	...overrides,
});

async function root() {
	const value = await mkdtemp(join(tmpdir(), "drone-experience-eviction-"));
	roots.push(value);
	return value;
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

/** Fill the store with distinct feature keys until it holds `count` records. */
async function fill(store: ExperienceStore, count: number, startRevision = 0) {
	for (let index = 0; index < count; index++) {
		await store.record(
			input({
				featureKey: `feature-${index}`,
				jobId: `job-${index}`,
				observation: { id: `obs-${index}`, outcome: "success" },
				summary: `Workflow result ${index} for alignment`,
			}),
			startRevision + index,
		);
	}
}

describe("experience store capacity", () => {
	it("evicts the oldest observations and keeps the ones written after the store is full", async () => {
		const directory = await root();
		const store = createExperienceStore({ binding, project: "project-a", hostId: "host-a", directory });
		await fill(store, EXPERIENCE_LIMITS.maxRecords);
		const newest = await store.record(
			input({
				featureKey: "feature-after-capacity",
				jobId: "job-after-capacity",
				observation: { id: "obs-after-capacity", outcome: "success" },
				summary: "Workflow result after the store was full for alignment",
			}),
			EXPERIENCE_LIMITS.maxRecords,
		);
		expect(newest.classification).toBe("new");
		const document = await store.read();
		expect(document.records).toHaveLength(EXPERIENCE_LIMITS.maxRecords);
		const keys = document.records.map((record) => record.featureKey);
		expect(keys).toContain("feature-after-capacity");
		expect(keys).not.toContain("feature-0");
	});

	it("keeps an observation added to an older feature key when the store is full", async () => {
		const directory = await root();
		const store = createExperienceStore({ binding, project: "project-a", hostId: "host-a", directory });
		await store.record(
			input({
				featureKey: "feature-old",
				jobId: "job-old",
				observation: { id: "obs-old", outcome: "success" },
			}),
			0,
		);
		await fill(store, EXPERIENCE_LIMITS.maxRecords - 1, 1);
		const updated = await store.record(
			input({
				featureKey: "feature-old",
				jobId: "job-old-again",
				observation: { id: "obs-old-again", outcome: "success" },
			}),
			EXPERIENCE_LIMITS.maxRecords,
		);
		expect(updated.classification).toBe("updated");
		await store.record(
			input({
				featureKey: "feature-one-past-capacity",
				jobId: "job-one-past-capacity",
				observation: { id: "obs-one-past-capacity", outcome: "success" },
			}),
			EXPERIENCE_LIMITS.maxRecords + 1,
		);
		const document = await store.read();
		const kept = document.records.find((record) => record.featureKey === "feature-old");
		expect(kept?.observationCount).toBe(2);
	});
});

describe("experience store record order", () => {
	it("writes the newest record first on disk and keeps that order across a reopen", async () => {
		const directory = await root();
		const store = createExperienceStore({ binding, project: "project-a", hostId: "host-a", directory });
		await store.record(
			input({
				featureKey: "alpha",
				jobId: "job-alpha",
				observation: { id: "obs-alpha", outcome: "success" },
			}),
			0,
		);
		await store.record(
			input({
				featureKey: "bravo",
				jobId: "job-bravo",
				observation: { id: "obs-bravo", outcome: "success" },
			}),
			1,
		);
		const document = await store.read();
		expect(document.records.map((record) => record.featureKey)).toEqual(["bravo", "alpha"]);
		const reopened = createExperienceStore({ binding, project: "project-a", hostId: "host-a", directory });
		const reloaded = await reopened.read();
		expect(reloaded.records.map((record) => record.featureKey)).toEqual(["bravo", "alpha"]);
	});
});

describe("experience store capacity across a reopen", () => {
	it("lets a record written after a reopen land in the document", async () => {
		const directory = await root();
		const store = createExperienceStore({ binding, project: "project-a", hostId: "host-a", directory });
		await fill(store, EXPERIENCE_LIMITS.maxRecords);
		const reopened = createExperienceStore({ binding, project: "project-a", hostId: "host-a", directory });
		const written = await reopened.record(
			input({
				featureKey: "feature-after-reopen",
				jobId: "job-after-reopen",
				observation: { id: "obs-after-reopen", outcome: "success" },
			}),
			EXPERIENCE_LIMITS.maxRecords,
		);
		expect(written.classification).toBe("new");
		const document = await reopened.read();
		expect(document.records.map((record) => record.featureKey)).toContain("feature-after-reopen");
	});
});
