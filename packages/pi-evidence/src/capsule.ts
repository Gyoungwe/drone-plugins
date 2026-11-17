import { EVIDENCE_CAPSULE_LIMIT, type EvidenceAccessLevel } from "./artifacts.js";
import { type EvidenceCheckpoint, validateCheckpoint } from "./checkpoints.js";
import { canonicalJson, digestJson, sha256Hex, stableJson } from "./digest.js";

export type EvidenceAudience = EvidenceAccessLevel;
export const CAPSULE_LIMIT = EVIDENCE_CAPSULE_LIMIT;

export interface EvidenceCapsule {
	readonly format: "drone-evidence-capsule";
	readonly version: 1;
	readonly checkpoint: EvidenceCheckpoint;
	readonly blobs: Readonly<Record<string, string>>;
}

export interface EvidenceAttestationCapsule {
	readonly format: "drone-evidence-attestation";
	readonly schemaVersion: 1;
	readonly audience: "public" | "restricted";
	readonly checkpointId: string;
	readonly createdAt: string;
	readonly exportedAt: string;
	readonly files: readonly { readonly sha256: string; readonly included: boolean }[];
	readonly blobs: Readonly<Record<string, string>>;
	readonly digest: string;
}

const audienceRank = (value: EvidenceAudience): number =>
	value === "public" ? 0 : value === "restricted" ? 1 : 2;

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid evidence object");
	return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
	if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)))
		throw new Error(`Invalid ${label} keys`);
}

function isHash(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function timestamp(value: unknown): string {
	if (
		typeof value !== "string" ||
		!Number.isFinite(Date.parse(value)) ||
		new Date(value).toISOString() !== value
	)
		throw new Error("Invalid attestation timestamp");
	return value;
}

function decodeBase64(value: unknown): Buffer {
	if (typeof value !== "string" || value.length > EVIDENCE_CAPSULE_LIMIT * 2)
		throw new Error("Invalid or oversized capsule blob");
	const bytes = Buffer.from(value, "base64");
	if (bytes.toString("base64") !== value) throw new Error("Invalid capsule base64");
	return bytes;
}

function attestedFiles(value: unknown): EvidenceAttestationCapsule["files"] {
	if (!Array.isArray(value) || !value.length || value.length > 10000)
		throw new Error("Invalid attestation files");
	const files = value.map((entry) => {
		const file = record(entry);
		exactKeys(file, ["sha256", "included"], "attestation file");
		if (!isHash(file.sha256) || typeof file.included !== "boolean")
			throw new Error("Invalid attestation file");
		return { sha256: file.sha256, included: file.included };
	});
	let previous = "";
	for (const file of files) {
		if (file.sha256 < previous) throw new Error("Attestation files are not sorted by sha256");
		previous = file.sha256;
	}
	return files;
}

function attestedBlobs(value: unknown, files: EvidenceAttestationCapsule["files"]): Record<string, string> {
	const expected = new Set(files.filter((file) => file.included).map((file) => file.sha256));
	const blobs: Record<string, string> = {};
	const sizes = new Map<string, number>();
	for (const [hash, encoded] of Object.entries(record(value))) {
		if (!expected.has(hash)) throw new Error("Unexpected attestation blob");
		if (typeof encoded !== "string" || encoded.length > CAPSULE_LIMIT * 2)
			throw new Error("Invalid or oversized attestation blob");
		const bytes = Buffer.from(encoded, "base64");
		if (bytes.toString("base64") !== encoded || sha256Hex(bytes) !== hash)
			throw new Error("Attestation blob checksum mismatch");
		blobs[hash] = encoded;
		sizes.set(hash, bytes.length);
	}
	let size = 0;
	for (const file of files) {
		if (!file.included) continue;
		const bytes = sizes.get(file.sha256);
		if (bytes === undefined) throw new Error("Missing attestation blob");
		size += bytes;
	}
	if (size > CAPSULE_LIMIT)
		throw new Error("Evidence exceeds capsule limit; use a smaller explicit checkpoint");
	return blobs;
}

/** Verify the host v1 hash-only wire format; this cannot authorize import or execution. */
export function verifyAttestation(value: unknown): EvidenceAttestationCapsule {
	const capsule = record(value);
	exactKeys(
		capsule,
		[
			"format",
			"schemaVersion",
			"audience",
			"checkpointId",
			"createdAt",
			"exportedAt",
			"files",
			"blobs",
			"digest",
		],
		"attestation",
	);
	if (capsule.format !== "drone-evidence-attestation" || capsule.schemaVersion !== 1)
		throw new Error("Unsupported attestation version");
	if (capsule.audience !== "public" && capsule.audience !== "restricted")
		throw new Error("Invalid attestation audience");
	if (!isHash(capsule.checkpointId) || !isHash(capsule.digest)) throw new Error("Invalid attestation hash");
	const files = attestedFiles(capsule.files);
	const body: Omit<EvidenceAttestationCapsule, "digest"> = {
		format: capsule.format,
		schemaVersion: capsule.schemaVersion,
		audience: capsule.audience,
		checkpointId: capsule.checkpointId,
		createdAt: timestamp(capsule.createdAt),
		exportedAt: timestamp(capsule.exportedAt),
		files,
		blobs: attestedBlobs(capsule.blobs, files),
	};
	if (sha256Hex(stableJson(body)) !== capsule.digest) throw new Error("Attestation digest mismatch");
	return { ...body, digest: capsule.digest };
}

export function validateCapsule(capsule: EvidenceCapsule): void {
	if (capsule.format !== "drone-evidence-capsule") throw new Error("Invalid capsule format");
	if (capsule.version !== 1) throw new Error("Unsupported capsule version");
	exactKeys(record(capsule), ["format", "version", "checkpoint", "blobs"], "capsule");
	validateCheckpoint(capsule.checkpoint);
	const expected = new Map(capsule.checkpoint.files.map(({ artifact }) => [artifact.sha256, artifact.bytes]));
	for (const [hash, encoded] of Object.entries(record(capsule.blobs))) {
		if (!expected.has(hash)) throw new Error("Unexpected capsule blob");
		const bytes = decodeBase64(encoded);
		if (bytes.length !== expected.get(hash)) throw new Error("Capsule blob size mismatch");
		if (sha256Hex(bytes) !== hash) throw new Error("Capsule blob checksum mismatch");
	}
	for (const { artifact } of capsule.checkpoint.files) {
		if (!Object.hasOwn(capsule.blobs, artifact.sha256)) throw new Error("Missing capsule blob");
		// Shared hashes still have to match every file's declared size.
		if (artifact.bytes !== expected.get(artifact.sha256)) throw new Error("Capsule blob size mismatch");
	}
}

export function createEvidenceCapsule(
	checkpoint: EvidenceCheckpoint,
	blobs: Readonly<Record<string, string | Uint8Array>>,
	audience?: "private",
): EvidenceCapsule;
export function createEvidenceCapsule(
	checkpoint: EvidenceCheckpoint,
	blobs: Readonly<Record<string, string | Uint8Array>>,
	audience: "public" | "restricted",
	exportedAt: string,
): EvidenceAttestationCapsule;
export function createEvidenceCapsule(
	checkpoint: EvidenceCheckpoint,
	blobs: Readonly<Record<string, string | Uint8Array>>,
	audience: EvidenceAudience = "private",
	exportedAt?: string,
): EvidenceCapsule | EvidenceAttestationCapsule {
	validateCheckpoint(checkpoint);
	if (!["public", "restricted", "private"].includes(audience))
		throw new Error("Invalid capsule publication audience");
	const files = checkpoint.files
		.map(({ artifact }) => ({
			sha256: artifact.sha256,
			included: audienceRank(artifact.accessLevel ?? "private") <= audienceRank(audience),
		}))
		.sort((a, b) => a.sha256.localeCompare(b.sha256));
	const selected: Record<string, string> = {};
	for (const file of files) {
		if (!file.included) continue;
		const value = blobs[file.sha256];
		if (value === undefined) throw new Error("Missing capsule blob");
		selected[file.sha256] = typeof value === "string" ? value : Buffer.from(value).toString("base64");
	}
	if (audience !== "private") {
		const body = {
			format: "drone-evidence-attestation",
			schemaVersion: 1,
			audience,
			checkpointId: checkpoint.id,
			createdAt: checkpoint.createdAt,
			exportedAt,
			files,
			blobs: selected,
		};
		return verifyAttestation({ ...body, digest: sha256Hex(stableJson(body)) });
	}
	const capsule: EvidenceCapsule = {
		format: "drone-evidence-capsule",
		version: 1,
		checkpoint,
		blobs: selected,
	};
	validateCapsule(capsule);
	return capsule;
}

export function serializeCapsule(capsule: EvidenceCapsule): string {
	validateCapsule(capsule);
	return canonicalJson(capsule);
}

export function parseCapsule(serialized: string): EvidenceCapsule {
	if (serialized.length > EVIDENCE_CAPSULE_LIMIT * 2) throw new Error("Capsule exceeds import limit");
	let parsed: unknown;
	try {
		parsed = JSON.parse(serialized);
	} catch {
		throw new Error("Invalid evidence capsule JSON");
	}
	const value = record(parsed);
	if (value.format === "drone-evidence-attestation")
		throw new Error("Attestation capsules are verify-only and cannot be imported");
	const capsule = parsed as EvidenceCapsule;
	validateCapsule(capsule);
	return capsule;
}

export function validateCapsuleImport(
	serialized: string | EvidenceCapsule | EvidenceAttestationCapsule,
): EvidenceCheckpoint {
	if (typeof serialized === "string") return parseCapsule(serialized).checkpoint;
	if (serialized.format === "drone-evidence-attestation")
		throw new Error("Attestation capsules are verify-only and cannot be imported");
	validateCapsule(serialized);
	return serialized.checkpoint;
}

export function capsuleDigest(capsule: EvidenceCapsule): string {
	validateCapsule(capsule);
	return digestJson(capsule);
}

export function capsuleBytes(capsule: EvidenceCapsule): Uint8Array {
	return new TextEncoder().encode(serializeCapsule(capsule));
}
