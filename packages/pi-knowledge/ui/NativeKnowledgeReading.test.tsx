import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { sessions, services, setPluginRuntime, knowledge } from "../test/setup";
import { KnowledgePage } from "./entry";
const path = "Library/Methods/a.md",
	other = "Library/Methods/b.md",
	hash = "a".repeat(64);
const overview = {
	state: "bound",
	binding: { vaultId: "vault", revision: 2, label: "Library" },
	project: "/alpha",
	index: {
		revision: 8,
		coverage: "ready",
		noteCount: 12,
		pendingChanges: 0,
		lastReconciledAt: null,
	},
	recentNotes: [{ path, title: "A method", kind: "method", updatedAt: 1 }],
};
const recent = {
	revision: 8,
	bindingRevision: 2,
	project: "/alpha",
	groups: { paper: [], software: [], method: overview.recentNotes, idea: [] },
	counts: { paper: 0, software: 0, method: 2, idea: 0, other: 0 },
};
const note = (target = path, startLine = 1) => ({
	revision: 8,
	bindingRevision: 2,
	project: "/alpha",
	path: target,
	missing: false,
	title: "A",
	kind: "method",
	category: "method",
	hash,
	text:
		target === other
			? "B content"
			: startLine === 1
				? "A first page"
				: "A second page",
	startLine,
	endLine: startLine === 1 ? 2 : 4,
	totalLines: 4,
	truncated: startLine === 1,
	humanReview: null,
	pending: [],
});
const links = (target = path) => ({
	revision: 8,
	bindingRevision: 2,
	project: "/alpha",
	path: target,
	title: "A",
	incoming: [],
	outgoing:
		target === path ? [{ path: other, title: "B method", exists: true }] : [],
});
const nodes = [
	{
		path,
		title: "A method",
		kind: "note",
		degree: 1,
		nodeType: "note",
		isInfrastructure: false,
		community: 0,
		x: 0,
		y: 0,
		contentType: "method",
	},
	{
		path: other,
		title: "B method",
		kind: "note",
		degree: 1,
		nodeType: "note",
		isInfrastructure: false,
		community: 0,
		x: 1,
		y: 1,
		contentType: "method",
	},
];
const graph = {
	revision: 8,
	bindingRevision: 2,
	project: "/alpha",
	nodes,
	edges: [{ source: path, target: other }],
	totalNotes: 2,
	semantic: {
		nodes,
		edges: [{ source: path, target: other }],
		relations: [{ source: path, target: other, type: "link" }],
		duplicates: [],
		communities: { [path]: 0, [other]: 0 },
		layout: { [path]: { x: 0, y: 0 }, [other]: { x: 1, y: 1 } },
		totalNotes: 2,
		view: "semantic",
		mergeMirrors: true,
		health: {
			isolated: 0,
			duplicates: 0,
			infrastructure: 0,
			truncated: false,
			candidateNodes: 2,
			candidateLimit: 400,
		},
	},
};
function fixture() {
	let changed!: (event: { type: "changed"; revision: number }) => void;
	const invoke = vi.fn(
		async (operation: string, input: any): Promise<unknown> => {
			if (operation === "overview") return overview;
			if (operation === "recentByCategory") return recent;
			if (operation === "readNote") return note(input.path, input.startLine);
			if (operation === "links") return links(input.path);
			if (operation === "graph") return graph;
			if (operation === "search")
				return {
					query: input.query,
					revision: 8,
					bindingRevision: 2,
					coverage: "ready",
					complete: true,
					hits: [
						{
							path,
							title: "Search method",
							kind: "method",
							hash,
							text: "Matched source",
							startLine: 3,
							endLine: 4,
						},
					],
				};
			if (operation === "jobs")
				return {
					revision: 8,
					bindingRevision: 2,
					project: "/alpha",
					items: [
						{
							key: String(input.offset),
							kind: "refresh",
							path: input.offset ? other : path,
							scope: "/alpha",
							revision: 8,
							updated: "2026-10-26",
						},
					],
					total: 21,
					offset: input.offset,
					nextOffset: input.offset ? null : 20,
				};
			throw new Error(`Unexpected operation ${operation}`);
		},
	);
	sessions.setState({ activeSessionId: "session-a", cwd: "/alpha" });
	knowledge.setState({ dialog: null });
	for (const method of [
		"readKnowledgeNote",
		"getKnowledgeGraph",
		"getKnowledgeNoteLinks",
		"openKnowledgeTarget",
	]) {
		services[method] = vi.fn(() => {
			throw new Error("Legacy domain must not run");
		});
	}
	setPluginRuntime({
		invoke,
		subscribe: (listener) => {
			changed = listener;
			return () => {};
		},
	});
	return { invoke, emit: () => changed({ type: "changed", revision: 1 }) };
}
afterEach(cleanup);
it("reads hashed pages, follows scoped links and keeps external opening disabled", async () => {
	const runtime = fixture();
	render(<KnowledgePage />);
	fireEvent.click(
		await screen.findByRole("button", { name: /A method Library/ }),
	);
	await screen.findByText("A first page");
	expect(screen.getByText(/L1–2 · aaaaaaaaaaaa/)).toBeDefined();
	const more = screen.getByRole("button", { name: "继续读取" });
	fireEvent.click(more);
	await screen.findByText("A second page");
	expect(runtime.invoke).toHaveBeenCalledWith("readNote", {
		path,
		revision: 2,
		startLine: 3,
		expectedHash: hash,
	});
	expect(
		(
			screen.getByRole("button", {
				name: "在 Obsidian 中打开",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
	fireEvent.click(await screen.findByRole("button", { name: "B method" }));
	await screen.findByText("B content");
	expect(knowledge.getState().dialog).toBeNull();
	for (const method of Object.values(services))
		expect(method).not.toHaveBeenCalled();
});
it("opens a search hit at its exact source range and hash, with scoped category totals", async () => {
	const runtime = fixture();
	render(<KnowledgePage />);
	await screen.findByRole("tab", { name: "全部 2" });
	fireEvent.change(screen.getByRole("searchbox"), {
		target: { value: "method" },
	});
	fireEvent.click(screen.getByRole("button", { name: "搜索" }));
	fireEvent.click(await screen.findByRole("button", { name: /Search method/ }));
	await screen.findByText("A second page");
	expect(runtime.invoke).toHaveBeenCalledWith("readNote", {
		path,
		revision: 2,
		startLine: 3,
		expectedHash: hash,
	});
});
it("uses the existing graph selection and paginates scoped jobs through the runtime", async () => {
	const runtime = fixture();
	render(<KnowledgePage />);
	await screen.findByText("A method");
	fireEvent.click(screen.getByRole("button", { name: "图谱", exact: true }));
	fireEvent.click(
		await screen.findByRole("button", { name: /A method · 方法/ }),
	);
	// The selected node's detail panel renders after the selection update; wait for it.
	fireEvent.click(await screen.findByRole("button", { name: "打开笔记" }));
	await screen.findByText("A first page");
	fireEvent.click(await screen.findByRole("button", { name: "索引任务" }));
	await screen.findByText(/refresh · Library\/Methods\/a.md/);
	fireEvent.click(screen.getByRole("button", { name: "下一页" }));
	await screen.findByText(/refresh · Library\/Methods\/b.md/);
	expect(runtime.invoke).toHaveBeenCalledWith("jobs", {
		offset: 20,
		limit: 20,
		revision: 2,
	});
});
it("does not display a delayed previous-session note and preserves the query across changed refresh", async () => {
	const runtime = fixture();
	render(<KnowledgePage />);
	await screen.findByText("A method");
	fireEvent.change(screen.getByRole("searchbox"), {
		target: { value: "method" },
	});
	fireEvent.click(screen.getByRole("button", { name: "搜索" }));
	await screen.findByText("Matched source");
	act(() => runtime.emit());
	await screen.findByText("Matched source");
	expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(
		"method",
	);
	let resolve!: (value: unknown) => void;
	const normal = runtime.invoke.getMockImplementation()!;
	runtime.invoke.mockImplementation((op, input) =>
		op === "readNote"
			? new Promise((done) => {
					resolve = done;
				})
			: normal(op, input),
	);
	fireEvent.click(screen.getByRole("button", { name: /Search method/ }));
	await waitFor(() => expect(resolve).toBeDefined());
	act(() => sessions.setState({ activeSessionId: "session-b" }));
	await screen.findByText("A method");
	await act(async () => resolve(note()));
	expect(screen.queryByText("A first page")).toBeNull();
	expect(screen.queryByTestId("knowledge-note")).toBeNull();
});

it("keeps Markdown links inside contribution navigation instead of opening a host target", async () => {
	const runtime = fixture();
	const normal = runtime.invoke.getMockImplementation()!;
	runtime.invoke.mockImplementation(async (op, input) =>
		op === "readNote"
			? { ...note(), text: "external-link" }
			: normal(op, input),
	);
	render(<KnowledgePage />);
	fireEvent.click(
		await screen.findByRole("button", { name: /A method Library/ }),
	);
	fireEvent.click(await screen.findByRole("link", { name: "External target" }));
	await screen.findByText(
		"此链接暂不能打开。库内笔记请使用下方的双向链接；外部链接需等待受控打开能力。",
	);
	expect(services.openKnowledgeTarget).not.toHaveBeenCalled();
	expect(knowledge.getState().dialog).toBeNull();
});

it("shows a failed jobs query instead of an empty success or a permanent loading state", async () => {
	const runtime = fixture();
	const normal = runtime.invoke.getMockImplementation()!;
	runtime.invoke.mockImplementation(async (op, input) => {
		if (op === "jobs") throw new Error("Index access was revoked");
		return normal(op, input);
	});
	render(<KnowledgePage />);
	await screen.findByText("A method");
	fireEvent.click(screen.getByRole("button", { name: "索引任务" }));
	await screen.findByText("Index access was revoked");
	expect(screen.queryByText("正在加载…")).toBeNull();
	expect(screen.queryByText("0 条任务")).toBeNull();
});
