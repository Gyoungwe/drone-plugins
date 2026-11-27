import type { Fact, FactArtifact } from "@gyoungwe/plugin-api/p5-inquiry";
import { expect } from "vitest";
import { factCursorKey } from "../src/fact-delivery-policy.js";
import { InquiryFactOwner } from "../src/fact-owner.js";
import { attemptRecordForFact } from "../src/fact-projection.js";
import type { InquiryLedgerOwner } from "../src/ledger-owner.js";
import type { ArtifactRecord } from "../src/models.js";
import { hostFact } from "./helpers/fact-fixture.js";
import { it, projectId, workspaceId } from "./helpers/ledger-owner-fixture.js";

const scope = { workspaceId, sessionId: "artifact-projection" };
const observedAt = "2026-11-27T00:00:00.000Z";

function artifact(id: string, overrides: Partial<FactArtifact> = {}): FactArtifact {
	return {
		id,
		path: `outputs/${id}.txt`,
		bytes: 27,
		sha256: "a".repeat(64),
		parentIds: [],
		purpose: "evidence",
		...overrides,
	};
}

function createOwner(ledger: InquiryLedgerOwner) {
	return new InquiryFactOwner({ scope: async () => scope, ledger: async () => ledger });
}

function deliver(owner: InquiryFactOwner, ...facts: Fact[]) {
	return owner.deliver({ cursor: null, facts }, new AbortController().signal);
}

function recordedArtifact(ref: FactArtifact): ArtifactRecord {
	return {
		...ref,
		schemaVersion: 2,
		projectId,
		location: "local",
		status: "valid",
		source: { kind: "task", id: "saved-task" },
		createdAt: observedAt,
		updatedAt: observedAt,
	};
}

it("persists the mapped run artifact and exposes it through provenance", async ({ ledger }) => {
	const owner = createOwner(ledger.owner);
	const output = artifact("result");
	const observation = hostFact({
		id: "compute-fact",
		sequence: 1,
		at: observedAt,
		artifactRefs: [output],
		runReceiptRef: "run-receipt",
	});
	await expect(deliver(owner, observation)).resolves.toEqual({ cursor: "compute-fact" });
	const snapshot = await ledger.owner.read((service) => service.storage.snapshot());
	expect(snapshot.artifacts).toEqual([
		{
			...output,
			schemaVersion: 2,
			projectId,
			location: "local",
			status: "valid",
			source: { kind: "run", id: "run-receipt" },
			runId: "run-receipt",
			createdAt: observedAt,
			updatedAt: observedAt,
		},
	]);
	const provenance = await ledger.owner.read((service) => service.artifactProvenance(output.id));
	expect(provenance?.artifact).toEqual(snapshot.artifacts[0]);
	expect(provenance?.attempts.map((attempt) => attempt.id)).toEqual([
		"host-fact:compute:entity-compute-fact",
	]);
});

it("persists a child listed before its parent and exposes the lineage", async ({ ledger }) => {
	const owner = createOwner(ledger.owner);
	const parent = artifact("parent");
	const child = artifact("child", { parentIds: [parent.id] });
	await deliver(
		owner,
		hostFact({ id: "local-fact", sequence: 1, kind: "local-execution", artifactRefs: [child, parent] }),
	);
	const provenance = await ledger.owner.read((service) => service.artifactProvenance(child.id));
	expect(provenance?.artifact).toMatchObject({
		...child,
		source: { kind: "run", id: "entity-local-fact" },
	});
	expect(provenance?.artifact).not.toHaveProperty("runId");
	expect(provenance?.parentChain.map((record) => record.id)).toEqual([parent.id]);
});

it("consumes the fact and keeps attempt references when a parent is missing", async ({ ledger }) => {
	const owner = createOwner(ledger.owner);
	const child = artifact("child", { parentIds: ["missing"] });
	const descendant = artifact("descendant", { parentIds: [child.id] });
	const observation = hostFact({ id: "missing-parent", sequence: 1, artifactRefs: [descendant, child] });
	await expect(deliver(owner, observation)).resolves.toEqual({ cursor: observation.id });
	expect(await owner.cursor(ledger.controller.signal)).toBe(observation.id);
	const snapshot = await ledger.owner.read((service) => service.storage.snapshot());
	expect(snapshot.artifacts).toEqual([]);
	expect(snapshot.attempts[0]?.artifactIds).toEqual([descendant.id, child.id]);
});

it("does not overwrite existing rows when a fact repeats or changes their digest", async ({ ledger }) => {
	const owner = createOwner(ledger.owner);
	const unchanged = recordedArtifact(artifact("unchanged", { purpose: "deliverable" }));
	const pending: ArtifactRecord = {
		...recordedArtifact(artifact("pending")),
		status: "pending-review",
		pendingReviewDecisionIds: ["pending-decision"],
		reviews: [
			{ decisionId: "reviewed-decision", confirmedBy: "user", confirmedAt: observedAt, reason: "Checked" },
		],
	};
	await ledger.owner.write(
		"seed-artifacts",
		async (service) => {
			await service.storage.artifacts.put(unchanged);
			await service.storage.artifacts.put(pending);
		},
		ledger.controller.signal,
	);
	const observation = hostFact({
		id: "existing-artifacts",
		sequence: 1,
		artifactRefs: [artifact(unchanged.id), artifact(pending.id, { sha256: "b".repeat(64) })],
	});
	await expect(deliver(owner, observation)).resolves.toEqual({ cursor: observation.id });
	const snapshot = await ledger.owner.read((service) => service.storage.snapshot());
	expect(snapshot.artifacts).toHaveLength(2);
	expect(snapshot.artifacts).toContainEqual(unchanged);
	expect(snapshot.artifacts).toContainEqual(pending);
});

it("skips invalid digests and their descendants without losing the rest of the batch", async ({ ledger }) => {
	const owner = createOwner(ledger.owner);
	const invalid = artifact("invalid", { sha256: "not-a-digest" });
	const child = artifact("child", { parentIds: [invalid.id] });
	const valid = artifact("valid");
	const observation = hostFact({
		id: "mixed-digests",
		sequence: 1,
		artifactRefs: [invalid, child, artifact(invalid.id), valid],
	});
	await expect(deliver(owner, observation)).resolves.toEqual({ cursor: observation.id });
	expect(await owner.cursor(ledger.controller.signal)).toBe(observation.id);
	const snapshot = await ledger.owner.read((service) => service.storage.snapshot());
	expect(snapshot.artifacts.map((record) => record.id)).toEqual([valid.id]);
	expect(snapshot.attempts[0]?.artifactIds).toEqual([invalid.id, child.id, invalid.id, valid.id]);
});

it("uses the first reference across facts and preserves decision references", async ({ ledger }) => {
	const owner = createOwner(ledger.owner);
	const first = artifact("first");
	const decisionOutput = artifact("decision-output", { parentIds: [first.id] });
	await deliver(
		owner,
		hostFact({ id: "task", sequence: 1, kind: "task-accepted", artifactRefs: [first] }),
		hostFact({
			id: "decision",
			sequence: 2,
			kind: "decision",
			decisionKind: "compute-submit",
			runReceiptRef: "linked-run",
			artifactRefs: [artifact(first.id, { bytes: 99 }), decisionOutput],
		}),
	);
	const snapshot = await ledger.owner.read((service) => service.storage.snapshot());
	expect(snapshot.artifacts).toHaveLength(2);
	expect(snapshot.artifacts).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ ...first, source: { kind: "task", id: "entity-task" } }),
			expect.objectContaining({
				...decisionOutput,
				source: { kind: "task", id: "entity-decision" },
				runId: "linked-run",
			}),
		]),
	);
	expect(snapshot.decisions[0]?.affectedArtifactIds).toEqual([first.id, decisionOutput.id]);
});

it("replays a fact without creating rows or changing an existing row", async ({ ledger }) => {
	const owner = createOwner(ledger.owner);
	const output = artifact("result");
	const observation = hostFact({ id: "replayed", sequence: 1, artifactRefs: [output] });
	await deliver(owner, observation);
	await ledger.owner.write(
		"archive-artifact",
		async (service) => {
			const existing = await service.storage.artifacts.get(output.id);
			if (!existing) throw new Error("Projected artifact is missing");
			await service.storage.artifacts.put({ ...existing, status: "archived", updatedAt: observedAt });
		},
		ledger.controller.signal,
	);
	const before = await ledger.owner.read((service) => service.storage.artifacts.list());
	await expect(deliver(owner, observation)).resolves.toEqual({ cursor: observation.id });
	const after = await ledger.owner.read((service) => service.storage.artifacts.list());
	expect(after).toEqual(before);
	expect(after).toHaveLength(1);
	expect(after[0]?.status).toBe("archived");
});

it("rolls back artifacts and the cursor when attempt validation fails", async ({ engine }) => {
	const storage = engine.open(projectId);
	try {
		const store = storage.factProjection();
		const output = recordedArtifact(artifact("transaction-output"));
		const observation = hostFact({ id: "rollback", sequence: 1, artifactRefs: [output] });
		const attempt = attemptRecordForFact(observation, projectId);
		const cursor = {
			key: factCursorKey(scope),
			factId: observation.id,
			sequence: observation.sequence,
			sha256: "a".repeat(64),
			updatedAt: observedAt,
		};
		await expect(
			store.commit({ artifacts: [output], attempts: [attempt, { ...attempt, id: "" }], cursor }),
		).rejects.toThrow("Invalid attempt record");
		const snapshot = await storage.snapshot();
		expect(snapshot.artifacts).toEqual([]);
		expect(snapshot.attempts).toEqual([]);
		expect(await store.cursor(cursor.key)).toBeUndefined();

		await store.commit({ artifacts: [output], attempts: [attempt], cursor });
		expect(await storage.artifacts.get(output.id)).toEqual(output);
		expect(await store.cursor(cursor.key)).toMatchObject({ factId: observation.id, sequence: 1 });
	} finally {
		await storage.close();
	}
});
