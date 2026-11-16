// @vitest-environment jsdom
import type { ResearchRunDetail, ResearchRunListItem } from "@gyoungwe/plugin-api/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchRunsCard } from "../ui/src/ResearchRunsCard.js";

const first: ResearchRunListItem = {
	runId: "run-first",
	resultSlug: "first",
	project: "demo",
	topicId: null,
	query: "Find first evidence",
	status: "running",
	stage: "sources_inspected",
	answerable: false,
	scientificallyVerified: false,
	startedAt: null,
	updatedAt: null,
	runDir: "first/run-first",
};
const second: ResearchRunListItem = {
	...first,
	runId: "run-second",
	resultSlug: "second",
	query: "Find second evidence",
};
const detail: ResearchRunDetail = {
	...first,
	route: [],
	timeline: [],
	sources: [{ path: "sources/paper.md", status: "inspected", hash: null, verified: false }],
	claims: [],
	warnings: ["Evidence needs review"],
	coverage: null,
	archive: { count: 1, reused: 0, verified: false },
};

function harness(invoke: ReturnType<typeof vi.fn>, language: "en" | "zh" = "en") {
	const openResourcePreview = vi.fn();
	const runtime = { invoke };
	Object.assign(window, {
		DroneUI: {
			hooks: { useLanguage: () => language, usePluginRuntime: () => runtime },
			stores: {
				useSessionsStore: (select: (state: { activeSessionId: string }) => unknown) =>
					select({ activeSessionId: "session" }),
				useUiStore: (select: (state: { openResourcePreview: typeof openResourcePreview }) => unknown) =>
					select({ openResourcePreview }),
			},
			components: { RoadmapLane: () => null },
			helpers: { roadmapStatus: () => "active" },
		},
	});
	return { openResourcePreview };
}

afterEach(cleanup);

describe("research runs card", () => {
	it("loads the first detail through its runtime and previews a source through the host", async () => {
		const invoke = vi
			.fn()
			.mockResolvedValueOnce({ items: [first, second], total: 2 })
			.mockResolvedValueOnce(detail);
		const { openResourcePreview } = harness(invoke);
		render(createElement(ResearchRunsCard, { project: "demo" }));
		await screen.findByText("Evidence needs review");
		expect(invoke.mock.calls).toEqual([
			["listRuns", { project: "demo", limit: 8 }],
			["detail", { runId: first.runId }],
		]);
		fireEvent.click(screen.getByRole("button", { name: /sources\/paper.md/ }));
		expect(openResourcePreview).toHaveBeenCalledWith({ href: "sources/paper.md", label: "sources/paper.md" });
		invoke.mockResolvedValueOnce({ ...detail, ...second });
		fireEvent.click(screen.getByRole("button", { name: /Find second evidence/ }));
		await waitFor(() => expect(invoke).toHaveBeenLastCalledWith("detail", { runId: second.runId }));
		expect(invoke).toHaveBeenCalledTimes(3);
	});

	it.each(["listRuns", "detail"])("renders an error when %s rejects", async (operation) => {
		const invoke = vi.fn();
		if (operation === "detail") invoke.mockResolvedValueOnce({ items: [first], total: 1 });
		invoke.mockRejectedValueOnce(new Error("Read denied"));
		harness(invoke);
		render(createElement(ResearchRunsCard));
		expect((await screen.findByRole("alert")).textContent).toContain("Read denied");
		expect(screen.queryByText("No research runs are available for this project yet.")).toBeNull();
	});

	it("renders the empty state in Chinese without requesting a detail", async () => {
		const invoke = vi.fn().mockResolvedValue({ items: [], total: 0 });
		harness(invoke, "zh");
		render(createElement(ResearchRunsCard));
		await screen.findByText("当前项目还没有可展示的研究运行。");
		expect(invoke.mock.calls).toEqual([["listRuns", { project: null, limit: 8 }]]);
	});
});
