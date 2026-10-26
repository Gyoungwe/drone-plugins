/** Package-owned JSON view models. No host, renderer or Node dependency. */
export type KnowledgeCoverage = "uninitialized" | "indexing" | "partial" | "ready";
export interface KnowledgeBindingSummary {
	vaultId: string;
	revision: number;
	label: string;
}
export interface KnowledgeIndexSummary {
	revision: number;
	coverage: KnowledgeCoverage;
	noteCount: number;
	pendingChanges: number;
	lastReconciledAt: string | null;
}
export interface KnowledgeRecentNote {
	path: string;
	title: string;
	kind: string;
	updatedAt: number;
}
export interface KnowledgeOverview {
	state: "unconfigured" | "bound";
	binding: KnowledgeBindingSummary | null;
	project: string | null;
	index: KnowledgeIndexSummary | null;
	recentNotes: KnowledgeRecentNote[];
}
export interface KnowledgeSearchInput {
	query: string;
	/** The binding revision returned by overview, not the SQLite index revision. */
	revision: number;
	limit?: number;
}
export interface KnowledgeSearchHit {
	path: string;
	title: string;
	kind: string;
	hash: string;
	text: string;
	startLine: number;
	endLine: number;
}
export interface KnowledgeSearchResult {
	query: string;
	revision: number;
	bindingRevision: number;
	coverage: KnowledgeCoverage;
	complete: boolean;
	hits: KnowledgeSearchHit[];
}

const string = { type: "string" };
const integer = { type: "integer", minimum: 0 };
const coverage = { enum: ["uninitialized", "indexing", "partial", "ready"] };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
	type: "object", properties, required, additionalProperties: false,
});
export const overviewInputSchema = { type: "null" };
export const overviewResultSchema = object({
	state: { enum: ["unconfigured", "bound"] },
	binding: nullable(object({ vaultId: string, revision: { type: "integer", minimum: 1 }, label: string })),
	project: nullable(string),
	index: nullable(object({ revision: integer, coverage, noteCount: integer, pendingChanges: integer, lastReconciledAt: nullable(string) })),
	recentNotes: { type: "array", items: object({ path: string, title: string, kind: string, updatedAt: { type: "number" } }) },
});
export const searchInputSchema = object({
	query: { type: "string", minLength: 1, maxLength: 2000 },
	revision: { type: "integer", minimum: 1 },
	limit: { type: "integer", minimum: 1, maximum: 12 },
}, ["query", "revision"]);
export const searchResultSchema = object({
	query: string, revision: integer, bindingRevision: { type: "integer", minimum: 1 }, coverage,
	complete: { type: "boolean" },
	hits: { type: "array", items: object({ path: string, title: string, kind: string, hash: string, text: string, startLine: { type: "integer", minimum: 1 }, endLine: integer }) },
});
