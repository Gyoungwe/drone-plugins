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
