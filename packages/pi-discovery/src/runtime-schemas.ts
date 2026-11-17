import { JOURNALS } from "./native-records.js";

export const readMetadata = {
	drone: { readOnly: true, capabilities: ["research", "analysis"] },
};
export const writeMetadata = { drone: { capabilities: ["research", "analysis"] } };
export const nullSchema = { type: "null" } as const;
export const objectSchema = { type: "object" } as const;
export const bindingSchema = {
	type: "object",
	properties: {
		root: { type: "string", minLength: 1 },
		acknowledgeExistingData: { type: "boolean" },
	},
	required: ["root", "acknowledgeExistingData"],
	additionalProperties: false,
} as const;
export const planSchema = {
	type: "object",
	properties: {
		id: { type: "string", minLength: 1 },
		hypothesisId: { type: "string", minLength: 1 },
		prior: {
			type: "object",
			properties: {
				direction: { enum: ["positive", "negative", "none", "unknown"] },
				recordedAt: { type: "string" },
				confidence: { type: "number", minimum: 0, maximum: 1 },
				magnitude: { type: "number", minimum: 0 },
			},
			required: ["direction", "recordedAt"],
			additionalProperties: false,
		},
		budget: {
			type: "object",
			properties: {
				maxExecutions: { type: "integer", minimum: 1 },
				maxWallTimeMs: { type: "integer", minimum: 1 },
				maxOutputBytes: { type: "integer", minimum: 1 },
				maxCostUnits: { type: "number", exclusiveMinimum: 0 },
			},
			required: ["maxExecutions", "maxWallTimeMs", "maxOutputBytes", "maxCostUnits"],
			additionalProperties: false,
		},
		candidates: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string", minLength: 1 },
					statement: { type: "string", minLength: 1 },
					surprise: { type: "number", minimum: 0, maximum: 1 },
					estimatedCost: { type: "number", exclusiveMinimum: 0 },
					expectedExplanationsExcluded: { type: "number", minimum: 0 },
					credibility: { type: "number", minimum: 0, maximum: 1 },
				},
				required: [
					"id",
					"statement",
					"surprise",
					"estimatedCost",
					"expectedExplanationsExcluded",
					"credibility",
				],
				additionalProperties: false,
			},
		},
	},
	required: ["id", "hypothesisId", "prior", "budget", "candidates"],
	additionalProperties: false,
} as const;

export const journalSchema = { type: "string", enum: JOURNALS } as const;

export const kernelSchema = {
	type: "object",
	properties: {
		sessionId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[a-zA-Z0-9._-]+$" },
		runDirectory: { type: "string", minLength: 6, pattern: "^runs/" },
		language: { enum: ["python", "r"] },
		image: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
		dataClassification: { enum: ["public", "internal", "controlled", "restricted"] },
		idleTimeoutMs: { type: "integer", minimum: 1, maximum: 120000 },
		executionTimeoutMs: { type: "integer", minimum: 1, maximum: 120000 },
		maxExecutions: { type: "integer", minimum: 1, maximum: 32 },
		maxOutputBytes: { type: "integer", minimum: 1, maximum: 1000000 },
	},
	required: ["sessionId", "runDirectory", "language", "image", "dataClassification"],
	additionalProperties: false,
} as const;
export const kernelIdSchema = {
	type: "object",
	properties: { sessionId: kernelSchema.properties.sessionId },
	required: ["sessionId"],
	additionalProperties: false,
} as const;
export const kernelExecuteSchema = {
	type: "object",
	properties: {
		sessionId: kernelSchema.properties.sessionId,
		code: { type: "string", minLength: 1, maxLength: 1000000 },
	},
	required: ["sessionId", "code"],
	additionalProperties: false,
} as const;

export const requestSchema = {
	type: "object",
	properties: {
		requestId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[a-zA-Z0-9._-]+$" },
	},
	required: ["requestId"],
	additionalProperties: false,
} as const;
