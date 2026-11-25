import { normalizeTaskMilestones, type TaskMilestoneInput } from "../milestone-plan.js";
import {
	activeTask,
	clean,
	LIMITS,
	settleWait,
	type TaskMilestone,
	type TaskRecord,
	taskError,
	terminal,
	type WorkbenchState,
} from "./workbench-state.js";
import type { workbenchVerifiers } from "./workbench-verifiers.js";

export interface PlanInput {
	goal?: string;
	summary?: string;
	writeRoots?: readonly string[];
	compute?: unknown;
	milestones: readonly TaskMilestoneInput[];
}

export const defersPendingReview = (query: unknown) =>
	/^(?:继续(?:做完|吧|执行|处理|完成|上一任务)?|接着(?:做|处理)?|continue|resume)[\s,.!？，。！?]*$/i.test(
		String(query ?? "").trim(),
	);

function deferReviews(task: TaskRecord, query: string, uncertain: boolean, now: () => string) {
	task.lastDefer = null;
	if (!defersPendingReview(query) || uncertain) return;
	let reviews = 0;
	for (const action of task.actions)
		if (action.state === "pending" && action.kind === "review") {
			action.state = "cancelled";
			action.resolvedAt = now();
			reviews++;
		}
	if (reviews) {
		settleWait(task, now);
		task.lastDefer = { reviews, releasedStage: false };
	}
}

export interface BeginResult {
	selectionRequired?: true;
	idle?: true;
	blocked?: true;
	taskId?: string;
	deferredReview?: boolean;
	stageReleased?: boolean;
}

function startTask(task: TaskRecord, query: string, advanceStage: () => boolean, now: () => string) {
	const uncertain = task.operations.some((operation) => ["started", "unknown"].includes(operation.state));
	deferReviews(task, query, uncertain, now);
	if (uncertain) {
		task.state = "blocked";
		task.reason = "reconcile-before-retry";
	} else if (task.actions.some((action) => action.state === "pending")) task.state = "waiting_user";
	else if (task.milestones.length && !task.planApproved) {
		task.state = "waiting_user";
		task.reason = "task-authorization-required";
	} else if (task.budget.stageCalls >= LIMITS.stageCalls && advanceStage()) task.state = "running";
	else if (task.budget.calls >= LIMITS.totalCalls || task.budget.stageCalls >= LIMITS.stageCalls) {
		task.state = "blocked";
		task.reason = "budget-review-required";
	} else task.state = "running";
}

export function beginTask(
	state: WorkbenchState,
	query: string,
	capabilities: readonly string[],
	binding: string | null,
	{ advanceStage, now, save }: { advanceStage(): boolean; now(): string; save(): void },
): BeginResult {
	state.turnCapabilities = capabilities.filter((capability) => typeof capability === "string").slice(0, 16);
	state.turnBinding = binding;
	const book = state.book;
	const eligible = book.tasks.filter((task) => !terminal(task.state));
	if (!activeTask(book) && eligible.length === 1) book.activeTaskId = eligible[0].id;
	const task = activeTask(book);
	if (!task) {
		if (eligible.length > 1 && !state.pinned) {
			book.selectionRequired = true;
			save();
			return { selectionRequired: true };
		}
		save();
		return { idle: true };
	}
	if (book.selectionRequired) return { selectionRequired: true };
	if (task.binding === undefined) task.binding = binding;
	if (task.binding !== binding) {
		task.state = "blocked";
		task.reason = "binding-changed";
		save();
		return { blocked: true };
	}
	if (terminal(task.state)) {
		book.activeTaskId = null;
		save();
		return { idle: true };
	}
	startTask(task, query, advanceStage, now);
	task.capabilities = [...new Set([...task.capabilities, ...capabilities])]
		.filter((capability) => typeof capability === "string")
		.slice(0, 16);
	if (task.lastDefer)
		task.lastDefer.releasedStage =
			task.reason === "automatic-stage-checkpoint" && task.budget.stageCalls === 0;
	state.requested = false;
	save();
	return {
		taskId: task.id,
		deferredReview: Boolean(task.lastDefer?.reviews),
		stageReleased: task.lastDefer?.releasedStage === true,
	};
}

export function taskPlanning(
	state: WorkbenchState,
	make: (goal: string) => TaskRecord,
	save: () => void,
	verifiers: ReturnType<typeof workbenchVerifiers>,
) {
	const openTask = (query: string, binding = state.turnBinding) => {
		const book = state.book;
		if (book.tasks.length >= LIMITS.tasks) {
			const archived = book.tasks.findIndex((task) => task.state === "archived");
			if (archived !== -1) book.tasks.splice(archived, 1);
		}
		if (book.tasks.length >= LIMITS.tasks)
			throw taskError(
				"task-capacity",
				"Task history is full. Archive a finished task from the task panel (export first if needed); no open task is silently discarded.",
			);
		const current = activeTask(book);
		if (current?.state === "running") current.state = "partial";
		const task = make(query);
		task.binding = binding;
		task.capabilities = [...state.turnCapabilities];
		book.tasks.push(task);
		book.activeTaskId = task.id;
		state.pinned = false;
		save();
		return task;
	};
	const plan = (input: PlanInput) => {
		if (state.book.selectionRequired) throw taskError("task-selection-required", "Select a task first.");
		const kinds = verifiers.knownKinds();
		const milestones = normalizeTaskMilestones(input.milestones, {
			kinds,
			fields: Object.fromEntries(kinds.map((kind) => [kind, verifiers.verifierFor(kind)?.fields || []])),
		}) as readonly TaskMilestone[];
		const current = activeTask(state.book);
		const task =
			current && !terminal(current.state) && !current.milestones.length
				? current
				: openTask(input.goal || "任务");
		if (task !== current && current && current.milestones.length && !terminal(current.state))
			current.state = "partial";
		if (input.goal) task.goal = clean(input.goal);
		task.authorizationSummary = clean(input.summary || task.goal, 1200);
		task.writeRoots = [...(input.writeRoots || [])];
		if (input.compute !== undefined) task.compute = structuredClone(input.compute);
		else delete task.compute;
		task.milestones = milestones;
		task.planApproved = false;
		task.state = "waiting_user";
		task.reason = "task-authorization-required";
		save();
		return structuredClone(milestones);
	};
	return { openTask, plan };
}
