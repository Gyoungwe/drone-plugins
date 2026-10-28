import type {
	TaskState,
	TaskView,
	WorkbenchTask,
} from "@gyoungwe/plugin-api/ui";

export function taskActionArguments(
	view: TaskView,
	taskId: string,
	action: string,
	extra: Record<string, string> = {},
): string {
	const text = JSON.stringify({
		...extra,
		taskId,
		revision: view.revision,
		action,
	});
	if (text.length > 4000) throw new Error("Task action is too large");
	const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(text)))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
	return encoded;
}
/** Presentation only: never changes the ledger or certifies scientific claims. */
export function taskDeliveryPresentation(
	task: WorkbenchTask,
	agentActive: boolean,
	language: "zh" | "en" = "zh",
) {
	const terminal = TERMINAL_TASK_STATES.has(task.state);
	const allAccepted =
		task.milestones.length > 0 &&
		task.milestones.every((m) => m.state === "completed");
	const unsettled =
		task.operations.some(
			(o) => o.state === "started" || o.state === "unknown",
		) || task.actions.some((a) => a.state === "pending");
	const deliveryComplete = allAccepted && !unsettled;
	const warnings =
		!!task.reason || task.operations.some((o) => o.state === "failed");
	const closed = task.state === "cancelled" || task.state === "archived";
	const labels = language === "en" ? TASK_STATE_LABELS_EN : TASK_STATE_LABELS;
	const label = closed
		? labels[task.state]
		: agentActive && !terminal && task.state !== "waiting_user"
			? language === "en"
				? "Running"
				: "执行中"
			: deliveryComplete
				? warnings
					? language === "en"
						? "Delivery complete · with reminders"
						: "交付已完成 · 有提醒"
					: language === "en"
						? "Delivery complete"
						: "交付已完成"
				: allAccepted && unsettled
					? language === "en"
						? "Deliverables accepted · items still need checking"
						: "交付已验收 · 尚有事项待核对"
					: labels[task.state];
	return {
		label,
		deliveryComplete,
		canContinue: !terminal && !agentActive && !deliveryComplete,
	};
}

export const TASK_STATE_LABELS: Record<TaskState, string> = {
	pending: "待开始",
	running: "执行中",
	waiting_user: "等待你",
	blocked: "受阻",
	partial: "部分完成",
	completed: "记录的验收已满足",
	cancelled: "已取消",
	archived: "已归档",
};
const TASK_STATE_LABELS_EN: Record<TaskState, string> = {
	pending: "Pending",
	running: "Running",
	waiting_user: "Waiting for you",
	blocked: "Blocked",
	partial: "Partly complete",
	completed: "Recorded acceptance satisfied",
	cancelled: "Cancelled",
	archived: "Archived",
};
/** Human-readable explanation with a next step for host reason codes; unknown codes fall back to the code. Mirrors the package-owned task workbench runtime. */
export const TASK_REASON_TEXT: Record<string, string> = {
	"task-authorization-required":
		"计划已经准备好，等你点头。确认一次，后面就自动做完，不再反复打扰。",
	"automatic-recovery":
		"刚才中断了一下，已经从上次保存的地方接着做，不用你操作。",
	"automatic-stage-checkpoint": "进展已保存，正在接着做下一部分。",
	"automatic-handoff": "这一步已保存，按你之前的授权接着做剩下的，不用再确认。",
	"total-budget":
		"这个任务的步数已经用完，做出来的结果都保留着。想继续做，请重新描述需求开一个新任务。",
	"stage-budget": "最近一段没有做出新进展，先停下来保留结果，避免空转。",
	"budget-review-required":
		"这一段的步数用完了。先看看目前的结果，确认后可以在任务面板继续。",
	"reconcile-before-retry":
		"上次有操作没等到结果就中断了（比如写文件、安装、上传），现在不确定它做没做成。请先点“核对已有结果”看一下实际情况，别让它盲目重做一遍。",
	"binding-changed":
		"知识库换了，旧任务里查到的内容不能继续用。请重新描述需求，开一个新任务。",
	"tool-failure":
		"中间有一步出错了。具体是哪一步、影不影响结果，看下面的记录。",
	"user-cancelled-choice-not-consent":
		"你取消了刚才的选择。任务停在原地等你决定，不会自作主张继续。",
	"user-action-cancelled":
		"你跳过了一个需要你处理的事项，任务先停着。想继续时再说一声就行。",
	"wiki-rejected-or-stale":
		"Wiki 修改没有通过审阅（或者来源内容变了），这一项还不算完成。",
	"verified-stage-checkpoint": "有一项交付已经确认完成，接着做下一项。",
	"session-restored": "会话已恢复，从上次保存的进度接着来。",
	"legacy-checkpoint-unreviewed":
		"这是从旧版本带过来的任务记录，之前做了什么还没核对过。",
	"user-cancelled": "你已取消这个任务。",
	"user-archived": "任务已归档。",
};
const TASK_REASON_TEXT_EN: Record<string, string> = {
	"task-authorization-required":
		"The plan is ready for your approval. One approval covers the agreed work.",
	"automatic-recovery":
		"The saved checkpoint was restored; work is continuing without another approval.",
	"automatic-stage-checkpoint":
		"Progress was saved and the next part is continuing.",
	"automatic-handoff":
		"This step was saved; the remaining work continues under the existing authorization.",
	"total-budget":
		"The task reached its call limit. Existing results are retained; start a new task to continue.",
	"stage-budget":
		"Recent steps made no new progress. Work paused to preserve results and avoid repeating effects.",
	"budget-review-required":
		"This stage reached its call limit. Review the saved results before continuing.",
	"reconcile-before-retry":
		"An earlier side effect has an uncertain outcome. Check the existing result before retrying it.",
	"binding-changed":
		"The knowledge binding changed. Start a newly scoped task instead of reusing old evidence or permissions.",
	"tool-failure":
		"An operation failed. Check its recorded result and effect on the remaining work.",
	"user-cancelled-choice-not-consent":
		"The choice was cancelled. The task is waiting; cancellation grants no consent.",
	"user-action-cancelled":
		"A requested user action was skipped. The task remains paused.",
	"wiki-rejected-or-stale":
		"The Wiki update was rejected or its sources changed; this item is not accepted.",
	"verified-stage-checkpoint":
		"One deliverable was checked; work continues with the next item.",
	"session-restored": "The session resumed from its saved checkpoint.",
	"legacy-checkpoint-unreviewed":
		"This older checkpoint has not been reconciled yet.",
	"user-cancelled": "You cancelled this task.",
	"user-archived": "The task was archived.",
};
export function explainTaskReason(
	code: string | null | undefined,
	language: "zh" | "en" = "zh",
): string | null {
	return code
		? (language === "en" ? TASK_REASON_TEXT_EN : TASK_REASON_TEXT)[code] || code
		: null;
}
/** Task states with no further agent continuation; the UI hides resume/stage/cancel for them. */
export const TERMINAL_TASK_STATES: ReadonlySet<TaskState> = new Set([
	"completed",
	"cancelled",
	"archived",
]);
/**
 * 流内应渲染的任务子集。
 *
 * 任务状态仍归右侧上下文面板；只有任务已经完成工作、留下待人工验收的
 * review 动作时，才在对应的助手消息旁投影一张可操作卡片。授权、阻塞和
 * 其它决策继续由宿主的 ask_user 流程处理，避免把过程噪声塞进聊天流。
 */
export function tasksForTranscript(view: TaskView): WorkbenchTask[] {
	return view.tasks.filter((task) =>
		task.actions.some(
			(action) => action.kind === "review" && action.state === "pending",
		),
	);
}

export type TaskDecisionLang = "zh" | "en";

/** Chat card for one task. Presentation only: it never mutates the ledger. */
export interface TaskDecision {
	mode: "decision" | "line";
	title: string;
	stop: string;
	done: string;
	remaining: string;
	details: string[];
	line: string;
	canComplete: boolean;
	canDefer: boolean;
	canEnd: boolean;
	completeActionId: string | null;
	cannotComplete: string | null;
	completeLabel: string;
	deferLabel: string;
	endLabel: string;
	detailsLabel: string;
}

function clip(text: string, max: number): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function pendingReview(task: WorkbenchTask) {
	return task.actions.find(
		(action) => action.kind === "review" && action.state === "pending",
	);
}

/** The latest snapshot's card. Pending reviews first; otherwise the active task, as one line. */
export function tasksForDecision(view: TaskView): WorkbenchTask[] {
	const pending = tasksForTranscript(view);
	if (pending.length) return pending;
	const active =
		view.tasks.find((task) => task.id === view.activeTaskId) ??
		view.tasks.at(-1);
	return active ? [active] : [];
}

/**
 * Title is the decision itself. Three lines say where it stopped, what is done, and what is left.
 * Completion is offered only when the review is tied to an open human-review deliverable.
 */
export function taskDecision(
	task: WorkbenchTask,
	lang: TaskDecisionLang = "zh",
): TaskDecision {
	const zh = lang !== "en";
	const review = pendingReview(task);
	const milestone = review?.milestoneId
		? task.milestones.find((item) => item.id === review.milestoneId)
		: undefined;
	const canComplete = Boolean(
		review &&
			milestone &&
			milestone.acceptance.kind === "human_review" &&
			milestone.state !== "completed",
	);
	const terminal = TERMINAL_TASK_STATES.has(task.state);
	const doneNames = task.milestones
		.filter((item) => item.state === "completed")
		.map((item) => item.title);
	const openNames = task.milestones
		.filter((item) => item.state !== "completed")
		.map((item) => item.title);
	const done = doneNames.length
		? zh
			? `已经做成：${doneNames.join("、")}`
			: `Done: ${doneNames.join(", ")}`
		: zh
			? "已经做成：还没有勾掉的交付"
			: "Done: nothing checked off yet";
	const remaining = openNames.length
		? zh
			? `还差：${openNames.join("、")}`
			: `Left: ${openNames.join(", ")}`
		: task.remainingSummary
			? zh
				? `还差：${clip(task.remainingSummary, 160)}`
				: `Left: ${clip(task.remainingSummary, 160)}`
			: zh
				? "还差：没有列出的未完成项"
				: "Left: no open deliverable is listed";
	const stop =
		task.reason === "stage-budget" || task.reason === "budget-review-required"
			? zh
				? "停在这一段的步数上限"
				: "Stopped at this stage's step limit"
			: task.reason === "total-budget"
				? zh
					? "停在整个任务的步数上限"
					: "Stopped at the task step limit"
				: review
					? zh
						? "停下来等你看一眼"
						: "Stopped for you to look"
					: task.state === "blocked"
						? zh
							? "停在宿主拦住的地方"
							: "Stopped at a host block"
						: zh
							? "还在做"
							: "Still going";
	const ops = task.operations.slice(-4).map((op) => `${op.tool} · ${op.state}`);
	const details = [
		zh
			? `步数 ${task.budget.calls}，这一段 ${task.budget.stageCalls}`
			: `Calls ${task.budget.calls}, this stage ${task.budget.stageCalls}`,
		task.reason
			? zh
				? `原因代码 ${task.reason}`
				: `Reason code ${task.reason}`
			: zh
				? "没有原因代码"
				: "No reason code",
		...(typeof task.progressCount === "number"
			? [
					zh
						? `这一段新进展 ${task.progressCount}，起点 ${task.stageStartProgress ?? 0}`
						: `Progress ${task.progressCount}, stage start ${task.stageStartProgress ?? 0}`,
				]
			: []),
		...ops,
	];
	const closed =
		task.state === "archived"
			? zh
				? "已归档"
				: "archived"
			: task.state === "cancelled" || task.state === "completed"
				? zh
					? "已结束"
					: "ended"
				: task.state === "blocked"
					? zh
						? "停着"
						: "stopped"
					: zh
						? "还在做"
						: "in progress";
	const mode = review && !terminal ? "decision" : "line";
	return {
		mode,
		title: review?.title.trim() || task.goal,
		stop,
		done,
		remaining,
		details,
		line: `${task.goal} · ${closed}`,
		canComplete,
		canDefer: mode === "decision",
		canEnd: mode === "decision" && !terminal,
		completeActionId: canComplete && review ? review.id : null,
		cannotComplete:
			mode === "decision" && !canComplete
				? zh
					? "这项对不上具体交付，不能替你勾完成。"
					: "This review is not tied to a deliverable, so it cannot be marked complete."
				: null,
		completeLabel: zh
			? "我看过了，这项算完成"
			: "I checked it; count this done",
		deferLabel: zh ? "先不验收，继续后面的" : "Leave it unchecked and continue",
		endLabel: zh ? "结束这项任务" : "End this task",
		detailsLabel: zh ? "详情" : "Details",
	};
}

export function taskNeedsUser(task: WorkbenchTask): boolean {
	if (task.authorizationRequired && !task.executionConsent) return true;
	if (task.state === "waiting_user" || task.state === "blocked") return true;
	return task.actions.some(
		(a) => a.kind === "authorization" && a.state === "pending",
	);
}
