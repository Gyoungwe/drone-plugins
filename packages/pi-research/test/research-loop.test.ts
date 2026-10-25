import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
	return { call, event, tool: tools.get("research_loop") };
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

async function provenanceRun() {
	const cwd = await workspace();
	const host = setup(cwd);
	const started = await host.call("one", "start", {
		query: "A bounded source observation",
		requires_provenance: true,
	});
	const run_dir = started.details.run_dir;
	const source = join(run_dir, "sources", "manual.txt");
	const text = "# Manual\nThis is a bounded documentation observation.\n";
	await mkdir(join(run_dir, "sources"));
	await writeFile(source, text);
	await writeFile(join(run_dir, "sources", "download-manifest.json"), JSON.stringify({
		items: [{ id: "manual", status: "downloaded", path: source, sha256: createHash("sha256").update(text).digest("hex") }],
		failures: [],
	}));
	await host.event("tool_execution_start", {
		toolCallId: "read-manual", toolName: "read", args: { path: source },
	}, "one");
	await host.event("tool_execution_end", {
		toolCallId: "read-manual", toolName: "read", isError: false,
		result: { content: [{ type: "text", text: await readFile(source, "utf8") }], details: {} },
	}, "one");
	const claim_bindings = [{
		claim: "This is a bounded documentation observation.",
		relationship: "direct",
		limitations: "Engineering fixture; no scientific assessment.",
		sources: [{ path: source, start_line: 2, end_line: 2, quote: "This is a bounded documentation observation." }],
	}];
	return { host, run_dir, claim_bindings };
}

describe("complete research extension lifecycle", () => {
	it("exposes the complete claim and source input contract to the model", async () => {
		const { tool } = setup(await workspace());
		const claims = tool.parameters.properties.claim_bindings;
		expect(claims.items.required).toEqual(["claim", "relationship", "limitations", "sources"]);
		expect(claims.items.properties.relationship.enum).toEqual([
			"direct", "indirect", "hypothesis", "unsupported",
		]);
		expect(claims.items.properties.sources.items.required).toEqual([
			"path", "start_line", "end_line", "quote",
		]);
		expect(claims.items.properties.sources.items.properties).not.toHaveProperty("readReceiptId");
		expect(tool.parameters.additionalProperties).toBe(false);
	});

	it("keeps a provenance-required run closed and gives the actual manifest tool as its next action", async () => {
		const { host, run_dir, claim_bindings } = await provenanceRun();
		await expect(host.call("one", "complete", { run_dir, claim_bindings }))
			.rejects.toThrow(/Next action: call research_record_run_manifest.*role="input"/);
		const status = await host.call("one", "status", { run_dir });
		expect(status.details.metadata.requires_provenance).toBe(true);
		expect(status.details.evidence_gate).toMatchObject({ stage: "claims_bound", answerable: false });
		expect(status.details.evidence_gate.claim_bindings[0].sources[0].read_receipt_id).toBeTruthy();
		await expect(readFile(join(run_dir, "reproducibility-manifest.json"))).rejects.toMatchObject({ code: "ENOENT" });
	});

	it.each(["invalid-json", "directory"])("does not rewrite the %s manifest error as a missing-manifest instruction", async (fault) => {
		const { host, run_dir, claim_bindings } = await provenanceRun();
		const path = join(run_dir, "reproducibility-manifest.json");
		if (fault === "invalid-json") await writeFile(path, "{");
		else await mkdir(path);
		const completion = host.call("one", "complete", { run_dir, claim_bindings });
		if (fault === "invalid-json") await expect(completion).rejects.toBeInstanceOf(SyntaxError);
		else await expect(completion).rejects.toMatchObject({ code: "EISDIR" });
		const status = await host.call("one", "status", { run_dir });
		expect(status.details.evidence_gate).toMatchObject({ stage: "claims_bound", answerable: false });
	});

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
