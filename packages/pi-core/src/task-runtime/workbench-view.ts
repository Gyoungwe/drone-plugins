import { failureReceipt } from "./failure-feedback.js";
import { remainingExplanation } from "./remaining.js";
import { LIMITS, type TaskBook, type TaskRecord } from "./workbench-state.js";

export const REASON_TEXT: Readonly<Record<string, string>> = Object.freeze({
	"task-authorization-required": "计划已经准备好，等你点头。确认一次，后面就自动做完，不再反复打扰。",
	"automatic-recovery": "刚才中断了一下，已经从上次保存的地方接着做，不用你操作。",
	"automatic-stage-checkpoint": "进展已保存，正在接着做下一部分。",
	"automatic-handoff": "这一步已保存，按你之前的授权接着做剩下的，不用再确认。",
	"total-budget": "这个任务的步数已经用完，做出来的结果都保留着。想继续做，请重新描述需求开一个新任务。",
	"stage-budget": "最近一段没有做出新进展，先停下来保留结果，避免空转。",
	"budget-review-required": "这一段的步数用完了。先看看目前的结果，确认后可以在任务面板继续。",
	"reconcile-before-retry":
		"上次有操作没等到结果就中断了（比如写文件、安装、上传），现在不确定它做没做成。请先点“核对已有结果”看一下实际情况，别让它盲目重做一遍。",
	"binding-changed": "知识库换了，旧任务里查到的内容不能继续用。请重新描述需求，开一个新任务。",
	"tool-failure": "中间有一步出错了。具体是哪一步、影不影响结果，看下面的记录。",
	"user-cancelled-choice-not-consent": "你取消了刚才的选择。任务停在原地等你决定，不会自作主张继续。",
	"user-action-cancelled": "你跳过了一个需要你处理的事项，任务先停着。想继续时再说一声就行。",
	"wiki-rejected-or-stale": "Wiki 修改没有通过审阅（或者来源内容变了），这一项还不算完成。",
	"verified-stage-checkpoint": "有一项交付已经确认完成，接着做下一项。",
	"session-restored": "会话已恢复，从上次保存的进度接着来。",
	"legacy-checkpoint-unreviewed": "这是从旧版本带过来的任务记录，之前做了什么还没核对过。",
	"user-cancelled": "你已取消这个任务。",
	"user-archived": "任务已归档。",
});
export const explainReason = (code: string | null | undefined) => (code ? REASON_TEXT[code] || code : null);

const states: Record<string, string> = {
	pending: "待开始",
	running: "执行中",
	waiting_user: "等你决定",
	blocked: "受阻",
	partial: "部分完成",
	completed: "已完成",
	cancelled: "已取消",
	archived: "已归档",
};
const artifactStates: Record<string, string> = {
	changed: "内容后来变过，需要再看一眼",
	verified: "已生成并核对",
	returned: "已生成",
};

export function workbenchView(book: TaskBook, now: () => string) {
	return structuredClone({
		version: 2,
		revision: book.revision,
		activeTaskId: book.activeTaskId,
		selectionRequired: book.selectionRequired,
		tasks: book.tasks.map(({ progressKeys, pendingObservations, ...task }) => ({
			...task,
			remainingSummary: remainingExplanation(task),
			operations: task.operations.map(({ key, ...operation }) => operation),
			waitMs:
				task.waitMs +
				(task.waitStartedAt ? Math.max(0, Date.parse(now()) - Date.parse(task.waitStartedAt)) : 0),
		})),
		limits: LIMITS,
	});
}

function artifactLink(artifact: string, state: string) {
	const path = artifact.replaceAll("\\", "/");
	const encoded = path
		.split("/")
		.map((segment) =>
			encodeURIComponent(segment).replace(
				/[!'()*]/g,
				(character) => `%${character.charCodeAt(0).toString(16)}`,
			),
		)
		.join("/");
	const href = /^[a-z]:\//i.test(path)
		? `file:///${path.slice(0, 2)}${encoded.slice(4)}`
		: path.startsWith("/")
			? `file://${encoded}`
			: `./${encoded}`;
	const label = (path.split("/").pop() || "产物").replace(/[[\]\\]/g, "\\$&");
	return `- 文件：[${label}](${href}) · ${artifactStates[state] || state}`;
}

export function renderWorkbench(task: TaskRecord | null, selectionRequired: boolean) {
	if (!task) return "这个会话还没有任务记录。";
	const artifacts = new Map<string, string>();
	for (const { artifact, state } of task.operations)
		if (artifact && !artifact.intentOnly && state !== "started") artifacts.set(artifact.path, state);
	return [
		"### 任务进展",
		`任务：${task.goal}`,
		`状态：${states[task.state]}；更新于 ${task.updatedAt}`,
		`宿主计数：阶段 ${task.budget.stageCalls}/${LIMITS.stageCalls}；总计 ${task.budget.calls}/${LIMITS.totalCalls}`,
		`交付：已完成 ${task.milestones.filter((milestone) => milestone.state === "completed").length}/${task.milestones.length} 项`,
		...[...artifacts].slice(-6).map(([path, state]) => artifactLink(path, state)),
		remainingExplanation(task),
		task.reason
			? `说明：${task.reason === "tool-failure" ? failureReceipt(task) : explainReason(task.reason)}`
			: null,
		selectionRequired ? "有多个任务可以继续，请先在任务面板选一个。" : null,
	]
		.filter(Boolean)
		.join("\n");
}
