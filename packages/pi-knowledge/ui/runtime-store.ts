import type { PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import type {
	KnowledgeOverview,
	KnowledgeSearchResult,
	KnowledgeReadNoteInput,
	KnowledgeReadNoteResult,
	KnowledgeLinksInput,
	KnowledgeLinksResult,
	KnowledgeGraphInput,
	KnowledgeGraphResult,
	KnowledgeJobsInput,
	KnowledgeJobsResult,
	KnowledgeRecentByCategoryResult,
	KnowledgeReviewsInput,
	KnowledgeReviewsResult,
	KnowledgePreviewReviewInput,
	KnowledgePreviewReviewResult,
	KnowledgeRejectReviewInput,
	KnowledgeRejectReviewResult,
	KnowledgeApplyReviewInput,
	KnowledgeApplyReviewResult,
	KnowledgeReviewHistoryResult,
	KnowledgeUndoReviewInput,
	KnowledgeUndoReviewResult,
} from "../src/desktop/contract.js";

export interface KnowledgeRuntimeState {
	query: string;
	selectedNote: {
		path: string;
		startLine: number;
		expectedHash?: string;
	} | null;
	view: "reading" | "graph" | "jobs" | "settings" | "reviews" | "history";
	observationRevision: number;
	overview: KnowledgeOverview | null;
	overviewLoading: boolean;
	overviewError: string | null;
	searchResult: KnowledgeSearchResult | null;
	searchLoading: boolean;
	searchError: string | null;
}

const initialState = (): KnowledgeRuntimeState => ({
	query: "",
	selectedNote: null,
	view: "reading",
	observationRevision: 0,
	overview: null,
	overviewLoading: false,
	overviewError: null,
	searchResult: null,
	searchLoading: false,
	searchError: null,
});
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One mounted caller owns its observations. Backend scope comes only from the bound client. */
export function createKnowledgeRuntimeStore(client: PluginUiRuntimeClient) {
	let state = initialState();
	const listeners = new Set<() => void>();
	let connected = false;
	let generation = 0;
	let overviewRequest = 0;
	let searchRequest = 0;
	let eventRevision = 0;
	let currentQuery: string | null = null;
	let readEpoch = 0;
	const update = (patch: Partial<KnowledgeRuntimeState>) => {
		state = { ...state, ...patch };
		for (const listener of listeners) listener();
	};
	async function refresh(): Promise<boolean> {
		if (!connected) return false;
		const owner = generation;
		const request = ++overviewRequest;
		++readEpoch;
		update({ overviewLoading: true, overviewError: null });
		try {
			const overview = (await client.invoke("overview", null)) as KnowledgeOverview;
			if (!connected || generation !== owner || request !== overviewRequest) return false;
			if (
				state.overview &&
				(state.overview.binding?.vaultId !== overview.binding?.vaultId ||
					state.overview.binding?.revision !== overview.binding?.revision)
			) {
				currentQuery = null;
				++searchRequest;
				update({
					searchResult: null,
					searchError: null,
					searchLoading: false,
					selectedNote: null,
					view: state.view === "settings" ? "settings" : "reading",
					query: "",
				});
			}
			update({
				overview,
				overviewLoading: false,
				observationRevision: state.observationRevision + 1,
				selectedNote: state.selectedNote ? { path: state.selectedNote.path, startLine: 1 } : null,
			});
			return true;
		} catch (error) {
			if (connected && generation === owner && request === overviewRequest)
				update({ overviewLoading: false, overviewError: errorText(error) });
			return false;
		}
	}
	async function search(query: string) {
		if (!connected) return;
		currentQuery = query;
		const owner = generation;
		const request = ++searchRequest;
		update({
			query,
			searchLoading: true,
			searchError: null,
			searchResult: null,
		});
		try {
			const binding = state.overview?.binding;
			if (!binding) throw new Error("Knowledge search requires a bound Vault");
			const searchResult = (await client.invoke("search", {
				query,
				revision: binding.revision,
				limit: 12,
			})) as KnowledgeSearchResult;
			if (connected && generation === owner && request === searchRequest)
				update({ searchResult, searchLoading: false });
		} catch (error) {
			if (connected && generation === owner && request === searchRequest)
				update({ searchLoading: false, searchError: errorText(error) });
		}
	}

	async function read<T>(operation: string, input: object): Promise<T> {
		if (!connected) throw new Error("Knowledge caller is disconnected");
		const binding = state.overview?.binding;
		if (!binding) throw new Error("Knowledge reading requires a bound Vault");
		const owner = generation,
			epoch = readEpoch;
		const result = (await client.invoke(operation, {
			...input,
			revision: binding.revision,
		})) as T;
		if (!connected || owner !== generation || epoch !== readEpoch)
			throw new Error("Knowledge observation was superseded");
		return result;
	}
	async function mutate<T>(operation: string, input: object): Promise<T> {
		if (!connected) throw new Error("Knowledge caller is disconnected");
		const binding = state.overview?.binding;
		if (!binding) throw new Error("Knowledge writing requires a bound Vault");
		const owner = generation;
		const result = (await client.invoke(operation, { ...input, revision: binding.revision })) as T;
		// A successful write invalidates reads before its receipt arrives. Retain that
		// receipt for this caller, while rejecting a replaced caller or binding.
		if (
			!connected ||
			owner !== generation ||
			state.overview?.binding?.vaultId !== binding.vaultId ||
			state.overview.binding.revision !== binding.revision
		)
			throw new Error("Knowledge caller or binding changed during writing");
		return result;
	}
	function connect() {
		connected = true;
		const owner = ++generation;
		eventRevision = 0;
		currentQuery = null;
		state = initialState();
		const unsubscribe = client.subscribe((event) => {
			if (!connected || generation !== owner || event.revision <= eventRevision) return;
			eventRevision = event.revision;
			const query = currentQuery;
			const request = ++searchRequest;
			update({ searchResult: null, searchLoading: false, searchError: null });
			void refresh().then((refreshed) => {
				if (
					refreshed &&
					connected &&
					generation === owner &&
					request === searchRequest &&
					query !== null &&
					query === currentQuery
				)
					void search(query);
			});
		});
		void refresh();
		return () => {
			unsubscribe();
			if (generation === owner) {
				connected = false;
				++generation;
			}
		};
	}
	return {
		getSnapshot: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		connect,
		refresh,
		search,
		setQuery: (query: string) => {
			currentQuery = null;
			++searchRequest;
			update({
				query,
				searchResult: null,
				searchLoading: false,
				searchError: null,
			});
		},
		openNote: (path: string, hit?: { startLine?: number; hash?: string }) =>
			update({
				selectedNote: {
					path,
					startLine: hit?.startLine ?? 1,
					expectedHash: hit?.hash,
				},
				view: "reading",
			}),
		closeNote: () => update({ selectedNote: null }),
		setView: (view: KnowledgeRuntimeState["view"]) => update({ view, selectedNote: null }),
		readNote: (input: Omit<KnowledgeReadNoteInput, "revision">) =>
			read<KnowledgeReadNoteResult>("readNote", input),
		links: (input: Omit<KnowledgeLinksInput, "revision">) => read<KnowledgeLinksResult>("links", input),
		graph: (input: Omit<KnowledgeGraphInput, "revision">) => read<KnowledgeGraphResult>("graph", input),
		jobs: (input: Omit<KnowledgeJobsInput, "revision">) => read<KnowledgeJobsResult>("jobs", input),
		reviews: (input: Omit<KnowledgeReviewsInput, "revision">) =>
			read<KnowledgeReviewsResult>("reviews", input),
		previewReview: (input: Omit<KnowledgePreviewReviewInput, "revision">) =>
			read<KnowledgePreviewReviewResult>("previewReview", input),
		rejectReview: (input: Omit<KnowledgeRejectReviewInput, "revision">) =>
			mutate<KnowledgeRejectReviewResult>("rejectReview", input),
		applyReview: (input: Omit<KnowledgeApplyReviewInput, "revision">) =>
			mutate<KnowledgeApplyReviewResult>("applyReview", input),
		reviewHistory: () => read<KnowledgeReviewHistoryResult>("reviewHistory", {}),
		undoReview: (input: Omit<KnowledgeUndoReviewInput, "revision">) =>
			mutate<KnowledgeUndoReviewResult>("undoReview", input),
		recentByCategory: () => read<KnowledgeRecentByCategoryResult>("recentByCategory", { limit: 8 }),
	};
}
