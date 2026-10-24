import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerResearchLoop } from "../src/research-loop.js";

const roots: string[] = [];
const shutdowns: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const shutdown of shutdowns.splice(0)) await shutdown();
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});
async function workspace() {
	const cwd = await mkdtemp(join(tmpdir(), "research-extension-"));
	roots.push(cwd);
	return cwd;
}
function setup(cwd: string) {
	const tools = new Map<string, any>();
	const listeners = new Map<string, (...args: any[]) => any>();
	registerResearchLoop({
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		on(event: string, listener: (...args: any[]) => any) {
			listeners.set(event, listener);
		},
	});
	const context = (id: string) => ({
		cwd,
		sessionManager: { getSessionId: () => id },
	});
	const event = async (name: string, payload: unknown, id: string) => {
		await listeners.get(name)!(payload, context(id));
	};
	const tracked = new Set<string>();
	shutdowns.push(async () => {
		for (const id of tracked) await event("session_shutdown", {}, id);
	});
	const call = async (
		id: string,
		action: string,
		extra: Record<string, unknown> = {},
	) => {
		tracked.add(id);
		return tools
			.get("research_loop")
			.execute(
				"same-tool-call",
				{ action, ...extra },
				new AbortController().signal,
				() => undefined,
				context(id),
			);
	};
	return { call, event };
}
const startedEvent = (query: string) => ({
	toolCallId: "same-tool-call",
	toolName: "research_search_knowledge",
	args: { query },
});
const endedEvent = {
	toolCallId: "same-tool-call",
	toolName: "research_search_knowledge",
	result: { details: { complete: true } },
	isError: false,
};

describe("complete research extension lifecycle", () => {
	it("persists the full gate and rejects empty claims and direct finalization", async () => {
		const host = setup(await workspace());
		const started = await host.call("one", "start", { query: "evidence" });
		const run = started.details.run_dir;
		expect(started.details.evidence_gate.stage).toBe("created");
		await expect(
			host.call("one", "bind_claims", { run_dir: run, claim_bindings: [] }),
		).rejects.toThrow();
		await expect(
			host.call("one", "finalize", { run_dir: run }),
		).rejects.toThrow();
		const status = await host.call("one", "status", { run_dir: run });
		expect(status.details.evidence_gate.answerable).toBe(false);
		const persisted = JSON.parse(
			await readFile(join(run, "metadata.json"), "utf8"),
		);
		expect(persisted.evidence_gate.answerable).toBe(false);
		expect(status.details.evidence_gate.claim_bindings).toEqual([]);
	});

	it("requires original source evidence, not model-supplied stage names", async () => {
		const host = setup(await workspace());
		const started = await host.call("one", "start", { query: "evidence" });
		const run_dir = started.details.run_dir;
		await host.call("one", "record_local", { run_dir, query: "evidence" });
		await host.call("one", "record_external", {
			run_dir,
			notes: "No remote search required",
		});
		await host.call("one", "inspect_sources", {
			run_dir,
			source_refs: ["fabricated-source"],
		});
		await expect(
			host.call("one", "verify_archive", { run_dir }),
		).rejects.toThrow("No available source");
		await expect(
			host.call("one", "bind_claims", { run_dir, claim_bindings: [] }),
		).rejects.toThrow();
		await expect(host.call("one", "finalize", { run_dir })).rejects.toThrow();
	});

	it("isolates current journals and rejects another active session's run", async () => {
		const host = setup(await workspace());
		const first = await host.call("one", "start", { query: "one" });
		const second = await host.call("two", "status");
		expect(second.details.evidence_gate.stage).toBe("not-started");
		await expect(
			host.call("two", "status", { run_dir: first.details.run_dir }),
		).rejects.toThrow("another active session");
	});

	it("independent event buses do not share receipts with the same cwd, session ID and tool call ID", async () => {
		const cwd = await workspace();
		const first = setup(cwd);
		const second = setup(cwd);
		const a = await first.call("same-session", "start", {
			query: "first",
			result_slug: "first",
		});
		const b = await second.call("same-session", "start", {
			query: "second",
			result_slug: "second",
		});
		await first.event(
			"tool_execution_start",
			startedEvent("first-observation"),
			"same-session",
		);
		await second.event(
			"tool_execution_start",
			startedEvent("second-observation"),
			"same-session",
		);
		await first.event("tool_execution_end", endedEvent, "same-session");
		await first.event("session_shutdown", {}, "same-session");
		await second.event("tool_execution_end", endedEvent, "same-session");
		const bStatus = await second.call("same-session", "status", {
			run_dir: b.details.run_dir,
		});
		expect(bStatus.details.receipt_journal.buffered).toBe(1);
		expect(bStatus.details.evidence_gate.stage).toBe("local_query_recorded");
		expect(
			bStatus.details.evidence_gate.events
				.map((event: any) => event.query)
				.filter(Boolean),
		).toEqual(["second-observation"]);
		const aMetadata = JSON.parse(
			await readFile(join(a.details.run_dir, "metadata.json"), "utf8"),
		);
		expect(
			aMetadata.evidence_gate.events
				.map((event: any) => event.query)
				.filter(Boolean),
		).toEqual(["first-observation"]);
	});

	it("shutdown of one session preserves another session's pending receipt with the same tool call ID", async () => {
		const host = setup(await workspace());
		await host.call("one", "start", { query: "one", result_slug: "one" });
		const b = await host.call("two", "start", {
			query: "two",
			result_slug: "two",
		});
		await host.event(
			"tool_execution_start",
			startedEvent("one-observation"),
			"one",
		);
		await host.event(
			"tool_execution_start",
			startedEvent("two-observation"),
			"two",
		);
		await host.event("session_shutdown", {}, "one");
		await host.event("tool_execution_end", endedEvent, "two");
		const status = await host.call("two", "status", {
			run_dir: b.details.run_dir,
		});
		expect(status.details.receipt_journal.buffered).toBe(1);
		expect(
			status.details.evidence_gate.events
				.map((event: any) => event.query)
				.filter(Boolean),
		).toEqual(["two-observation"]);
	});
});
