import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { knowledge, services, sessions, setPluginRuntime } from "../test/setup";
import { KnowledgePage } from "./entry";
const hash = "a".repeat(64),
	proposalHash = "b".repeat(64),
	sourcePath = "Library/Methods/source.md";
const overview = {
	state: "bound",
	binding: { vaultId: "vault", revision: 2, label: "Library" },
	project: "alpha",
	index: {
		revision: 4,
		coverage: "ready",
		noteCount: 8,
		pendingChanges: 0,
		lastReconciledAt: null,
	},
	recentNotes: [],
};
const item = {
	id: "candidate-a",
	title: "Candidate A",
	path: "Wiki/Alpha.md",
	status: "pending",
	proposalHash,
	expiresAt: 9999999999999,
	expired: false,
	bindingChanged: false,
};
const preview = {
	...item,
	bindingRevision: 2,
	project: "alpha",
	rationale: "A recorded rationale",
	before: "Existing claim",
	after: "Suggested claim",
	protectedText: "Human-authored content",
	sources: [
		{
			path: sourcePath,
			hash,
			startLine: 5,
			endLine: 8,
			currentHash: hash,
			excerptHash: hash,
			changed: false,
		},
	],
	targetChanged: false,
	canApply: true,
	scientificallyVerified: false,
};
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((yes) => {
		resolve = yes;
	});
	return { promise, resolve };
}
function fixture() {
	let changed!: (event: { type: "changed"; revision: number }) => void;
	const invoke = vi.fn(async (operation: string, input: any) => {
		if (operation === "overview") return overview;
		if (operation === "recentByCategory")
			return {
				revision: 4,
				bindingRevision: 2,
				project: "alpha",
				groups: { paper: [], method: [], software: [], idea: [] },
				counts: { paper: 0, method: 0, software: 0, idea: 0, other: 0 },
			};
		if (operation === "reviews")
			return {
				bindingRevision: 2,
				project: "alpha",
				items: input.offset ? [{ ...item, id: "candidate-b", title: "Candidate B" }] : [item],
				problems: [],
				total: 13,
				offset: input.offset,
				nextOffset: input.offset ? null : 12,
			};
		if (operation === "previewReview") return { ...preview, id: input.id };
		if (operation === "applyReview")
			return {
				id: input.id,
				status: "applied",
				path: item.path,
				vaultWritten: true,
				reviewRecorded: true,
				indexed: true,
				recovered: false,
				recordError: null,
				indexError: null,
			};
		if (operation === "rejectReview")
			return {
				id: input.id,
				status: "rejected",
				vaultWritten: false,
				reviewRecorded: true,
			};
		if (operation === "readNote")
			return {
				revision: 4,
				bindingRevision: 2,
				project: "alpha",
				missing: false,
				path: sourcePath,
				title: "Source",
				kind: "method",
				category: "method",
				hash,
				text: "Exact source paragraph",
				startLine: 5,
				endLine: 8,
				totalLines: 8,
				truncated: false,
				humanReview: null,
				pending: [],
			};
		if (operation === "links")
			return {
				revision: 4,
				bindingRevision: 2,
				project: "alpha",
				path: sourcePath,
				title: "Source",
				incoming: [],
				outgoing: [],
			};
		throw new Error(`Unexpected operation ${operation}`);
	});
	sessions.setState({ activeSessionId: "session-a", cwd: "/alpha" });
	knowledge.setState({ dialog: null });
	for (const name of [
		"getKnowledgeOverview",
		"getKnowledgeReviews",
		"previewKnowledgeReview",
		"decideKnowledgeReview",
		"readKnowledgeNote",
	])
		services[name] = vi.fn(() => {
			throw new Error("Legacy knowledge API must not run");
		});
	setPluginRuntime({
		invoke,
		subscribe: (listener) => {
			changed = listener;
			return () => {};
		},
	});
	return { invoke, emit: () => changed({ type: "changed", revision: 1 }) };
}
async function openReviews() {
	render(<KnowledgePage />);
	const button = screen.getByRole("button", { name: "待审候选", exact: true });
	await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
	fireEvent.click(button);
}
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});
it("reads paginated candidate diff/protected/source views without legacy domain APIs or writes", async () => {
	const runtime = fixture();
	await openReviews();
	fireEvent.click(await screen.findByRole("button", { name: "Candidate A" }));
	await screen.findByText("Suggested claim");
	expect(runtime.invoke).toHaveBeenCalledWith("previewReview", {
		id: item.id,
		expectedProposalHash: proposalHash,
		revision: 2,
	});
	fireEvent.click(screen.getByRole("tab", { name: "受保护的人工内容" }));
	await screen.findByText("Human-authored content");
	expect(screen.getByText(/候选写入需要宿主明确授予/)).toBeDefined();
	expect(screen.getByRole("button", { name: "应用候选" })).toBeDefined();
	fireEvent.click(screen.getByRole("button", { name: "关闭预览" }));
	fireEvent.click(screen.getByRole("button", { name: "下一页" }));
	await screen.findByRole("button", { name: "Candidate B" });
	expect(runtime.invoke).toHaveBeenCalledWith("reviews", {
		offset: 12,
		limit: 12,
		revision: 2,
	});
	fireEvent.click(screen.getByRole("button", { name: "Candidate B" }));
	fireEvent.click(await screen.findByRole("button", { name: sourcePath }));
	await screen.findByText("Exact source paragraph");
	expect(runtime.invoke).toHaveBeenCalledWith("readNote", {
		path: sourcePath,
		startLine: 5,
		expectedHash: hash,
		revision: 2,
	});
	expect(knowledge.getState().dialog).toBeNull();
	for (const method of Object.values(services)) expect(method).not.toHaveBeenCalled();
});

it("applies a reviewed candidate through the host-authorized write operation", async () => {
	const runtime = fixture();
	await openReviews();
	fireEvent.click(await screen.findByRole("button", { name: "Candidate A" }));
	await screen.findByText("Suggested claim");
	fireEvent.click(screen.getByRole("button", { name: "应用候选" }));
	await waitFor(() =>
		expect(runtime.invoke).toHaveBeenCalledWith("applyReview", {
			id: item.id,
			expectedProposalHash: proposalHash,
			revision: 2,
		}),
	);
	await waitFor(() => expect(screen.queryByTestId("native-review-preview")).toBeNull());
});

it("keeps the review open and reports a failed rejection", async () => {
	const runtime = fixture();
	const normal = runtime.invoke.getMockImplementation()!;
	runtime.invoke.mockImplementation((operation, input) => {
		if (operation === "rejectReview") return Promise.reject(new Error("State write permission is required"));
		return normal(operation, input);
	});
	await openReviews();
	fireEvent.click(await screen.findByRole("button", { name: "Candidate A" }));
	await screen.findByText("Suggested claim");
	fireEvent.click(screen.getByRole("button", { name: "拒绝候选" }));
	await screen.findByText("State write permission is required");
	expect(screen.getByTestId("native-review-preview")).toBeDefined();
});
it("shows changed proposal failures without displaying a stale preview", async () => {
	const runtime = fixture(),
		normal = runtime.invoke.getMockImplementation()!;
	runtime.invoke.mockImplementation((op, input) =>
		op === "previewReview"
			? Promise.reject(new Error("Proposal changed; refresh candidates"))
			: normal(op, input),
	);
	await openReviews();
	fireEvent.click(await screen.findByRole("button", { name: "Candidate A" }));
	await screen.findByText("Proposal changed; refresh candidates");
	expect(screen.queryByText("Suggested claim")).toBeNull();
});
it("drops pending previews when the active session changes", async () => {
	const runtime = fixture(),
		pending = deferred<typeof preview>(),
		normal = runtime.invoke.getMockImplementation()!;
	runtime.invoke.mockImplementation((op, input) =>
		op === "previewReview" ? pending.promise : normal(op, input),
	);
	await openReviews();
	fireEvent.click(await screen.findByRole("button", { name: "Candidate A" }));
	await waitFor(() =>
		expect(runtime.invoke).toHaveBeenCalledWith("previewReview", {
			id: item.id,
			expectedProposalHash: proposalHash,
			revision: 2,
		}),
	);
	act(() => sessions.setState({ activeSessionId: "session-b", cwd: "/beta" }));
	await act(async () => pending.resolve(preview));
	expect(screen.queryByTestId("native-review-preview")).toBeNull();
	expect(screen.queryByText("Suggested claim")).toBeNull();
});
it("clears an open preview on changed and ignores its delayed result after refresh", async () => {
	const runtime = fixture(),
		pending = deferred<typeof preview>(),
		normal = runtime.invoke.getMockImplementation()!;
	runtime.invoke.mockImplementation((op, input) =>
		op === "previewReview" ? pending.promise : normal(op, input),
	);
	await openReviews();
	fireEvent.click(await screen.findByRole("button", { name: "Candidate A" }));
	await waitFor(() => expect(runtime.invoke.mock.calls.some(([op]) => op === "previewReview")).toBe(true));
	await act(async () => runtime.emit());
	await screen.findByRole("button", { name: "Candidate A" });
	await act(async () => pending.resolve(preview));
	expect(screen.queryByTestId("native-review-preview")).toBeNull();
	expect(screen.queryByText("Suggested claim")).toBeNull();
});
it("reports failed state reads instead of an empty successful list", async () => {
	const runtime = fixture(),
		normal = runtime.invoke.getMockImplementation()!;
	runtime.invoke.mockImplementation((op, input) =>
		op === "reviews" ? Promise.reject(new Error("State root access revoked")) : normal(op, input),
	);
	await openReviews();
	await screen.findByText("State root access revoked");
	expect(screen.queryByText("当前课题暂无候选。")).toBeNull();
});

it("refreshes the candidate version after a conflict and preserves source/target warnings", async () => {
	const runtime = fixture(),
		normal = runtime.invoke.getMockImplementation()!;
	const nextHash = "c".repeat(64);
	let updated = false;
	runtime.invoke.mockImplementation((operation, input) => {
		if (operation === "reviews")
			return Promise.resolve({
				bindingRevision: 2,
				project: "alpha",
				items: [{ ...item, proposalHash: updated ? nextHash : proposalHash }],
				problems: [{ id: "corrupt-candidate", error: "Candidate JSON is corrupt" }],
				total: 1,
				offset: 0,
				nextOffset: null,
			});
		if (operation === "previewReview") {
			if (!updated) return Promise.reject(new Error("Proposal changed; refresh candidates"));
			return Promise.resolve({
				...preview,
				proposalHash: nextHash,
				expired: true,
				targetChanged: true,
				sources: [
					{
						...preview.sources[0],
						changed: true,
						error: "Source no longer exists",
					},
				],
			});
		}
		return normal(operation, input);
	});
	await openReviews();
	await screen.findByText("corrupt-candidate: Candidate JSON is corrupt");
	fireEvent.click(screen.getByRole("button", { name: "Candidate A" }));
	await screen.findByText("Proposal changed; refresh candidates");
	updated = true;
	fireEvent.click(screen.getByRole("button", { name: "刷新", exact: true }));
	fireEvent.click(await screen.findByRole("button", { name: "Candidate A" }));
	await screen.findByText("Suggested claim");
	expect(runtime.invoke).toHaveBeenCalledWith("previewReview", {
		id: item.id,
		expectedProposalHash: nextHash,
		revision: 2,
	});
	expect(screen.getByText("候选已过期，仅供查看。")).toBeDefined();
	expect(screen.getByText(/目标笔记已变化/)).toBeDefined();
	expect(screen.getByText("Source no longer exists")).toBeDefined();
});

it("explains projectless scope instead of reporting an empty current project", async () => {
	const runtime = fixture(),
		normal = runtime.invoke.getMockImplementation()!;
	runtime.invoke.mockImplementation((operation, input) => {
		if (operation === "overview") return Promise.resolve({ ...overview, project: null });
		if (operation === "reviews")
			return Promise.resolve({
				bindingRevision: 2,
				project: null,
				items: [],
				problems: [],
				total: 0,
				offset: 0,
				nextOffset: null,
			});
		return normal(operation, input);
	});
	sessions.setState({ activeSessionId: null, cwd: null });
	await openReviews();
	await screen.findByText("选择一个真实项目会话，以查看该课题的候选。");
	expect(screen.queryByText("当前课题暂无候选。")).toBeNull();
	expect(runtime.invoke).toHaveBeenCalledWith("reviews", {
		revision: 2,
		offset: 0,
		limit: 12,
	});
});

it("shows a partial write receipt instead of presenting an incomplete review as complete", async () => {
	const runtime = fixture();
	const normal = runtime.invoke.getMockImplementation()!;
	runtime.invoke.mockImplementation(async (operation, input) =>
		operation === "applyReview"
			? {
					id: input.id,
					status: "applied",
					path: item.path,
					vaultWritten: true,
					reviewRecorded: false,
					indexed: true,
					recovered: false,
					recordError: "Record storage refused",
					indexError: null,
				}
			: normal(operation, input),
	);
	await openReviews();
	fireEvent.click(await screen.findByRole("button", { name: "Candidate A" }));
	await screen.findByText("Suggested claim");
	fireEvent.click(screen.getByRole("button", { name: "应用候选" }));
	await screen.findByText(/Record storage refused/);
	expect(screen.getByRole("alert").textContent).toContain("笔记已写入");
});
