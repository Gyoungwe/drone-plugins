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

export { AnalysisAdapterRegistry, AssemblyAdapter, BulkRnaseqAdapter };
export type {
	AnalysisAdapter,
	AnalysisAdapterContract,
	AnalysisAdapterPlan,
	AnalysisArtifactEvidence,
	AnalysisComputePlanInput,
	AnalysisContext,
	AnalysisIdentity,
	AnalysisReadiness,
	AnalysisResearchStage,
	AnalysisReviewCheck,
	AnalysisSchemaField,
	AnalysisSideEffect,
} from "./analysis-contract.js";
export {
	adapterSnapshotSha256,
	validateAdapterContract,
} from "./registry.js";
export { assessBulkRnaseqReadiness } from "./bulk-rnaseq.js";
export { DESEQ2_RESULT_POLICY } from "./bulk-results.js";
export { normalizeBulkScientificPlan, readBulkScientificPlan, scientificPlanHash } from "./bulk-scientific-plan.js";
export type { BulkScientificPlan, BulkScientificPlanContent, BulkReference, BulkSample } from "./bulk-scientific-plan.js";
export { BulkRnaseqNumericalComparator } from "./bulk-comparator.js";
export { DESEQ2_NUMERICAL_POLICY } from "./bulk-numerical-policy.js";
export type {
	AnalysisArtifactReader, AnalysisArtifactRef, AnalysisArtifactValidation,
	AnalysisArtifactValidationInput, AnalysisScientificPlan,
	AnalysisNumericalComparatorPolicy, AnalysisNumericalComparator,
	AnalysisNumericalComparisonInput, AnalysisNumericalComparison,
} from "./analysis-contract.js";
