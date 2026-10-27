import { useAgentActive, useSessionMessages, useSessionsStore } from "./api";
import { TaskRow } from "./components/TaskRow";
import { useTaskText } from "./copy";
import { taskNeedsUser } from "./presentation";

/** Domain state comes from the canonical session journal projection, never a UI store. */
export function TaskPanelContent() {
	const sessionId = useSessionsStore((state) => state.activeSessionId);
	const readOnly = useSessionsStore(
		(state) =>
			state.sessions.find((session) => session.sessionId === sessionId)
				?.readOnly === true,
	);
	const messages = useSessionMessages(sessionId);
	const agentActive = useAgentActive(sessionId);
	const t = useTaskText();
	const latest = messages.findLast(
		(message) => message.kind === "assistant" && message.taskView,
	);
	const view = latest?.kind === "assistant" ? latest.taskView : undefined;
	const attention = view?.tasks.filter(taskNeedsUser).length || 0;
	return (
		<section className="min-h-0 overflow-auto p-3" data-testid="task-panel">
			<h3 className="text-[13px] font-medium text-ink">{t("panelTitle")}</h3>
			{attention > 0 && (
				<p className="mt-1 text-[12px] text-warn">
					{t("attention", { count: attention })}
				</p>
			)}
			{view?.tasks.length ? (
				view.tasks.map((task) => (
					<TaskRow
						key={task.id}
						task={task}
						view={view}
						sessionId={sessionId}
						agentActive={agentActive}
						readOnly={readOnly}
					/>
				))
			) : (
				<p className="mt-3 text-[12px] text-ink-dim">{t("empty")}</p>
			)}
		</section>
	);
}
