import type { AnalysisHostLoader, AnalysisHostPort } from "@gyoungwe/plugin-api";
import { AssemblyAdapter } from "./assembly.js";
import { assessBulkRnaseqReadiness, BulkRnaseqAdapter } from "./bulk-rnaseq.js";
import { AnalysisAdapterRegistry } from "./registry.js";

/** Build the versioned registry consumed by the Drone host composition root. */
export function createAnalysisAdapterRegistry(): AnalysisAdapterRegistry {
	return new AnalysisAdapterRegistry([new BulkRnaseqAdapter(), new AssemblyAdapter()]);
}

export function createAnalysisHost(): AnalysisHostPort {
	return {
		contractVersion: 1,
		registry: createAnalysisAdapterRegistry(),
	};
}

export const analysisHostLoader: AnalysisHostLoader = {
	contractVersion: 1,
	load: createAnalysisHost,
};

export type {
	AnalysisAdapter,
	AnalysisAdapterContract,
	AnalysisAdapterPlan,
	AnalysisArtifactEvidence,
	AnalysisArtifactReader,
	AnalysisArtifactRef,
	AnalysisArtifactValidation,
	AnalysisArtifactValidationInput,
	AnalysisComputePlanInput,
	AnalysisContext,
	AnalysisIdentity,
	AnalysisNumericalComparator,
	AnalysisNumericalComparatorPolicy,
	AnalysisNumericalComparison,
	AnalysisNumericalComparisonInput,
	AnalysisReadiness,
	AnalysisResearchStage,
	AnalysisReviewCheck,
	AnalysisSchemaField,
	AnalysisScientificPlan,
	AnalysisSideEffect,
} from "./analysis-contract.js";
export { BulkRnaseqNumericalComparator } from "./bulk-comparator.js";
export { DESEQ2_NUMERICAL_POLICY } from "./bulk-numerical-policy.js";
export { DESEQ2_RESULT_POLICY } from "./bulk-results.js";
export { assessBulkRnaseqReadiness } from "./bulk-rnaseq.js";
export type {
	BulkReference,
	BulkSample,
	BulkScientificPlan,
	BulkScientificPlanContent,
} from "./bulk-scientific-plan.js";
export {
	normalizeBulkScientificPlan,
	readBulkScientificPlan,
	scientificPlanHash,
} from "./bulk-scientific-plan.js";
export {
	adapterSnapshotSha256,
	validateAdapterContract,
} from "./registry.js";
export { AnalysisAdapterRegistry, AssemblyAdapter, BulkRnaseqAdapter };
