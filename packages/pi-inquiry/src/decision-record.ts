import { type DecisionKind, type DecisionRecord, INQUIRY_SCHEMA_VERSION } from "./models.js";

export function decisionRecord(input: {
	readonly id: string;
	readonly projectId: string;
	readonly kind: DecisionKind;
	readonly summary: string;
	readonly basis?: readonly string[];
	readonly affectedArtifactIds?: readonly string[];
	readonly createdAt?: string;
}): DecisionRecord {
	return {
		id: input.id,
		schemaVersion: INQUIRY_SCHEMA_VERSION,
		projectId: input.projectId,
		kind: input.kind,
		summary: input.summary,
		basis: [...new Set(input.basis ?? [])],
		affectedArtifactIds: [...new Set(input.affectedArtifactIds ?? [])],
		status: "active",
		createdAt: input.createdAt ?? new Date().toISOString(),
	};
}
