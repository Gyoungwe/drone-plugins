import { randomUUID } from "node:crypto";
import type { TaskInteractionInput } from "./ask-authorization.js";
import { isReadOnlyTool } from "./tool-manifest.js";
import { restoreBook } from "./workbench-checkpoint.js";
import { applyTaskCommand, type TaskFileInput, type WaitInput, waitForAction } from "./workbench-command.js";
import {
	advanceTaskStage,
	readRoots,
	reserveContinuation,
	reserveHandoff,
	taskAuthorization,
} from "./workbench-continuation.js";
import { inspectTaskFile } from "./workbench-files.js";
import { guardTask } from "./workbench-guard.js";
import { observeTask } from "./workbench-observation.js";
import { beginTask, taskPlanning } from "./workbench-planning.js";
import { reconcileTask } from "./workbench-reconcile.js";
import {
	activeTask,
	clean,
	deriveTask,
	type InspectFile,
	type TaskBook,
	type TaskEntry,
	type TaskRecord,
	type TaskToolCall,
	type TaskToolResult,
	taskError,
	terminal,
	type WorkbenchState,
} from "./workbench-state.js";
import { bindIdentity, type IdentityObservation, workbenchVerifiers } from "./workbench-verifiers.js";
import { renderWorkbench, workbenchView } from "./workbench-view.js";

export { ARTIFACT_ROOT_KINDS, inspectTaskFile } from "./workbench-files.js";
export { defersPendingReview, type PlanInput } from "./workbench-planning.js";
export { clean, LIMITS, WORKBENCH_ENTRY } from "./workbench-state.js";
export { explainReason, REASON_TEXT } from "./workbench-view.js";

interface WorkbenchOptions {
	persist?(book: TaskBook): void;
	now?(): string;
	inspect?: InspectFile;
	verifiers?: Parameters<typeof workbenchVerifiers>[0];
	onCheckpoint?(): void;
	requireAuthorization?: boolean;
	readOnly?(name: string): boolean;
}

const emptyBook = (scope: string | null): TaskBook => ({
	version: 2,
	scope,
	revision: 0,
	activeTaskId: null,
	selectionRequired: false,
	tasks: [],
});
const emptyState = (scope: string | null): WorkbenchState => ({
	book: emptyBook(scope),
	requested: false,
	pinned: false,
	turnCapabilities: [],
	turnBinding: null,
});

function makeTask(goal: string, now: () => string, authorizationRequired: boolean): TaskRecord {
	return {
		id: randomUUID(),
		goal: clean(goal),
		state: "pending",
		createdAt: now(),
		updatedAt: now(),
		reason: null,
		stage: 1,
		stageProgress: 0,
		authorizationRequired,
		progressCount: 0,
		stageStartProgress: 0,
		progressKeys: [],
		pendingObservations: [],
		budget: { calls: 0, stageCalls: 0, recoveries: 0, bytes: 0, autoResumes: 0 },
		milestones: [],
		actions: [],
		operations: [],
		receipts: [],
		capabilities: [],
		waitMs: 0,
		waitStartedAt: null,
	};
}

function workbenchActions(
	state: WorkbenchState,
	inspect: InspectFile,
	verifierFor: ReturnType<typeof workbenchVerifiers>["verifierFor"],
	now: () => string,
	save: () => void,
) {
	const checkRevision = (taskId: string, revision: number) => {
		if (revision !== state.book.revision)
			throw taskError("stale-task-view", "Task changed. Refresh before acting.");
		const task = state.book.tasks.find((candidate) => candidate.id === taskId);
		if (!task) throw taskError("task-scope", "Task does not belong to this session/branch.");
		return task;
	};
	return {
		command(input: TaskInteractionInput) {
			const task = checkRevision(input.taskId, input.revision);
			if (
				state.book.tasks.some((candidate) =>
					candidate.operations.some((operation) => operation.state === "started"),
				)
			)
				throw taskError("task-busy", "Stop the running agent before changing task state.");
			applyTaskCommand(task, input, verifierFor, now, {
				select() {
					state.book.activeTaskId = task.id;
					state.book.selectionRequired = false;
					state.pinned = true;
				},
				deselect() {
					if (state.book.activeTaskId !== task.id) return;
					state.book.activeTaskId = null;
					state.pinned = false;
				},
			});
			save();
			return workbenchView(state.book, now);
		},
		async acceptFile(input: TaskFileInput, cwd: string) {
			const task = checkRevision(input.taskId, input.revision);
			const action = task.actions.find(
				(candidate) => candidate.id === input.actionId && candidate.state === "pending",
			);
			if (!action || !["file", "download"].includes(action.kind))
				throw taskError("action-file", "Select an active file/download action.");
			const file = await inspect(cwd, input.path, action.expected);
			checkRevision(input.taskId, input.revision);
			if (task.actions.some((other) => other.id !== action.id && other.file?.sha256 === file.sha256))
				throw taskError(
					"duplicate-file",
					"This exact file is already associated with another action; original file was not changed.",
				);
			action.file = file;
			action.fileCheckedAt = now();
			save();
			return structuredClone(action);
		},
	};
}

function workbenchEffects(
	state: WorkbenchState,
	inspect: InspectFile,
	verifiers: ReturnType<typeof workbenchVerifiers>,
	now: () => string,
	save: () => void,
) {
	const requireTask = () => {
		const task = activeTask(state.book);
		if (!task || state.book.selectionRequired)
			throw taskError("task-selection-required", "Select a task first.");
		return task;
	};
	return {
		wait(input: WaitInput) {
			const action = waitForAction(requireTask(), input, verifiers.verifierFor, now);
			save();
			return structuredClone(action);
		},
		async observe(event: TaskToolResult, cwd: string) {
			const task = activeTask(state.book);
			if (task) await observeTask(task, event, cwd, inspect, verifiers.allVerifiers, now, save);
		},
		identified({ toolCallId, toolName, kind, identity }: IdentityObservation) {
			const task = activeTask(state.book);
			const verifier = verifiers.verifierFor(kind);
			if (!task || !verifier) return null;
			const operation = task.operations.find((candidate) => candidate.id === toolCallId) || {
				id: null,
				tool: clean(toolName, 80),
			};
			const slot = bindIdentity(task, verifier, identity, operation, now);
			save();
			return slot?.id ?? null;
		},
		async reconcile(cwd: string) {
			const task = requireTask();
			const stillCurrent = () => {
				const current = state.book.tasks.find((candidate) => candidate.id === task.id);
				if (!current) throw taskError("task-scope", "Task does not belong to this session/branch.");
				if (current !== task)
					throw taskError(
						"stale-task-view",
						"Task was replaced while reconciling; call task_reconcile again.",
					);
			};
			await reconcileTask(task, cwd, inspect, verifiers.verifierFor, stillCurrent, now);
			stillCurrent();
			deriveTask(task);
			save();
			return workbenchView(state.book, now);
		},
	};
}

export function createTaskWorkbench({
	persist = () => undefined,
	now = () => /* @__PURE__ */ new Date().toISOString(),
	inspect = inspectTaskFile,
	verifiers = null,
	onCheckpoint = () => undefined,
	requireAuthorization = false,
	readOnly = isReadOnlyTool,
}: WorkbenchOptions = {}) {
	const state = emptyState(null);
	const active = () => activeTask(state.book);
	const verifierRegistry = workbenchVerifiers(verifiers);
	const make = (goal: string) => makeTask(goal, now, requireAuthorization);
	const save = () => {
		state.book.revision++;
		const task = active();
		if (task) task.updatedAt = now();
		persist(structuredClone(state.book));
	};
	const advanceStage = () => {
		if (!advanceTaskStage(active())) return false;
		save();
		onCheckpoint();
		return true;
	};
	const authorization = (forWrite = false) =>
		taskAuthorization(state.book, verifierRegistry.verifierFor, forWrite);
	const reserve = (next: (task: TaskRecord) => boolean) => {
		const task = active();
		if (!task || !authorization() || !next(task)) return false;
		save();
		return true;
	};
	const render = () => renderWorkbench(active(), state.book.selectionRequired);
	return {
		...taskPlanning(state, make, save, verifierRegistry),
		...workbenchActions(state, inspect, verifierRegistry.verifierFor, now, save),
		...workbenchEffects(state, inspect, verifierRegistry, now, save),
		...workbenchLifecycle(state, active, render, save, now),
		checkpoint: () => structuredClone(state),
		rollback: (saved: WorkbenchState) => {
			Object.assign(state, structuredClone(saved));
		},
		advanceStage,
		authorization,
		scope: () => state.book.scope,
		readRoots: () => readRoots(state.book),
		reserveContinuation: (reason: string) => reserve((task) => reserveContinuation(task, reason)),
		reserveHandoff: () => reserve(reserveHandoff),
		attach(scope: string, entries: readonly TaskEntry[] = [], force = false) {
			if (state.book.scope === scope && !force) return;
			Object.assign(state, emptyState(scope));
			state.book = restoreBook(scope, entries, make, now);
		},
		begin: (query: string, caps: readonly string[] = [], binding: string | null = null) =>
			beginTask(state, query, caps, binding, { advanceStage, now, save }),
		guard: (event: TaskToolCall) =>
			guardTask(state.book, active(), event, { readOnly, advanceStage, save, now }),
	};
}

function workbenchLifecycle(
	state: WorkbenchState,
	active: () => TaskRecord | null,
	render: () => string,
	save: () => void,
	now: () => string,
) {
	return {
		pause(reason: string) {
			const task = active();
			if (!task) return;
			task.state = "partial";
			task.reason = clean(reason);
			for (const operation of task.operations) if (operation.state === "started") operation.state = "unknown";
			save();
		},
		settle() {
			const task = active();
			if (!task || terminal(task.state)) return;
			if (task.state === "running") deriveTask(task);
			save();
		},
		view: () => workbenchView(state.book, now),
		render,
		snapshot() {
			const task = active();
			return task
				? structuredClone({
						...task,
						pending: task.operations.filter((operation) => ["started", "unknown"].includes(operation.state)),
					})
				: null;
		},
		requestReport: () => {
			state.requested = true;
		},
		takeReport() {
			const requested = state.requested;
			state.requested = false;
			return requested ? render() : null;
		},
	};
}
