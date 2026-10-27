import type {
	ChatMessageProps,
	TaskView,
	UIMessage,
	WorkbenchTask,
} from "@gyoungwe/plugin-api/ui";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { uiFixture } from "../test/ui-setup";
import { TaskMessage, TaskPanel } from "./entry";

const task: WorkbenchTask = {
	id: "task-one",
	goal: "Review the recorded output",
	state: "waiting_user",
	updatedAt: "now",
	reason: null,
	stage: 1,
	budget: { calls: 2, stageCalls: 2 },
	waitMs: 0,
	capabilities: [],
	operations: [],
	milestones: [
		{
			id: "review",
			title: "Review output",
			dependsOn: [],
			acceptance: { kind: "human_review" },
			state: "pending",
		},
	],
	actions: [
		{
			id: "review-action",
			kind: "review",
			title: "Check this output",
			reason: "Human review",
			expected: {},
			milestoneId: "review",
			state: "pending",
		},
	],
};
const taskView: TaskView = {
	version: 2,
	revision: 7,
	activeTaskId: task.id,
	selectionRequired: false,
	tasks: [task],
	limits: { totalCalls: 192, stageCalls: 48 },
};
const latest: UIMessage = {
	kind: "assistant",
	id: "latest",
	text: "### 任务进展\nRecorded journal",
	thinking: "",
	tools: [],
	timestamp: 2,
	hostStatus: true,
	taskView,
};
const props = (message: UIMessage = latest): ChatMessageProps => ({
	message,
	sessionId: "shown",
	agentActive: false,
	readOnly: false,
	renderDefault: () => <p>Ordinary message</p>,
});
afterEach(cleanup);

it("sends the rendered row's session and exact journal revision through the public prompt port", async () => {
	uiFixture.sessions.activeSessionId = "other";
	uiFixture.messages = [latest];
	render(<TaskMessage {...props()} />);
	fireEvent.click(screen.getByRole("button", { name: "我看过了，这项算完成" }));
	await act(async () => {});
	expect(uiFixture.prompt).toHaveBeenCalledOnce();
	const [sessionId, name, args] = uiFixture.prompt.mock.calls[0] as unknown as [
		string,
		string,
	];
	expect(sessionId).toBe("shown");
	expect(name).toBe("task-action");
	const decoded = JSON.parse(
		new TextDecoder().decode(
			Uint8Array.from(
				atob(args.replaceAll("-", "+").replaceAll("_", "/")),
				(c) => c.charCodeAt(0),
			),
		),
	);
	expect(decoded).toEqual({
		actionId: "review-action",
		taskId: task.id,
		revision: 7,
		action: "acknowledge",
	});
});
it("does not grant a read-only or running row an action because another session is editable", () => {
	uiFixture.messages = [latest];
	const view = render(<TaskMessage {...props()} readOnly />);
	expect(
		screen
			.getByRole("button", { name: "我看过了，这项算完成" })
			.hasAttribute("disabled"),
	).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "我看过了，这项算完成" }));
	expect(uiFixture.prompt).not.toHaveBeenCalled();
	view.rerender(<TaskMessage {...props()} agentActive />);
	expect(
		screen
			.getByRole("button", { name: "我看过了，这项算完成" })
			.hasAttribute("disabled"),
	).toBe(true);
});
it("owns snapshot selection while ordinary text keeps the host default renderer", () => {
	const older = { ...latest, id: "older", timestamp: 1 };
	uiFixture.messages = [older, latest];
	const view = render(
		<>
			<TaskMessage {...props(older)} />
			<TaskMessage {...props()} />
		</>,
	);
	expect(
		screen.getAllByRole("button", { name: "我看过了，这项算完成" }),
	).toHaveLength(1);
	view.rerender(
		<TaskMessage
			{...props({
				...latest,
				text: "Ordinary explanation beside the task",
				hostStatus: undefined,
			})}
		/>,
	);
	expect(screen.getByText("Ordinary message")).toBeTruthy();
	const fallback = vi.fn(() => <p>Untouched default</p>);
	const ordinary = {
		kind: "assistant" as const,
		id: "body",
		text: "Safe body",
		thinking: "",
		tools: [],
		timestamp: 3,
	};
	expect(TaskMessage({ ...props(ordinary), renderDefault: fallback })).toEqual(
		<p>Untouched default</p>,
	);
	expect(fallback).toHaveBeenCalledOnce();
});
it("renders an incompatible diagnostic without invoking a missing host hook", () => {
	const hook = window.DroneUI.hooks.useSessionMessages;
	Reflect.deleteProperty(window.DroneUI.hooks, "useSessionMessages");
	try {
		render(<TaskPanel />);
		expect(
			document.querySelector('[data-task-ui-status="incompatible"]'),
		).toBeTruthy();
		expect(screen.queryByTestId("task-panel")).toBeNull();
	} finally {
		window.DroneUI.hooks.useSessionMessages = hook;
	}
});
