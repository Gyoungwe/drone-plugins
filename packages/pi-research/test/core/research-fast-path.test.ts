import { createHash } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { LiteratureReceipt } from "../../src/core/literature-receipt.js";
import { registerResearchExtension } from "../../src/extension.js";

type Pi = Parameters<typeof registerResearchExtension>[0];
type Tool = Parameters<Pi["registerTool"]>[0];
type Listener = Parameters<NonNullable<Pi["on"]>>[1];
type Args = Record<string, unknown>;

const path = "Library/Papers/a-study.md";
const text = "A bounded observation.";
const hash = createHash("sha256").update(text).digest("hex");
const claims = [
	{
		claim: text,
		relationship: "direct",
		limitations: "Literature note only.",
		sources: [{ path, start_line: 1, end_line: 1, quote: text }],
	},
];
const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function setup() {
	const cwd = await realpath(await mkdtemp(join(tmpdir(), "research-fast-path-")));
	roots.push(cwd);
	const ctx = { cwd, sessionId: "test-session" };
	const listeners = new Map<string, Listener>();
	const tools = new Map<string, Tool>();
	const approval = vi.fn(() => false);
	const verify = vi.fn(
		async (): Promise<LiteratureReceipt> => ({
			doi: "10.1234/fixture",
			zoteroKey: "FIXTURE1",
			obsidian: { status: "verified", path, hash, vault: cwd },
			zotero: { status: "verified", fulltextStatus: "metadata-only" },
			status: "both-verified",
			scientificallyVerified: false,
		}),
	);
	const sourceStatus = vi.fn(async () => ({ manifest: { items: [] } }));
	registerResearchExtension(
		{
			on: (name, listener) => listeners.set(name, listener),
			registerTool: (tool) => tools.set(tool.name, tool),
		},
		{
			workspace: async () => ({ resultsRoot: join(cwd, "results"), obsidianVault: cwd }),
			resolveProject: async () => "fixture",
			resolveSessionProject: async () => ({ project: "fixture" }),
			describeProject: (project) => project,
			registerTool: (pi, tool) => pi.registerTool(tool),
			run: async (work) => work(),
			verifyLiteratureReceipt: verify,
			sourceStatus,
		},
	);
	const event = async (name: string, payload: unknown) => listeners.get(name)?.(payload, ctx);
	const tool = tools.get("research_loop");
	if (!tool) throw new Error("research_loop unavailable");
	const sequence = { id: 0 };
	const host = { ctx, tool, event, approval, verify, sourceStatus, sequence };
	return {
		...host,
		call: (action: string, args: Args = {}) => dispatch(host, "research_loop", { action, ...args }),
		execute: (name: string, args: Args, details: unknown = {}) => dispatch(host, name, args, details),
	};
}

async function dispatch(
	host: {
		ctx: { cwd: string; sessionId: string };
		tool: Tool;
		event(name: string, payload: unknown): Promise<unknown>;
		approval(): boolean;
		sequence: { id: number };
	},
	toolName: string,
	args: Args,
	details: unknown = {},
) {
	const toolCallId = `call-${++host.sequence.id}`;
	await host.event("tool_execution_start", { toolCallId, toolName, args });
	const guard = await host.event("tool_call", { toolCallId, toolName, input: args });
	if (guard) {
		await host.event("tool_execution_end", { toolCallId, toolName, isError: true });
		return guard;
	}
	if (toolName === "write" || toolName === "research_archive_source") {
		const authorized = host.approval();
		await host.event("tool_execution_end", { toolCallId, toolName, isError: !authorized });
		return { authorized };
	}
	const result =
		toolName === "research_loop"
			? await host.tool
					.execute(toolCallId, args, new AbortController().signal, undefined, host.ctx)
					.catch(async (error: unknown) => {
						await host.event("tool_execution_end", { toolCallId, toolName, isError: true, durationMs: 1 });
						throw error;
					})
			: { details };
	await host.event("tool_execution_end", { toolCallId, toolName, result });
	return result;
}

async function startFast(host: Awaited<ReturnType<typeof setup>>) {
	return host.call("start", { query: "What was observed?", mode: "fast_readonly" });
}

async function readAndVerify(host: Awaited<ReturnType<typeof setup>>) {
	await host.execute("research_read_knowledge", { path }, { path, text, hash, startLine: 1, endLine: 1 });
	await host.execute("research_verify_literature", { note_path: path }, await host.verify());
}

it("completes on the fifth observed tool execution using a verified local excerpt", async () => {
	const host = await setup();
	await startFast(host);
	await host.execute("research_search_knowledge", { query: "bounded" }, { complete: true, hits: [{ path }] });
	await readAndVerify(host);
	const completed = await host.call("complete", { claim_bindings: claims });
	expect(completed).toMatchObject({
		details: {
			evidence_gate: {
				answerable: true,
				archive_count: 0,
				reuse_count: 1,
				claim_bindings: [{ sources: [{ read_receipt_id: expect.any(String) }] }],
			},
		},
	});
	const status = await host.call("status");
	expect(status).toMatchObject({
		details: {
			metadata: {
				mode: "fast_readonly",
				fast_path: { stepsUsed: 5, escalation_required: false },
			},
		},
	});
	expect(status).not.toMatchObject({
		details: {
			evidence_gate: {
				events: expect.arrayContaining([expect.objectContaining({ type: "external_search_recorded" })]),
			},
		},
	});
	expect(host.sourceStatus).not.toHaveBeenCalled();
	expect(host.approval).not.toHaveBeenCalled();
});

it("blocks step six and continues to expose status for escalation", async () => {
	const host = await setup();
	await startFast(host);
	for (let index = 0; index < 3; index++) await host.execute("research_read_knowledge", { path });
	await host.execute("research_search_knowledge", { query: "bounded" }, { complete: true, hits: [{ path }] });
	expect(await host.execute("research_verify_literature", { note_path: path })).toMatchObject({
		block: true,
		reason: expect.stringContaining("step_cap_reached"),
	});
	expect(await host.call("status")).toMatchObject({
		details: {
			escalationRequired: true,
			metadata: {
				fast_path: { stepsUsed: 5, escalation_required: true, reason: "step_cap_reached" },
			},
		},
	});
});

it("escalates on a complete local miss and keeps incomplete searches inconclusive", async () => {
	const host = await setup();
	await startFast(host);
	await host.execute("research_search_knowledge", { query: "partial" }, { complete: false, hits: [] });
	expect(await host.call("status")).toMatchObject({ details: { escalationRequired: false } });
	await host.execute("research_search_knowledge", { query: "complete" }, { complete: true, hits: [] });
	expect(await host.call("status")).toMatchObject({
		details: {
			escalationRequired: true,
			metadata: {
				fast_path: { localSearches: 2, reason: "no_local_hits" },
			},
		},
	});
});

it("reserves parallel slots while counting only finished tool executions", async () => {
	const host = await setup();
	await startFast(host);
	for (const query of ["first", "second"]) {
		await host.execute("research_search_knowledge", { query }, { complete: true, hits: [{ path }] });
	}
	const pending = [
		{ toolCallId: "read", toolName: "research_read_knowledge", input: { path } },
		{ toolCallId: "verify", toolName: "research_verify_literature", input: { note_path: path } },
	];
	for (const step of pending) expect(await host.event("tool_call", step)).toBeUndefined();
	const overflow = { ...pending[0], toolCallId: "overflow", toolName: "research_read_knowledge" };
	expect(await host.event("tool_call", overflow)).toMatchObject({ block: true });
	expect(await host.call("status")).toMatchObject({ details: { metadata: { fast_path: { stepsUsed: 3 } } } });
	for (const step of pending) await host.event("tool_execution_end", step);
	await host.event("tool_execution_end", { ...overflow, isError: true });
	await host.event("tool_execution_end", pending[0]);
	expect(await host.call("status")).toMatchObject({
		details: {
			metadata: {
				fast_path: { stepsUsed: 5, reason: "step_cap_reached" },
			},
		},
	});
});

it("keeps the evidence gate closed for a quote missing from the observed excerpt", async () => {
	const host = await setup();
	await startFast(host);
	await readAndVerify(host);
	await expect(
		host.call("complete", {
			claim_bindings: [
				{ ...claims[0], sources: [{ path, start_line: 1, end_line: 1, quote: "Fabricated observation" }] },
			],
		}),
	).rejects.toThrow(/quote does not match/);
	expect(await host.call("status")).toMatchObject({ details: { evidence_gate: { answerable: false } } });
});

it("preserves admitted parallel reads that finish after a local miss requires escalation", async () => {
	const host = await setup();
	await startFast(host);
	const steps = [
		{ toolCallId: "search", toolName: "research_search_knowledge", input: { query: "bounded" } },
		{ toolCallId: "read", toolName: "research_read_knowledge", input: { path } },
		{ toolCallId: "verify", toolName: "research_verify_literature", input: { note_path: path } },
	];
	for (const step of steps) expect(await host.event("tool_call", step)).toBeUndefined();
	const details = [
		{ complete: true, hits: [] },
		{ path, text, hash, startLine: 1, endLine: 1 },
		await host.verify(),
	];
	for (const [index, step] of steps.entries()) {
		await host.event("tool_execution_end", { ...step, result: { details: details[index] } });
	}
	expect(await host.call("status")).toMatchObject({
		details: {
			metadata: {
				fast_path: { stepsUsed: 4, escalation_required: true, reason: "no_local_hits" },
			},
		},
	});
	await host.call("escalate", { reason: "no_local_hits" });
	expect(await host.call("complete", { claim_bindings: claims })).toMatchObject({
		details: { evidence_gate: { answerable: true, reuse_count: 1 } },
	});
});

it.each(["research_archive_source", "webfetch", "write"])(
	"blocks %s before execution or approval",
	async (toolName) => {
		const host = await setup();
		await startFast(host);
		expect(await host.execute(toolName, { path })).toMatchObject({
			block: true,
			reason: expect.stringContaining("write_or_archive_required"),
		});
		expect(await host.call("status")).toMatchObject({
			details: {
				metadata: {
					fast_path: { stepsUsed: 1, escalation_required: true, reason: "write_or_archive_required" },
				},
			},
		});
		expect(host.approval).not.toHaveBeenCalled();
	},
);

it("preserves the current-turn reads and leaves write approval to the host after escalation", async () => {
	const host = await setup();
	await startFast(host);
	await readAndVerify(host);
	await host.call("complete", { claim_bindings: claims });
	await host.execute("write", { path });
	const before = (await host.call("status")) as {
		details: {
			revision: number;
			evidence_gate: {
				claim_bindings: { sources: { read_receipt_id: string }[] }[];
			};
		};
	};
	const originalReceiptId = before.details.evidence_gate.claim_bindings[0]?.sources[0]?.read_receipt_id;
	expect(originalReceiptId).toEqual(expect.any(String));
	const escalated = await host.call("escalate", { reason: "write_or_archive_required" });
	expect(escalated).toMatchObject({
		details: {
			revision: before.details.revision + 1,
			metadata: { mode: "deep_research" },
			evidence_gate: {
				events: expect.arrayContaining([
					expect.objectContaining({ type: "escalation", reason: "write_or_archive_required" }),
				]),
			},
		},
	});
	expect(await host.execute("write", { path })).toMatchObject({ authorized: false });
	expect(host.approval).toHaveBeenCalledOnce();
	expect(await host.call("complete", { claim_bindings: claims })).toMatchObject({
		details: {
			evidence_gate: {
				answerable: true,
				claim_bindings: [{ sources: [{ read_receipt_id: originalReceiptId }] }],
			},
		},
	});
});
