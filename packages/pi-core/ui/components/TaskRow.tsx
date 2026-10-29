import type { TaskView, WorkbenchTask } from "@gyoungwe/plugin-api/ui";
import { useState } from "react";
import { sessions, useLanguage } from "../api";
import { storageTaskReason } from "../storage";
import { useTaskText } from "../copy";
import {
	taskActionArguments,
	taskDeliveryPresentation,
} from "../presentation";
import { MilestoneEvidence } from "./MilestoneEvidence";
import { TaskArtifactLinks } from "./TaskArtifactLinks";

function operationStateLabel(state: string, zh: boolean): string {
	const labels: Record<string, [string, string]> = {
		queued: ["排队中", "queued"],
		running: ["处理中", "running"],
		done: ["已完成", "completed"],
		completed: ["已完成", "completed"],
		error: ["未完成", "needs attention"],
		failed: ["未完成", "needs attention"],
		blocked: ["需要处理", "needs attention"],
	};
	const pair = labels[state];
	return pair ? pair[zh ? 0 : 1] : state;
}

/**
 * 任务卡：一份 TaskView 里的单个任务（目标 / 交付状态 / 验收进度 / 继续做剩下的 / 产物链接 / 验收项 / 操作记录）。
 * 由右侧上下文面板「任务」页签渲染（原 TaskSidebar 已并入面板）。
 *
 * 授权入口只触发 ask_user，绝不直接同意；宿主问题展示并绑定准确的任务契约版本。
 * 里程碑证据来自所属 owner 的已校验消息投影，UI 不改变验收状态。
 */
export function TaskRow({
	task,
	view,
	sessionId,
	agentActive,
	readOnly = false,
}: {
	task: WorkbenchTask;
	view: TaskView;
	sessionId: string | null;
	agentActive: boolean;
	readOnly?: boolean;
}) {
	const t = useTaskText();
	const language = useLanguage();
	const zh = language === "zh";
	const [busy, setBusy] = useState(false),
		[error, setError] = useState("");
	const done = task.milestones.filter((m) => m.state === "completed").length;
	const pct = task.milestones.length
		? Math.round((done / task.milestones.length) * 100)
		: 0;
	const reason = storageTaskReason(view, task.reason, language);
	const presentation = taskDeliveryPresentation(task, agentActive, language);
	const pendingReview = task.actions.some(
		(action) => action.kind === "review" && action.state === "pending",
	);
	const remainingSummary =
		(agentActive ? t("taskRow.running") : task.remainingSummary) ||
		(task.milestones.length
			? t("taskRow.unconfirmed")
			: t("taskRow.noDeliverables"));
	return (
		<article className="border-b border-border px-2 py-2 last:border-0">
			<div className="flex items-start justify-between gap-2">
				<h4 className="min-w-0 break-words text-[12px] font-medium leading-4">
					{task.goal}
				</h4>
				<span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs">
					{presentation.label}
				</span>
			</div>
			<p className="mt-0.5 text-xs text-ink-dim">
				{t("taskRow.steps", { n: task.budget.calls })}
				{task.milestones.length > 0 &&
					t("taskRow.accepted", { done, total: task.milestones.length })}
			</p>
			{task.milestones.length > 0 && (
				<div
					className="mt-1 h-0.5 overflow-hidden rounded-full bg-hover"
					role="progressbar"
					aria-label={t("taskRow.progressLabel")}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={pct}
					aria-valuetext={t("taskRow.progressText", {
						done,
						total: task.milestones.length,
					})}
				>
					<div
						className={`h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none ${
							pct < 100 ? "bg-warn" : "bg-ok"
						}`}
						style={{ width: `${pct}%` }}
					/>
				</div>
			)}
			{reason && (
				<p className="mt-1 truncate text-xs text-ink-dim" title={reason}>
					{reason}
				</p>
			)}
			<p
				className="mt-1 truncate text-xs leading-4"
				data-testid="task-remaining-summary"
				title={remainingSummary}
			>
				{remainingSummary}
			</p>
			{presentation.canContinue && !pendingReview && (
				<button
					type="button"
					disabled={busy || readOnly || agentActive || !sessionId}
					className="mt-2 w-full rounded-md bg-warn/10 px-2 py-2 text-left text-xs text-warn disabled:opacity-40"
					onClick={async () => {
						if (!sessionId) return;
						setBusy(true);
						setError("");
						try {
							await sessions.command(
								sessionId,
								"task-action",
								taskActionArguments(view, task.id, "progress"),
							);
						} catch (e) {
							setError(String(e));
						} finally {
							setBusy(false);
						}
					}}
				>
					{t("taskRow.continue")}
				</button>
			)}
			{error && (
				<p role="alert" className="text-xs text-err">
					{error}
				</p>
			)}
			<TaskArtifactLinks task={task} sessionId={sessionId} />
			{!!task.milestones.length && (
				<details className="mt-2">
					<summary className="cursor-pointer text-xs text-ink-dim">
						{t("taskRow.milestones", { done, total: task.milestones.length })}
					</summary>
					<ul className="mt-1 space-y-0.5">
						{task.milestones.map((m) => (
							<li key={m.id} className="text-xs leading-4">
								<div className="flex items-start gap-2">
									<span
										className={
											m.state === "completed" ? "text-ok" : "text-ink-dim"
										}
									>
										{m.state === "completed" ? "\u2713" : "\u25cb"}
									</span>
									<span
										className={
											m.state === "completed" ? "text-ink-dim line-through" : ""
										}
									>
										{m.title}
									</span>
								</div>
								<MilestoneEvidence milestone={m} sessionId={sessionId} />
							</li>
						))}
					</ul>
				</details>
			)}
			{!!task.operations.length && (
				<details className="mt-2">
					<summary className="cursor-pointer text-xs text-ink-dim">
						{t("taskRow.operations", { n: task.operations.length })}
					</summary>
					<ul className="mt-1 space-y-0.5">
						{task.operations.slice(-12).map((o) => (
							<li key={o.id} className="truncate text-xs text-ink-dim">
								<code>{o.tool}</code> · {operationStateLabel(o.state, zh)}
							</li>
						))}
					</ul>
				</details>
			)}
		</article>
	);
}
