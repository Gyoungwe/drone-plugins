import { randomUUID } from "node:crypto";
import { effectiveAcceptance } from "./acceptance.js";
import type { TaskInteractionInput } from "./ask-authorization.js";
import { contractHash, hasTaskConsent, MAX_AUTO_RESUMES } from "./consent.js";
import {
	clean,
	depsDone,
	LIMITS,
	settleWait,
	type TaskAction,
	type TaskRecord,
	taskError,
	terminal,
} from "./workbench-state.js";
import { sameIdentity, type VerifierLookup } from "./workbench-verifiers.js";

export interface WaitInput {
	kind: string;
	title: string;
	reason: string;
	doi?: string;
	url?: string;
	sha256?: string;
	milestoneId?: string;
}

type TaskRevision = Pick<TaskInteractionInput, "taskId" | "revision">;
export type TaskFileInput = TaskRevision & { actionId?: string; path: string };

function rebindIdentity(task: TaskRecord, input: WaitInput, verifierFor: VerifierLookup) {
	const milestone = task.milestones.find((candidate) => candidate.id === input.milestoneId);
	if (!milestone) throw taskError("rebind-milestone", "Name an existing milestone of this task to rebind.");
	if (!task.planApproved)
		throw taskError(
			"rebind-plan",
			"Rebind applies to an approved plan; before approval call task_plan with the correct identity.",
		);
	const doi = clean(input.doi, 512);
	if (!verifierFor(milestone.acceptance.kind)?.fields.includes("doi") || !doi)
		throw taskError(
			"rebind-identity",
			"Only milestones whose acceptance declares a doi field can be rebound; supply the new doi.",
		);
	const current = effectiveAcceptance(milestone);
	if (sameIdentity(current.doi, doi))
		throw taskError(
			"rebind-same",
			"This milestone already names that identity; verify it instead of rebinding.",
		);
	if (
		task.actions.some(
			(action) =>
				action.kind === "rebind" && action.state === "pending" && action.milestoneId === milestone.id,
		)
	)
		throw taskError("rebind-pending", "A rebind request for this milestone is already waiting for the user.");
	return { doi, previous: clean(current.doi, 512) || null };
}

function actionUrl(url?: string) {
	if (!url) return null;
	const parsed = new URL(url);
	if (
		!["https:", "http:"].includes(parsed.protocol) ||
		parsed.username ||
		parsed.password ||
		/(?:token|key|secret|auth)=/i.test(parsed.search)
	)
		throw taskError("action-url", "Use a public browser link without embedded credentials.");
	return parsed.href;
}

export function waitForAction(
	task: TaskRecord,
	input: WaitInput,
	verifierFor: VerifierLookup,
	now: () => string,
) {
	if (!["file", "download", "authorization", "review", "rebind"].includes(input.kind))
		throw taskError("action-kind", "Unknown user action.");
	if (task.actions.filter((action) => action.state === "pending").length >= LIMITS.actions)
		throw taskError("action-limit", "Resolve an existing action first.");
	const rebind = input.kind === "rebind" ? rebindIdentity(task, input, verifierFor) : null;
	const url = actionUrl(input.url);
	const action: TaskAction = {
		id: randomUUID(),
		kind: input.kind,
		title: clean(input.title),
		reason: clean(input.reason),
		url,
		expected: {
			kind: input.kind === "download" ? "pdf" : rebind ? "identity" : "file",
			doi: rebind ? rebind.doi : clean(input.doi),
			title: clean(input.title),
			sha256: input.sha256 && /^[a-f0-9]{64}$/.test(input.sha256) ? input.sha256 : null,
		},
		...(rebind ? { previous: rebind.previous } : {}),
		milestoneId: task.milestones.find((milestone) => milestone.id === input.milestoneId)?.id ?? null,
		state: "pending",
		createdAt: now(),
		file: null,
	};
	task.actions.push(action);
	task.state = "waiting_user";
	if (
		["automatic-handoff", "automatic-stage-checkpoint", "automatic-recovery"].some(
			(reason) => reason === task.reason,
		)
	)
		task.reason = null;
	task.waitStartedAt ||= now();
	return action;
}

function authorize(task: TaskRecord, now: () => string) {
	if (terminal(task.state) || !task.milestones.length)
		throw taskError("plan-required", "Review a non-empty task plan before authorizing execution.");
	let consent = task.executionConsent;
	if (!consent || !hasTaskConsent(task, LIMITS.totalCalls)) {
		consent = task.executionConsent = {
			version: 1,
			contractHash: contractHash(task),
			approvedAt: now(),
			maxCalls: LIMITS.totalCalls,
			maxAutoResumes: MAX_AUTO_RESUMES,
		};
		task.stage++;
		task.budget.stageCalls = 0;
		task.stageStartProgress = task.progressCount || 0;
	}
	task.planApproved = true;
	task.planApprovedAt = consent.approvedAt;
}

function resolveAction(
	task: TaskRecord,
	input: TaskInteractionInput,
	verifierFor: VerifierLookup,
	now: () => string,
) {
	const action = task.actions.find(
		(candidate) => candidate.id === input.actionId && candidate.state === "pending",
	);
	if (!action) throw taskError("action-stale", "Action no longer pending.");
	const acknowledge = input.action === "acknowledge";
	if (acknowledge && ["download", "file"].includes(action.kind) && !action.file)
		throw taskError("file-required", "Inspect the selected file first.");
	const milestone = task.milestones.find((candidate) => candidate.id === action.milestoneId);
	if (acknowledge && action.kind === "review" && action.milestoneId) {
		const refusal = verifierFor(milestone?.acceptance.kind)?.acknowledgeError as
			| { code: string; message: string }
			| undefined;
		if (refusal) throw taskError(refusal.code, refusal.message);
	}
	action.state = acknowledge ? "acknowledged" : "cancelled";
	action.resolvedAt = now();
	if (action.file && action.file.identity !== "hash-matched") action.file.identity = "human-confirmed";
	const doi = action.expected?.doi;
	if (milestone && acknowledge && action.kind === "rebind" && doi) {
		milestone.bound = { fields: { doi }, via: "rebind", actionId: action.id, at: now() };
		milestone.state = "pending";
		milestone.evidence = null;
		task.unboundIdentities = (task.unboundIdentities || []).filter(
			(identity) => !sameIdentity(identity.doi, doi),
		);
	}
	if (milestone && acknowledge && milestone.acceptance.kind === "human_review" && depsDone(task, milestone)) {
		milestone.state = "completed";
		milestone.evidence = { kind: "human-review", at: now(), scope: milestone.title };
	}
	settleWait(task, now);
	if (!acknowledge) {
		task.state = "blocked";
		task.reason = "user-action-cancelled";
	}
}

function archive(task: TaskRecord, now: () => string) {
	if (!["completed", "cancelled", "partial", "blocked"].includes(task.state))
		throw taskError("archive-state", "Cancel or finish the task before archiving it.");
	if (task.operations.some((operation) => ["started", "unknown"].includes(operation.state)))
		throw taskError(
			"archive-unknown",
			"Reconcile unknown effects before archiving; archiving is not confirmation.",
		);
	if (task.actions.some((action) => action.state === "pending"))
		throw taskError("archive-pending", "Resolve or dismiss pending user actions before archiving.");
	task.archivedFrom = task.state;
	task.state = "archived";
	task.reason = "user-archived";
	task.archivedAt = now();
	settleWait(task, now);
}

function nextStage(task: TaskRecord, select: () => void) {
	if (task.budget.calls >= LIMITS.totalCalls)
		throw taskError(
			"total-budget",
			"Absolute task budget reached. Export the checkpoint and explicitly scope a new task; no automatic continuation.",
		);
	if (
		task.operations.some((operation) => ["started", "unknown"].includes(operation.state)) ||
		task.actions.some((action) => action.state === "pending")
	)
		throw taskError(
			"reconcile-before-resume",
			"Resolve unknown effects and pending user actions before another stage.",
		);
	select();
	task.stage++;
	task.budget.stageCalls = 0;
	task.state = "partial";
	task.reason = null;
}

function confirmOutcome(task: TaskRecord, id: string | undefined, now: () => string) {
	const operation = task.operations.find((candidate) => candidate.id === id);
	if (!operation || !["unknown", "returned"].includes(operation.state))
		throw taskError("operation-stale", "No uncertain operation to confirm.");
	operation.state = "human-confirmed";
	operation.checkedAt = now();
	operation.verifier = "explicit-user-attestation-not-scientific-proof";
	task.reason = null;
	task.state = "partial";
}

export function applyTaskCommand(
	task: TaskRecord,
	input: TaskInteractionInput,
	verifierFor: VerifierLookup,
	now: () => string,
	{ select, deselect }: { select(): void; deselect(): void },
) {
	switch (input.action) {
		case "authorize-task":
			authorize(task, now);
			select();
			task.state = "partial";
			task.reason = null;
			return;
		case "approve-plan":
			task.planApproved = true;
			task.planApprovedAt = now();
			return;
		case "select":
			return select();
		case "cancel":
			if (task.operations.some((operation) => operation.state === "started"))
				throw taskError("task-busy", "Stop the running agent before cancelling this task.");
			task.state = "cancelled";
			task.reason = "user-cancelled";
			for (const action of task.actions) if (action.state === "pending") action.state = "cancelled";
			return settleWait(task, now);
		case "archive":
			archive(task, now);
			return deselect();
		case "next-stage":
			return nextStage(task, select);
		case "acknowledge":
		case "dismiss":
			return resolveAction(task, input, verifierFor, now);
		case "confirm-outcome":
			return confirmOutcome(task, input.operationId, now);
		default:
			throw taskError("task-command", "Unsupported task action.");
	}
}
