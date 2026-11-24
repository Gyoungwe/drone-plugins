import type { Fact } from "@gyoungwe/plugin-api/p5-inquiry";
import { hostFactContentHash } from "./fact-identity.js";

/**
 * Durable marker of the committed projection prefix.
 *
 * The marker lives in the canonical owner's own projection database, in the
 * same transaction as the projected rows. No host store keeps a second cursor
 * ledger.
 */
export interface CommittedFactCursor {
	readonly factId: string;
	readonly sequence: number;
	readonly sha256: string;
}

/** Projection schema version; a change invalidates every stored cursor marker. */
export const FACT_PROJECTION_SCHEMA = 1 as const;

/**
 * Identity of the host fact journal this projection consumes.
 *
 * A cursor marker is only valid for the journal that produced it, so the
 * marker key carries the journal identity next to the scope.
 */
export const FACT_JOURNAL_IDENTITY = "agent-p5-facts" as const;

/** Scope of one delivery: the workspace and session the host bound to this owner. */
export interface FactScope {
	readonly workspaceId: string;
	readonly sessionId: string;
}

/**
 * Durable key of one cursor marker.
 *
 * The key covers the workspace/session, the fact-journal identity and the
 * projection schema, so a reinstall or a projection change cannot reuse a
 * marker written for a different identity.
 */
export function factCursorKey(scope: FactScope, schema: number = FACT_PROJECTION_SCHEMA): string {
	return JSON.stringify([scope.workspaceId, scope.sessionId, FACT_JOURNAL_IDENTITY, schema]);
}

export class FactDeliveryConflict extends Error {
	constructor(readonly code: "DUPLICATE_CONFLICT" | "INVALID_INPUT" | "STALE_TERMINAL") {
		super(`Inquiry fact delivery: ${code}`);
		this.name = "FactDeliveryConflict";
	}
}

export interface AcceptedFact {
	readonly fact: Fact;
	readonly sha256: string;
}

export interface FactSelection {
	/** Facts this delivery may consume, in delivery order. */
	readonly accepted: readonly AcceptedFact[];
	/** The fact to acknowledge; never regresses behind the committed prefix. */
	readonly cursor: string | null;
	/** True when the batch stopped at a gap and the remaining facts stay pending. */
	readonly gap: boolean;
}

/**
 * Select the facts this delivery may consume.
 *
 * The host numbers sequences per workspace while it reads per session, so the
 * sequence numbers of one session are sparse and numeric adjacency cannot
 * define a missing fact. The only ordering the host guarantees is that a
 * session's own sequences strictly increase; a batch that breaks that
 * guarantee is a gap.
 *
 * - A repeated fact ID with the same content hash is already consumed and is skipped.
 * - A repeated fact ID with a different content hash is a conflict and aborts the delivery.
 * - A fact at or below the committed sequence is already durable and is skipped.
 * - A batch that does not strictly increase stops at the offending fact; the
 *   facts after it stay pending and the delivery acknowledges only the prefix.
 */
export function selectConsumableFacts(
	facts: readonly Fact[],
	committed: CommittedFactCursor | null,
): FactSelection {
	const accepted: AcceptedFact[] = [];
	const seen = new Map<string, string>();
	const consumedThrough = committed?.sequence ?? 0;
	let previousSequence = 0;
	let prefixCursor: string | null = null;
	let gap = false;
	for (const fact of facts) {
		if (!fact.id.trim() || !Number.isSafeInteger(fact.sequence) || fact.sequence < 1)
			throw new FactDeliveryConflict("INVALID_INPUT");
		const sha256 = hostFactContentHash(fact);
		const known = seen.get(fact.id);
		if (known !== undefined) {
			if (known !== sha256) throw new FactDeliveryConflict("DUPLICATE_CONFLICT");
			continue;
		}
		if (committed && fact.id === committed.factId) {
			if (committed.sha256 !== sha256) throw new FactDeliveryConflict("DUPLICATE_CONFLICT");
			continue;
		}
		// The host delivers one session in order; a non-increasing sequence is a gap.
		if (previousSequence && fact.sequence <= previousSequence) {
			gap = true;
			break;
		}
		previousSequence = fact.sequence;
		if (fact.sequence <= consumedThrough) {
			// Already durable: a lost acknowledgement replays the committed prefix.
			prefixCursor = fact.id;
			continue;
		}
		seen.set(fact.id, sha256);
		accepted.push({ fact, sha256 });
	}
	const cursor = accepted.at(-1)?.fact.id ?? prefixCursor ?? committed?.factId ?? null;
	return { accepted, cursor, gap };
}
