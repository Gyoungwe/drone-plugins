import { describe, expect, it } from "vitest";
import { registerResearchLoop } from "../src/research-loop.js";

function setup() {
	const tools = new Map<string, any>();
	registerResearchLoop({ registerTool(tool: any) { tools.set(tool.name, tool); } });
	return tools.get("research_loop");
}

const call = (tool: any, action: string, ctx: any, extra: Record<string, unknown> = {}) =>
	tool.execute("test", { action, ...extra }, new AbortController().signal, () => undefined, ctx);

describe("host-neutral research lifecycle", () => {
	it("records a monotonic receipt and finalizes after claims", async () => {
		const tool = setup();
		const ctx = { cwd: "/tmp/research-a", sessionId: "session-a" };
		const started = await call(tool, "start", ctx, { query: "evidence" });
		const runDir = started.details.run_dir;
		for (const action of ["record_local", "record_external", "inspect_sources", "verify_archive", "bind_claims", "finalize"])
			await call(tool, action, ctx, { run_dir: runDir });
		const status = await call(tool, "status", ctx, { run_dir: runDir });
		expect(status.details.stage).toBe("answerable");
		expect(status.details.events.map((event: any) => event.type)).toEqual([
			"local_query_recorded",
			"external_search_recorded",
			"sources_inspected",
			"sources_archived",
			"claims_bound",
			"answerable",
		]);
	});

	it("isolates ledgers between sessions", async () => {
		const tool = setup();
		const first = await call(tool, "start", { cwd: "/tmp/research", sessionId: "one" }, { query: "one" });
		const second = await call(tool, "status", { cwd: "/tmp/research", sessionId: "two" });
		expect(second.details.stage).toBe("not-started");
		await expect(call(tool, "status", { cwd: "/tmp/research", sessionId: "two" }, { run_dir: first.details.run_dir })).rejects.toThrow(
			"run_dir must come from",
		);
	});

	it("rejects finalization before claim binding", async () => {
		const tool = setup();
		const ctx = { cwd: "/tmp/research", sessionId: "three" };
		const started = await call(tool, "start", ctx, { query: "incomplete" });
		await expect(call(tool, "finalize", ctx, { run_dir: started.details.run_dir })).rejects.toThrow(
			"cannot finalize before claims",
		);
	});
});
