import type {
	ReadTaskBinding,
	TaskInteractionContext,
	TaskInteractionInput,
	TaskInteractionJournal,
	TaskQuestionUi,
} from "./ask-authorization.ts";
import { contextUi } from "./context-ui.ts";
import {
	type RemainingTask,
	remainingExplanation,
	type WorkbenchAction,
	type WorkbenchMilestone,
	type WorkbenchOperation,
} from "./remaining.ts";
// @ts-expect-error TS7016: Cluster 3 owns the workbench migration.
import { explainReason as explainWorkbenchReason } from "./workbench.mjs";

const explainReason: (reason: string) => string | null = explainWorkbenchReason;

type ProgressInput = Pick<TaskInteractionInput, "taskId" | "revision">;
type ProgressContext = TaskInteractionContext & Parameters<typeof contextUi.idle>[0] & { cwd: string };

interface ProgressTask extends RemainingTask {
	id: string;
	state: string;
	reason?: string | null;
	executionConsent?: unknown;
	milestones: readonly WorkbenchMilestone[];
	actions: readonly WorkbenchAction[];
	operations: readonly WorkbenchOperation[];
}

interface ProgressJournal extends TaskInteractionJournal<ProgressTask> {
	snapshot(): { id: string; state: string } | null;
	acceptFile(input: TaskInteractionInput & { path: string }, cwd: string): unknown;
	reconcile(cwd: string): unknown;
	authorization(): unknown;
}

interface ProgressUi extends TaskQuestionUi {
	idle(ctx: ProgressContext): boolean | Promise<boolean>;
	input(
		ctx: TaskInteractionContext,
		title: string,
		placeholder: string,
		signal?: AbortSignal,
	): string | undefined | Promise<string | undefined>;
}

interface ProgressOptions {
	askAuthorization(input: TaskInteractionInput, ctx: ProgressContext): boolean | Promise<boolean>;
	checkBinding: ReadTaskBinding;
	continueAuthorized(ctx: ProgressContext): unknown;
	prepareRemaining(): unknown;
	send(content?: string): unknown;
	ui?: ProgressUi;
	getGeneration?(): number;
}

interface ProgressInvocation {
	journal: ProgressJournal;
	input: ProgressInput;
	ctx: ProgressContext;
	options: Required<ProgressOptions>;
}

interface ProgressScope {
	scope: string;
	generation: number;
	binding: string | null;
}

interface ProgressAnswer {
	readbackOnly: boolean;
	file?: { action: WorkbenchAction; path: string };
	review?: WorkbenchAction;
}

async function validateProgress(
	{ journal, input, ctx, options: { checkBinding, getGeneration, ui } }: ProgressInvocation,
	{ generation, scope, binding }: ProgressScope,
) {
	const view = journal.view(),
		task = view.tasks.find((candidate) => candidate.id === input.taskId);
	if (
		!task ||
		view.revision !== input.revision ||
		journal.scope() !== scope ||
		getGeneration() !== generation ||
		(await checkBinding()) !== binding ||
		ctx.signal?.aborted ||
		!(await ui.idle(ctx))
	)
		throw new Error(
			"\u4EFB\u52A1\u7684\u60C5\u51B5\u521A\u53D1\u751F\u4E86\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u770B\u4E00\u4E0B\u6700\u65B0\u72B6\u6001\u518D\u64CD\u4F5C\u3002",
		);
	if (["completed", "cancelled", "archived"].includes(task.state))
		throw new Error(
			"\u8FD9\u4E2A\u4EFB\u52A1\u5DF2\u7ECF\u7ED3\u675F\u4E86\uFF0C\u53BB\u770B\u770B\u4EA4\u4ED8\u7684\u7ED3\u679C\u5427\uFF1B\u60F3\u518D\u505A\u7C7B\u4F3C\u7684\u4E8B\u5C31\u91CD\u65B0\u63CF\u8FF0\u4E00\u6B21\u9700\u6C42\u3002",
		);
	return task;
}

const DECLINE = "\u6682\u4E0D\u5904\u7406";
const READBACK_ONLY = "\u4EC5\u6838\u5BF9\u5DF2\u6709\u4EA7\u7269";

function progressQuestion(task: ProgressTask, action: WorkbenchAction | undefined) {
	const report = `ask_user \xB7 \u63A8\u8FDB\u5269\u4F59\u4E8B\u9879

${remainingExplanation(task)}

${
	task.reason
		? `\u76EE\u524D\u7684\u60C5\u51B5\uFF1A${explainReason(task.reason)}
`
		: ""
}\u53EA\u5904\u7406\u8FD9\u4E2A\u4EFB\u52A1\u5269\u4E0B\u7684\u90E8\u5206\uFF1B\u5DF2\u7ECF\u505A\u5B8C\u7684\u4E0D\u4F1A\u91CD\u505A\uFF0C\u5B8C\u6210\u6807\u51C6\u4E5F\u4E0D\u4F1A\u53D8\u3002`;
	const uncertain = task.operations.some((operation) => ["started", "unknown"].includes(operation.state));
	const file = action && ["file", "download"].includes(action.kind) && !uncertain ? action : undefined;
	const review =
		action?.kind === "review" &&
		task.milestones.find((milestone) => milestone.id === action.milestoneId)?.acceptance.kind ===
			"human_review" &&
		!uncertain
			? action
			: undefined;
	const proceed = file
		? "\u63D0\u4EA4\u6240\u9700\u6587\u4EF6"
		: review
			? "\u6211\u5DF2\u4EB2\u81EA\u770B\u8FC7\u8FD9\u4E9B\u5185\u5BB9"
			: uncertain
				? "\u5148\u6838\u5BF9\u4E0A\u6B21\u6CA1\u7ED3\u679C\u7684\u64CD\u4F5C"
				: "\u63A5\u7740\u505A\u5B8C\u5269\u4E0B\u7684";
	const unsupportedReview =
		(action?.kind === "review" && !review) ||
		["binding-changed", "total-budget"].includes(task.reason as string);
	const choices = unsupportedReview ? [DECLINE, READBACK_ONLY] : [DECLINE, READBACK_ONLY, proceed];
	return { report, choices, file, review, proceed, uncertain };
}

function filePrompt(action: WorkbenchAction) {
	return `ask_user \xB7 \u63D0\u4EA4\u6587\u4EF6

${action.title}
${action.reason}
\u8BF7\u628A\u6587\u4EF6\u7684\u5B8C\u6574\u8DEF\u5F84\u586B\u5728\u4E0B\u9762\u3002\u7A0B\u5E8F\u4F1A\u81EA\u5DF1\u6838\u5BF9\u8FD9\u4EFD\u6587\u4EF6\u5BF9\u4E0D\u5BF9\uFF0C\u4E0D\u4F1A\u76F2\u76EE\u91C7\u7528\u3002`;
}

async function finishProgress(
	{ journal, input, ctx, options }: ProgressInvocation,
	task: ProgressTask,
	{ file, review, readbackOnly }: ProgressAnswer,
	{ scope, generation, binding }: ProgressScope,
) {
	const { getGeneration, checkBinding, send, continueAuthorized, prepareRemaining } = options;
	await journal.command({ ...input, action: "select" });
	const command = <Extra extends Pick<TaskInteractionInput, "action" | "actionId">>(extra: Extra) => ({
		taskId: task.id,
		revision: journal.view().revision,
		...extra,
	});
	if (file) {
		await journal.acceptFile(
			command({ action: "file", actionId: file.action.id, path: file.path.trim() }),
			ctx.cwd,
		);
		await journal.command(command({ action: "acknowledge", actionId: file.action.id }));
	}
	if (review) await journal.command(command({ action: "acknowledge", actionId: review.id }));
	await journal.reconcile(ctx.cwd);
	if (
		journal.scope() !== scope ||
		journal.snapshot()?.id !== task.id ||
		getGeneration() !== generation ||
		ctx.signal?.aborted ||
		(await checkBinding()) !== binding
	)
		return;
	await send();
	if (readbackOnly || journal.snapshot()?.state === "completed") return;
	if (journal.authorization()) await continueAuthorized(ctx);
	else if (!task.milestones.length) await prepareRemaining();
}

async function runProgress(invocation: ProgressInvocation) {
	const { journal, input, ctx, options } = invocation;
	const { getGeneration, checkBinding, ui, askAuthorization, send, continueAuthorized } = options;
	const generation = getGeneration();
	const scope = journal.scope(),
		binding = await checkBinding();
	const active = { scope, generation, binding };
	const task = await validateProgress(invocation, active);
	if (!ui.hasUI(ctx)) return;
	if (!task.executionConsent && task.milestones.length) {
		if (await askAuthorization({ ...input, action: "authorize-task" }, ctx)) {
			await send(
				"\u4F60\u5DF2\u786E\u8BA4\uFF0C\u63A5\u7740\u5B8C\u6210\u5269\u4E0B\u7684\u4EA4\u4ED8\u3002",
			);
			await continueAuthorized(ctx);
		}
		return;
	}
	const action = task.actions.find((candidate) => candidate.state === "pending");
	if (action?.kind === "authorization") {
		if (await askAuthorization({ ...input, action: "ask-authorization", actionId: action.id }, ctx)) {
			await journal.command({ taskId: task.id, revision: journal.view().revision, action: "select" });
			await send(
				"\u4F60\u5DF2\u540C\u610F\u8FD9\u9879\u65B0\u589E\u7684\u5185\u5BB9\uFF0C\u7EE7\u7EED\u5F80\u4E0B\u505A\u3002",
			);
			await continueAuthorized(ctx);
		}
		return;
	}
	const { report, choices, file, review, proceed, uncertain } = progressQuestion(task, action);
	const selected = await ui.select(ctx, report, choices, ctx.signal);
	if (!choices.includes(selected as string) || selected === DECLINE || ctx.signal?.aborted) return;
	await validateProgress(invocation, active);
	const answer: ProgressAnswer = { readbackOnly: uncertain || selected === READBACK_ONLY };
	if (file && selected === proceed) {
		const path = await ui.input(ctx, filePrompt(file), "\u5B8C\u6574\u6587\u4EF6\u8DEF\u5F84", ctx.signal);
		if (!path?.trim() || ctx.signal?.aborted) return;
		await validateProgress(invocation, active);
		answer.file = { action: file, path };
	}
	if (review && selected === proceed) answer.review = review;
	return finishProgress(invocation, task, answer, active);
}

function createTaskProgression(
	journal: ProgressJournal,
	{
		askAuthorization,
		checkBinding,
		continueAuthorized,
		prepareRemaining,
		send,
		ui = contextUi,
		getGeneration = () => 0,
	}: ProgressOptions,
) {
	const pending = /* @__PURE__ */ new Map<string, Promise<void>>();
	const options = {
		askAuthorization,
		checkBinding,
		continueAuthorized,
		prepareRemaining,
		send,
		ui,
		getGeneration,
	};
	return async (input: ProgressInput, ctx: ProgressContext) => {
		const key = `${journal.scope()}:${input.taskId}:${input.revision}`;
		const waiting = pending.get(key);
		if (waiting) return waiting;
		const run = runProgress({ journal, input, ctx, options });
		pending.set(key, run);
		try {
			return await run;
		} finally {
			pending.delete(key);
		}
	};
}

export { createTaskProgression };
