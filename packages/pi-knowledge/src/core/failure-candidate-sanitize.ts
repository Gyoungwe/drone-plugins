import { createHash } from "node:crypto";
import { Type } from "typebox";
import { Check } from "typebox/value";
import {
	FAILURE_CANDIDATE_KIND,
	FAILURE_CANDIDATE_LIMITS,
	FAILURE_CANDIDATE_VERSION,
	type FailureCandidate,
	type FailureCandidateDocument,
	type FailureCandidateInput,
	type FailureCandidateProvenance,
	type FailureCandidateScope,
	failureCandidateSafety,
} from "./failure-candidate-contract.js";

export const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_LIVE_WEIGHT = 0.125;
export const HARD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_WEIGHT = 10;
export const CORRUPT_FAILURE_CANDIDATE_DOCUMENT = "Corrupt failure-candidate document";

const closed = { additionalProperties: false };
const scopeKind = Type.String({ pattern: "^[a-z][a-z0-9-]{0,31}$" });
const ref = Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$" });
const provenance = Type.Object(
	{
		sourcePlugin: Type.Union([Type.Literal("drone-pi-research"), Type.Literal("drone-pi-evidence")]),
		producer: Type.Union([
			Type.Literal("research-loop"),
			Type.Literal("evidence-loop"),
			Type.Literal("evidence-validator"),
		]),
		receiptId: ref,
		runId: Type.Optional(ref),
		breakerReceiptId: Type.Optional(ref),
		sessionHash: Type.Optional(Type.String({ pattern: "^[a-f0-9]{16,64}$" })),
	},
	closed,
);

const diagnosticText = Type.String({ minLength: 1, maxLength: 4096 });
export const failureCandidateInputSchema = Type.Object(
	{
		failureCode: diagnosticText,
		subject: diagnosticText,
		scopeKind,
		summary: diagnosticText,
		reason: Type.Optional(diagnosticText),
		nextHint: Type.Optional(diagnosticText),
		tags: Type.Optional(Type.Array(diagnosticText, { maxItems: 32 })),
		provenance,
	},
	closed,
);
const boundedText = (maxLength: number) => Type.String({ minLength: 1, maxLength });
const candidateFields = {
	failureCode: boundedText(FAILURE_CANDIDATE_LIMITS.maxCodeChars),
	subject: boundedText(FAILURE_CANDIDATE_LIMITS.maxSubjectChars),
	scopeKind,
	summary: boundedText(FAILURE_CANDIDATE_LIMITS.maxSummaryChars),
	reason: Type.Optional(boundedText(FAILURE_CANDIDATE_LIMITS.maxReasonChars)),
	nextHint: Type.Optional(boundedText(FAILURE_CANDIDATE_LIMITS.maxReasonChars)),
	tags: Type.Array(boundedText(FAILURE_CANDIDATE_LIMITS.maxCodeChars), {
		maxItems: FAILURE_CANDIDATE_LIMITS.maxTags,
		uniqueItems: true,
	}),
	provenance,
};
const cleanInputSchema = Type.Object(candidateFields, closed);
const key = Type.String({ pattern: "^[a-f0-9]{32}$" });
const weight = Type.Number({ minimum: MIN_LIVE_WEIGHT, maximum: MAX_WEIGHT });
const revision = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const recordFields = {
	...candidateFields,
	id: key,
	dedupKey: key,
	firstSeenAt: Type.String({ minLength: 24, maxLength: 24 }),
	lastSeenAt: Type.String({ minLength: 24, maxLength: 24 }),
	weight: Type.Number({ minimum: 1, maximum: MAX_WEIGHT }),
	occurrences: Type.Integer({ minimum: 1, maximum: 999 }),
	seenReceiptIds: Type.Array(ref, {
		minItems: 1,
		maxItems: FAILURE_CANDIDATE_LIMITS.maxSeenReceipts,
		uniqueItems: true,
	}),
	navigationOnly: Type.Literal(failureCandidateSafety.navigationOnly),
	evidenceEligible: Type.Literal(failureCandidateSafety.evidenceEligible),
	instructionEligible: Type.Literal(failureCandidateSafety.instructionEligible),
	authorityEligible: Type.Literal(failureCandidateSafety.authorityEligible),
	status: Type.Literal(failureCandidateSafety.status),
};
const recordSchema = Type.Object(recordFields, closed);

export const failureCandidateRecordResultSchema = Type.Object(
	{
		classification: Type.Union([Type.Literal("created"), Type.Literal("merged"), Type.Literal("duplicate")]),
		revision,
		candidate: recordSchema,
	},
	closed,
);
export const failureCandidateQuerySchema = Type.Object(
	{ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: FAILURE_CANDIDATE_LIMITS.maxQueryLimit })) },
	closed,
);
export const failureCandidateQueryResultSchema = Type.Object(
	{
		revision,
		candidates: Type.Array(Type.Object({ ...recordFields, effectiveWeight: weight }, closed), {
			maxItems: FAILURE_CANDIDATE_LIMITS.maxQueryLimit,
		}),
	},
	closed,
);

const documentSchema = Type.Object(
	{
		version: Type.Literal(FAILURE_CANDIDATE_VERSION),
		kind: Type.Literal(FAILURE_CANDIDATE_KIND),
		vaultId: Type.String(),
		project: Type.String(),
		revision,
		candidates: Type.Array(recordSchema, { maxItems: FAILURE_CANDIDATE_LIMITS.maxCandidates }),
	},
	closed,
);

function redactUrl(raw: string): string {
	if (!/[?#@]/.test(raw)) return raw;
	try {
		const url = new URL(raw);
		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
		return url.href;
	} catch {
		return "[URL omitted]";
	}
}

function redactText(value: string): string {
	return value
		.replace(/\p{Cf}/gu, "")
		.normalize("NFKC")
		.replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s<>"']+/gi, redactUrl)
		.replace(
			/\b(?:authorization|(?:set-)?cookie)["']?[ \t]*[:=][^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/gi,
			"[redacted header]",
		)
		.replace(/[\p{Cc}<>]/gu, " ")
		.replace(/(\bbearer\s+)(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s,;]+)/gi, "$1[redacted]")
		.replace(
			/(\b(?:api[ _-]?key|(?:(?:access|refresh)[ _-]?)?token|password|secret|authorization|(?:set-)?cookie)["']?\s*[=:]\s*)(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s,;]+)/gi,
			"$1[redacted]",
		)
		.replace(
			/\b(?:sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{12,}|github_pat_[a-z0-9_]{12,}|AKIA[A-Z0-9]{16})\b/gi,
			"[redacted]",
		)
		.trim();
}

function clip(text: string, limit: number): string {
	return redactText(text).slice(0, limit).trimEnd();
}

function safeReferences(provenance: FailureCandidateProvenance): boolean {
	return [provenance.receiptId, provenance.runId, provenance.breakerReceiptId].every(
		(value) => value === undefined || value === redactText(value),
	);
}

export function sanitizeFailureCandidateInput(value: unknown): FailureCandidateInput & { tags: string[] } {
	if (!Check(failureCandidateInputSchema, value) || !safeReferences(value.provenance))
		throw new Error("Invalid failure-candidate input");
	const { maxCodeChars, maxSubjectChars, maxSummaryChars, maxReasonChars, maxTags } =
		FAILURE_CANDIDATE_LIMITS;
	const reason = value.reason && clip(value.reason, maxReasonChars);
	const nextHint = value.nextHint && clip(value.nextHint, maxReasonChars);
	const tags = (value.tags ?? []).map((tag) => clip(tag, maxCodeChars)).filter(Boolean);
	const clean = {
		failureCode: clip(value.failureCode, maxCodeChars),
		subject: clip(value.subject, maxSubjectChars),
		scopeKind: value.scopeKind,
		summary: clip(value.summary, maxSummaryChars),
		...(reason ? { reason } : {}),
		...(nextHint ? { nextHint } : {}),
		tags: [...new Set(tags)].slice(0, maxTags),
		provenance: { ...value.provenance },
	};
	if (!Check(cleanInputSchema, clean) || redactText(clean.scopeKind) !== clean.scopeKind)
		throw new Error("Invalid failure-candidate input");
	return clean;
}

export function failureCandidateDedupKey(input: FailureCandidateInput): string {
	const normalizedSubject = input.subject.toLowerCase().replace(/\s+/g, " ");
	return sha256(
		[input.provenance.producer, input.failureCode, normalizedSubject, input.scopeKind].join("\0"),
	).slice(0, 32);
}

export const sha256 = (value: string | Uint8Array): string =>
	createHash("sha256").update(value).digest("hex");
export const serializeFailureCandidateDocument = (value: unknown): string =>
	`${JSON.stringify(value, null, 2)}\n`;

function canonicalTimestamp(value: string): boolean {
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validRecord(candidate: FailureCandidate): boolean {
	const limits = FAILURE_CANDIDATE_LIMITS;
	const texts: [string | undefined, number][] = [
		[candidate.failureCode, limits.maxCodeChars],
		[candidate.subject, limits.maxSubjectChars],
		[candidate.scopeKind, 32],
		[candidate.summary, limits.maxSummaryChars],
		[candidate.reason, limits.maxReasonChars],
		[candidate.nextHint, limits.maxReasonChars],
		...candidate.tags.map((tag): [string, number] => [tag, limits.maxCodeChars]),
	];
	return (
		candidate.id === candidate.dedupKey &&
		candidate.dedupKey === failureCandidateDedupKey(candidate) &&
		canonicalTimestamp(candidate.firstSeenAt) &&
		canonicalTimestamp(candidate.lastSeenAt) &&
		candidate.firstSeenAt <= candidate.lastSeenAt &&
		candidate.occurrences >= candidate.seenReceiptIds.length &&
		candidate.seenReceiptIds.at(-1) === candidate.provenance.receiptId &&
		candidate.seenReceiptIds.every((id) => id === redactText(id)) &&
		safeReferences(candidate.provenance) &&
		texts.every(([value, limit]) => value === undefined || value === clip(value, limit))
	);
}

export function parseFailureCandidateDocument(
	value: unknown,
	scope: FailureCandidateScope,
): FailureCandidateDocument {
	if (
		!Check(documentSchema, value) ||
		value.vaultId !== scope.vaultId ||
		value.project !== scope.project ||
		(value.revision === 0 && value.candidates.length > 0) ||
		Buffer.byteLength(serializeFailureCandidateDocument(value)) > FAILURE_CANDIDATE_LIMITS.maxFileBytes ||
		new Set(value.candidates.map((candidate) => candidate.id)).size !== value.candidates.length ||
		!value.candidates.every(validRecord)
	)
		throw new Error(CORRUPT_FAILURE_CANDIDATE_DOCUMENT);
	return value;
}
