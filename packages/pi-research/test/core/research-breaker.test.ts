import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createResearchLoop } from "../../src/core/research-loop.js";
import { registerResearchExtension } from "../../src/extension.js";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function workspace() {
	const cwd = await mkdtemp(join(tmpdir(), "research-breaker-"));
	roots.push(cwd);
	return cwd;
}

function portsFor(cwd: string, breakerBudget = { maxBilledTokens: 100 }) {
	return {
		workspace: async () => ({ resultsRoot: join(cwd, "results"), obsidianVault: cwd }),
		resolveProject: async () => "fixture",
		verifyLiteratureReceipt: async () => {
			throw new Error("Unexpected library lookup");
		},
		sourceStatus: async () => {
			throw new Error("Unexpected archive lookup");
		},
		breakerBudget,
	};
}

async function trackedRun(breakerBudget?: { maxBilledTokens: number; maxCost?: number }) {
	const cwd = await workspace();
	const loop = createResearchLoop(portsFor(cwd, breakerBudget));
	const { run_dir: runDir } = await loop.startResearchRun({ cwd, mode: "deep_research", query: "fixture" });
	return { cwd, loop, runDir, status: () => loop.updateResearchLoop({ cwd, runDir, action: "status" }) };
}

const sample = {
	reported: true,
	inputTokens: 30,
	outputTokens: 10,
	cacheWriteTokens: 10,
	cacheReadTokens: 400,
};

it("deducts only billed token fields and atomically persists the stop and receipt together", async () => {
	const { cwd, loop, runDir, status } = await trackedRun();
	await loop.observeUsage(cwd, runDir, sample);
	expect(await status()).toMatchObject({ metadata: { status: "running" } });
	await loop.observeUsage(cwd, runDir, sample);
	const stopped = await status();
	expect(stopped).toMatchObject({
		metadata: {
			status: "stopped_by_breaker",
			breaker_receipt: {
				version: 1,
				kind: "drone.research.breaker-receipt",
				reason: "budget-exceeded",
				limitKind: "tokens",
				measured: {
					inputTokens: 60,
					outputTokens: 20,
					cacheReadTokens: 800,
					cacheWriteTokens: 20,
					billedTokens: 100,
					remainingTokens: 0,
				},
				scientificallyVerified: false,
			},
		},
		evidence_gate: { answerable: false },
	});
	expect(JSON.parse(await readFile(join(runDir, "metadata.json"), "utf8"))).toEqual(stopped.metadata);
	expect(await readdir(runDir)).toEqual(["metadata.json"]);
	await expect(loop.updateResearchLoop({ cwd, runDir, action: "complete" })).rejects.toThrow(
		/budget-exceeded/,
	);
	const reopened = createResearchLoop(portsFor(cwd));
	expect(await reopened.checkTool(cwd, runDir, { toolName: "write" })).toMatchObject({
		block: true,
		terminate: true,
		reason: expect.stringContaining("budget-exceeded"),
	});
});

it("trips at the configured cost rather than substituting token or price estimates", async () => {
	const { cwd, loop, runDir, status } = await trackedRun({ maxBilledTokens: 1000, maxCost: 0.5 });
	await loop.observeUsage(cwd, runDir, { ...sample, cost: 0.5 });
	expect(await status()).toMatchObject({
		metadata: {
			breaker_receipt: {
				reason: "budget-exceeded",
				limitKind: "cost",
				measured: { remainingTokens: 950, remainingCost: 0 },
			},
		},
	});
});

it.each([
	{
		name: "unreported usage",
		maxBilledTokens: 100,
		usage: { ...sample, reported: false },
		unknownUsageSteps: 1,
	},
	{ name: "corrupt quota", maxBilledTokens: Number.NaN, usage: sample, unknownUsageSteps: 0 },
])("fails closed for $name", async ({ maxBilledTokens, usage, unknownUsageSteps }) => {
	const { cwd, loop, runDir, status } = await trackedRun({ maxBilledTokens });
	await loop.observeUsage(cwd, runDir, usage);
	expect(await status()).toMatchObject({
		metadata: {
			breaker_receipt: {
				reason: "quota-unconfirmable",
				limitKind: "unknown-quota",
				measured: { remainingTokens: null, usageReported: usage.reported, unknownUsageSteps },
			},
		},
	});
});

it("rejects the next tool before dispatch when the configured token quota is missing", async () => {
	const cwd = await workspace();
	const { breakerBudget: _budget, ...ports } = portsFor(cwd);
	const loop = createResearchLoop(ports);
	const { run_dir: runDir } = await loop.startResearchRun({ cwd, mode: "deep_research", query: "fixture" });
	expect(await loop.checkTool(cwd, runDir, { toolName: "write", args: {} })).toMatchObject({
		block: true,
		reason: expect.stringContaining("quota-unconfirmable"),
	});
});

it.each([
	{ queries: ["first", "second", "third"], reason: "stalled", limitKind: "stall" },
	{
		queries: ["Same query", " same  query ", "SAME QUERY"],
		reason: "repeated-tool-loop",
		limitKind: "repeats",
	},
])("trips $reason on the third observed non-progressing step", async ({ queries, reason, limitKind }) => {
	const { cwd, loop, runDir, status } = await trackedRun();
	for (const [index, query] of queries.entries()) {
		await loop.observeResearchReceipt({
			cwd,
			runDir,
			toolName: "research_search_knowledge",
			toolCallId: `search-${index}`,
			args: { query },
			details: { complete: false },
			countedStep: true,
		});
		if (index < 2) expect(await status()).toMatchObject({ metadata: { status: "running" } });
	}
	expect(await status()).toMatchObject({
		metadata: {
			breaker_receipt: {
				reason,
				limitKind,
				measured: { steps: 3, stalledSteps: 3 },
				preservedProgress: { stage: "created" },
			},
		},
	});
});

it("stops at 20 tool steps even when each step adds a read receipt", async () => {
	const { cwd, loop, runDir, status } = await trackedRun();
	for (let index = 0; index < 20; index += 1) {
		const path = `Library/Papers/fixture-${index}.md`;
		await loop.observeResearchReceipt({
			cwd,
			runDir,
			toolName: "research_read_knowledge",
			toolCallId: `read-${index}`,
			countedStep: true,
			args: { path },
			details: { path, text: "Observed line", hash: "a".repeat(64), startLine: 1, endLine: 1 },
		});
	}
	expect(await status()).toMatchObject({
		metadata: {
			breaker_receipt: {
				reason: "budget-exceeded",
				limitKind: "steps",
				measured: { steps: 20, stalledSteps: 0 },
				preservedProgress: { inspectedSources: 20, stage: "sources_inspected" },
			},
		},
	});
});

type Pi = Parameters<typeof registerResearchExtension>[0];
type Tool = Parameters<Pi["registerTool"]>[0];
type Listener = Parameters<NonNullable<Pi["on"]>>[1];

it("observes only current-session eviction events and assistant usage through the host hooks", async () => {
	const cwd = await workspace();
	const ctx = { cwd, sessionId: "owner" };
	const listeners = new Map<string, Listener>();
	const tools = new Map<string, Tool>();
	const emit = vi.fn();
	registerResearchExtension(
		{
			on: (name, listener) => listeners.set(name, listener),
			registerTool: (tool) => tools.set(tool.name, tool),
			events: { on: (name, listener) => listeners.set(name, listener), emit },
		},
		{
			...portsFor(cwd),
			resolveSessionProject: async () => ({ project: "fixture" }),
			describeProject: (project) => project,
			registerTool: (pi, tool) => pi.registerTool(tool),
			run: async (work) => work(),
		},
	);
	const tool = tools.get("research_loop");
	if (!tool) throw new Error("research_loop unavailable");
	const call = (args: Record<string, unknown>) =>
		tool.execute("fixture-id", args, new AbortController().signal, undefined, ctx);
	const event = (name: string, payload: unknown) => listeners.get(name)?.(payload, ctx);
	const args = { action: "start", mode: "deep_research", query: "fixture" };
	const toolCall = { toolCallId: "fixture-id", toolName: "research_loop" };
	await event("before_agent_start", { systemPrompt: "fixture" });
	await event("message_start", { message: { role: "user" } });
	await event("message_end", {
		message: {
			role: "assistant",
			usage: { input: 20, output: 10, cacheWrite: 0, cacheRead: 200 },
			content: [{ type: "toolCall", name: "research_loop", id: toolCall.toolCallId, arguments: args }],
		},
	});
	await event("tool_execution_start", { ...toolCall, args });
	await event("tool_call", { ...toolCall, input: args });
	await event("tool_execution_end", { ...toolCall, result: await call(args) });
	await event("drone:context-evicted", { sessionId: "other", toolCallIds: ["ignored"] });
	await event("drone:context-evicted", { sessionId: "owner", toolCallIds: ["first", "second"] });
	const usage = { input: 40, output: 10, cacheWrite: 20, cacheRead: 600 };
	await event("message_end", { message: { role: "toolResult", usage } });
	expect(await call({ action: "status" })).toMatchObject({ details: { metadata: { status: "running" } } });
	await event("message_end", { message: { role: "assistant", usage } });
	expect(await call({ action: "status" })).toMatchObject({
		details: {
			metadata: {
				breaker_receipt: {
					limitKind: "tokens",
					measured: { steps: 1, billedTokens: 100, cacheReadTokens: 800 },
					contextPressure: { evictionCount: 1, evictedToolCallIds: 2, lastEvictedAt: expect.any(String) },
				},
			},
		},
	});
	expect(tool.parameters).toMatchObject({ additionalProperties: false });
	expect(tool.parameters).not.toHaveProperty("properties.usage");
	expect(emit).not.toHaveBeenCalled();
});
