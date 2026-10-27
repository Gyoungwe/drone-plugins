import { describe, expect, it, vi } from "vitest";
import type {
	KnowledgeOverview,
	KnowledgeSearchResult,
} from "../src/desktop/contract";
import { createKnowledgeRuntimeStore } from "./runtime-store";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}
const overview = (label = "Vault A", revision = 1): KnowledgeOverview => ({
	state: "bound",
	binding: { vaultId: "vault", revision, label },
	project: "project-a",
	index: {
		revision: 1,
		coverage: "ready",
		noteCount: 2,
		pendingChanges: 0,
		lastReconciledAt: null,
	},
	recentNotes: [],
});
const results = (query: string): KnowledgeSearchResult => ({
	query,
	revision: 1,
	bindingRevision: 1,
	coverage: "partial",
	complete: false,
	hits: [
		{
			path: "Library/Methods/method.md",
			title: query,
			kind: "method",
			hash: "a".repeat(64),
			text: "Observed source",
			startLine: 1,
			endLine: 2,
		},
	],
});
function fixture(
	invoke = vi.fn(
		async (_operation: string, _input: unknown): Promise<unknown> => overview(),
	),
) {
	let receive!: (event: { type: "changed"; revision: number }) => void;
	const unsubscribe = vi.fn();
	const client = {
		invoke,
		subscribe: vi.fn((listener: typeof receive) => {
			receive = listener;
			return unsubscribe;
		}),
	};
	const store = createKnowledgeRuntimeStore(client);
	return {
		store,
		client,
		emit: (revision: number) => receive({ type: "changed", revision }),
		unsubscribe,
	};
}

const settle = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe("knowledge runtime store", () => {
	it("loads and refreshes through the bound generic client without caller-supplied identity", async () => {
		const value = fixture();
		const disconnect = value.store.connect();
		await settle();
		expect(value.store.getSnapshot().overview).toEqual(overview());
		expect(value.client.invoke).toHaveBeenCalledWith("overview", null);
		await value.store.refresh();
		value.client.invoke.mockResolvedValueOnce(results("method"));
		await value.store.search("method");
		expect(value.client.invoke).toHaveBeenLastCalledWith("search", {
			query: "method",
			revision: 1,
			limit: 12,
		});
		expect(value.store.getSnapshot().searchResult?.complete).toBe(false);
		disconnect();
		expect(value.unsubscribe).toHaveBeenCalledOnce();
	});

	it("forwards review decisions with the current binding revision", async () => {
		const value = fixture(
			vi.fn(async (operation) => {
				if (operation === "overview") return overview("Vault A", 7);
				return operation === "applyReview"
					? { id: "candidate", status: "applied", path: "Wiki/A.md", vaultWritten: true, reviewRecorded: true, indexed: false }
					: { id: "candidate", status: "rejected", vaultWritten: false, reviewRecorded: true };
			}),
		);
		const disconnect = value.store.connect();
		await settle();
		await value.store.applyReview({ id: "candidate", expectedProposalHash: "a".repeat(64) });
		await value.store.rejectReview({ id: "candidate", expectedProposalHash: "b".repeat(64) });
		expect(value.client.invoke).toHaveBeenCalledWith("applyReview", {
			id: "candidate",
			expectedProposalHash: "a".repeat(64),
			revision: 7,
		});
		expect(value.client.invoke).toHaveBeenCalledWith("rejectReview", {
			id: "candidate",
			expectedProposalHash: "b".repeat(64),
			revision: 7,
		});
		disconnect();
	});

	it("reports backend failures and allows explicit retry without fabricating empty results", async () => {
		const value = fixture(
			vi
				.fn()
				.mockRejectedValueOnce(new Error("Worker unavailable"))
				.mockResolvedValue(overview()),
		);
		const disconnect = value.store.connect();
		await settle();
		expect(value.store.getSnapshot()).toMatchObject({
			overview: null,
			overviewLoading: false,
			overviewError: "Worker unavailable",
		});
		await value.store.refresh();
		value.client.invoke.mockRejectedValueOnce(new Error("Binding changed"));
		await value.store.search("method");
		expect(value.store.getSnapshot()).toMatchObject({
			overviewError: null,
			searchResult: null,
			searchError: "Binding changed",
			searchLoading: false,
		});
		disconnect();
	});

	it("ignores out-of-order responses and old caller results after disconnect/reconnect", async () => {
		const first = deferred<unknown>();
		const next = deferred<unknown>();
		const value = fixture(
			vi
				.fn()
				.mockReturnValueOnce(first.promise)
				.mockReturnValueOnce(next.promise)
				.mockResolvedValue(overview("Vault B")),
		);
		const disconnect = value.store.connect();
		const refreshed = value.store.refresh();
		next.resolve(overview("New"));
		await refreshed;
		first.resolve(overview("Old"));
		await settle();
		expect(value.store.getSnapshot().overview?.binding?.label).toBe("New");
		const pending = deferred<unknown>();
		value.client.invoke.mockReturnValueOnce(pending.promise);
		const searching = value.store.search("old session");
		disconnect();
		const stopNext = value.store.connect();
		await settle();
		pending.resolve(results("old session"));
		await searching;
		expect(value.store.getSnapshot().overview?.binding?.label).toBe("Vault B");
		expect(value.store.getSnapshot().searchResult).toBeNull();
		stopNext();
	});

	it("refreshes once for a new changed revision and replaces in-flight search with current results", async () => {
		const fresh = results("old index");
		fresh.hits[0].text = "Fresh index text";
		const value = fixture(
			vi.fn(async (operation) =>
				operation === "overview" ? overview() : fresh,
			),
		);
		const disconnect = value.store.connect();
		await settle();
		const pending = deferred<unknown>();
		value.client.invoke.mockReturnValueOnce(pending.promise);
		const searching = value.store.search("old index");
		value.emit(3);
		value.emit(3);
		value.emit(2);
		await settle();
		expect(
			value.client.invoke.mock.calls.filter(
				([method]) => method === "overview",
			),
		).toHaveLength(2);
		await vi.waitFor(() =>
			expect(value.store.getSnapshot().searchResult).toEqual(fresh),
		);
		pending.resolve(results("old index"));
		await searching;
		expect(value.store.getSnapshot().searchResult).toEqual(fresh);
		disconnect();
		value.emit(4);
		expect(
			value.client.invoke.mock.calls.filter(
				([method]) => method === "overview",
			),
		).toHaveLength(2);
	});
	it("does not restart an old query after a newer query supersedes its refresh", async () => {
		const value = fixture(
			vi.fn(async (operation, input: any) =>
				operation === "overview" ? overview() : results(input.query),
			),
		);
		const disconnect = value.store.connect();
		await settle();
		await value.store.search("first");
		const refreshed = deferred<unknown>();
		value.client.invoke.mockReturnValueOnce(refreshed.promise);
		value.emit(1);
		await value.store.search("second");
		refreshed.resolve(overview());
		await settle();
		expect(value.store.getSnapshot().searchResult?.query).toBe("second");
		expect(
			value.client.invoke.mock.calls.filter(([method]) => method === "search"),
		).toHaveLength(2);
		disconnect();
	});

	for (const change of ["binding", "session"] as const) {
		it(`does not repeat a query after ${change} changes during refresh`, async () => {
			const value = fixture(
				vi.fn(async (operation) =>
					operation === "overview" ? overview() : results("first"),
				),
			);
			const disconnect = value.store.connect();
			await settle();
			await value.store.search("first");
			const refreshed = deferred<unknown>();
			value.client.invoke.mockReturnValueOnce(refreshed.promise);
			value.emit(1);
			if (change === "session") disconnect();
			refreshed.resolve(overview("New binding", 2));
			await settle();
			expect(value.store.getSnapshot().searchResult).toBeNull();
			expect(
				value.client.invoke.mock.calls.filter(
					([method]) => method === "search",
				),
			).toHaveLength(1);
			if (change === "binding") disconnect();
		});
	}
});

it("rejects delayed note/graph reads after changed, binding change, or caller disconnect", async () => {
	const pending = deferred<unknown>();
	const value = fixture();
	const disconnect = value.store.connect();
	await settle();
	value.store.openNote("Library/a.md", { startLine: 3, hash: "a".repeat(64) });
	value.client.invoke.mockImplementation(async (operation) =>
		operation === "overview" ? overview() : pending.promise,
	);
	const oldRead = value.store.readNote({ path: "Library/a.md", startLine: 1 });
	const rejected = expect(oldRead).rejects.toThrow("superseded");
	value.emit(3);
	await settle();
	pending.resolve({ path: "Library/a.md", missing: true });
	await rejected;
	expect(value.store.getSnapshot().selectedNote).toEqual({
		path: "Library/a.md",
		startLine: 1,
	});
	value.client.invoke.mockResolvedValueOnce(overview("B", 2));
	await value.store.refresh();
	expect(value.store.getSnapshot().selectedNote).toBeNull();
	const later = deferred<unknown>();
	value.client.invoke.mockReturnValueOnce(later.promise);
	const graph = value.store.graph({ view: "all" });
	const closed = expect(graph).rejects.toThrow("superseded");
	disconnect();
	later.resolve({ nodes: [] });
	await closed;
});

it("keeps the submitted query through refresh and typing cancels an older repeat", async () => {
	const value = fixture();
	value.store.connect();
	await settle();
	value.client.invoke.mockResolvedValueOnce(results("original"));
	await value.store.search("original");
	const pending = deferred<KnowledgeOverview>();
	value.client.invoke.mockReturnValueOnce(pending.promise);
	value.emit(2);
	value.store.setQuery("new text");
	pending.resolve(overview());
	await settle();
	expect(value.store.getSnapshot().query).toBe("new text");
	expect(value.store.getSnapshot().searchResult).toBeNull();
	expect(
		value.client.invoke.mock.calls.filter(([op]) => op === "search"),
	).toHaveLength(1);
});
