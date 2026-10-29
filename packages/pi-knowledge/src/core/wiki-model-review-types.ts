export interface WikiModelReviewAudit {
	auditId: string;
	proposalId: string;
	proposalHash: string;
	path: string;
	model: string;
	startedAt: number;
	completedAt: number;
	verdict: "approve" | "needs-human" | "reject";
	summary: string;
	cautions: string[];
	checks: Record<string, boolean>;
	source_paths: string[];
	canAutoApply: boolean;
	autoApplyAuthorized: boolean;
	applied: boolean;
	humanReviewed: false;
	scientificallyVerified: false;
	usage: { inputTokens: number | null; outputTokens: number | null; cost: number | null };
	partial?: boolean;
	applyError?: string;
	auditSaveError?: string;
	writeResult?: {
		id: string;
		status: "applied";
		path: string;
		vaultWritten: true;
		reviewRecorded: boolean;
		indexed: boolean;
		recovered: boolean;
		recordError: string | null;
		indexError: string | null;
	};
}
