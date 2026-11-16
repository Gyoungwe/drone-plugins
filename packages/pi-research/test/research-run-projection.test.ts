import { afterEach, describe, expect, it, vi } from "vitest";
import createDesktopRuntime from "../src/desktop/runtime.js";
import * as researchHost from "../src/research-host.js";

const item: researchHost.ResearchRunSummary = {
	runId: "run-first",
	resultSlug: "demo",
	project: "demo",
	topicId: null,
	query: "Find evidence",
	status: "running",
	stage: "sources_inspected",
	answerable: false,
	startedAt: null,
	updatedAt: null,
	runDir: "demo/run-first",
};

async function harness(operations: researchHost.ResearchHostOperations) {
	vi.spyOn(researchHost, "createResearchHost").mockReturnValue({ contractVersion: 1, operations });
	const capabilities = { call: vi.fn().mockRejectedValue(new Error("Unexpected capability")) };
	const signal = new AbortController().signal;
	const runtime = await createDesktopRuntime({
		applicationId: "test",
		signal,
		resources: [],
		capabilities,
		events: { changed: () => undefined },
	});
	const context = {
		capabilities,
		signal,
		scope: { kind: "workspace" as const, workspaceId: "demo", workspaceDirectory: "/granted/demo" },
	};
	return { runtime, context };
}

afterEach(() => vi.restoreAllMocks());

describe("Desktop research run projection", () => {
	it("marks listed runs as unverified and uses the runtime workspace", async () => {
		const listRuns = vi.fn().mockResolvedValue({ items: [item], total: 1 });
		const { runtime, context } = await harness({ listRuns, status: vi.fn() });
		expect(runtime.operations.listRuns.effect).toBe("read");
		await expect(
			runtime.operations.listRuns.execute({ project: "demo", limit: 8, workspace: "/other" }, context),
		).resolves.toEqual({ items: [{ ...item, scientificallyVerified: false }], total: 1 });
		expect(listRuns).toHaveBeenCalledWith({ workspace: "/granted/demo", project: "demo", limit: 8 });
	});

	it("marks an adapter detail as unverified without changing its evidence", async () => {
		const detail = {
			...item,
			route: [],
			timeline: [],
			sources: [],
			claims: [],
			warnings: [],
			coverage: null,
			archive: { count: 2, reused: 1, verified: false },
			scientificallyVerified: true,
		};
		const readDetail = vi.fn().mockResolvedValue(detail);
		const { runtime, context } = await harness({ listRuns: vi.fn(), status: vi.fn(), detail: readDetail });
		expect(runtime.operations.detail.effect).toBe("read");
		await expect(runtime.operations.detail.execute({ runId: item.runId }, context)).resolves.toEqual({
			...detail,
			scientificallyVerified: false,
		});
		expect(readDetail).toHaveBeenCalledWith(
			expect.objectContaining({ workspace: "/granted/demo", runId: item.runId }),
		);
	});

	it("does not turn the card's absent project into a literal project filter", async () => {
		const listRuns = vi.fn().mockResolvedValue({ items: [item], total: 1 });
		const { runtime, context } = await harness({ listRuns, status: vi.fn() });
		await runtime.operations.listRuns.execute({ project: null, limit: 8 }, context);
		expect(listRuns).toHaveBeenCalledWith({ workspace: "/granted/demo", project: undefined, limit: 8 });
	});
});

describe("Desktop metadata-only research run projection", () => {
	it("returns the host's metadata-only shape and warning when detail is absent", async () => {
		const status = vi.fn().mockResolvedValue({ item });
		const { runtime, context } = await harness({ listRuns: vi.fn(), status });
		expect(runtime.operations.status.effect).toBe("read");
		await expect(runtime.operations.detail.execute({ runDir: item.runDir }, context)).resolves.toEqual({
			...item,
			scientificallyVerified: false,
			route: [],
			sources: [],
			claims: [],
			warnings: [
				"The installed research plugin exposes run metadata only; detailed evidence is unavailable.",
			],
			coverage: null,
			archive: { count: 0, reused: 0, verified: false },
		});
		expect(status).toHaveBeenCalledWith(
			expect.objectContaining({ workspace: "/granted/demo", runDir: item.runDir }),
		);
	});

	it("finds metadata by run ID when a metadata-only adapter returns a status list", async () => {
		const status = vi.fn().mockResolvedValue({ items: [item], total: 1 });
		const { runtime, context } = await harness({ listRuns: vi.fn(), status });
		await expect(runtime.operations.detail.execute({ runId: item.runId }, context)).resolves.toMatchObject({
			runId: item.runId,
			scientificallyVerified: false,
			sources: [],
			warnings: [
				"The installed research plugin exposes run metadata only; detailed evidence is unavailable.",
			],
		});
	});
});
