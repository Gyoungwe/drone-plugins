import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { uiFixture } from "../test/ui-setup";
import { ResearchStatusPanel, WorkbenchPanel } from "./entry";

const installedHost = window.DroneUI;

beforeEach(() => {
	window.DroneUI = {
		...installedHost,
		hooks: { ...installedHost.hooks },
		sessions: { ...installedHost.sessions },
		stores: { ...installedHost.stores },
	};
});

afterEach(() => {
	cleanup();
	window.DroneUI = installedHost;
});

it.each([
	["zh", "科研工作台", "已从已安装 UI 包加载", "工作台", "当前会话还没有任务。", "还没有保存的工作台记忆。"],
	[
		"en",
		"Research workbench",
		"Loaded from the installed UI package",
		"Workbench",
		"No tasks in the active session.",
		"No saved workbench memory yet.",
	],
] as const)(
	"renders both localized panels on a host without session commands (%s)",
	(language, research, status, workbench, noTasks, noMemory) => {
		uiFixture.language = language;
		Reflect.deleteProperty(window.DroneUI, "sessions");
		Reflect.deleteProperty(window.DroneUI.hooks, "useSessionMessages");
		const { container } = render(
			<>
				<ResearchStatusPanel />
				<WorkbenchPanel />
			</>,
		);
		const researchPanel = container.querySelector(
			'.drone-task-ui > section[data-drone-ui-pack="research-status"]',
		);
		const workbenchPanel = container.querySelector(
			'.drone-task-ui > section[data-drone-ui-workbench="panel"]',
		);
		expect(screen.getByText(research).closest("section")).toBe(researchPanel);
		expect(screen.getByText(status).closest("section")).toBe(researchPanel);
		expect(screen.getByRole("heading", { name: workbench }).closest("section")).toBe(workbenchPanel);
		expect(screen.getByText(noTasks)).toBeTruthy();
		expect(screen.getByText(noMemory)).toBeTruthy();
	},
);

it("shows todos only from the active session and reports empty memory", () => {
	uiFixture.language = "en";
	uiFixture.sessions.activeSessionId = "review";
	uiFixture.transcripts.bySession = {
		review: {
			messages: [],
			todos: [
				{ content: "Review evidence", status: "in_progress" },
				{ content: "Collect output", status: "completed" },
			],
		},
		session: { messages: [], todos: [{ content: "Other session todo", status: "pending" }] },
	};
	render(<WorkbenchPanel />);
	const tasks = within(screen.getByRole("list", { name: "Tasks" }));
	expect(tasks.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
		"·Review evidence",
		"✓Collect output",
	]);
	expect(screen.getByText("No saved workbench memory yet.")).toBeTruthy();
});

it("shows the empty task list when the active transcript has no todos field", () => {
	uiFixture.transcripts.bySession = { session: { messages: [] } };
	render(<WorkbenchPanel />);
	expect(screen.getByText("当前会话还没有任务。")).toBeTruthy();
});

it.each(["useSessionsStore", "useTranscriptStore"] as const)(
	"keeps Research available when Workbench is missing %s",
	(binding) => {
		Reflect.deleteProperty(window.DroneUI.stores, binding);
		const { container } = render(
			<>
				<ResearchStatusPanel />
				<WorkbenchPanel />
			</>,
		);
		expect(screen.getByText("科研工作台")).toBeTruthy();
		expect(container.querySelector("[data-drone-ui-workbench]")).toBeNull();
	},
);

it.each(["hooks", "useLanguage"] as const)("hides both panels when %s is absent", (binding) => {
	if (binding === "hooks") Reflect.deleteProperty(window.DroneUI, binding);
	else Reflect.deleteProperty(window.DroneUI.hooks, binding);
	const { container } = render(
		<>
			<ResearchStatusPanel />
			<WorkbenchPanel />
		</>,
	);
	expect(container.childElementCount).toBe(0);
});

it("imports before host installation and reads live bindings at render time", async () => {
	const host = window.DroneUI;
	Reflect.deleteProperty(window, "DroneUI");
	vi.resetModules();
	const entry = await import("./entry");
	const { container, unmount } = render(
		<>
			<entry.ResearchStatusPanel />
			<entry.WorkbenchPanel />
			<entry.TaskPanel />
		</>,
	);
	expect(container.querySelector("[data-drone-ui-pack], [data-drone-ui-workbench]")).toBeNull();
	expect(screen.getByRole("alert").getAttribute("data-task-ui-status")).toBe("incompatible");
	unmount();
	window.DroneUI = host;
	render(
		<>
			<entry.TaskPanel />
			<entry.WorkbenchPanel />
		</>,
	);
	expect(screen.getByTestId("task-panel")).toBeTruthy();
	expect(screen.getByRole("heading", { name: "工作台" })).toBeTruthy();
});
