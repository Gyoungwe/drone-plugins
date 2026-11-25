import type { PluginNativeRuntimeInstance, PluginNativeSession } from "@gyoungwe/plugin-api/native";
import type {
	PluginRuntimeFactoryContext,
	PluginRuntimeOperation,
	PluginRuntimeSchema,
} from "@gyoungwe/plugin-api/runtime";
import { createTaskApplicationState } from "./application-state.js";
import { type ManagedCall, managedPorts } from "./managed-ports.js";
import { bindRuntime, createStandaloneRuntime, withRuntime } from "./runtime-bridge.js";
import {
	registerWorkbenchAdapter,
	type TaskJournal,
	taskScope,
	type WorkbenchHook,
} from "./workbench-adapter.js";

interface ManagedTaskSession {
	readonly controller: {
		readonly journal: {
			plan(input: unknown): Promise<unknown>;
			begin(query: string, capabilities?: readonly string[], binding?: string | null): Promise<unknown>;
			requestReport(): Promise<unknown>;
		};
	};
}
export interface ManagedTaskApplication extends PluginNativeRuntimeInstance {
	createNativeSession(): PluginNativeSession;
	withCurrentSession<Result>(
		signal: AbortSignal,
		operation: (session: ManagedTaskSession) => Result | Promise<Result>,
	): Promise<Result>;
}

const empty = { type: "null" };
const statusSchema = {
	type: "object",
	properties: { snapshot: {}, render: { type: "string" }, storage: {} },
	required: ["snapshot", "render", "storage"],
	additionalProperties: false,
};
const READ = "read" as const;
const TOOL_EFFECTS = {
	task_status: READ,
	task_plan: READ,
	task_wait: READ,
	task_reconcile: READ,
	task_evidence_restore: READ,
};
const COMMAND_EFFECTS = { "task-status": READ, "task-action": READ };
const EVENT_EFFECTS = Object.fromEntries(
	[
		"session_start",
		"session_tree",
		"context",
		"input",
		"before_agent_start",
		"message_start",
		"turn_start",
		"turn_end",
		"tool_call",
		"tool_result",
		"tool_execution_end",
		"agent_end",
		"agent_settled",
		"drone:context-evicted",
	].map((name) => [name, READ]),
);

type Runtime = ReturnType<typeof createStandaloneRuntime>;
type CurrentSession = <Result>(
	signal: AbortSignal,
	operation: (journal: TaskJournal) => Result | Promise<Result>,
) => Promise<Result>;

function project(journal: TaskJournal) {
	const { snapshot: task, render, storage } = journal.status();
	return {
		snapshot: task
			? {
					id: task.id,
					goal: task.goal,
					state: task.state,
					reason: task.reason ?? null,
					milestones: task.milestones.map(({ id, title, state, dependsOn }) => ({
						id,
						title,
						state,
						dependsOn,
					})),
					budget: task.budget,
					pending: task.operations
						.filter((operation) => ["started", "unknown"].includes(operation.state))
						.map(({ id, tool, state }) => ({ id, tool, state })),
				}
			: null,
		render,
		storage,
	};
}

function managedOperations(withSession: CurrentSession) {
	const operation = (
		effect: "read" | "write",
		inputSchema: PluginRuntimeSchema,
		execute: (input: unknown, journal: TaskJournal) => unknown,
		resultSchema: PluginRuntimeSchema = statusSchema,
	): PluginRuntimeOperation => ({
		effect,
		inputSchema,
		resultSchema,
		execute: (input, invocation) =>
			withSession(invocation.signal, async (journal) => {
				await journal.refresh(invocation.signal);
				return execute(input, journal);
			}),
	});
	const withStatus = (name: string, type: PluginRuntimeSchema) => ({
		...statusSchema,
		properties: { ...statusSchema.properties, [name]: type },
		required: [...statusSchema.required, name],
	});
	return {
		status: operation("read", empty, (_input, journal) => project(journal)),
		pause: operation(
			"write",
			{
				type: "object",
				properties: { reason: { type: "string", minLength: 1, maxLength: 128 } },
				required: ["reason"],
				additionalProperties: false,
			},
			async (input, journal) => {
				await journal.pause((input as { reason: string }).reason);
				return project(journal);
			},
		),
		advanceStage: operation(
			"write",
			empty,
			async (_input, journal) => ({ ...project(journal), advanced: await journal.advanceStage() }),
			withStatus("advanced", { type: "boolean" }),
		),
		takeReport: operation(
			"write",
			empty,
			async (_input, journal) => ({ ...project(journal), report: await journal.takeReport() }),
			withStatus("report", { type: ["string", "null"] }),
		),
	};
}

function managedSessions(call: ManagedCall, lifetime: AbortSignal) {
	const application = createTaskApplicationState();
	const journals = new Set<{ journal: TaskJournal; runtime: Runtime }>();
	const sessions = new Set<{ dispose(): Promise<void> }>();
	const createNativeSession = (): PluginNativeSession => {
		lifetime.throwIfAborted();
		const runtime = createStandaloneRuntime();
		let entry: { journal: TaskJournal; runtime: Runtime } | undefined;
		const session = {
			dispose: async () => {
				if (entry) journals.delete(entry);
				sessions.delete(session);
				await runtime.dispose();
			},
		};
		sessions.add(session);
		return {
			toolEffects: TOOL_EFFECTS,
			commandEffects: COMMAND_EFFECTS,
			eventEffects: EVENT_EFFECTS,
			extension: (pi) => {
				const facade = {
					on: pi.on.bind(pi),
					registerTool: pi.registerTool.bind(pi),
					registerCommand: pi.registerCommand.bind(pi),
					events: { on: () => () => undefined, emit: () => undefined },
				};
				bindRuntime(facade, runtime);
				withRuntime(runtime, () => {
					const on = facade.on as (name: string, handler: WorkbenchHook) => () => void;
					const journal = registerWorkbenchAdapter(facade, managedPorts(call, on), { application });
					entry = { journal, runtime };
					journals.add(entry);
				});
			},
			dispose: session.dispose,
		};
	};
	return { journals, sessions, createNativeSession };
}

export function createManagedTaskApplication(context: PluginRuntimeFactoryContext): ManagedTaskApplication {
	const lifetime = new AbortController();
	const call = ((name: string, input: unknown, signal?: AbortSignal) =>
		context.capabilities.call(name, input, signal)) as ManagedCall;
	const { journals, sessions, createNativeSession } = managedSessions(call, lifetime.signal);
	const withSession: CurrentSession = async (signal, operation) => {
		const current = AbortSignal.any([context.signal, lifetime.signal, ...(signal ? [signal] : [])]);
		const scope = await call("caller.scope", null, current);
		if (scope.kind !== "session")
			throw new Error("Task data service requires an actual attached SDK session");
		const key = taskScope(scope.sessionId, scope.workspaceDirectory);
		const entry = [...journals].find((candidate) => candidate.journal.scope() === key);
		if (!entry) throw new Error("Task data service has no native attachment for this SDK session");
		current.throwIfAborted();
		const result = await withRuntime(entry.runtime, () => operation(entry.journal));
		current.throwIfAborted();
		return result;
	};
	return {
		operations: managedOperations(withSession),
		createNativeSession,
		withCurrentSession: (signal, operation) =>
			withSession(signal, (journal) => operation({ controller: { journal } })),
		dispose: async () => {
			lifetime.abort(new Error("Managed task application closed"));
			await Promise.all([...sessions].map((session) => session.dispose()));
		},
	};
}
