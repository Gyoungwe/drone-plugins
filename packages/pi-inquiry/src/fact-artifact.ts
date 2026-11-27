import type { Fact, FactArtifact } from "@gyoungwe/plugin-api/p5-inquiry";
import { validateArtifactRecord } from "./lineage.js";
import type { ArtifactRecord } from "./models.js";

export function artifactRecordForFact(fact: Fact, artifact: FactArtifact, projectId: string): ArtifactRecord {
	const { id, path, bytes, sha256, parentIds, purpose } = artifact;
	const { kind, entityId, runReceiptRef, at } = fact;
	return {
		id,
		path,
		bytes,
		sha256,
		parentIds,
		purpose,
		schemaVersion: 2,
		projectId,
		location: "local",
		status: "valid",
		source:
			kind === "compute" || kind === "local-execution"
				? { kind: "run", id: runReceiptRef ?? entityId }
				: { kind: "task", id: entityId },
		...(runReceiptRef !== null ? { runId: runReceiptRef } : {}),
		createdAt: at,
		updatedAt: at,
	};
}

interface DependentArtifact {
	readonly record: ArtifactRecord;
	remainingParents: number;
}

export function orderValidFactArtifacts(
	records: readonly ArtifactRecord[],
	existing: readonly ArtifactRecord[],
): ArtifactRecord[] {
	const existingIds = new Set(existing.map((record) => record.id));
	const seen = new Set(existingIds);
	const dependents = new Map<string, DependentArtifact[]>();
	const ordered: ArtifactRecord[] = [];
	for (const record of records) {
		if (seen.has(record.id)) continue;
		seen.add(record.id);
		if (validateArtifactRecord(record).length) continue;
		const parents = record.parentIds.filter((parentId) => !existingIds.has(parentId));
		if (!parents.length) {
			ordered.push(record);
			continue;
		}
		const dependent = { record, remainingParents: parents.length };
		for (const parentId of parents) {
			const waiting = dependents.get(parentId);
			if (waiting) waiting.push(dependent);
			else dependents.set(parentId, [dependent]);
		}
	}
	for (const parent of ordered) {
		for (const dependent of dependents.get(parent.id) ?? []) {
			dependent.remainingParents -= 1;
			if (dependent.remainingParents === 0) ordered.push(dependent.record);
		}
	}
	return ordered;
}
