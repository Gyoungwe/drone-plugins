import type { Fact } from "@gyoungwe/plugin-api/p5-inquiry";
import type { AttemptOutcome, AttemptRecord, DecisionKind, DecisionRecord } from "./models.js";

/**
 * Projection of one host fact into Inquiry records.
 *
 * A host fact is an observation the host already committed. It carries no
 * producer authority, so the projection rebuilds its own summary from a fixed
 * template and never copies the host's prose.
 */

/** Fact kinds that observe an executed thing rather than a user-facing decision. */
const ATTEMPT_KINDS: readonly Fact["kind"][] = ["compute", "local-execution", "task-accepted"];

/** Fact kinds that describe a decision the agent made for the user. */
const DECISION_KINDS: readonly DecisionKind[] = [
	"task-authorization",
	"workflow-repair",
	"subagent-dispatch",
	"compute-submit",
	"zotero-write",
	"rebind",
];

const TERMINAL_OUTCOMES: readonly AttemptOutcome[] = ["succeeded", "failed", "blocked"];

export function isTerminalOutcome(outcome: AttemptOutcome): boolean {
	return TERMINAL_OUTCOMES.includes(outcome);
}

/** Outcome of one fact observation; an unknown or non-terminal state stays open. */
export function outcomeForFact(fact: Fact): AttemptOutcome {
	switch (fact.status) {
		case "succeeded":
		case "accepted":
			return "succeeded";
		case "failed":
			return "failed";
		case "cancelled":
		case "blocked":
			return "blocked";
		case "running":
		case "submitted":
		case "created":
			return "running";
		default:
			return "unknown";
	}
}

/** True when the fact observes an executed thing rather than a decision. */
export function projectsAttempt(fact: Fact): boolean {
	return ATTEMPT_KINDS.includes(fact.kind);
}

function decisionKindFor(fact: Fact): DecisionKind | null {
	if (fact.kind !== "decision") return null;
	return DECISION_KINDS.find((kind) => kind === fact.decisionKind) ?? null;
}

/**
 * Attempt identity of one fact.
 *
 * The host's entity is the stable identity of the executed thing; several
 * facts observe it at different states and stay one attempt. Keying the
 * attempt by the fact ID would scatter one execution over many records and
 * make a terminal outcome impossible to protect.
 */
export function attemptIdForFact(fact: Fact): string {
	return `host-fact:${fact.kind}:${fact.entityId}`;
}

/** Decision identity of one fact; the host fact ID stays the record's stable identity. */
export function decisionIdForFact(fact: Fact): string {
	return `host-fact:${fact.kind}:${fact.id}`;
}

/**
 * Rebuild the attempt record of one fact.
 *
 * The summary is generated here from a fixed template; the host's own summary
 * is an observation detail, not this package's prose.
 */
export function attemptRecordForFact(fact: Fact, projectId: string): AttemptRecord {
	const outcome = outcomeForFact(fact),
		startedAt = fact.at,
		finishedAt = isTerminalOutcome(outcome) ? fact.at : undefined;
	return {
		id: attemptIdForFact(fact),
		schemaVersion: 2,
		projectId,
		hypothesisIds: [],
		parameters: {
			source: "host-fact",
			factKind: fact.kind,
			factId: fact.id,
			entityId: fact.entityId,
			status: fact.status,
			...(fact.runReceiptRef ? { runReceiptRef: fact.runReceiptRef } : {}),
		},
		artifactIds: fact.artifactRefs.map((artifact) => artifact.id),
		resultSummary: `host fact ${fact.kind} observed ${fact.status}`,
		outcome,
		enteredReport: false,
		startedAt,
		...(finishedAt ? { finishedAt } : {}),
	};
}

/** Rebuild the decision record of one fact whose kind and decision kind agree. */
export function decisionRecordForFact(fact: Fact, projectId: string): DecisionRecord | null {
	const kind = decisionKindFor(fact);
	if (!kind) return null;
	return {
		id: decisionIdForFact(fact),
		schemaVersion: 2,
		projectId,
		kind,
		summary: `host decision ${fact.id} observed ${fact.status}`,
		basis: [...fact.basis],
		affectedArtifactIds: fact.artifactRefs.map((artifact) => artifact.id),
		status: "active",
		createdAt: fact.at,
	};
}

/**
 * Merge a newer observation into an already projected attempt.
 *
 * The first observation keeps the start of the attempt; the newer observation
 * supplies the current outcome and artifacts.
 */
export function mergeAttempt(existing: AttemptRecord, next: AttemptRecord): AttemptRecord {
	return {
		...existing,
		...next,
		artifactIds: [...new Set([...existing.artifactIds, ...next.artifactIds])],
		startedAt: existing.startedAt <= next.startedAt ? existing.startedAt : next.startedAt,
		...(next.finishedAt ? { finishedAt: next.finishedAt } : {}),
	};
}

/**
 * Merge a projected decision into an already recorded one.
 *
 * A user-revoked decision stays revoked: a replayed host observation must not
 * reactivate what the user withdrew.
 */
export function mergeDecision(existing: DecisionRecord, next: DecisionRecord): DecisionRecord {
	return {
		...next,
		...existing,
		affectedArtifactIds: [...new Set([...existing.affectedArtifactIds, ...next.affectedArtifactIds])],
	};
}

/**
 * Decide whether a new observation may replace an already projected one.
 *
 * A terminal outcome must not be downgraded by a later or replayed
 * non-terminal observation, and a terminal observation must not replace a
 * different terminal outcome.
 */
export function mayReplaceAttempt(
	existing: Pick<AttemptRecord, "outcome">,
	next: Pick<AttemptRecord, "outcome">,
): boolean {
	if (!isTerminalOutcome(existing.outcome)) return true;
	return isTerminalOutcome(next.outcome) && next.outcome === existing.outcome;
}
