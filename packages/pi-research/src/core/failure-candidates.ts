import { createHash, randomUUID } from "node:crypto";
import type { SlowPathBreakerReceipt } from "./research-breaker.js";
import type { ResearchRunMetadata } from "./research-loop-state.js";

type ResearchFailureCode = keyof typeof researchFailures;
export type EvidenceLoopFailureCode = keyof typeof evidenceFailures;

export interface FailureCandidateInput {
	failureCode: string;
	subject: string;
	scopeKind: "project";
	summary: string;
	provenance: {
		receiptId: string;
		runId?: string;
		breakerReceiptId?: string;
	} & (
		| { sourcePlugin: "drone-pi-research"; producer: "research-loop" | "evidence-loop" }
		| { sourcePlugin: "drone-pi-evidence"; producer: "evidence-validator" }
	);
}

export interface FailureCandidateSink {
	record(input: FailureCandidateInput): Promise<void>;
}

const researchFailures = {
	"no-available-source": "No current verified source was available.",
	"archive-verify-failed": "An archived source failed verification.",
	"reused-source-changed": "A reused source changed or lost its current-turn read receipt.",
	"missing-provenance-manifest": "The run requires a valid reproducibility manifest.",
};

const evidenceFailures = {
	"source-changed-mid-read": "A local source changed after discovery or reading.",
	"zero-local-hits": "The local source search returned no results.",
	"insufficient-distinct-sources": "The answer needs at least two distinct current read receipts.",
};

const breakerFailures: Record<SlowPathBreakerReceipt["reason"], string> = {
	stalled: "Research stopped after several steps without new evidence progress.",
	"budget-exceeded": "Research stopped after reaching its configured limit.",
	"quota-unconfirmable": "Research stopped because the remaining quota could not be confirmed.",
	"repeated-tool-loop": "Research stopped after repeatedly using the same tool and target.",
};

const failureCodeKey = Symbol("research-loop failure code");
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function opaqueReceiptId(id: string) {
	return uuid.test(id) ? id : createHash("sha256").update(id).digest("hex");
}

function runReference(runId: string) {
	return /^run-\d{14}-[a-f0-9]{8}$/i.test(runId) ? { runId } : {};
}

export function breakerFailureCandidate(receipt: SlowPathBreakerReceipt): FailureCandidateInput {
	const receiptId = opaqueReceiptId(receipt.id);
	return {
		failureCode: `breaker:${receipt.reason}`,
		subject: "Research limits",
		scopeKind: "project",
		summary: breakerFailures[receipt.reason],
		provenance: {
			sourcePlugin: "drone-pi-research",
			producer: "research-loop",
			...runReference(receipt.runId),
			receiptId,
			breakerReceiptId: receiptId,
		},
	};
}

function researchFailureCandidate(
	failureCode: ResearchFailureCode,
	runId: string,
	receiptId: string,
): FailureCandidateInput {
	return {
		failureCode,
		subject: "Research evidence gate",
		scopeKind: "project",
		summary: researchFailures[failureCode],
		provenance: {
			sourcePlugin: "drone-pi-research",
			producer: "research-loop",
			...runReference(runId),
			receiptId: opaqueReceiptId(receiptId),
		},
	};
}

export function evidenceLoopFailureCandidate(
	failureCode: EvidenceLoopFailureCode,
	receiptId: string,
): FailureCandidateInput {
	return {
		failureCode,
		subject: "Local evidence",
		scopeKind: "project",
		summary: evidenceFailures[failureCode],
		provenance: {
			sourcePlugin: "drone-pi-research",
			producer: "evidence-loop",
			receiptId: opaqueReceiptId(receiptId),
		},
	};
}

export async function recordFailureCandidate(sink: FailureCandidateSink, input: FailureCandidateInput) {
	try {
		await sink.record(input);
	} catch {
		return;
	}
}

export function researchFailure(failureCode: ResearchFailureCode, message: string) {
	return Object.assign(new Error(message), { [failureCodeKey]: failureCode });
}

export async function recordResearchFailure(
	sink: FailureCandidateSink | undefined,
	metadata: Pick<ResearchRunMetadata, "run_id" | "mode">,
	error: unknown,
) {
	if (!sink || metadata.mode === "fast_readonly" || !(error instanceof Error) || !(failureCodeKey in error))
		return;
	const { [failureCodeKey]: code } = error as ReturnType<typeof researchFailure>;
	await recordFailureCandidate(sink, researchFailureCandidate(code, metadata.run_id, randomUUID()));
}
