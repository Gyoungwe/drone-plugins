import { createHash } from "node:crypto";
import {
	createEventBus,
	type ExtensionAPI,
	type ExtensionToolContext,
	SessionManager,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { PluginNativeSession } from "@gyoungwe/plugin-api/native";
import type {
	PluginModelJson,
	PluginModelSelection,
	PluginModelToolStepInput,
	PluginModelToolStepResult,
	PluginRuntimeCapabilities,
} from "@gyoungwe/plugin-api/runtime";
import { vi } from "vitest";
import type { KnowledgeBinding } from "../../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../../src/core/runtime-host.js";
import { createKnowledgeSpecialistHost } from "../../src/core/specialist-host.js";
import type { SpecialistRequest } from "../../src/core/specialist-model-loop.js";
import createDesktopRuntime from "../../src/desktop/runtime.js";
import { createBrokerKnowledgeSpecialist } from "../../src/desktop/specialist-model.js";
import { withAgentSlotFake } from "./agent-slot-fake.js";

export const sourcePath = "Library/Methods/synthetic.md";
export const task = "Find synthetic knowledge evidence";
export const answer = { summary: "Synthetic specialist finding", source_paths: [sourcePath], cautions: [] };
export const selection: PluginModelSelection = {
	provider: "synthetic-parent-provider",
	model: "synthetic-parent-model",
	thinkingLevel: "off",
};
const binding: KnowledgeBinding = {
	version: 1,
	vault: "/synthetic-vault",
	vaultId: "a".repeat(24),
	revision: 1,
	profile: "hybrid",
	depositMode: "verified",
	subagentPolicy: "read-local",
	updatedAt: "2026-11-17T00:00:00.000Z",
};

export function deferred<T>() {
	let resolve: (value: T) => void;
	const promise = new Promise<T>((release) => {
		resolve = release;
	});
	return { promise, resolve: (value: T) => resolve(value) };
}

export function reply(
	name: string,
	args: PluginModelJson,
	usage: { totalTokens?: number } = {},
): PluginModelToolStepResult {
	return {
		selection,
		reply: {
			role: "assistant",
			stopReason: "toolUse",
			timestamp: 0,
			content: [{ type: "toolCall", id: `synthetic-${name}`, name, arguments: args }],
		},
		usage: {
			inputTokens: null,
			outputTokens: null,
			cacheReadTokens: null,
			cacheWriteTokens: null,
			reasoningTokens: null,
			totalTokens: null,
			cost: null,
			...usage,
			reportedFields: Object.keys(usage),
		},
	};
}

function page(path: string) {
	const text = path === sourcePath ? "# Synthetic method\nBounded synthetic evidence.\n" : "# Navigation\n";
	return {
		path,
		text,
		hash: createHash("sha256").update(text).digest("hex"),
		startLine: 1,
		endLine: 2,
		missing: false,
		truncated: false,
		humanReview: "",
	};
}

function resourceBroker() {
	const invoke = vi.fn(async (input: { operation: string; input: Record<string, unknown> }) => {
		if (input.operation === "read") return page(input.input.path as string);
		if (input.operation === "search")
			return {
				query: input.input.query,
				hits: input.input.wikiOnly ? [] : [{ ...page(sourcePath), kind: "method" }],
				revision: 1,
				coverage: "ready",
				complete: true,
			};
		if (["status", "reconcile"].includes(input.operation))
			return {
				revision: 1,
				coverage: "ready",
				problems: [],
				pendingChanges: 0,
				noteCount: 1,
			};
		throw new Error(`Unscripted index operation ${input.operation}`);
	});
	return { invoke };
}

function modelBroker() {
	const select = vi.fn(async () => selection);
	const step = vi.fn(
		async (_input: PluginModelToolStepInput, _signal?: AbortSignal): Promise<PluginModelToolStepResult> => {
			throw new Error("Unscripted model step");
		},
	);
	return { select, step };
}

function capabilityBroker(settings: Record<string, number>) {
	const model = modelBroker();
	const resource = resourceBroker();
	const call = vi.fn<PluginRuntimeCapabilities["call"]>(async (name, input, signal) => {
		if (name === "agent.slot.acquire") return { lease: "synthetic-agent-slot" };
		if (name === "agent.slot.release") return { released: true };
		if (name === "model.selection") return model.select();
		// Snapshot at the transport boundary: the real loop appends to its private message array.
		if (name === "model.toolStep")
			return model.step(structuredClone(input) as PluginModelToolStepInput, signal);
		if (name === "resource.create") return { handle: "synthetic-index" };
		if (name === "resource.invoke") return resource.invoke(input as Parameters<typeof resource.invoke>[0]);
		if (name === "roots.resolve") return { handle: "synthetic-files" };
		if (name === "files.readText") return { text: JSON.stringify({ knowledgeProjectId: "synthetic" }) };
		if (name === "provider.inspect") return { state: "absent" };
		if (name === "session.inspect") return { agentActive: false, projectTrusted: true, readOnly: false };
		if (name === "session.records.read") return { state: "durable", records: [], error: null };
		if (name === "state.readJson") {
			const { path } = input as { path: string };
			if (path === "binding.json") return { kind: "value", value: binding, version: "binding-1" };
			if (path === "specialists.json")
				return {
					kind: "value",
					value: { mode: "automatic", revision: 0, ...settings },
					version: "settings-1",
				};
			return { kind: "missing" };
		}
		throw new Error(`Unscripted capability ${name}`);
	});
	return { call, model, resource };
}

type Hook = (event: unknown, context: ExtensionToolContext) => unknown;

async function registerNative(session: PluginNativeSession, signal: AbortSignal) {
	const hooks = new Map<string, Hook[]>();
	const sessionManager = SessionManager.inMemory("/synthetic-workspace");
	sessionManager.appendMessage({ role: "user", content: "SYNTHETIC_PARENT_HISTORY_ONLY", timestamp: 0 });
	const parentHistory = sessionManager.getBranch();
	const context: Pick<ExtensionToolContext, "cwd" | "signal" | "sessionManager"> = {
		cwd: "/synthetic-workspace",
		signal,
		sessionManager,
	};
	const on = vi.fn((_event: string, _handler: (...args: never[]) => unknown) => () => undefined);
	const registerTool = vi.fn<ExtensionAPI["registerTool"]>();
	const pi: Partial<ExtensionAPI> = {
		events: createEventBus(),
		on,
		registerTool: registerTool as ExtensionAPI["registerTool"],
		registerCommand: vi.fn(),
		getCommands: () => [],
	};
	await session.extension(pi as ExtensionAPI);
	for (const [name, hook] of on.mock.calls) hooks.set(name, [...(hooks.get(name) ?? []), hook as Hook]);
	async function emit(name: string, event: unknown) {
		const results = [];
		for (const hook of hooks.get(name) ?? [])
			results.push(await hook(event, context as ExtensionToolContext));
		return results;
	}
	await emit("session_start", {});
	const delegate: ToolDefinition | undefined = registerTool.mock.calls
		.map(([tool]) => tool)
		.find((tool) => tool.name === "research_delegate_knowledge");
	if (!delegate) throw new Error("Native specialist tool was not registered");
	return {
		context,
		parentHistory,
		emit,
		begin: (prompt = task) => emit("before_agent_start", { prompt }),
		async execute(role = "evidence") {
			return (
				await delegate.execute(
					"synthetic-call",
					{ role, task, source_paths: [sourcePath] },
					signal,
					undefined,
					context as ExtensionToolContext,
				)
			).details as Record<string, unknown>;
		},
	};
}

export async function ownerFixture(settings: Record<string, number> = {}) {
	const broker = capabilityBroker(settings);
	const controller = new AbortController();
	const runtime = await createDesktopRuntime({
		applicationId: "specialist-model-test",
		signal: controller.signal,
		resources: [{ kind: "state", handle: "synthetic-state", access: "read-write" }],
		capabilities: { call: broker.call },
		events: { changed: vi.fn() },
		resourcesLifecycle: { dispose: vi.fn(async () => undefined) },
	});
	if (!runtime.createNativeSession) throw new Error("Native session factory is missing");
	const session = await runtime.createNativeSession({ kind: "primary", readOnly: false });
	const native = await registerNative(session, controller.signal);
	await native.begin();
	return {
		...broker,
		...native,
		async close() {
			await session.dispose();
			await runtime.dispose();
			controller.abort();
		},
		sourceReads: () =>
			broker.resource.invoke.mock.calls.filter(
				([args]) =>
					args.operation === "read" && args.input.path === sourcePath && args.input.maxChars === 3000,
			),
		evidenceSearches: () =>
			broker.resource.invoke.mock.calls.filter(
				([args]) => args.operation === "search" && args.input.wikiOnly === false,
			),
	};
}

export function reviewerFixture() {
	const model = modelBroker();
	const call = vi.fn<PluginRuntimeCapabilities["call"]>(async (name, input, signal) => {
		if (name === "model.selection") return model.select();
		if (name === "model.toolStep")
			return model.step(structuredClone(input) as PluginModelToolStepInput, signal);
		throw new Error(`Unscripted reviewer capability ${name}`);
	});
	const host = createKnowledgeSpecialistHost(
		createKnowledgeRuntimeHost(),
		{
			readKnowledgeBinding: async () => binding,
			withKnowledgeBinding: async (_binding, operation) => operation(),
		},
		{ invalidateKnowledgeUi: vi.fn() },
		{ read: async () => null, write: vi.fn() },
	);
	const unregister = host.registerKnowledgeSpecialistHost(
		"synthetic-reviewer",
		createBrokerKnowledgeSpecialist(withAgentSlotFake(call)),
	);
	const request: SpecialistRequest = {
		role: "reviewer",
		task,
		packet: "Synthetic review packet",
		capabilities: [],
		check: vi.fn(async () => undefined),
		progress: vi.fn(),
	};
	return {
		model,
		call,
		request,
		run: () => host.knowledgeSpecialistHost({ sessionId: "synthetic-reviewer" })(request),
		close: () => {
			unregister();
			host.dispose();
		},
	};
}
