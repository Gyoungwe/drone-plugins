import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";

export type TaskState = "pending" | "in_progress" | "completed" | "blocked";

export interface WorkbenchTask {
	id: string;
	content: string;
	state: TaskState;
	updatedAt: string;
}

export interface WorkbenchMemory {
	id: string;
	title: string;
	body: string;
	createdAt: string;
}

export interface WorkbenchSnapshot {
	tasks: WorkbenchTask[];
	memory: WorkbenchMemory[];
}

export const emptyWorkbenchSnapshot = (): WorkbenchSnapshot => ({ tasks: [], memory: [] });

type WorkbenchTool = ToolDefinition<TSchema, unknown, unknown> & {
	drone: { capabilities: string[]; recoverySafe: true; externalWrites?: false; readOnly?: true };
};

export type PiToolRegistrar = { registerTool(tool: WorkbenchTool): void };

export class WorkbenchStore {
	private readonly tasks = new Map<string, WorkbenchTask>();
	private readonly memory = new Map<string, WorkbenchMemory>();

	constructor(snapshot: WorkbenchSnapshot = emptyWorkbenchSnapshot()) {
		for (const task of snapshot.tasks) this.tasks.set(task.id, { ...task });
		for (const entry of snapshot.memory) this.memory.set(entry.id, { ...entry });
	}

	plan(items: readonly string[]): WorkbenchTask[] {
		const now = new Date().toISOString();
		return items.map((item, index) => {
			const content = item.trim();
			if (!content) throw new Error("Task content is required");
			const id = `task-${index + 1}-${Date.now()}`;
			const task: WorkbenchTask = { id, content, state: "pending", updatedAt: now };
			this.tasks.set(id, task);
			return task;
		});
	}

	update(id: string, state: TaskState): WorkbenchTask {
		const current = this.tasks.get(id);
		if (!current) throw new Error(`Unknown task: ${id}`);
		const task = { ...current, state, updatedAt: new Date().toISOString() };
		this.tasks.set(id, task);
		return task;
	}

	snapshot(): WorkbenchSnapshot {
		return { tasks: [...this.tasks.values()], memory: [...this.memory.values()] };
	}

	saveMemory(rawTitle: string, rawBody: string): WorkbenchMemory {
		const title = rawTitle.trim();
		if (!title) throw new Error("Memory title is required");
		const body = rawBody.trim();
		if (!body) throw new Error("Memory body is required");
		const memory = { id: `memory-${Date.now()}`, title, body, createdAt: new Date().toISOString() };
		this.memory.set(memory.id, memory);
		return memory;
	}
}

function objectParams(properties: Record<string, unknown>) {
	return { type: "object", properties, required: Object.keys(properties) };
}

function result(details: object) {
	return { content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }], details };
}

function objectInput(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("params must be an object");
	return value as Record<string, unknown>;
}

function registerPlanningTools(pi: PiToolRegistrar, store: WorkbenchStore) {
	pi.registerTool({
		name: "workbench_plan",
		label: "Workbench · plan",
		description:
			"Create a bounded task plan in this activation. The host decides whether and how to persist it.",
		drone: { capabilities: ["planning"], recoverySafe: true, externalWrites: false },
		parameters: objectParams({
			items: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 32 },
		}),
		async execute(_id, params) {
			const { items } = objectInput(params);
			if (!Array.isArray(items) || items.some((item) => typeof item !== "string"))
				throw new Error("items must be an array of strings");
			return result({ tasks: store.plan(items) });
		},
	});
	pi.registerTool({
		name: "workbench_status",
		label: "Workbench · status",
		description: "Read the current task and memory snapshot for this activation.",
		drone: { readOnly: true, recoverySafe: true, capabilities: ["planning", "evidence-context"] },
		parameters: objectParams({}),
		async execute() {
			return result(store.snapshot());
		},
	});
	pi.registerTool({
		name: "workbench_todo",
		label: "Workbench · update task",
		description: "Update one task state in this activation.",
		drone: { capabilities: ["planning"], recoverySafe: true, externalWrites: false },
		parameters: objectParams({
			id: { type: "string", minLength: 1 },
			state: { type: "string", enum: ["pending", "in_progress", "completed", "blocked"] },
		}),
		async execute(_id, params) {
			const { id, state } = objectInput(params);
			if (typeof id !== "string" || typeof state !== "string") throw new Error("id and state are required");
			return result({ task: store.update(id, state as TaskState) });
		},
	});
}

export function registerPiWorkbench(pi: PiToolRegistrar, options: { store?: WorkbenchStore } = {}) {
	const store = options.store ?? new WorkbenchStore();
	registerPlanningTools(pi, store);
	pi.registerTool({
		name: "workbench_memory_save",
		label: "Workbench · save memory",
		description:
			"Save a bounded domain-memory entry in the current activation; persistence remains host-owned.",
		drone: { capabilities: ["evidence-context"], recoverySafe: true, externalWrites: false },
		parameters: objectParams({
			title: { type: "string", minLength: 1, maxLength: 200 },
			body: { type: "string", minLength: 1, maxLength: 20000 },
		}),
		async execute(_id, params) {
			const { title, body } = objectInput(params);
			if (typeof title !== "string" || typeof body !== "string")
				throw new Error("title and body are required");
			return result({ memory: store.saveMemory(title, body) });
		},
	});
	return {
		tools: ["workbench_plan", "workbench_status", "workbench_todo", "workbench_memory_save"],
		store,
	} as const;
}
