import { isSha256 } from "./digest.js";

export const ANALYSIS_EVIDENCE_PLAN_VERSION = 1 as const;

export interface AnalysisEvidencePlanIdentity {
	readonly id: string;
	readonly version: string;
}

export interface AnalysisEvidencePlanReadiness {
	readonly ok: boolean;
	readonly inferentialClaimsAllowed: boolean;
	readonly gates: readonly unknown[];
	readonly warnings: readonly string[];
}

export interface AnalysisEvidencePlan {
	readonly format: "drone-analysis-evidence-plan";
	readonly version: typeof ANALYSIS_EVIDENCE_PLAN_VERSION;
	readonly analysis: AnalysisEvidencePlanIdentity;
	readonly adapter: AnalysisEvidencePlanIdentity;
	readonly adapterSnapshotSha256: string;
	readonly method: AnalysisEvidencePlanIdentity;
	readonly requiredOutputs: readonly string[];
	readonly readiness: AnalysisEvidencePlanReadiness;
	readonly execution: "host-required";
	readonly evidence: "host-supplied";
}

function identity(value: unknown, label: string): AnalysisEvidencePlanIdentity {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.id !== "string" || !candidate.id.trim()) throw new Error(`${label}.id is required`);
	if (typeof candidate.version !== "string" || !candidate.version.trim())
		throw new Error(`${label}.version is required`);
	return { id: candidate.id, version: candidate.version };
}

function outputPath(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		!value.startsWith("/") &&
		!value.includes("\\") &&
		!value.split("/").some((part) => part === "" || part === "." || part === "..")
	);
}

/** Validate the read-only analysis handoff before a host records evidence. */
export function validateAnalysisEvidencePlan(value: unknown): AnalysisEvidencePlan {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Analysis evidence plan must be an object");
	const plan = value as Record<string, unknown>;
	if (plan.format !== "drone-analysis-evidence-plan") throw new Error("Invalid analysis evidence plan format");
	if (plan.version !== ANALYSIS_EVIDENCE_PLAN_VERSION) throw new Error("Unsupported analysis evidence plan version");
	const analysis = identity(plan.analysis, "analysis");
	const adapter = identity(plan.adapter, "adapter");
	const method = identity(plan.method, "method");
	if (!isSha256(plan.adapterSnapshotSha256)) throw new Error("adapterSnapshotSha256 must be a SHA-256 digest");
	if (!Array.isArray(plan.requiredOutputs) || plan.requiredOutputs.length === 0)
		throw new Error("requiredOutputs must be a nonempty array");
	const requiredOutputs = plan.requiredOutputs.filter(outputPath);
	if (requiredOutputs.length !== plan.requiredOutputs.length)
		throw new Error("requiredOutputs must contain relative paths");
	if (new Set(requiredOutputs).size !== requiredOutputs.length)
		throw new Error("requiredOutputs must not contain duplicates");
	if (!plan.readiness || typeof plan.readiness !== "object" || Array.isArray(plan.readiness))
		throw new Error("readiness must be an object");
	const readiness = plan.readiness as Record<string, unknown>;
	if (typeof readiness.ok !== "boolean" || typeof readiness.inferentialClaimsAllowed !== "boolean")
		throw new Error("readiness flags are required");
	if (!Array.isArray(readiness.gates) || !Array.isArray(readiness.warnings))
		throw new Error("readiness gates and warnings must be arrays");
	if (readiness.warnings.some((warning) => typeof warning !== "string"))
		throw new Error("readiness warnings must be strings");
	if (plan.execution !== "host-required" || plan.evidence !== "host-supplied")
		throw new Error("Analysis evidence plans must remain host-owned");
	return {
		format: "drone-analysis-evidence-plan",
		version: ANALYSIS_EVIDENCE_PLAN_VERSION,
		analysis,
		adapter,
		adapterSnapshotSha256: plan.adapterSnapshotSha256,
		method,
		requiredOutputs,
		readiness: {
			ok: readiness.ok,
			inferentialClaimsAllowed: readiness.inferentialClaimsAllowed,
			gates: [...readiness.gates],
			warnings: [...readiness.warnings],
		},
		execution: "host-required",
		evidence: "host-supplied",
	};
}
