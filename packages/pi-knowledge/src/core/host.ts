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
	/** Optional review UI operations supplied by the installed knowledge host. */
	reviews?(input: unknown): Promise<unknown>;
	preview?(input: unknown): Promise<unknown>;
	decide?(input: unknown): Promise<unknown>;
	setupPreview?(input: unknown): Promise<unknown>;
	specialistSettings?(input: unknown): Promise<unknown>;
	openTarget?(input: unknown): Promise<unknown>;
	semantic?: {
		status(input: unknown): Promise<unknown>;
		saveSettings(input: unknown): Promise<unknown>;
		testProvider(input: unknown): Promise<unknown>;
		index(input: unknown): Promise<unknown>;
		cancelIndex(input: unknown): Promise<unknown>;
	};
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
		reviews: (input) => import("./ui-service.js").then(({ knowledgeReviews }) => knowledgeReviews(input as never)),
		preview: (input) =>
			import("./ui-service.js").then(({ knowledgePreviewReview }) => knowledgePreviewReview(input as never)),
		decide: (input) =>
			import("./ui-service.js").then(({ knowledgeDecideReview }) => knowledgeDecideReview(input as never)),
		setupPreview: (input) =>
			import("./ui-service.js").then(({ knowledgeSetupPreview }) => knowledgeSetupPreview(input as never)),
		specialistSettings: (input) =>
			import("./ui-service.js").then(({ knowledgeSpecialistSettings }) => knowledgeSpecialistSettings(input as never)),
		openTarget: (input) =>
			import("./ui-service.js").then(({ knowledgeOpenTarget }) => knowledgeOpenTarget(input as never)),
		semantic: {
			status: (input) =>
				import("./ui-service.js").then(({ knowledgeSemanticStatus }) => knowledgeSemanticStatus(input as never)),
			saveSettings: (input) =>
				import("./ui-service.js").then(({ saveKnowledgeSemanticSettings }) => saveKnowledgeSemanticSettings(input as never)),
			testProvider: (input) =>
				import("./ui-service.js").then(({ testKnowledgeSemanticProvider }) => testKnowledgeSemanticProvider(input as never)),
			index: (input) =>
				import("./ui-service.js").then(({ indexKnowledgeSemantic }) => indexKnowledgeSemantic(input as never)),
			cancelIndex: (input) =>
				import("./ui-service.js").then(({ cancelKnowledgeSemanticIndex }) => cancelKnowledgeSemanticIndex(input as never)),
		},
		jobs: (input) => import("./ui-service.js").then(({ knowledgeJobs }) => knowledgeJobs(input as never)),
		maintenance: (input) =>
			import("./ui-service.js").then(({ knowledgeMaintenance }) => knowledgeMaintenance(input as never)),
	}),
};
