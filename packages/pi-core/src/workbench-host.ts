import type {
	PluginRuntimeContext,
	PluginRuntimeFactory,
	PluginRuntimeOperation,
	PluginStateReadResult,
} from "@gyoungwe/plugin-api/runtime";
import { type TaskState, type WorkbenchSnapshot, WorkbenchStore } from "./workbench";

function isTaskState(value: unknown): value is TaskState {
	return value === "pending" || value === "in_progress" || value === "completed" || value === "blocked";
}

function snapshotFromState(value: unknown): WorkbenchSnapshot {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid workbench state");
	const { tasks, memory } = value as Record<string, unknown>;
	if (!Array.isArray(tasks) || !Array.isArray(memory)) throw new Error("Invalid workbench state");
	return {
		tasks: tasks.map((task) => {
			if (!task || typeof task !== "object" || Array.isArray(task)) throw new Error("Invalid workbench task");
			const { id, content, updatedAt, state } = task as Record<string, unknown>;
			if (
				typeof id !== "string" ||
				typeof content !== "string" ||
				typeof updatedAt !== "string" ||
				!isTaskState(state)
			)
				throw new Error("Invalid workbench task");
			return { id, content, state, updatedAt };
		}),
		memory: memory.map((entry) => {
			if (!entry || typeof entry !== "object" || Array.isArray(entry))
				throw new Error("Invalid workbench memory");
			const { id, title, body, createdAt } = entry as Record<string, unknown>;
			if (
				typeof id !== "string" ||
				typeof title !== "string" ||
				typeof body !== "string" ||
				typeof createdAt !== "string"
			)
				throw new Error("Invalid workbench memory");
			return { id, title, body, createdAt };
		}),
	};
}

function guardedOperation(isDisposed: () => boolean) {
	return <Input>(
		inputSchema: object,
		effect: PluginRuntimeOperation["effect"],
		execute: (input: Input, context: PluginRuntimeContext) => object | Promise<object>,
	): PluginRuntimeOperation => ({
		inputSchema,
		resultSchema: { type: "object" },
		effect,
		async execute(input, context) {
			if (isDisposed() || context.signal.aborted) throw new Error("Workbench runtime is disposed");
			return execute(input as Input, context);
		},
	});
}

function buildWorkbenchOperations(
	store: WorkbenchStore,
	operation: ReturnType<typeof guardedOperation>,
	persist: (input: unknown, context: PluginRuntimeContext) => Promise<{ version: string }>,
) {
	return {
		status: operation({}, "read", () => store.snapshot()),
		plan: operation(
			{
				type: "object",
				properties: { items: { type: "array", items: { type: "string" } } },
				required: ["items"],
			},
			"write",
			({ items }: { items: unknown }) => {
				if (!Array.isArray(items) || items.some((item) => typeof item !== "string"))
					throw new Error("items must be an array of strings");
				return { tasks: store.plan(items) };
			},
		),
		todo: operation(
			{
				type: "object",
				properties: { id: { type: "string" }, state: { type: "string" } },
				required: ["id", "state"],
			},
			"write",
			({ id, state }: { id: unknown; state: unknown }) => {
				if (typeof id !== "string" || !isTaskState(state)) throw new Error("id and state are required");
				return { task: store.update(id, state) };
			},
		),
		memorySave: operation(
			{
				type: "object",
				properties: { title: { type: "string" }, body: { type: "string" } },
				required: ["title", "body"],
			},
			"write",
			({ title, body }: { title: unknown; body: unknown }) => {
				if (typeof title !== "string" || typeof body !== "string")
					throw new Error("title and body are required");
				return { memory: store.saveMemory(title, body) };
			},
		),
		persist: operation({}, "write", persist),
	};
}

export const createWorkbenchRuntime: PluginRuntimeFactory = async (factoryContext) => {
	const states = factoryContext.resources.filter((resource) => resource.kind === "state");
	if (states.length !== 1)
		throw new Error("Workbench runtime requires exactly one authorized application-state root");
	const state = states[0];
	const location = { root: state.handle, path: "workbench.json" };
	const stored = (await factoryContext.capabilities.call(
		"state.readJson",
		location,
	)) as PluginStateReadResult;
	const store = new WorkbenchStore(stored.kind === "missing" ? undefined : snapshotFromState(stored.value));
	let version = stored.version;
	let disposed = false;
	const operation = guardedOperation(() => disposed || factoryContext.signal.aborted);
	async function persist(_input: unknown, context: PluginRuntimeContext) {
		if (state.access !== "read-write")
			throw new Error("Workbench persistence requires a read-write state grant");
		const saved = (await context.capabilities.call(
			"state.writeJson",
			{ ...location, value: store.snapshot(), expectedVersion: version },
			context.signal,
		)) as { version: string };
		version = saved.version;
		factoryContext.events.changed();
		return { version };
	}
	return {
		operations: buildWorkbenchOperations(store, operation, persist),
		async dispose() {
			disposed = true;
		},
	};
};
