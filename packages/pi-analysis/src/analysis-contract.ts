/**
 * Host-neutral analysis contract used by this portable adapter package.
 *
 * The published plugin-api package currently carries the host seam. The
 * analysis types/functions live here so this package remains installable while
 * older plugin-api releases are still in circulation; the host-facing API is
 * still re-exported as a type-only dependency below.
 */
export type { DroneHostPort } from "@gyoungwe/plugin-api";

/** Public, host-neutral analysis contract used by native Pi packages. */
export const ANALYSIS_CONTRACT_VERSION = 1 as const;
export type AnalysisMode = "exploratory" | "inferential";
export type AnalysisDomain = "bioinformatics" | "genomics" | "transcriptomics" | "proteomics" | "other";
export type AnalysisResearchStage = "design" | "readiness" | "execution" | "review" | "delivery";
export type AnalysisSideEffect =
	| "read-only"
	| "network"
	| "project-write"
	| "code-execution"
	| "external-service";
export type AnalysisGateSeverity = "pause" | "block";
export type AnalysisGateCode =
	| "scientific-ambiguity"
	| "missing-data"
	| "missing-biological-replicates"
	| "reference-mismatch"
	| "unsupported-method";

export interface AnalysisIdentity {
	readonly id: string;
	readonly version: string;
}

export interface AnalysisGate {
	readonly code: AnalysisGateCode;
	readonly severity: AnalysisGateSeverity;
	readonly message: string;
	readonly evidenceKey: string;
}

export interface AnalysisReadiness {
	readonly ok: boolean;
	readonly inferentialClaimsAllowed: boolean;
	readonly gates: readonly AnalysisGate[];
	readonly warnings: readonly string[];
}

export interface AnalysisContext {
	readonly version: typeof ANALYSIS_CONTRACT_VERSION;
	readonly id: string;
	readonly question: string;
	readonly assay: string;
	readonly mode: AnalysisMode;
	readonly adapter?: AnalysisIdentity;
}

export interface AnalysisSchemaField {
	readonly id: string;
	readonly type: "file" | "table" | "metadata" | "metric" | "report";
	readonly required: boolean;
	readonly formats?: readonly string[];
}

export interface AnalysisDatasetFileRef {
	readonly path: string;
	readonly bytes?: number;
	readonly sha256?: string;
}

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

export interface AnalysisAdapterContract {
	readonly schemaVersion: typeof ANALYSIS_CONTRACT_VERSION;
	readonly assay: string;
	readonly domain: AnalysisDomain;
	readonly researchStages: readonly AnalysisResearchStage[];
	readonly inputs: readonly AnalysisSchemaField[];
	readonly outputs: readonly AnalysisSchemaField[];
	readonly capabilities: readonly string[];
	readonly sideEffects: readonly AnalysisSideEffect[];
	readonly evidenceTypes: readonly string[];
	readonly workflow?: AnalysisIdentity;
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
	readonly expected: { readonly artifacts: readonly AnalysisArtifactEvidence[]; readonly reader: AnalysisArtifactReader };
	readonly actual: { readonly artifacts: readonly AnalysisArtifactEvidence[]; readonly reader: AnalysisArtifactReader };
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

export interface AnalysisReviewCheck {
	readonly id: string;
	readonly passed: boolean;
	readonly detail: string;
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

function stableContractJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map(stableContractJson).join(",")}]`;
	const object = value as Record<string, unknown>;
	return `{${Object.keys(object)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableContractJson(object[key])}`)
		.join(",")}}`;
}

// Small dependency-free SHA-256 implementation keeps the public contract
// usable from native Pi, Electron preload and browser-based hosts alike.
function sha256Hex(input: string): string {
	const encoded = encodeURIComponent(input);
	const utf8: number[] = [];
	for (let i = 0; i < encoded.length; i += 1) {
		if (encoded[i] === "%") {
			utf8.push(Number.parseInt(encoded.slice(i + 1, i + 3), 16));
			i += 2;
		} else {
			utf8.push(encoded.charCodeAt(i));
		}
	}
	const bytes = Uint8Array.from(utf8);
	const words = new Array<number>(64).fill(0);
	const hash: number[] = [
		0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
	];
	const constants: number[] = [
		0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
		0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
		0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
		0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
		0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
		0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
		0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
		0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
	];
	const readNumber = (values: readonly number[], index: number): number => {
		const value = values[index];
		if (value === undefined) throw new Error(`SHA-256 state index ${index} is out of bounds`);
		return value;
	};
	const bitLength = bytes.length * 8;
	const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
	const padded = new Uint8Array(paddedLength);
	padded.set(bytes);
	padded[bytes.length] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(paddedLength - 4, bitLength >>> 0);
	view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
	for (let offset = 0; offset < padded.length; offset += 64) {
		for (let i = 0; i < 16; i += 1) words[i] = view.getUint32(offset + i * 4);
		for (let i = 16; i < 64; i += 1) {
			const value = readNumber(words, i - 15);
			const smallSigma0 = ((value >>> 7) | (value << 25)) ^ ((value >>> 18) | (value << 14)) ^ (value >>> 3);
			const previous = readNumber(words, i - 2);
			const smallSigma1 =
				((previous >>> 17) | (previous << 15)) ^ ((previous >>> 19) | (previous << 13)) ^ (previous >>> 10);
			words[i] = (readNumber(words, i - 16) + smallSigma0 + readNumber(words, i - 7) + smallSigma1) >>> 0;
		}
		let a = readNumber(hash, 0);
		let b = readNumber(hash, 1);
		let c = readNumber(hash, 2);
		let d = readNumber(hash, 3);
		let e = readNumber(hash, 4);
		let f = readNumber(hash, 5);
		let g = readNumber(hash, 6);
		let h = readNumber(hash, 7);
		for (let i = 0; i < 64; i += 1) {
			const bigSigma1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
			const choose = (e & f) ^ (~e & g);
			const temp1 = (h + bigSigma1 + choose + readNumber(constants, i) + readNumber(words, i)) >>> 0;
			const bigSigma0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
			const majority = (a & b) ^ (a & c) ^ (b & c);
			const temp2 = (bigSigma0 + majority) >>> 0;
			h = g;
			g = f;
			f = e;
			e = (d + temp1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (temp1 + temp2) >>> 0;
		}
		hash[0] = (readNumber(hash, 0) + a) >>> 0;
		hash[1] = (readNumber(hash, 1) + b) >>> 0;
		hash[2] = (readNumber(hash, 2) + c) >>> 0;
		hash[3] = (readNumber(hash, 3) + d) >>> 0;
		hash[4] = (readNumber(hash, 4) + e) >>> 0;
		hash[5] = (readNumber(hash, 5) + f) >>> 0;
		hash[6] = (readNumber(hash, 6) + g) >>> 0;
		hash[7] = (readNumber(hash, 7) + h) >>> 0;
	}
	return [...hash].map((value) => value.toString(16).padStart(8, "0")).join("");
}

export function analysisAdapterSnapshotSha256(
	adapter: Pick<AnalysisAdapter, "identity" | "contract">,
): string {
	return sha256Hex(stableContractJson({ identity: adapter.identity, contract: adapter.contract }));
}

export function createAnalysisContext(input: {
	id: string;
	question: string;
	assay: string;
	mode: AnalysisMode;
	adapter: AnalysisIdentity;
}): AnalysisContext {
	const clean = (value: string, label: string, max: number) => {
		const text = value.normalize("NFKC").replace(/\s+/g, " ").trim();
		if (!text || text.length > max) throw new Error(`${label} must be a non-empty bounded string`);
		return text;
	};
	const id = clean(input.id, "Analysis id", 128);
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) throw new Error("Analysis id contains unsafe characters");
	return {
		version: ANALYSIS_CONTRACT_VERSION,
		id,
		question: clean(input.question, "Analysis question", 512),
		assay: clean(input.assay, "Assay", 128),
		mode: input.mode,
		adapter: input.adapter,
	};
}
