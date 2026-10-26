import { expect, it, vi } from "vitest";
import { createKnowledgeReadTool } from "../src/extension/read-tools.js";

function setup(requestResult: unknown = { outgoing: [], incoming: [] }) {
	const request = vi.fn(async (operation: string, input: unknown) => {
		if (operation !== "noteLinks") throw new Error(`Unexpected operation ${operation}`);
		return requestResult;
	});
	const service = {
		read: vi.fn(async () => ({ path: "Library/alpha.md", hash: "a".repeat(64), text: "# Alpha", startLine: 1, endLine: 1, missing: false })),
		request,
	};
	const tool = createKnowledgeReadTool({
		ensureTurn: async () => ({ service, ticket: "ticket", binding: { vaultId: "vault", revision: 3 }, project: "project-alpha" }),
		toolBudget: { consume: () => null },
	});
	return { tool, service, request };
}

it("passes the active project when reading links", async () => {
	const { tool, request } = setup({ outgoing: [{ path: "Library/b.md", title: "B", exists: true }], incoming: [] });
	const result = await tool.execute("id", { path: "Library/alpha.md" }, undefined, undefined, { cwd: "/workspace" });
	expect(request).toHaveBeenCalledWith("noteLinks", { path: "Library/alpha.md", project: "project-alpha" });
	expect(result.details.links).toEqual({ outgoing: [{ path: "Library/b.md", title: "B" }], backlinks: [] });
});

it("surfaces link read failure instead of silently hiding a partial receipt", async () => {
	const { tool } = setup();
	await expect(tool.execute("id", { path: "Library/alpha.md" }, undefined, undefined, { cwd: "/workspace" })).resolves.toMatchObject({ details: { links: { outgoing: [], backlinks: [] } } });
	const failing = setup();
failing.request.mockRejectedValueOnce(new Error("index unavailable"));
	await expect(failing.tool.execute("id", { path: "Library/alpha.md" }, undefined, undefined, { cwd: "/workspace" })).rejects.toThrow("index unavailable");
});
