import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { services, sessions, setPluginRuntime } from "../test/setup";
import { KnowledgePage, KnowledgeSurface } from "./entry";

afterEach(cleanup);
function fixture() {
	sessions.setState({ activeSessionId: "alpha", cwd: "/workspace" });
	let applied = true;
	const invoke = vi.fn(async (operation: string) => {
		if (operation === "overview")
			return {
				state: "bound",
				binding: { vaultId: "vault", revision: 3, label: "Research" },
				project: "alpha",
				index: { revision: 1, coverage: "ready", noteCount: 1, pendingChanges: 0, lastReconciledAt: null },
				recentNotes: [],
			};
		if (operation === "recentByCategory")
			return {
				groups: { paper: [], software: [], method: [], idea: [] },
				counts: { paper: 0, software: 0, method: 0, idea: 0, other: 0 },
			};
		if (operation === "reviewHistory")
			return {
				bindingRevision: 3,
				project: "alpha",
				items: applied
					? [
							{
								id: "candidate",
								path: "Wiki/Review.md",
								afterHash: "a".repeat(64),
								reviewedAt: 1,
								reviewMethod: "human",
							},
						]
					: [],
			};
		if (operation === "undoReview") {
			applied = false;
			return { status: "reverted", path: "Wiki/Review.md" };
		}
		if (operation === "reviews")
			return {
				bindingRevision: 3,
				project: "alpha",
				items: [],
				problems: [],
				total: 0,
				offset: 0,
				nextOffset: null,
			};
		throw new Error(`Unexpected operation ${operation}`);
	});
	const client = { invoke, subscribe: vi.fn(() => vi.fn()) };
	setPluginRuntime(client);
	return client;
}
it("opens actual runtime history and requires an explicit undo confirmation", async () => {
	const runtime = fixture();
	services.maintainKnowledge = vi.fn(() => {
		throw new Error("Legacy host cannot execute");
	});
	render(<KnowledgePage />);
	await screen.findByRole("button", { name: "审核历史" });
	fireEvent.click(screen.getByRole("button", { name: "审核历史" }));
	await screen.findByText("Wiki/Review.md");
	fireEvent.click(screen.getByRole("button", { name: "撤销此更新" }));
	expect(runtime.invoke.mock.calls.some(([op]) => op === "undoReview")).toBe(false);
	fireEvent.click(screen.getByRole("button", { name: "确认撤销" }));
	await waitFor(() => expect(screen.queryByText("Wiki/Review.md")).toBeNull());
	expect(runtime.invoke).toHaveBeenCalledWith("undoReview", {
		revision: 3,
		id: "candidate",
		expectedHash: "a".repeat(64),
	});
	expect(services.maintainKnowledge).not.toHaveBeenCalled();
});
it("restores the embedded review surface using its tab prop without trusting supplied cwd", async () => {
	const runtime = fixture();
	render(
		<KnowledgeSurface
			kind="settings"
			context={{ cwd: "/untrusted-ui-path", sessionId: "spoofed", tab: "reviews" }}
		/>,
	);
	await screen.findByText("当前课题暂无候选。");
	expect(runtime.invoke).toHaveBeenCalledWith("reviews", { revision: 3, offset: 0, limit: 12 });
	expect(JSON.stringify(runtime.invoke.mock.calls)).not.toContain("/untrusted-ui-path");
});
