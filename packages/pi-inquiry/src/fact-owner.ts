import type { FactsResult, HostFactDeliveryAcknowledgement } from "@gyoungwe/plugin-api/p5-inquiry";
import {
	type AcceptedFact,
	type CommittedFactCursor,
	FactDeliveryConflict,
	type FactScope,
	factCursorKey,
	selectConsumableFacts,
} from "./fact-delivery-policy.js";
import {
	attemptRecordForFact,
	decisionRecordForFact,
	mayReplaceAttempt,
	mergeAttempt,
	mergeDecision,
	projectsAttempt,
} from "./fact-projection.js";
import type { InquiryLedgerOwner } from "./ledger-owner.js";
import type { AttemptRecord, DecisionRecord } from "./models.js";
import type { InquiryService } from "./service.js";

/** What the owner needs to reach its scope and the ledger owner of that scope. */
export interface InquiryFactOwnerPorts {
	/** The workspace/session the host bound to this owner. */
	scope(): Promise<FactScope>;
	/** The ledger owner of that scope, or undefined when Inquiry is not bound there. */
	ledger(scope: FactScope): Promise<InquiryLedgerOwner | undefined>;
}

/**
 * Canonical fact owner of one Inquiry workspace/session.
 *
 * The owner projects host facts into the Inquiry ledger and advances the
 * consumed-fact cursor in the same transaction. It never keeps a second
 * ledger: the cursor marker lives in the owner's own projection database, so
 * a lost acknowledgement replays without applying the committed prefix twice.
 */
export class InquiryFactOwner {
	constructor(private readonly ports: InquiryFactOwnerPorts) {}

	/** The committed cursor of this scope, if any. */
	async cursor(signal: AbortSignal): Promise<string | null> {
		signal.throwIfAborted();
		const scope = await this.ports.scope();
		const ledger = await this.ports.ledger(scope);
		if (!ledger) return null;
		const committed = await ledger.read(async (service) => this.readCursor(service, scope));
		signal.throwIfAborted();
		return committed?.factId ?? null;
	}

	/**
	 * Project one host fact batch and acknowledge the committed prefix.
	 *
	 * The acknowledgement names the highest consumed fact. A batch that stops
	 * at a gap acknowledges only what was committed, so the host keeps the
	 * remaining facts pending.
	 */
	async deliver(delivery: FactsResult, signal: AbortSignal): Promise<HostFactDeliveryAcknowledgement> {
		signal.throwIfAborted();
		const scope = await this.ports.scope();
		const ledger = await this.ports.ledger(scope);
		if (!ledger) throw new Error("Inquiry is not bound to this workspace");
		const committed = await ledger.read(async (service) => this.readCursor(service, scope));
		const selection = selectConsumableFacts(delivery.facts, committed);
		if (!selection.cursor) throw new FactDeliveryConflict("INVALID_INPUT");
		if (!selection.accepted.length) return { cursor: selection.cursor };
		await ledger.write(
			"project-host-facts",
			async (service) => {
				await this.applyFacts(service, scope, selection.accepted, signal);
			},
			signal,
		);
		signal.throwIfAborted();
		return { cursor: selection.cursor };
	}

	/** Read the durable marker of this scope out of the owner's projection store. */
	private async readCursor(service: InquiryService, scope: FactScope): Promise<CommittedFactCursor | null> {
		const marker = await this.store(service).cursor(factCursorKey(scope));
		if (!marker) return null;
		return { factId: marker.factId, sequence: marker.sequence, sha256: marker.sha256 };
	}

	private store(service: InquiryService) {
		const store = service.storage.factProjection?.();
		if (!store) throw new Error("Inquiry storage cannot commit a fact projection and its cursor together");
		return store;
	}

	/**
	 * Project the accepted facts and advance the cursor in one transaction.
	 *
	 * The host's revocation and write fence is rechecked before every fact,
	 * including inside a batch, so a revoked owner stops mid-batch.
	 */
	private async applyFacts(
		service: InquiryService,
		scope: FactScope,
		accepted: readonly AcceptedFact[],
		signal: AbortSignal,
	): Promise<void> {
		const store = this.store(service);
		const snapshot = await service.storage.snapshot();
		const attempts = new Map(snapshot.attempts.map((record) => [record.id, record]));
		const decisions = new Map(snapshot.decisions.map((record) => [record.id, record]));
		const projectedAttempts: AttemptRecord[] = [];
		const projectedDecisions: DecisionRecord[] = [];
		for (const item of accepted) {
			signal.throwIfAborted();
			if (projectsAttempt(item.fact)) {
				const next = attemptRecordForFact(item.fact, service.storage.projectId);
				const existing = attempts.get(next.id);
				// A terminal outcome is never downgraded by a later or replayed observation.
				if (existing && !mayReplaceAttempt(existing, next)) continue;
				const merged = existing ? mergeAttempt(existing, next) : next;
				attempts.set(merged.id, merged);
				projectedAttempts.push(merged);
				continue;
			}
			const next = decisionRecordForFact(item.fact, service.storage.projectId);
			if (!next) continue;
			const existing = decisions.get(next.id);
			const merged = existing ? mergeDecision(existing, next) : next;
			decisions.set(merged.id, merged);
			projectedDecisions.push(merged);
		}
		const last = accepted.at(-1);
		if (!last) return;
		await store.commit({
			attempts: projectedAttempts,
			decisions: projectedDecisions,
			cursor: {
				key: factCursorKey(scope),
				factId: last.fact.id,
				sequence: last.fact.sequence,
				sha256: last.sha256,
				updatedAt: new Date().toISOString(),
			},
		});
	}
}
