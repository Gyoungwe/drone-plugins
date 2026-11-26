import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	PluginProviderInspection,
	PluginRuntimeContext,
	PluginRuntimeFactory,
} from "@gyoungwe/plugin-api/runtime";
import { afterEach, expect, it, vi } from "vitest";
import type { FailureCandidateSink } from "../src/core/failure-candidates.js";
import createDesktopRuntime, { createDesktopFailureCandidateSink } from "../src/desktop/runtime.js";
import { registerEvidenceLoop } from "../src/evidence-loop.js";
import { type ResearchExtensionPorts, registerResearchExtension } from "../src/extension.js";
import type { Context, Tool } from "../src/research-loop-tool.js";

const signal = new AbortController().signal;
const events = { changed: () => undefined };
const vaultId = "0123456789abcdef01234567";
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
	for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

function versionOf(value: unknown) {
	return createHash("sha256")
		.update(`${JSON.stringify(value, null, 2)}\n`)
		.digest("hex");
}

function knowledgeState() {
	const entries = new Map<string, unknown>([
		[
			"binding.json",
			{
				version: 1,
				revision: 1,
				vaultId,
				vault: "/synthetic-vault",
				profile: "hybrid",
				depositMode: "verified",
				subagentPolicy: "none",
				updatedAt: "2026-11-26T00:00:00.000Z",
			},
		],
	]);
	const directories = new Set<string>();
	return {
		async call(name: string, raw: unknown): Promise<unknown> {
			const request = raw as { root: string; path: string; expectedVersion?: string; value?: unknown };
			if (name === "roots.resolve") return { handle: "workspace" };
			if (
				name === "files.readText" &&
				request.root === "workspace" &&
				request.path === ".pi/research-workspace.json"
			)
				return { text: '{"knowledgeProjectId":"fixture"}' };
			if (request.root !== "state") throw new Error(`Unknown capability: ${name}`);
			const current = entries.get(request.path);
			if (name === "state.readJson")
				return current === undefined
					? { kind: "missing", version: null }
					: { kind: "value", value: structuredClone(current), version: versionOf(current) };
			if (name === "state.ensureDirectory") {
				directories.add(request.path);
				return { created: true };
			}
			if (name !== "state.writeJson" || !directories.has(request.path.split("/").slice(0, -1).join("/")))
				throw new Error(`Unexpected state capability: ${name}`);
			if (request.expectedVersion !== (current === undefined ? null : versionOf(current)))
				throw new Error("State write lacks a current version");
			entries.set(request.path, structuredClone(request.value));
			return { kind: "value", value: request.value, version: versionOf(request.value) };
		},
	};
}

async function loadProvider() {
	const root = new URL("../../pi-knowledge/", import.meta.url);
	const manifest = JSON.parse(await readFile(new URL("plugin.manifest.json", root), "utf8"));
	const entry = new URL(manifest.entrypoints.desktopRuntime, root);
	const { default: createRuntime } = (await import(fileURLToPath(entry))) as {
		default: PluginRuntimeFactory;
	};
	const capabilityPort = knowledgeState();
	const runtime = await createRuntime({
		applicationId: "test",
		resources: [{ kind: "state", handle: "state", access: "read-write" }],
		resourcesLifecycle: { dispose: async () => undefined },
		capabilities: capabilityPort,
		events,
		signal,
	});
	cleanup.push(() => runtime.dispose());
	return { manifest, runtime, capabilityPort };
}

async function bridge(state: PluginProviderInspection["state"] = "available") {
	const cwd = await mkdtemp(join(tmpdir(), "research-failure-bridge-"));
	cleanup.push(() => rm(cwd, { recursive: true, force: true }));
	const scope = {
		kind: "session" as const,
		sessionId: "session",
		workspaceId: "workspace",
		workspaceDirectory: cwd,
	};
	const consumer = JSON.parse(await readFile(new URL("../plugin.manifest.json", import.meta.url), "utf8"));
	const provider = state === "available" ? await loadProvider() : undefined;
	const call = vi.fn(async (name: string, input: unknown) => {
		const request = input as { alias: string; operation: string; input: unknown };
		const requirement = consumer.drone.requires?.[request.alias];
		expect(requirement).toEqual({ service: "knowledge.failure-candidates", version: 1 });
		if (name === "provider.inspect") return { state };
		const advertised = provider?.manifest.drone.provides[requirement.service];
		if (
			!provider ||
			advertised?.version !== requirement.version ||
			!advertised.operations.includes(request.operation)
		)
			throw new Error(`No matching provider operation ${request.operation}`);
		const operation = provider.runtime.operations[request.operation];
		if (!operation || name !== `provider.${operation.effect}`) throw new Error("Broker effect mismatch");
		return operation.execute(request.input, { scope, signal, capabilities: provider.capabilityPort });
	});
	const capabilities = { call };
	const runtime = await createDesktopRuntime({
		applicationId: "test",
		resources: [],
		signal,
		capabilities,
		events,
	});
	cleanup.push(() => runtime.dispose());
	const context: PluginRuntimeContext = { scope, signal, capabilities };
	return {
		cwd,
		context,
		call,
		query: () => runtime.operations.queryFailureCandidates.execute({ limit: 2 }, context),
	};
}

function researchSession(cwd: string, failureCandidateSink: FailureCandidateSink) {
	const ctx: Context = { cwd, sessionId: "session" };
	const tools = new Map<string, Omit<Tool, "executionMode">>();
	const listeners = new Map<string, (event: unknown, ctx: Context) => unknown>();
	const pi = {
		registerTool: (tool: Omit<Tool, "executionMode">) => tools.set(tool.name, tool),
		on: (event: string, handler: (event: unknown, ctx: Context) => unknown) => listeners.set(event, handler),
	};
	const ports: ResearchExtensionPorts = {
		workspace: async () => ({ resultsRoot: join(cwd, "results") }),
		resolveProject: async () => "fixture",
		resolveSessionProject: async () => ({ project: "fixture" }),
		describeProject: (value) => value,
		verifyLiteratureReceipt: async () => {
			throw new Error("No literature checks expected");
		},
		sourceStatus: async () => ({}),
		registerTool: (host, tool) => host.registerTool(tool),
		run: async (operation) => operation(),
		breakerBudget: { maxBilledTokens: 5 },
		failureCandidateSink,
	};
	registerResearchExtension(pi, ports);
	registerEvidenceLoop(pi, { failureCandidateSink });
	return {
		async execute(name: string, params: Record<string, unknown>) {
			const tool = tools.get(name);
			if (!tool) throw new Error(`Missing tool ${name}`);
			return tool.execute("tool-event", params, signal, undefined, ctx);
		},
		async event(name: string, input: unknown) {
			const listener = listeners.get(name);
			if (!listener) throw new Error(`Missing research event ${name}`);
			return listener(input, ctx);
		},
	};
}

const start = { action: "start", query: "fixture question" };
const exhausted = {
	message: { role: "assistant", usage: { reported: true, input: 5, output: 0, cacheWrite: 0 } },
};

it("records an authorized research failure through the shipped Knowledge runtime and queries it read-only", async () => {
	const harness = await bridge();
	const session = researchSession(
		harness.cwd,
		createDesktopFailureCandidateSink(harness.context, () => true),
	);
	await session.execute("research_loop", start);
	await session.event("message_end", exhausted);
	expect(await harness.query()).toMatchObject({
		revision: 1,
		candidates: [
			{
				failureCode: "breaker:budget-exceeded",
				navigationOnly: true,
				evidenceEligible: false,
				instructionEligible: false,
				authorityEligible: false,
				status: "candidate",
			},
		],
	});
	expect(harness.call.mock.calls.map(([name]) => name)).toEqual([
		"provider.inspect",
		"provider.write",
		"provider.inspect",
		"provider.read",
	]);
});

it.each(["absent", "disabled"] as const)("degrades when the required provider is %s", async (state) => {
	const harness = await bridge(state);
	const session = researchSession(
		harness.cwd,
		createDesktopFailureCandidateSink(harness.context, () => true),
	);
	await session.execute("research_loop", start);
	await expect(session.event("message_end", exhausted)).resolves.toBeUndefined();
	expect(await harness.query()).toBeNull();
	expect(harness.call.mock.calls.map(([name]) => name)).toEqual(["provider.inspect", "provider.inspect"]);
});

it("never attempts provider writes after an observed fast-path miss", async () => {
	const harness = await bridge();
	const session = researchSession(
		harness.cwd,
		createDesktopFailureCandidateSink(harness.context, () => false),
	);
	await session.execute("research_loop", { ...start, mode: "fast_readonly" });
	const search = {
		toolCallId: "local-search",
		toolName: "research_search_knowledge",
		input: { query: "fixture" },
	};
	await expect(session.event("tool_call", search)).resolves.toBeUndefined();
	await session.event("tool_execution_end", {
		...search,
		result: { details: { complete: true, hits: [] } },
	});
	await session.event("message_end", exhausted);
	await expect(session.execute("research_loop", { action: "status" })).resolves.toMatchObject({
		details: { escalationRequired: true, metadata: { mode: "fast_readonly" } },
	});
	expect(await harness.query()).toEqual({ revision: 0, candidates: [] });
	expect(harness.call.mock.calls.map(([name]) => name)).not.toContain("provider.write");
});

it("drops a local evidence failure when write authority is revoked during provider inspection", async () => {
	const harness = await bridge();
	const authority = { active: true };
	const sink = createDesktopFailureCandidateSink(harness.context, () => authority.active);
	const session = researchSession(harness.cwd, sink);
	await mkdir(join(harness.cwd, "research-sources"));
	harness.call.mockImplementationOnce(async () => {
		authority.active = false;
		return { state: "available" };
	});
	await expect(session.execute("research_search_sources", { query: "absent" })).resolves.toMatchObject({
		details: { count: 0 },
	});
	expect(harness.call.mock.calls.map(([name]) => name)).toEqual(["provider.inspect"]);
});
