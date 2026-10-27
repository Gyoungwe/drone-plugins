import { expect, it, vi } from "vitest";
import { createKnowledgeReadTool, createKnowledgeSearchTool } from "../src/extension/read-tools.js";

function setup(requestResult: unknown = { outgoing: [], incoming: [] }) {
	const request = vi.fn(async (operation: string, input: unknown) => {
		if (operation !== "noteLinks") throw new Error(`Unexpected operation ${operation}`);
		return requestResult;
	});
	const service = {
		search: vi.fn(async () => ({ revision: 1, hits: [] })),
		read: vi.fn(async () => ({ path: "Library/alpha.md", hash: "a".repeat(64), text: "# Alpha", startLine: 1, endLine: 1, missing: false })),
		request,
	};
	const tool = createKnowledgeReadTool({
		ensureTurn: async () => ({ service, ticket: "ticket", binding: { version: 1, vault: "/vault", vaultId: "vault", revision: 3, profile: "hybrid", depositMode: "verified", subagentPolicy: "none", updatedAt: new Date(0).toISOString() }, project: "project-alpha" }),
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

it("routes explicit experience navigation through the active session scope", async () => {
	const { service } = setup();
	const binding = { version: 1 as const, vault: "/vault", vaultId: "vault", revision: 3, profile: "hybrid" as const, depositMode: "verified" as const, subagentPolicy: "none" as const, updatedAt: new Date(0).toISOString() };
	const turn = { service, ticket: "ticket", binding, project: "project-alpha" };
	const searchExperiences = vi.fn(async () => ({ navigationOnly: true, evidenceEligible: false, instructionEligible: false, items: [] }));
	const tool = createKnowledgeSearchTool({ ensureTurn: async () => turn, toolBudget: { consume: () => null }, searchExperiences });
	const ctx = { cwd: "/workspace" };
	const input = { query: "alignment", kind: "experiences" as const, workflow: "rnaseq", host_id: "local-mac" };
	const result = await tool.execute("id", input, undefined, undefined, ctx);
	expect(searchExperiences).toHaveBeenCalledWith(ctx, input);
	expect(service.search).not.toHaveBeenCalled();
	expect(result.details).toMatchObject({ navigationOnly: true, evidenceEligible: false, instructionEligible: false });
	await expect(tool.execute("id", { query: "alignment", kind: "experiences" }, undefined, undefined, ctx)).rejects.toThrow("explicit workflow and host_id");
	expect(searchExperiences).toHaveBeenCalledTimes(1);
});
