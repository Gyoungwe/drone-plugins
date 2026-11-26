import { effectiveAcceptance } from "./acceptance.js";
import { hasTaskConsent, MAX_AUTO_RESUMES } from "./consent.js";
import { activeTask, LIMITS, type TaskBook, type TaskRecord, terminal } from "./workbench-state.js";
import type { VerifierLookup } from "./workbench-verifiers.js";

const recoverable = new Set([
	"tool-loop-stopped",
	"source-unread",
	"source-changed",
	"search-required",
	"search-stale",
	"citation-required",
	"check-timeout",
]);

export function readRoots(book: TaskBook) {
	const task = activeTask(book);
	return task &&
		hasTaskConsent(task, LIMITS.totalCalls) &&
		!["cancelled", "archived"].includes(task.state) &&
		!book.selectionRequired &&
		task.reason !== "binding-changed"
		? [...(task.writeRoots || [])]
		: [];
}

export function taskAuthorization(book: TaskBook, verifierFor: VerifierLookup, forWrite = false) {
	const task = activeTask(book);
	if (
		!task ||
		!hasTaskConsent(task, LIMITS.totalCalls) ||
		terminal(task.state) ||
		book.selectionRequired ||
		task.reason === "binding-changed" ||
		task.state === "waiting_user" ||
		task.operations.some((operation) =>
			(forWrite ? ["unknown", "changed"] : ["started", "unknown", "changed"]).includes(operation.state),
		)
	)
		return null;
	const acceptances = [];
	for (const milestone of task.milestones || []) {
		const verifier = verifierFor(milestone.acceptance?.kind);
		if (!verifier?.consent) continue;
		const input = milestone.bound?.via === "rebind" ? effectiveAcceptance(milestone) : milestone.acceptance;
		const entry = verifier.consent(input) as Record<string, unknown> | null;
		if (!entry || (entry.slot && (milestone.bound || milestone.state === "completed"))) continue;
		acceptances.push({ milestoneId: milestone.id, kind: milestone.acceptance.kind, ...entry });
	}
	return { taskId: task.id, writeRoots: [...(task.writeRoots || [])], ...task.executionConsent, acceptances };
}

export function reserveContinuation(task: TaskRecord, reason: string) {
	if (
		!recoverable.has(reason) ||
		task.budget.calls >= LIMITS.totalCalls ||
		(task.budget.autoResumes || 0) >= MAX_AUTO_RESUMES ||
		task.actions.some((action) => action.state === "pending") ||
		(task.progressCount || 0) <= (task.lastResumeProgress || 0)
	)
		return false;
	task.budget.autoResumes = (task.budget.autoResumes || 0) + 1;
	task.lastResumeProgress = task.progressCount;
	task.stage++;
	task.budget.stageCalls = 0;
	task.stageStartProgress = task.progressCount;
	task.reason = "automatic-recovery";
	task.state = "partial";
	return true;
}

export function reserveHandoff(task: TaskRecord) {
	if (
		task.state === "blocked" ||
		!task.milestones.length ||
		!task.milestones.some((milestone) => milestone.state !== "completed") ||
		task.actions.some((action) => action.state === "pending") ||
		task.operations.some((operation) => ["started", "unknown", "changed"].includes(operation.state)) ||
		task.budget.calls >= LIMITS.totalCalls ||
		(task.budget.autoHandoffs || 0) >= LIMITS.autoHandoffs ||
		(task.progressCount || 0) <= (task.lastResumeProgress || 0)
	)
		return false;
	task.budget.autoHandoffs = (task.budget.autoHandoffs || 0) + 1;
	task.lastResumeProgress = task.progressCount;
	task.reason = "automatic-handoff";
	task.state = "partial";
	return true;
}

export function advanceTaskStage(task: TaskRecord | null) {
	if (
		!task?.planApproved ||
		task.budget.calls >= LIMITS.totalCalls ||
		task.operations.some((operation) => operation.state === "unknown")
	)
		return false;
	const count = task.milestones.filter((milestone) => milestone.state === "completed").length;
	const automatic =
		hasTaskConsent(task, LIMITS.totalCalls) &&
		(task.progressCount || 0) > (task.stageStartProgress || 0) &&
		!task.actions.some((action) => action.state === "pending");
	if (!automatic && count <= (task.stageProgress || 0)) return false;
	task.stageStartProgress = task.progressCount || 0;
	task.stageProgress = count;
	task.stage++;
	task.budget.stageCalls = 0;
	task.state = "partial";
	task.reason = automatic ? "automatic-stage-checkpoint" : "verified-stage-checkpoint";
	return true;
}
