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

export type KnowledgeCategory = "paper" | "software" | "method" | "idea" | "other";
export interface KnowledgeReadScope { revision: number; bindingRevision: number; project: string | null }
export interface KnowledgeReadNoteInput { path: string; revision: number; startLine?: number; expectedHash?: string }
export interface KnowledgeNoteSnippet { text: string; startLine: number; endLine: number; totalLines: number; truncated: boolean }
export type KnowledgeReadNoteResult = KnowledgeReadScope & ({ path: string; missing: true } | ({
	path: string; missing: false; title: string; kind: string; category: KnowledgeCategory; hash: string;
	humanReview: KnowledgeNoteSnippet | null; pending: Array<{ kind: string; revision: number }>;
} & KnowledgeNoteSnippet));
export interface KnowledgeLinksInput { path: string; revision: number }
export interface KnowledgeLink { path: string; title: string; exists: boolean }
export interface KnowledgeLinksResult extends KnowledgeReadScope { path: string; title: string; outgoing: KnowledgeLink[]; incoming: KnowledgeLink[] }
export interface KnowledgeGraphInput { revision: number; limit?: number; view?: "semantic" | "all"; mergeMirrors?: boolean }
export interface KnowledgeGraphResult extends KnowledgeReadScope {
	nodes: Array<{ path: string; title: string; kind: string; degree: number; warnings?: string[] }>;
	edges: Array<{ source: string; target: string }>;
	totalNotes: number;
	semantic: import("../core/semantic-model.js").SemanticGraph & {
		totalNotes: number; view: "semantic" | "all"; mergeMirrors: boolean;
		health: { isolated: number; duplicates: number; infrastructure: number; truncated: boolean; candidateNodes: number; candidateLimit: number };
	};
}
export interface KnowledgeJobsInput { revision: number; offset?: number; limit?: number }
export interface KnowledgeJob { key: string; kind: string; path: string; scope: string; revision: number; updated: string }
export interface KnowledgeJobsResult extends KnowledgeReadScope { items: KnowledgeJob[]; total: number; offset: number; nextOffset: number | null }
export interface KnowledgeRecentByCategoryInput { revision: number; limit?: number }
export interface KnowledgeRecentByCategoryResult extends KnowledgeReadScope {
	groups: Record<Exclude<KnowledgeCategory, "other">, KnowledgeRecentNote[]>;
	counts: Record<KnowledgeCategory, number>;
}

const boolean = { type: "boolean" };
const array = (items: object) => ({ type: "array", items });
const record = (additionalProperties: object) => ({ type: "object", additionalProperties });
const bindingRevision = { type: "integer", minimum: 1 };
const readScope = { revision: integer, bindingRevision, project: nullable(string) };
const notePath = { type: "string", minLength: 1, maxLength: 1000 };
const snippetProperties = { text: string, startLine: bindingRevision, endLine: integer, totalLines: integer, truncated: boolean };
const snippetSchema = object(snippetProperties);
const recentNoteSchema = object({ path: string, title: string, kind: string, updatedAt: { type: "number" } });
export const readNoteInputSchema = object({ path: notePath, revision: bindingRevision, startLine: bindingRevision,
	expectedHash: { type: "string", pattern: "^[a-f0-9]{64}$" } }, ["path", "revision"]);
export const readNoteResultSchema = { anyOf: [
	object({ ...readScope, path: string, missing: { const: true } }),
	object({ ...readScope, path: string, missing: { const: false }, title: string, kind: string,
		category: { enum: ["paper", "software", "method", "idea", "other"] }, hash: string, ...snippetProperties,
		humanReview: nullable(snippetSchema), pending: array(object({ kind: string, revision: integer })) }),
] };
export const linksInputSchema = object({ path: notePath, revision: bindingRevision });
export const linksResultSchema = object({ ...readScope, path: string, title: string,
	outgoing: array(object({ path: string, title: string, exists: boolean })),
	incoming: array(object({ path: string, title: string, exists: boolean })),
});
export const graphInputSchema = object({ revision: bindingRevision, limit: { type: "integer", minimum: 10, maximum: 500 },
	view: { enum: ["semantic", "all"] }, mergeMirrors: boolean }, ["revision"]);
const edgeSchema = object({ source: string, target: string });
const graphNodeProperties = { path: string, title: string, kind: string, degree: integer, warnings: array(string) };
const semanticNodeSchema = object({ ...graphNodeProperties,
	nodeType: { enum: ["note", "wiki", "navigation", "mirror", "infrastructure", "memory"] }, isInfrastructure: boolean,
	community: { type: "integer", minimum: -1 }, x: { type: "number" }, y: { type: "number" }, mirrors: array(string), contentType: string,
	isMain: boolean, sharedWith: array(string),
}, ["path", "title", "kind", "degree", "nodeType", "isInfrastructure", "community", "x", "y"]);
export const graphResultSchema = object({ ...readScope,
	nodes: array(object(graphNodeProperties, ["path", "title", "kind", "degree"])), edges: array(edgeSchema), totalNotes: integer,
	semantic: object({ nodes: array(semanticNodeSchema), edges: array(edgeSchema), totalNotes: integer,
		view: { enum: ["semantic", "all"] }, mergeMirrors: boolean,
		relations: array(object({ source: string, target: string, type: { enum: ["link", "directory", "duplicate"] } })),
		duplicates: array(object({ canonical: string, duplicate: string })), communities: record({ type: "integer", minimum: -1 }),
		layout: record(object({ x: { type: "number" }, y: { type: "number" } })),
		health: object({ isolated: integer, duplicates: integer, infrastructure: integer, truncated: boolean, candidateNodes: integer, candidateLimit: integer }),
	}),
});
export const jobsInputSchema = object({ revision: bindingRevision, offset: { type: "integer", minimum: 0, maximum: 100000 },
	limit: { type: "integer", minimum: 1, maximum: 50 } }, ["revision"]);
export const jobsResultSchema = object({ ...readScope,
	items: array(object({ key: string, kind: string, path: string, scope: string, revision: integer, updated: string })),
	total: integer, offset: integer, nextOffset: nullable(integer),
});
export const recentByCategoryInputSchema = object({ revision: bindingRevision, limit: { type: "integer", minimum: 1, maximum: 24 } }, ["revision"]);
export const recentByCategoryResultSchema = object({ ...readScope,
	groups: object({ paper: array(recentNoteSchema), software: array(recentNoteSchema), method: array(recentNoteSchema), idea: array(recentNoteSchema) }),
	counts: object({ paper: integer, software: integer, method: integer, idea: integer, other: integer }),
});
