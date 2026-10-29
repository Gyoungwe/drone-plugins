import { Type } from "typebox";

const text = Type.String({ minLength: 1, maxLength: 4096 });
const timestamp = Type.Union([Type.Number(), text]);
const scalar = Type.Union([
	Type.String({ maxLength: 8192 }),
	Type.Number(),
	Type.Boolean(),
	Type.Null(),
]);
const parameters = Type.Record(Type.String(), scalar);
const provenance = Type.Object(
	{
		containerDigests: Type.Optional(Type.Array(text, { maxItems: 128 })),
		workflow: Type.Optional(text),
		modules: Type.Optional(Type.Array(text, { maxItems: 128 })),
		commandSummary: Type.Optional(text),
		environment: Type.Optional(
			Type.Record(Type.String(), Type.String({ maxLength: 8192 })),
		),
	},
	{ additionalProperties: false },
);
const artifact = Type.Object(
	{
		id: Type.Optional(text),
		path: text,
		bytes: Type.Optional(Type.Integer({ minimum: 0 })),
		size: Type.Optional(Type.Integer({ minimum: 0 })),
		sha256: Type.Optional(Type.String({ pattern: "^[a-fA-F0-9]{64}$" })),
		location: Type.Optional(
			Type.Union([Type.Literal("local"), Type.Literal("remote")]),
		),
		purpose: Type.Optional(
			Type.Union(
				["input", "draft", "intermediate", "deliverable", "evidence"].map(
					(value) => Type.Literal(value),
				),
			),
		),
		status: Type.Optional(
			Type.Union(
				[
					"valid",
					"superseded",
					"cleanup-candidate",
					"archived",
					"pending-review",
				].map((value) => Type.Literal(value)),
			),
		),
		parentIds: Type.Optional(Type.Array(text, { maxItems: 256 })),
		runId: Type.Optional(text),
		sourceKind: Type.Optional(
			Type.Union(
				["task", "run", "input", "tool", "workflow", "manual"].map((value) =>
					Type.Literal(value),
				),
			),
		),
		sourceId: Type.Optional(text),
	},
	{ additionalProperties: false },
);
const artifacts = Type.Array(artifact, { maxItems: 256 });
const common = {
	id: text,
	projectId: Type.Optional(text),
	sessionId: Type.Optional(text),
	turn: Type.Optional(Type.Integer({ minimum: 0 })),
	codeFingerprint: Type.Optional(text),
	parameters: Type.Optional(parameters),
	runProvenance: Type.Optional(provenance),
	artifacts: Type.Optional(artifacts),
};
const compute = Type.Object(
	{
		...common,
		jobId: text,
		type: Type.Union(
			[
				"created",
				"submitted",
				"status",
				"logs",
				"collected",
				"cancelled",
				"error",
			].map((value) => Type.Literal(value)),
		),
		at: timestamp,
		status: Type.Optional(text),
		cursor: Type.Optional(text),
		detail: Type.Optional(text),
		runId: Type.Optional(text),
		startedAt: Type.Optional(timestamp),
		hostId: Type.Optional(text),
		manifest: Type.Optional(
			Type.Object(
				{ entries: Type.Optional(artifacts) },
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);
const task = Type.Object(
	{
		...common,
		taskId: text,
		runId: Type.Optional(text),
		status: Type.Union(
			["succeeded", "failed", "cancelled", "blocked", "partial", "unknown"].map(
				(value) => Type.Literal(value),
			),
		),
		at: Type.Optional(timestamp),
		startedAt: Type.Optional(timestamp),
		detail: Type.Optional(text),
		manifest: Type.Optional(
			Type.Object(
				{ entries: Type.Optional(artifacts) },
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);
const local = Type.Object(
	{
		...common,
		toolName: text,
		startedAt: Type.Optional(timestamp),
		finishedAt: Type.Optional(timestamp),
		codeFingerprint: text,
		parameters,
		runProvenance: provenance,
		outcome: Type.Union(
			["running", "succeeded", "failed", "blocked", "unknown"].map((value) =>
				Type.Literal(value),
			),
		),
	},
	{ additionalProperties: false },
);
/** Exact external event shape, deliberately ordinary asserted JSON rather than an execution proof. */
export const assertedEventWriteSchema = Type.Union([
	Type.Object(
		{ action: Type.Literal("recordComputeEvent"), event: compute },
		{ additionalProperties: false },
	),
	Type.Object(
		{ action: Type.Literal("recordTaskTerminal"), event: task },
		{ additionalProperties: false },
	),
	Type.Object(
		{ action: Type.Literal("recordLocalExecution"), event: local },
		{ additionalProperties: false },
	),
]);
