import type { PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import type {
	KnowledgeOverview,
	KnowledgeSearchResult,
} from "../src/desktop/contract.js";

export interface KnowledgeRuntimeState {
	overview: KnowledgeOverview | null;
	overviewLoading: boolean;
	overviewError: string | null;
	searchResult: KnowledgeSearchResult | null;
	searchLoading: boolean;
	searchError: string | null;
}

const initialState = (): KnowledgeRuntimeState => ({
	overview: null,
	overviewLoading: false,
	overviewError: null,
	searchResult: null,
	searchLoading: false,
	searchError: null,
});
const errorText = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

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
	const update = (patch: Partial<KnowledgeRuntimeState>) => {
		state = { ...state, ...patch };
		for (const listener of listeners) listener();
	};
	async function refresh(): Promise<boolean> {
		if (!connected) return false;
		const owner = generation;
		const request = ++overviewRequest;
		update({ overviewLoading: true, overviewError: null });
		try {
			const overview = (await client.invoke(
				"overview",
				null,
			)) as KnowledgeOverview;
			if (!connected || generation !== owner || request !== overviewRequest)
				return false;
			if (
				state.overview?.binding?.vaultId !== overview.binding?.vaultId ||
				state.overview?.binding?.revision !== overview.binding?.revision
			) {
				currentQuery = null;
				++searchRequest;
				update({ searchResult: null, searchError: null, searchLoading: false });
			}
			update({ overview, overviewLoading: false });
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
		update({ searchLoading: true, searchError: null, searchResult: null });
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
	function connect() {
		connected = true;
		const owner = ++generation;
		eventRevision = 0;
		currentQuery = null;
		state = initialState();
		const unsubscribe = client.subscribe((event) => {
			if (!connected || generation !== owner || event.revision <= eventRevision)
				return;
			eventRevision = event.revision;
			const query = currentQuery;
			const request = ++searchRequest;
			update({ searchResult: null, searchLoading: false, searchError: null });
			void refresh().then((refreshed) => {
				if (refreshed && connected && generation === owner && request === searchRequest && query !== null && query === currentQuery)
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
	};
}
