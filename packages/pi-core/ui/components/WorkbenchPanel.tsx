import type { TodoItem } from "../../src/contracts";
import { useLanguage, useSessionsStore, useTranscriptStore } from "../api";

const EMPTY_TASKS: readonly TodoItem[] = [];
const EMPTY_ENTRY = { todos: EMPTY_TASKS };

const copy = {
	zh: {
		title: "工作台",
		tasks: "任务",
		memory: "记忆",
		noTasks: "当前会话还没有任务。",
		noMemory: "还没有保存的工作台记忆。",
	},
	en: {
		title: "Workbench",
		tasks: "Tasks",
		memory: "Memory",
		noTasks: "No tasks in the active session.",
		noMemory: "No saved workbench memory yet.",
	},
};

function WorkbenchTaskList({
	tasks,
	label,
	empty,
}: {
	tasks: readonly TodoItem[];
	label: string;
	empty: string;
}) {
	const occurrences = new Map<string, number>();
	return (
		<ul className="flex flex-col gap-1" aria-label={label}>
			{tasks.length === 0 ? (
				<li className="text-[13px] text-ink-dim">{empty}</li>
			) : (
				tasks.map((task) => {
					const occurrence = occurrences.get(task.content) ?? 0;
					occurrences.set(task.content, occurrence + 1);
					return (
						<li key={`${task.content}:${occurrence}`} className="flex items-start gap-2 text-[13px] text-ink">
							<span className="text-ink-dim" aria-hidden="true">
								{task.status === "completed" ? "✓" : "·"}
							</span>
							{task.content}
						</li>
					);
				})
			)}
		</ul>
	);
}

export function WorkbenchPanelContent() {
	const text = copy[useLanguage()];
	const activeSessionId = useSessionsStore((state) => state.activeSessionId);
	const tasks = useTranscriptStore((state) => {
		const entry = (activeSessionId ? state.bySession[activeSessionId] : undefined) ?? EMPTY_ENTRY;
		return entry.todos ?? EMPTY_TASKS;
	});
	return (
		<section data-drone-ui-workbench="panel" className="flex flex-col gap-4 p-4 text-ink">
			<h2 className="text-[15px] font-medium">{text.title}</h2>
			<div className="flex flex-col gap-2">
				<h3 className="text-[12px] font-medium uppercase tracking-wide text-ink-dim">{text.tasks}</h3>
				<WorkbenchTaskList tasks={tasks} label={text.tasks} empty={text.noTasks} />
			</div>
			<div className="flex flex-col gap-2">
				<h3 className="text-[12px] font-medium uppercase tracking-wide text-ink-dim">{text.memory}</h3>
				<p className="text-[13px] text-ink-dim">{text.noMemory}</p>
			</div>
		</section>
	);
}
