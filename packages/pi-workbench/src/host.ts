import type {
	PluginRuntimeContext,
	PluginRuntimeFactory,
	PluginRuntimeOperation,
} from "@gyoungwe/plugin-api/runtime";
import {
	WorkbenchStore,
	emptyWorkbenchSnapshot,
	type TaskState,
	type WorkbenchSnapshot,
} from "./index.js";

const stateFile = "workbench.json";

function snapshotFromState(value: unknown): WorkbenchSnapshot {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid workbench state");
	const input = value as Record<string, unknown>;
	if (!Array.isArray(input.tasks) || !Array.isArray(input.memory)) throw new Error("Invalid workbench state");
	const tasks = input.tasks.map((task) => {
		if (!task || typeof task !== "object" || Array.isArray(task)) throw new Error("Invalid workbench task");
		const item = task as Record<string, unknown>;
		if (
			typeof item.id !== "string" ||
			typeof item.content !== "string" ||
			typeof item.updatedAt !== "string" ||
			!(["pending", "in_progress", "completed", "blocked"] as const).includes(item.state as TaskState)
		)
			throw new Error("Invalid workbench task");
		return {
			id: item.id,
			content: item.content,
			state: item.state as TaskState,
			updatedAt: item.updatedAt,
		};
	});
	const memory = input.memory.map((entry) => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Invalid workbench memory");
		const item = entry as Record<string, unknown>;
		if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.body !== "string" || typeof item.createdAt !== "string")
			throw new Error("Invalid workbench memory");
		return { id: item.id, title: item.title, body: item.body, createdAt: item.createdAt };
	});
	return { tasks, memory };
}

type StateRead = { kind: "missing"; version: null } | { kind: "value"; value: unknown; version: string };

/**
 * Desktop adapter for the same scoped workbench store used by native Pi.
 * The plugin never opens a file: persistence is an explicit host capability call.
 */
export const createWorkbenchRuntime: PluginRuntimeFactory = async (factoryContext) => {
	const states = factoryContext.resources.filter((resource) => resource.kind === "state");
	if (states.length !== 1) throw new Error("Workbench runtime requires exactly one authorized application-state root");
	const state = states[0];
	const stored = (await factoryContext.capabilities.call("state.readJson", {
		root: state.handle,
		path: stateFile,
	})) as StateRead;
	const store = new WorkbenchStore(stored.kind === "missing" ? emptyWorkbenchSnapshot() : snapshotFromState(stored.value));
	let version = stored.version;
	let disposed = false;
	const assertActive = () => {
		if (disposed || factoryContext.signal.aborted) throw new Error("Workbench runtime is disposed");
	};
	const operation = <TInput>(
		inputSchema: object,
		effect: "read" | "write",
		execute: (input: TInput, context: PluginRuntimeContext) => Promise<unknown>,
	): PluginRuntimeOperation => ({
		inputSchema,
		resultSchema: { type: "object" },
		effect,
		execute: async (input, context) => {
			assertActive();
			if (context.signal.aborted) throw new Error("Workbench runtime is disposed");
			return execute(input as TInput, context);
		},
	});
	return {
		operations: {
			status: operation({}, "read", async () => store.snapshot()),
			plan: operation(
				{ type: "object", properties: { items: { type: "array", items: { type: "string" } } }, required: ["items"] },
				"write",
				async (input: { items: string[] }) => {
					if (!Array.isArray(input.items) || input.items.some((item) => typeof item !== "string")) throw new Error("items must be an array of strings");
					return { tasks: store.plan(input.items) };
				},
			),
			todo: operation(
				{ type: "object", properties: { id: { type: "string" }, state: { type: "string" } }, required: ["id", "state"] },
				"write",
				async (input: { id: string; state: TaskState }) => {
					if (typeof input.id !== "string" || !(["pending", "in_progress", "completed", "blocked"] as const).includes(input.state)) throw new Error("id and state are required");
					return { task: store.update(input.id, input.state) };
				},
			),
			memorySave: operation(
				{ type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"] },
				"write",
				async (input: { title: string; body: string }) => {
					if (typeof input.title !== "string" || typeof input.body !== "string") throw new Error("title and body are required");
					return { memory: store.saveMemory(input.title, input.body) };
				},
			),
			persist: operation({}, "write", async () => {
				if (state.access !== "read-write") throw new Error("Workbench persistence requires a read-write state grant");
				const result = (await factoryContext.capabilities.call("state.writeJson", {
					root: state.handle,
					path: stateFile,
					value: store.snapshot(),
					expectedVersion: version,
				})) as { version: string };
				version = result.version;
				factoryContext.events.changed();
				return { version };
			}),
		},
		dispose: async () => {
			disposed = true;
		},
	};
};

export default createWorkbenchRuntime;
