// biome-ignore-all assist/source/organizeImports: T489 specifies the contract export order.
/**
 * Host-neutral analysis contract used by this portable adapter package.
 *
 * The shared contract comes from the published plugin-api 1.2.0 dependency;
 * adapter-specific contracts remain local.
 */
import type {
	AnalysisAdapterContract,
	AnalysisContext,
	AnalysisDatasetFileRef,
	AnalysisIdentity,
	AnalysisReadiness,
	AnalysisReviewCheck,
} from "@gyoungwe/plugin-api";

export type { DroneHostPort } from "@gyoungwe/plugin-api";

export {
	ANALYSIS_CONTRACT_VERSION,
	type AnalysisMode,
	type AnalysisDomain,
	type AnalysisResearchStage,
	type AnalysisSideEffect,
	type AnalysisGateCode,
	type AnalysisGateSeverity,
	type AnalysisIdentity,
	type AnalysisSchemaField,
	type AnalysisDatasetFileRef,
	type AnalysisReviewCheck,
	type AnalysisGate,
	type AnalysisContext,
	type AnalysisAdapterContract,
	type AnalysisReadiness,
	createAnalysisContext,
	analysisAdapterSnapshotSha256,
} from "@gyoungwe/plugin-api";

/** Host maps its ComputePreflightJobSpec into this immutable portable shape. */
export interface AnalysisComputePlanInput {
	readonly workflow?: unknown;
	readonly outputs?: readonly (string | { readonly path: string })[];
	readonly dataDesign?: {
		readonly rows?: readonly Readonly<Record<string, unknown>>[];
		readonly dataset?: { readonly files?: readonly AnalysisDatasetFileRef[] };
		readonly sampleSheet?: { readonly idColumn: string };
		readonly analysisPlan?: {
			readonly id?: string;
			readonly alpha?: number;
			readonly covariates?: readonly string[];
			readonly methodPlan?: AnalysisScientificPlan;
		};
	};
}

export interface AnalysisArtifactEvidence {
	readonly path: string;
	readonly bytes?: number;
	readonly sha256?: string;
	readonly text?: string;
	/** Scope of the text shown to the reviewer, independent of full-file validation. */
	readonly textCoverage?: {
		readonly capturedBytes: number;
		readonly totalBytes: number;
		readonly complete: boolean;
	};
}

export interface AnalysisArtifactRef {
	readonly path: string;
	readonly bytes: number;
	readonly sha256: string;
}

/** Host permits only this collection's immutable manifest identities. */
export interface AnalysisArtifactReader {
	lines(ref: AnalysisArtifactRef): AsyncIterable<string>;
}

/** The adapter validates and owns content; hosts persist this exact snapshot. */
export interface AnalysisScientificPlan {
	readonly schemaVersion: 1;
	readonly kind: string;
	readonly sha256: string;
	readonly content: Readonly<Record<string, unknown>>;
}

export interface AnalysisNumericalComparatorPolicy {
	readonly identity: AnalysisIdentity;
	readonly sha256: string;
	readonly contract: {
		readonly keyColumns: readonly string[];
		readonly columns: readonly {
			readonly column: string;
			readonly unit: string;
			readonly absoluteTolerance: number;
			readonly relativeTolerance: number;
		}[];
		readonly endpoints: readonly string[];
	};
}
export interface AnalysisNumericalComparisonInput {
	readonly context: AnalysisContext;
	readonly method: AnalysisIdentity;
	readonly scientificPlan: AnalysisScientificPlan;
	readonly expected: {
		readonly artifacts: readonly AnalysisArtifactEvidence[];
		readonly reader: AnalysisArtifactReader;
	};
	readonly actual: {
		readonly artifacts: readonly AnalysisArtifactEvidence[];
		readonly reader: AnalysisArtifactReader;
	};
}
export interface AnalysisNumericalComparison {
	readonly policy: AnalysisNumericalComparatorPolicy;
	readonly equivalent: boolean;
	readonly checks: readonly AnalysisReviewCheck[];
	readonly statistics: Readonly<Record<string, number>>;
}
export interface AnalysisNumericalComparator {
	readonly policy: AnalysisNumericalComparatorPolicy;
	compare(input: AnalysisNumericalComparisonInput): Promise<AnalysisNumericalComparison>;
}

export interface AnalysisArtifactValidation {
	readonly checks: readonly AnalysisReviewCheck[];
	readonly executionEvidence?: {
		readonly path: string;
		readonly sha256: string;
		readonly content: Readonly<Record<string, unknown>>;
	};
	readonly summaries: readonly {
		readonly path: string;
		readonly sha256: string;
		readonly policy: AnalysisIdentity;
		readonly coverage: "full-file";
		readonly rows: number;
		readonly validRows: number;
		readonly naCounts: Readonly<Record<string, number>>;
		readonly statistics: Readonly<Record<string, number>>;
	}[];
}

export interface AnalysisArtifactValidationInput {
	readonly context: AnalysisContext;
	readonly method: AnalysisIdentity;
	readonly artifacts: readonly AnalysisArtifactEvidence[];
	readonly reader: AnalysisArtifactReader;
	readonly scientificPlan?: AnalysisScientificPlan;
}

export interface AnalysisAdapterPlan {
	readonly method: AnalysisIdentity;
	readonly requiredOutputs: readonly string[];
	readonly assessment: AnalysisReadiness;
	readonly adapterSnapshotSha256: string;
	readonly scientificPlan?: AnalysisScientificPlan;
}

export interface AnalysisAdapter {
	readonly identity: AnalysisIdentity;
	readonly contract: AnalysisAdapterContract;
	supports(assay: string): boolean;
	buildPlan(context: AnalysisContext, spec: AnalysisComputePlanInput, evidence: unknown): AnalysisAdapterPlan;
	reviewResults(
		context: AnalysisContext,
		artifacts: readonly AnalysisArtifactEvidence[],
	): readonly AnalysisReviewCheck[];
	validateArtifacts?(input: AnalysisArtifactValidationInput): Promise<AnalysisArtifactValidation>;
	readonly numericalComparator?: AnalysisNumericalComparator;
	readonly reviewInstructions: string;
}
