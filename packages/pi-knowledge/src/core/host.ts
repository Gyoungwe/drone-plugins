/**
 * Stable host entry point for the knowledge capability.
 *
 * The read port is deliberately dependency-free: Drone can discover it from
 * an installed package without importing the package's implementation into the
 * backend bundle. The rest of the host exports remain available during the
 * staged migration of write and lifecycle services.
 */
export * from "./index.js";

export interface KnowledgeHostPort {
	readonly contractVersion: 1;
	overview(input: unknown): Promise<unknown>;
	search(input: unknown): Promise<unknown>;
	read(input: unknown): Promise<unknown>;
	noteLinks(input: unknown): Promise<unknown>;
	graph(input: unknown): Promise<unknown>;
	/** Optional UI operations are exposed incrementally as the host migrates. */
	jobs?(input: unknown): Promise<unknown>;
	maintenance?(input: unknown): Promise<unknown>;
}

export interface KnowledgeHostLoader {
	readonly contractVersion: 1;
	load(): KnowledgeHostPort;
}

/** Generic discovery export consumed by Drone's optional capability loader. */
export const knowledgeHostLoader: KnowledgeHostLoader = {
	contractVersion: 1,
	load: () => ({
		contractVersion: 1,
		overview: (input) => import("./ui-service.js").then(({ knowledgeOverview }) => knowledgeOverview(input as never)),
		search: (input) => import("./ui-service.js").then(({ searchKnowledge }) => searchKnowledge(input as never)),
		read: (input) => import("./ui-service.js").then(({ knowledgeReadNote }) => knowledgeReadNote(input as never)),
		noteLinks: (input) => import("./ui-service.js").then(({ knowledgeNoteLinks }) => knowledgeNoteLinks(input as never)),
		graph: (input) => import("./ui-service.js").then(({ knowledgeGraph }) => knowledgeGraph(input as never)),
		jobs: (input) => import("./ui-service.js").then(({ knowledgeJobs }) => knowledgeJobs(input as never)),
		maintenance: (input) =>
			import("./ui-service.js").then(({ knowledgeMaintenance }) => knowledgeMaintenance(input as never)),
	}),
};
