import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { createTaskAuthorization, TaskInteractionInput } from "./ask-authorization.js";
import type { createTaskProgression } from "./progress-action.js";
import { singleFlightCommand } from "./single-flight.js";
import type { WorkbenchAdapter } from "./workbench-adapter.js";

type Authorization = ReturnType<typeof createTaskAuthorization>;
type Progress = ReturnType<typeof createTaskProgression>;

async function authorizeTask(
	adapter: WorkbenchAdapter,
	ask: Authorization,
	input: TaskInteractionInput,
	ctx: ExtensionContext,
) {
	const { journal, ports, status, handoff } = adapter;
	if (!(await ask(input, ctx))) {
		await status.send("你没有确认，任务不会开始。想执行的时候再点一次就行。");
		return;
	}
	const task = journal.view().tasks.find((candidate) => candidate.id === input.taskId);
	await ports.decision?.({
		id: `task-authorization:${input.taskId}:${input.revision}`,
		kind: "task-authorization",
		summary: task?.authorizationSummary || task?.goal || "Task authorization approved",
		basis: [`task:${input.taskId}`, `revision:${input.revision}`],
		at: /* @__PURE__ */ new Date().toISOString(),
	});
	await status.send("已确认，接下来会自动做完并交付结果。你随时可以停；要做计划之外的事仍会先问你。");
	await handoff.continueAuthorized(ctx);
}

async function promptForAction(
	adapter: WorkbenchAdapter,
	ask: Authorization,
	input: TaskInteractionInput,
	ctx: ExtensionContext,
) {
	const { journal, ports, status, handoff } = adapter;
	const selectAndContinue = async () => {
		await journal.command({ taskId: input.taskId, revision: journal.view().revision, action: "select" });
		await handoff.continueAuthorized(ctx);
	};
	if (["approve-plan", "next-stage", "ask-authorization", "confirm-outcome"].includes(input.action)) {
		const accepted = await ask(input, ctx);
		await status.send(accepted ? "已记录你的确认。" : "你没有确认，一切保持原样。");
		if (accepted) await selectAndContinue();
		return true;
	}
	if (input.action !== "acknowledge") return false;
	const action = journal
		.view()
		.tasks.find((task) => task.id === input.taskId)
		?.actions.find((candidate) => candidate.id === input.actionId);
	if (!action || !["authorization", "rebind"].includes(action.kind)) return false;
	const accepted = await ask({ ...input, action: "ask-authorization" }, ctx);
	await status.send();
	if (accepted) {
		if (action.kind === "rebind")
			await ports.decision?.({
				id: `rebind:${input.taskId}:${input.actionId}`,
				kind: "rebind",
				summary: action.title || "Rebind approved",
				basis: [`task:${input.taskId}`, `action:${input.actionId}`],
				at: /* @__PURE__ */ new Date().toISOString(),
			});
		await selectAndContinue();
	}
	return true;
}

async function runAction(
	args: string,
	ctx: ExtensionContext,
	adapter: WorkbenchAdapter,
	ask: Authorization,
	progress: Progress,
) {
	const { journal, ports, attach, bindingKey, status, handoff } = adapter;
	handoff.cancel();
	await attach(ctx);
	if (!(await ports.idle(ctx)))
		throw new Error("Stop the agent before changing tasks or inspecting recovery files.");
	if (!args.trim()) {
		await status.send("任务动作为空：请从任务面板发起具体操作；这条消息不会改变任务或授权。", "task-action");
		return;
	}
	const input: TaskInteractionInput & { path: string } = JSON.parse(
		Buffer.from(args.trim(), "base64url").toString("utf8"),
	);
	if (input.action === "progress") return progress(input, ctx);
	if (input.action === "authorize-task") return authorizeTask(adapter, ask, input, ctx);
	if (await promptForAction(adapter, ask, input, ctx)) return;
	if (input.action === "file") await journal.acceptFile(input, ctx.cwd);
	else if (input.action === "refresh" || input.action === "resume") {
		await journal.command({ ...input, action: "select" });
		if (input.action === "refresh") await journal.reconcile(ctx.cwd);
		else {
			const result = await journal.begin("继续", [], await bindingKey());
			const state = journal.snapshot()?.state;
			await status.send();
			if (!result.blocked && state !== "blocked" && state !== "waiting_user")
				await ports.sendUserMessage(ctx, "继续", { expandPromptTemplates: true });
			return;
		}
	} else await journal.command(input);
	await status.send(undefined, "task-action");
}

export function registerWorkbenchCommands(adapter: WorkbenchAdapter, ask: Authorization, progress: Progress) {
	const { pi, bind, attach, status } = adapter;
	pi.registerCommand("task-status", {
		description: "任务工作台：无模型状态、任务选择、产物与人工动作",
		handler: bind(
			async (_args: string, ctx: ExtensionContext) => {
				await attach(ctx);
				await status.send(undefined, "task-status");
			},
			(_args, ctx) => ctx,
		),
	});
	pi.registerCommand("task-action", {
		description: "任务面板的版本化用户操作；不授予新权限",
		handler: bind(
			singleFlightCommand((args: string, ctx: ExtensionContext) =>
				runAction(args, ctx, adapter, ask, progress),
			),
			(_args, ctx) => ctx,
		),
	});
}
