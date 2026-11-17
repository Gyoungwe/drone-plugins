import {
	assertValidArtifactManifest,
	type EvidenceAccessLevel,
	type EvidenceArtifact,
	type EvidenceArtifactRole,
	isSafeBranchId,
} from "./artifacts.js";
import { digestJson, isSha256 } from "./digest.js";
import { type EvidenceProvenance, validateProvenance } from "./provenance.js";

export type EvidenceAnalysisMode = "exploratory" | "inferential";

interface PluginAnalysisContext {
	readonly version: number;
	readonly id: string;
	readonly question: string;
	readonly assay: string;
	readonly mode: EvidenceAnalysisMode;
	readonly adapter?: { readonly id: string; readonly version: string };
}

/** Host-neutral analysis projection. It intentionally has no workspace path. */
export interface EvidenceAnalysisSnapshot {
	readonly version: 1;
	readonly id: string;
	readonly question: string;
	readonly assay: string;
	readonly mode: EvidenceAnalysisMode;
	readonly stage?: string;
	readonly status?: string;
	readonly capabilities?: readonly string[];
	readonly adapter?: { readonly id: string; readonly version: string };
	readonly provenance?: EvidenceProvenance;
	readonly readiness?: {
		readonly ok: boolean;
		readonly inferentialClaimsAllowed: boolean;
		readonly gates: readonly unknown[];
		readonly warnings: readonly string[];
	} | null;
	readonly review?: {
		readonly approved: boolean;
		readonly detail: string;
		readonly limitations: readonly string[];
		readonly reportPath?: string;
		readonly checks?: readonly { readonly id: string; readonly passed: boolean; readonly detail: string }[];
		readonly modelStatus?: "approved" | "rejected" | "unavailable";
	};
	readonly publicationRequested?: boolean;
	readonly events?: readonly { readonly type: string; readonly at: string; readonly detail?: string }[];
}

export interface FrozenEvidenceFile {
	readonly artifact: EvidenceArtifact;
	readonly kind: EvidenceArtifactRole;
}

export type FrozenFile = FrozenEvidenceFile;

export interface EvidenceLineage {
	readonly schemaVersion: 1;
	readonly eventId: string;
	readonly runAttemptId?: string;
	readonly causationId?: string;
}

export interface EvidenceCheckpoint {
	readonly schemaVersion: 1;
	readonly id: string;
	readonly analysis: EvidenceAnalysisSnapshot;
	readonly files: readonly FrozenEvidenceFile[];
	readonly environmentFingerprint?: string;
	readonly createdAt: string;
	readonly lineage?: EvidenceLineage;
}

export type EvidenceBranchStatus = "preparing" | "ready" | "failed";

/** A branch descriptor contains no workspace or execution authorization. */
export interface EvidenceBranch {
	readonly schemaVersion: 1;
	readonly id: string;
	readonly checkpointId: string;
	readonly sourceAnalysisId: string;
	readonly status: EvidenceBranchStatus;
	readonly createdAt: string;
}

function checkpointBody(value: Omit<EvidenceCheckpoint, "id">): Omit<EvidenceCheckpoint, "id"> {
	const { lineage: _lineage, analysis, ...content } = value;
	const { provenance } = analysis;
	if (!provenance) return { ...content, analysis };
	const { lineage: _provenanceLineage, ...provenanceContent } = provenance;
	return { ...content, analysis: { ...analysis, provenance: provenanceContent } };
}

// Check imported JSON recursively: nested metadata must never smuggle live authority.
function rejectAuthorization(value: unknown, path: readonly string[] = []): void {
	if (value === null || typeof value !== "object") return;
	for (const [key, child] of Object.entries(value)) {
		// Host v1 scientific review approval is evidence, never an execution grant.
		if (
			/approval|grant|authoriz|consent|approved/iu.test(key) &&
			!(path.length === 2 && path[0] === "analysis" && path[1] === "review" && key === "approved")
		)
			throw new Error("Evidence JSON cannot carry authorization");
		rejectAuthorization(child, [...path, key]);
	}
}

export function checkpointId(value: Omit<EvidenceCheckpoint, "id">): string {
	return digestJson(checkpointBody(value));
}

function validateAnalysis(value: EvidenceAnalysisSnapshot): void {
	if (
		value.version !== 1 ||
		typeof value.id !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value.id) ||
		typeof value.question !== "string" ||
		!value.question.trim() ||
		typeof value.assay !== "string" ||
		!value.assay.trim() ||
		(value.mode !== "exploratory" && value.mode !== "inferential")
	)
		throw new Error("Invalid evidence analysis snapshot");
	if ("workspace" in value) throw new Error("Evidence analysis snapshot cannot contain host workspace state");
	if (value.provenance) validateProvenance(value.provenance);
	if (value.events?.some((event) => typeof event.at !== "string" || typeof event.type !== "string"))
		throw new Error("Invalid analysis event");
}

function validateLineage(value: EvidenceLineage): void {
	if (
		Object.keys(value).some(
			(key) => !["schemaVersion", "eventId", "causationId", "runAttemptId"].includes(key),
		)
	)
		throw new Error("Unexpected causal envelope field");
	if (value.schemaVersion !== 1) throw new Error("Invalid causal envelope schemaVersion");
	for (const label of ["eventId", "causationId", "runAttemptId"] as const) {
		const id = value[label];
		if (label !== "eventId" && id === undefined) continue;
		if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id))
			throw new Error(`Invalid causal envelope ${label}`);
	}
	if (value.causationId === value.eventId) throw new Error("An event cannot cause itself");
}

export function validateCheckpoint(checkpoint: EvidenceCheckpoint): void {
	rejectAuthorization(checkpoint);
	const { id, ...body } = checkpoint;
	if (checkpoint.schemaVersion !== 1 || id !== checkpointId(body))
		throw new Error("Checkpoint manifest checksum mismatch");
	validateAnalysis(checkpoint.analysis);
	if (Number.isNaN(Date.parse(checkpoint.createdAt))) throw new Error("Invalid checkpoint timestamp");
	if (checkpoint.lineage) validateLineage(checkpoint.lineage);
	if (checkpoint.analysis.provenance?.lineage) validateLineage(checkpoint.analysis.provenance.lineage);
	if (
		checkpoint.environmentFingerprint !== undefined &&
		(typeof checkpoint.environmentFingerprint !== "string" || checkpoint.environmentFingerprint.length > 512)
	)
		throw new Error("Invalid environment fingerprint");
	if (!Array.isArray(checkpoint.files) || checkpoint.files.length === 0 || checkpoint.files.length > 10000)
		throw new Error("Invalid evidence files");
	assertValidArtifactManifest(
		{ version: 1, entries: checkpoint.files.map((file) => file.artifact) },
		{ requireIdentity: true },
	);
	const kinds = new Set(["input", "output", "code", "environment", "review"]);
	for (const file of checkpoint.files) {
		if (!kinds.has(file.kind)) throw new Error("Invalid evidence kind");
	}
}

export function createCheckpoint(
	input: Omit<EvidenceCheckpoint, "id" | "schemaVersion">,
): EvidenceCheckpoint {
	const body: Omit<EvidenceCheckpoint, "id"> = {
		schemaVersion: 1,
		...input,
		files: [...input.files].sort((left, right) => (left.artifact.path < right.artifact.path ? -1 : 1)),
	};
	const checkpoint: EvidenceCheckpoint = { ...body, id: checkpointId(body) };
	validateCheckpoint(checkpoint);
	return checkpoint;
}

export function createBranch(input: {
	readonly id: string;
	readonly checkpoint: EvidenceCheckpoint;
	readonly createdAt: string;
	readonly status?: EvidenceBranchStatus;
}): EvidenceBranch {
	if ("format" in input.checkpoint && input.checkpoint.format === "drone-evidence-attestation")
		throw new Error("Attestation capsules are verify-only and cannot be forked");
	if (!isSafeBranchId(input.id)) throw new Error("Unsafe evidence branch id");
	validateCheckpoint(input.checkpoint);
	if (Number.isNaN(Date.parse(input.createdAt))) throw new Error("Invalid branch timestamp");
	const branch: EvidenceBranch = {
		schemaVersion: 1,
		id: input.id,
		checkpointId: input.checkpoint.id,
		sourceAnalysisId: input.checkpoint.analysis.id,
		status: input.status ?? "preparing",
		createdAt: input.createdAt,
	};
	validateBranch(branch);
	return branch;
}

export function validateBranch(branch: EvidenceBranch): void {
	if (
		branch.schemaVersion !== 1 ||
		!isSafeBranchId(branch.id) ||
		!isSha256(branch.checkpointId) ||
		!branch.sourceAnalysisId ||
		!["preparing", "ready", "failed"].includes(branch.status) ||
		Number.isNaN(Date.parse(branch.createdAt))
	)
		throw new Error("Invalid evidence branch");
}

/** Strip a shared AnalysisContext down to the portable, path-free evidence projection. */
export interface AnalysisContextLike extends PluginAnalysisContext {
	readonly stage?: string;
	readonly status?: string;
	readonly capabilities?: readonly string[];
	readonly provenance?: EvidenceProvenance;
	readonly review?: EvidenceAnalysisSnapshot["review"];
	readonly publicationRequested?: boolean;
	readonly events?: EvidenceAnalysisSnapshot["events"];
}

export function toEvidenceAnalysisSnapshot(context: AnalysisContextLike): EvidenceAnalysisSnapshot {
	return {
		version: 1,
		id: context.id,
		question: context.question,
		assay: context.assay,
		mode: context.mode,
		stage: context.stage,
		status: context.status,
		capabilities: context.capabilities ? [...context.capabilities] : [],
		...(context.adapter ? { adapter: { ...context.adapter } } : {}),
		...(context.provenance ? { provenance: context.provenance } : {}),
		...(context.review
			? {
					review: {
						approved: context.review.approved,
						detail: context.review.detail,
						limitations: [...context.review.limitations],
					},
				}
			: {}),
		publicationRequested: context.publicationRequested,
		events: context.events ? context.events.map((event) => ({ ...event })) : [],
	};
}

export type EvidenceAccess = EvidenceAccessLevel;
