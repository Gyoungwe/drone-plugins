import type { ChatMessageProps } from "@gyoungwe/plugin-api/ui";
import { useSessionMessages } from "./api";
import { TaskStorageNotice } from "./components/TaskStorageNotice";
import { TaskDecisionCard } from "./components/TaskDecisionCard";
import { tasksForDecision } from "./presentation";

export function TaskMessageContent({
	message,
	sessionId,
	agentActive,
	readOnly,
	renderDefault,
}: ChatMessageProps) {
	const messages = useSessionMessages(sessionId);
	if (message.kind !== "assistant" || !message.taskView) return renderDefault();
	const view = message.taskView;
	const latest = messages.findLast(
		(value) => value.kind === "assistant" && value.taskView,
	);
	// The canonical workbench's text report is replaced by its own structured UI.
	// Ordinary text sharing a message with a task projection keeps the default renderer.
	const ordinaryText = Boolean(message.text && !message.hostStatus);
	if (latest?.id !== message.id) return ordinaryText ? renderDefault() : null;
	return (
		<>
			<TaskStorageNotice view={view} />
			{tasksForDecision(view).map((task) => (
				<TaskDecisionCard
					key={task.id}
					task={task}
					view={view}
					sessionId={sessionId}
					agentActive={agentActive}
					readOnly={readOnly}
				/>
			))}
			{ordinaryText || message.route || message.progress
				? renderDefault()
				: null}
		</>
	);
}
