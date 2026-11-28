import { type Static, Type } from "typebox";
import { assertedEventWriteSchema } from "./event-schema.js";

const name = Type.String({ minLength: 1, maxLength: 128 });
const promotionText = Type.String({ minLength: 1 });
export const readMetadata = {
	drone: { capabilities: ["research", "provenance"], readOnly: true },
};
export const writeMetadata = { drone: { capabilities: ["research", "provenance"] } };
const object = Type.Record(Type.String(), Type.Unknown());
export const readSchema = Type.Union([
	Type.Object({ action: Type.Literal("status") }, { additionalProperties: false }),
	Type.Object({ action: Type.Literal("inspect"), root: name }, { additionalProperties: false }),
	Type.Object(
		{
			action: Type.Literal("planPromotion"),
			taskId: promotionText,
			runId: Type.Optional(promotionText),
			root: Type.Optional(promotionText),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Union([
				Type.Literal("snapshot"),
				Type.Literal("listDecisions"),
				Type.Literal("cleanupDryRun"),
				Type.Literal("pendingReruns"),
			]),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("artifactProvenance"),
			id: Type.String({ minLength: 1 }),
		},
		{ additionalProperties: false },
	),
]);
export const writeSchema = Type.Union([
	assertedEventWriteSchema,
	Type.Object({ action: Type.Literal("drainHostEvents") }, { additionalProperties: false }),
	Type.Object(
		{
			action: Type.Literal("promoteRun"),
			taskId: promotionText,
			runId: Type.Optional(promotionText),
			root: Type.Optional(promotionText),
			planSha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("bind"),
			root: name,
			metadataRoot: name,
			acknowledgeExistingData: Type.Boolean(),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Union([
				Type.Literal("recordArtifact"),
				Type.Literal("recordFinding"),
				Type.Literal("recordQuestion"),
				Type.Literal("recordAttempt"),
				Type.Literal("recordDecision"),
			]),
			record: object,
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Union([
				Type.Literal("revokeDecision"),
				Type.Literal("confirmDecision"),
				Type.Literal("reviewDecisionArtifacts"),
			]),
			id: Type.String({ minLength: 1 }),
			reason: Type.String({ minLength: 1 }),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("associateDecisionArtifacts"),
			id: Type.String({ minLength: 1 }),
			artifactIds: Type.Array(Type.String({ minLength: 1 })),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Union([Type.Literal("rerunArtifact"), Type.Literal("collectRerun")]),
			id: Type.String({ minLength: 1 }),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("markRerunRunning"),
			id: Type.String({ minLength: 1 }),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("completeRerun"),
			id: Type.String({ minLength: 1 }),
			outcome: Type.Union([
				Type.Object({ error: Type.String() }, { additionalProperties: false }),
				Type.Object({ artifact: object }, { additionalProperties: false }),
			]),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Union([Type.Literal("reconcile"), Type.Literal("restoreOriginal")]),
		},
		{ additionalProperties: false },
	),
]);
export type ReadInput = Static<typeof readSchema>;
export type WriteInput = Static<typeof writeSchema>;
