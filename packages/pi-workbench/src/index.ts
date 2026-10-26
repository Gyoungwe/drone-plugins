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

/** In-memory, registration-scoped task and memory state. Hosts own persistence and UI. */
export class WorkbenchStore {
	private readonly tasks = new Map<string, WorkbenchTask>();
	private readonly memory = new Map<string, WorkbenchMemory>();

	plan(items: readonly string[]): WorkbenchTask[] {
		const now = new Date().toISOString();
		const tasks = items.map((content, index) => {
			const value = content.trim();
			if (!value) throw new Error("Task content is required");
			const task = { id: `task-${index + 1}-${Date.now()}`, content: value, state: "pending" as const, updatedAt: now };
			this.tasks.set(task.id, task);
			return task;
		});
		return tasks;
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

	saveMemory(title: string, body: string): WorkbenchMemory {
		const normalizedTitle = title.trim();
		if (!normalizedTitle) throw new Error("Memory title is required");
		const normalizedBody = body.trim();
		if (!normalizedBody) throw new Error("Memory body is required");
		const memory = { id: `memory-${Date.now()}`, title: normalizedTitle, body: normalizedBody, createdAt: new Date().toISOString() };
		this.memory.set(memory.id, memory);
		return memory;
	}
}

function objectParams(properties: Record<string, unknown>, required: string[] = []) {
	return { type: "object", properties, required };
}

function result(details: unknown) {
	return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
}

function objectInput(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("params must be an object");
	return value as Record<string, unknown>;
}

/** Register task orchestration and domain-memory tools with per-activation state. */
export function registerPiWorkbench(pi: any, options: { store?: WorkbenchStore } = {}) {
	const store = options.store ?? new WorkbenchStore();
	pi.registerTool({
		name: "workbench_plan",
		label: "Workbench · plan",
		description: "Create a bounded task plan in this activation. The host decides whether and how to persist it.",
		drone: { capabilities: ["planning"], recoverySafe: true, externalWrites: false },
		parameters: objectParams({ items: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: 32 } }, ["items"]),
		async execute(_id: string, params: unknown) {
			const input = objectInput(params);
			if (!Array.isArray(input.items) || input.items.some((item) => typeof item !== "string")) throw new Error("items must be an array of strings");
			return result({ tasks: store.plan(input.items) });
		},
	});
	pi.registerTool({
		name: "workbench_status",
		label: "Workbench · status",
		description: "Read the current task and memory snapshot for this activation.",
		drone: { readOnly: true, recoverySafe: true, capabilities: ["planning", "evidence-context"] },
		parameters: objectParams({}),
		async execute() { return result(store.snapshot()); },
	});
	pi.registerTool({
		name: "workbench_todo",
		label: "Workbench · update task",
		description: "Update one task state in this activation.",
		drone: { capabilities: ["planning"], recoverySafe: true, externalWrites: false },
		parameters: objectParams({ id: { type: "string", minLength: 1 }, state: { type: "string", enum: ["pending", "in_progress", "completed", "blocked"] } }, ["id", "state"]),
		async execute(_id: string, params: unknown) {
			const input = objectInput(params);
			if (typeof input.id !== "string" || typeof input.state !== "string") throw new Error("id and state are required");
			return result({ task: store.update(input.id, input.state as TaskState) });
		},
	});
	pi.registerTool({
		name: "workbench_memory_save",
		label: "Workbench · save memory",
		description: "Save a bounded domain-memory entry in the current activation; persistence remains host-owned.",
		drone: { capabilities: ["evidence-context"], recoverySafe: true, externalWrites: false },
		parameters: objectParams({ title: { type: "string", minLength: 1, maxLength: 200 }, body: { type: "string", minLength: 1, maxLength: 20000 } }, ["title", "body"]),
		async execute(_id: string, params: unknown) {
			const input = objectInput(params);
			if (typeof input.title !== "string" || typeof input.body !== "string") throw new Error("title and body are required");
			return result({ memory: store.saveMemory(input.title, input.body) });
		},
	});
	return { tools: ["workbench_plan", "workbench_status", "workbench_todo", "workbench_memory_save"], store } as const;
}

export default registerPiWorkbench;
