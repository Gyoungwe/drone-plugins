/**
 * The host supplies React, language and transcript stores through window.DroneUI.
 * Workbench state remains host-owned: this first UI slice renders the active
 * session's task list and a truthful empty memory state without opening IPC.
 */
type Task = { content: string; status: "pending" | "in_progress" | "completed" };
type TranscriptEntry = { todos?: Task[] };
type DroneUiRuntime = {
	React: {
		createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown;
		memo: <T extends (props: Record<string, never>) => unknown>(component: T) => T;
	};
	hooks: {
		useLanguage: () => "zh" | "en";
	};
	stores: {
		useSessionsStore: <Selected>(selector: (state: { activeSessionId: string | null }) => Selected) => Selected;
		useTranscriptStore: <Selected>(selector: (state: { bySession: Record<string, TranscriptEntry> }) => Selected) => Selected;
	};
};

const EMPTY_TASKS: Task[] = [];
const EMPTY_ENTRY: TranscriptEntry = { todos: EMPTY_TASKS };

function runtime(): DroneUiRuntime | undefined {
	return (globalThis as { window?: { DroneUI?: DroneUiRuntime } }).window?.DroneUI;
}

function WorkbenchPanelImpl(): unknown {
	const drone = runtime();
	if (!drone) return null;
	const language = drone.hooks.useLanguage();
	const activeSessionId = drone.stores.useSessionsStore((state) => state.activeSessionId);
	const entry = drone.stores.useTranscriptStore((state) =>
		(activeSessionId ? state.bySession[activeSessionId] : undefined) ?? EMPTY_ENTRY,
	);
	const tasks = entry.todos ?? EMPTY_TASKS;
	const text = language === "zh"
		? { title: "工作台", tasks: "任务", memory: "记忆", noTasks: "当前会话还没有任务。", noMemory: "还没有保存的工作台记忆。" }
		: { title: "Workbench", tasks: "Tasks", memory: "Memory", noTasks: "No tasks in the active session.", noMemory: "No saved workbench memory yet." };
	const taskChildren = tasks.length > 0
		? tasks.map((task) => drone.React.createElement(
			"li",
			{ key: `${task.status}:${task.content}`, className: "flex items-start gap-2 text-[13px] text-ink" },
			drone.React.createElement("span", { className: "text-ink-dim", "aria-hidden": true }, task.status === "completed" ? "✓" : "·"),
			task.content,
		))
		: [drone.React.createElement("li", { key: "empty", className: "text-[13px] text-ink-dim" }, text.noTasks)];
	return drone.React.createElement(
		"section",
		{ "data-drone-ui-workbench": "panel", className: "flex flex-col gap-4 p-4 text-ink" },
		drone.React.createElement("h2", { className: "text-[15px] font-medium" }, text.title),
		drone.React.createElement(
		"div",
		{ className: "flex flex-col gap-2" },
		drone.React.createElement("h3", { className: "text-[12px] font-medium uppercase tracking-wide text-ink-dim" }, text.tasks),
		drone.React.createElement("ul", { className: "flex flex-col gap-1", "aria-label": text.tasks }, taskChildren),
	),
		drone.React.createElement(
		"div",
		{ className: "flex flex-col gap-2" },
		drone.React.createElement("h3", { className: "text-[12px] font-medium uppercase tracking-wide text-ink-dim" }, text.memory),
		drone.React.createElement("p", { className: "text-[13px] text-ink-dim" }, text.noMemory),
	),
	);
}

const fallbackMemo = <T extends (props: Record<string, never>) => unknown>(component: T): T => component;
export const WorkbenchPanel = (runtime()?.React.memo ?? fallbackMemo)(WorkbenchPanelImpl);
