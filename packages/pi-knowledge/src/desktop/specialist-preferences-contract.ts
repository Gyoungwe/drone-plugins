/** Human Desktop settings operations; limits match the specialist owner's bounded view. */
export interface KnowledgeSpecialistLimits {
	maxRunsPerTurn: number;
	maxRunsPerSession: number;
	maxToolOperations: number;
	concurrency: number;
	queueLimit: number;
	queueWaitMs: number;
	timeoutMs: number;
	maxTokensPerTurn: number;
	maxTokensPerSession: number;
	maxCostPerTurn: number;
	maxCostPerSession: number;
}
export interface KnowledgeSpecialistPreferences extends KnowledgeSpecialistLimits {
	mode: "automatic" | "manual" | "off";
	revision: number;
	maxConcurrency: number;
	bindingRevision: number | null;
	canWriteState: boolean;
}
export interface KnowledgeSetSpecialistSettingsInput extends Partial<KnowledgeSpecialistLimits> {
	mode: KnowledgeSpecialistPreferences["mode"];
	revision: number;
	bindingRevision: number;
}

const integer = (minimum: number, maximum: number) => ({ type: "integer", minimum, maximum });
const mode = { type: "string", enum: ["automatic", "manual", "off"] };
const limits = {
	maxRunsPerTurn: integer(1, 4),
	maxRunsPerSession: integer(1, 20),
	maxToolOperations: integer(1, 80),
	concurrency: integer(1, 4),
	queueLimit: integer(1, 8),
	queueWaitMs: integer(50, 15000),
	timeoutMs: integer(50, 120000),
	maxTokensPerTurn: integer(1, 24000),
	maxTokensPerSession: integer(1, 120000),
	maxCostPerTurn: { type: "number", minimum: 0, maximum: 1 },
	maxCostPerSession: { type: "number", minimum: 0, maximum: 5 },
};
const bindingRevision = integer(1, Number.MAX_SAFE_INTEGER);
const settings = { ...limits, mode, revision: integer(0, Number.MAX_SAFE_INTEGER) };
export const specialistPreferencesInputSchema = { type: "null" };
const resultProperties = {
	...settings,
	maxConcurrency: { const: 4 },
	bindingRevision: { anyOf: [bindingRevision, { type: "null" }] },
	canWriteState: { type: "boolean" },
};
export const specialistPreferencesResultSchema = {
	type: "object",
	properties: resultProperties,
	required: Object.keys(resultProperties),
	additionalProperties: false,
};
export const setSpecialistSettingsInputSchema = {
	type: "object",
	properties: {
		...settings,
		revision: integer(0, Number.MAX_SAFE_INTEGER - 1),
		bindingRevision,
	},
	required: ["mode", "revision", "bindingRevision"],
	additionalProperties: false,
};
