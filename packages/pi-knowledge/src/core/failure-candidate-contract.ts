export const FAILURE_CANDIDATE_VERSION = 1;
export const FAILURE_CANDIDATE_KIND = "drone.knowledge.failure-candidates";
export const FAILURE_CANDIDATE_LIMITS = Object.freeze({
	maxCandidates: 64,
	maxFileBytes: 256 * 1024,
	maxSeenReceipts: 8,
	maxSummaryChars: 400,
	maxReasonChars: 240,
	maxSubjectChars: 180,
	maxCodeChars: 64,
	maxTags: 8,
	maxQueryLimit: 16,
});

export const failureCandidateSafety = Object.freeze({
	navigationOnly: true,
	evidenceEligible: false,
	instructionEligible: false,
	authorityEligible: false,
	status: "candidate",
} as const);

export interface FailureCandidateScope {
	vaultId: string;
	project: string;
}

export interface FailureCandidateProvenance {
	sourcePlugin: "drone-pi-research" | "drone-pi-evidence";
	producer: "research-loop" | "evidence-loop" | "evidence-validator";
	receiptId: string;
	runId?: string;
	breakerReceiptId?: string;
	sessionHash?: string;
}

export interface FailureCandidateInput {
	failureCode: string;
	subject: string;
	scopeKind: string;
	summary: string;
	reason?: string;
	nextHint?: string;
	tags?: readonly string[];
	provenance: FailureCandidateProvenance;
}

export type FailureCandidate = Readonly<FailureCandidateInput> &
	typeof failureCandidateSafety & {
		readonly id: string;
		readonly dedupKey: string;
		readonly firstSeenAt: string;
		readonly lastSeenAt: string;
		readonly weight: number;
		readonly occurrences: number;
		readonly seenReceiptIds: readonly string[];
		readonly tags: readonly string[];
	};

export interface FailureCandidateDocument extends FailureCandidateScope {
	version: typeof FAILURE_CANDIDATE_VERSION;
	kind: typeof FAILURE_CANDIDATE_KIND;
	revision: number;
	candidates: readonly FailureCandidate[];
}

export interface FailureCandidateRecordResult {
	classification: "created" | "merged" | "duplicate";
	revision: number;
	candidate: FailureCandidate;
}

export interface FailureCandidateQuery {
	limit?: number;
}

export interface FailureCandidateQueryResult {
	revision: number;
	candidates: readonly (FailureCandidate & { readonly effectiveWeight: number })[];
}
