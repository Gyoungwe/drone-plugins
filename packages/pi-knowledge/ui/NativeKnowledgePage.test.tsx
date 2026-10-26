import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sessions, services, setPluginRuntime } from "../test/setup";
import type {
	KnowledgeOverview,
	KnowledgeSearchResult,
} from "../src/desktop/contract";
import { KnowledgePage, KnowledgeSurface } from "./entry";

const overview: KnowledgeOverview = {
	state: "bound",
	binding: { vaultId: "vault", revision: 4, label: "Research library" },
	project: "project-a",
	index: {
		revision: 9,
		coverage: "ready",
		noteCount: 3,
		pendingChanges: 0,
		lastReconciledAt: null,
	},
	recentNotes: [
		{
			path: "Library/Methods/method.md",
			title: "Observed method",
			kind: "method",
			updatedAt: 1,
		},
	],
};
const results: KnowledgeSearchResult = {
	query: "method",
	revision: 9,
	bindingRevision: 4,
	coverage: "partial",
	complete: false,
	hits: [
		{
			path: "Library/Methods/method.md",
			title: "Matched method",
			kind: "method",
			hash: "a".repeat(64),
			text: "Source excerpt from this session",
			startLine: 2,
			endLine: 5,
		},
	],
};
function client() {
	return {
		invoke: vi.fn(
			async (operation: string, _input: unknown): Promise<unknown> =>
				operation === "overview" ? overview : results,
		),
		subscribe: vi.fn(() => vi.fn()),
	};
}
beforeEach(() => {
	sessions.setState({ activeSessionId: "session-a", cwd: "/project-a" });
});
afterEach(cleanup);

it("renders overview, search excerpts and read-only refresh through the generic runtime only", async () => {
	const runtime = client();
	setPluginRuntime(runtime);
	services.getKnowledgeOverview = vi.fn(() => {
		throw new Error("Legacy host knowledge must not run");
	});
	services.searchKnowledge = vi.fn(() => {
		throw new Error("Legacy host knowledge must not run");
	});
	render(<KnowledgePage />);
	await screen.findByText("Observed method");
	expect(screen.getByText("3 篇笔记 · 索引已就绪")).toBeDefined();
	fireEvent.change(screen.getByRole("searchbox", { name: "搜索知识库" }), {
		target: { value: "method" },
	});
	fireEvent.click(screen.getByRole("button", { name: "搜索" }));
	await screen.findByText("Source excerpt from this session");
	expect(runtime.invoke).toHaveBeenLastCalledWith("search", {
		query: "method",
		revision: 4,
		limit: 12,
	});
	expect(
		screen.getByText("索引尚未完整，当前结果不代表全部资料。"),
	).toBeDefined();
	fireEvent.click(screen.getByRole("button", { name: "刷新" }));
	await waitFor(() =>
		expect(
			runtime.invoke.mock.calls.filter(
				([operation]) => operation === "overview",
			),
		).toHaveLength(2),
	);
	expect(
		runtime.invoke.mock.calls.every(
			([, input]) => input === null || !("cwd" in (input as object)),
		),
	).toBe(true);
	expect(services.getKnowledgeOverview).not.toHaveBeenCalled();
	expect(services.searchKnowledge).not.toHaveBeenCalled();
});

it("removes a previous session's search results and rejects late responses after caller selection changes", async () => {
	const runtime = client();
	let complete!: (value: unknown) => void;
	runtime.invoke.mockImplementation(async (operation) =>
		operation === "overview"
			? overview
			: new Promise((resolve) => {
					complete = resolve;
				}),
	);
	setPluginRuntime(runtime);
	render(<KnowledgePage />);
	await screen.findByText("Observed method");
	fireEvent.change(screen.getByRole("searchbox"), { target: { value: "old" } });
	fireEvent.click(screen.getByRole("button", { name: "搜索" }));
	act(() => sessions.setState({ activeSessionId: "session-b" }));
	await waitFor(() => expect(runtime.subscribe).toHaveBeenCalledTimes(2));
	await act(async () => complete(results));
	expect(screen.queryByText("Source excerpt from this session")).toBeNull();
	expect(runtime.subscribe.mock.results[0].value).toHaveBeenCalledOnce();
});

it("shows explicit errors and unavailable surfaces without calling any legacy domain service", async () => {
	const runtime = client();
	runtime.invoke.mockRejectedValue(new Error("Runtime access was revoked"));
	setPluginRuntime(runtime);
	const page = render(<KnowledgePage />);
	await screen.findByRole("alert");
	expect(screen.getByText("Runtime access was revoked")).toBeDefined();
	expect(screen.queryByRole("searchbox")).toBeNull();
	page.unmount();
	runtime.invoke.mockClear();
	render(<KnowledgeSurface />);
	expect(screen.getByText("其他知识功能暂不可用")).toBeDefined();
	expect(runtime.invoke).not.toHaveBeenCalled();
});
