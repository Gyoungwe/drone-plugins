import type { ChatMessageProps } from "@gyoungwe/plugin-api/ui";
import { memo, type ReactNode } from "react";
import { getHostUi, uiCompatibility } from "./api";
import { ResearchStatusPanelContent } from "./components/ResearchStatusPanel";
import { WorkbenchPanelContent } from "./components/WorkbenchPanel";
import { taskText } from "./copy";
import { taskStyles } from "./styles/generated";
import { TaskMessageContent } from "./TaskMessage";
import { TaskPanelContent } from "./TaskPanel";

function Surface({ children }: { children: ReactNode }) {
	return (
		<div className="drone-task-ui">
			<style data-drone-task-styles>{taskStyles}</style>
			{children}
		</div>
	);
}
function Incompatible() {
	return (
		<p role="alert" data-task-ui-status="incompatible">
			{taskText("en", "incompatible")} / {taskText("zh", "incompatible")}
		</p>
	);
}
export function TaskPanel() {
	const host = getHostUi();
	const compatible =
		uiCompatibility().status === "compatible" &&
		typeof host?.hooks?.useAgentActive === "function" &&
		typeof host.stores?.useSessionsStore === "function" &&
		typeof host.stores?.useUiStore === "function";
	return <Surface>{compatible ? <TaskPanelContent /> : <Incompatible />}</Surface>;
}
export function TaskMessage(props: ChatMessageProps) {
	if (typeof props.renderDefault !== "function")
		return (
			<Surface>
				<Incompatible />
			</Surface>
		);
	if (props.message.kind !== "assistant" || !props.message.taskView) return props.renderDefault();
	if (uiCompatibility().status !== "compatible")
		return (
			<Surface>
				<Incompatible />
			</Surface>
		);
	return (
		<Surface>
			<TaskMessageContent {...props} />
		</Surface>
	);
}

export const ResearchStatusPanel = memo(function ResearchStatusPanel() {
	if (typeof getHostUi()?.hooks?.useLanguage !== "function") return null;
	return (
		<Surface>
			<ResearchStatusPanelContent />
		</Surface>
	);
});

export const WorkbenchPanel = memo(function WorkbenchPanel() {
	const host = getHostUi();
	if (
		typeof host?.hooks?.useLanguage !== "function" ||
		typeof host.stores?.useSessionsStore !== "function" ||
		typeof host.stores?.useTranscriptStore !== "function"
	) {
		return null;
	}
	return (
		<Surface>
			<WorkbenchPanelContent />
		</Surface>
	);
});
