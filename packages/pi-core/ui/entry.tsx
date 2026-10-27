import type { ChatMessageProps } from "@gyoungwe/plugin-api/ui";
import type { ReactNode } from "react";
import { uiCompatibility } from "./api";
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
	return (
		<Surface>
			{uiCompatibility().status === "compatible" ? (
				<TaskPanelContent />
			) : (
				<Incompatible />
			)}
		</Surface>
	);
}
export function TaskMessage(props: ChatMessageProps) {
	if (typeof props.renderDefault !== "function")
		return (
			<Surface>
				<Incompatible />
			</Surface>
		);
	if (props.message.kind !== "assistant" || !props.message.taskView)
		return props.renderDefault();
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
