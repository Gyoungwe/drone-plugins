import type {
	AnalysisAdapterPlan,
	AnalysisContext,
	AnalysisIdentity,
	AnalysisReadiness,
} from "./analysis-contract.js";

/** Versioned, host-neutral handoff from analysis planning to evidence capture. */
export const ANALYSIS_EVIDENCE_PLAN_VERSION = 1 as const;

export interface AnalysisEvidencePlan {
	readonly format: "drone-analysis-evidence-plan";
	readonly version: typeof ANALYSIS_EVIDENCE_PLAN_VERSION;
	readonly analysis: AnalysisIdentity;
	readonly adapter: AnalysisIdentity;
	readonly adapterSnapshotSha256: string;
	readonly method: AnalysisIdentity;
	readonly requiredOutputs: readonly string[];
	readonly readiness: AnalysisReadiness;
	/** Execution and evidence bytes remain host-owned. */
	readonly execution: "host-required";
	readonly evidence: "host-supplied";
}

export function createAnalysisEvidencePlan(
	context: AnalysisContext,
	plan: AnalysisAdapterPlan,
): AnalysisEvidencePlan {
	if (context.version !== 1) throw new Error("Unsupported analysis contract version");
	if (!context.adapter) throw new Error("An analysis adapter is required for evidence preparation");
	return {
		format: "drone-analysis-evidence-plan",
		version: ANALYSIS_EVIDENCE_PLAN_VERSION,
		analysis: { id: context.id, version: `analysis-contract-${context.version}` },
		adapter: { ...context.adapter },
		adapterSnapshotSha256: plan.adapterSnapshotSha256,
		method: { ...plan.method },
		requiredOutputs: [...plan.requiredOutputs],
		readiness: {
			ok: plan.assessment.ok,
			inferentialClaimsAllowed: plan.assessment.inferentialClaimsAllowed,
			gates: [...plan.assessment.gates],
			warnings: [...plan.assessment.warnings],
		},
		execution: "host-required",
		evidence: "host-supplied",
	};
}
