import { createHash } from "node:crypto";
import type { ClaimBinding } from "./claim-bindings.js";

export const summaryHash = (value: string | Uint8Array): string =>
	createHash("sha256").update(value).digest("hex");

/** The bytes written to SUMMARY.md, not a hash of the model's unnormalized input. */
export const summaryBody = (markdown: string): string => `${markdown.trim()}\n`;

export interface PreparedResearchDelivery {
	runId: string;
	evidenceRevision: number;
	gateSha256: string;
	claimsSha256: string;
	bodySha256: string;
	body: string;
	claims: readonly ClaimBinding[];
	readReceipts: readonly SummaryReadReceipt[];
}

export interface SummaryReadReceipt {
	receiptId: string;
	path: string;
	sha256: string;
	startLine: number;
	endLine: number;
	text: string;
}

export interface SummaryMemoryClaim extends Record<string, unknown> {
	bindingId: string;
	claim: string;
	sourcePath: string;
	sourceHash: string;
	startLine: number;
	endLine: number;
	limitations: string;
}

interface SummaryEvidenceReference {
	path: string;
	sha256: string;
	startLine: number;
	endLine: number;
	readReceiptId: string;
}
type SummaryAssessment = "supported" | "contradicted" | "out-of-scope" | "unknown";

export interface ResearchSummaryReviewPacket {
	version: 1;
	body: string;
	bodySha256: string;
	gateSha256: string;
	claimsSha256: string;
	evidenceRevision: number;
	blocks: readonly {
		blockId: string;
		text: string;
		start: number;
		end: number;
		proposedClaimIds: readonly string[];
	}[];
	claims: readonly ClaimBinding[];
	readReceipts: readonly SummaryReadReceipt[];
	memoryClaims: readonly (SummaryMemoryClaim & { memoryClaimSha256: string })[];
	packetSha256: string;
}

export interface ResearchSummaryAssessment {
	status: "model-assessed";
	packetSha256: string;
	bodySha256: string;
	provider: string;
	model: string;
	/** Host-observed model usage; absent when the provider did not report it. */
	usage?: unknown;
	blocks: readonly {
		blockId: string;
		role: "claim" | "limitation" | "navigation";
		assessment: SummaryAssessment;
		claimIds: readonly string[];
		evidence: readonly SummaryEvidenceReference[];
		reason: string;
	}[];
	/** Required separately: a supported body never approves an unassessed memory scope. */
	memoryClaims: readonly {
		bindingId: string;
		memoryClaimSha256: string;
		assessment: SummaryAssessment;
		evidence: readonly SummaryEvidenceReference[];
		reason: string;
	}[];
}

/** Bounded model inputs are validated here, rather than again inside the host writer. */
export function deliveryMemoryClaims(
	input: unknown,
	prepared: PreparedResearchDelivery,
): SummaryMemoryClaim[] {
	if (input === undefined) return [];
	if (!Array.isArray(input) || input.length > 24) throw new Error("Provide at most 24 summary memory claims");
	const bindings = new Set<string>();
	return input.map((claim) => {
		if (!claim || typeof claim !== "object") throw new Error("Invalid summary memory claim");
		const binding = prepared.claims.find((candidate) =>
			claim.bindingId ? candidate.id === claim.bindingId : candidate.claim === claim.claim,
		);
		if (!binding) throw new Error("Summary memory claim is not bound to this research run");
		if (bindings.has(binding.id)) throw new Error("Provide one memory claim per bindingId");
		bindings.add(binding.id);
		const source = binding.sources.find(
			(item) => item.path === claim.sourcePath && item.hash === claim.sourceHash,
		);
		if (!source) throw new Error("Summary memory claim source/hash differs from the bound evidence");
		for (const key of ["subject", "predicate"]) {
			if (typeof claim[key] !== "string" || !claim[key].trim() || claim[key].length > 180)
				throw new Error(`Invalid memory claim ${key}`);
		}
		if (!["observation", "interpretation", "hypothesis"].includes(claim.relation))
			throw new Error("Invalid memory claim relation");
		const result: SummaryMemoryClaim = {
			bindingId: binding.id,
			claim: binding.claim,
			subject: claim.subject,
			predicate: claim.predicate,
			sourcePath: source.path,
			sourceHash: source.hash,
			startLine: source.start_line,
			endLine: source.end_line,
			location: `${source.start_line}-${source.end_line}`,
			limitations: binding.limitations,
			relation:
				binding.relationship === "hypothesis" || binding.relationship === "unsupported"
					? "hypothesis"
					: claim.relation,
			deliveryBodySha256: prepared.bodySha256,
		};
		for (const key of ["value", "organism", "tissue", "stage", "method", "direction", "endpoint", "unit"]) {
			if (claim[key] !== undefined) {
				if (typeof claim[key] !== "string" || claim[key].length > 600)
					throw new Error(`Invalid memory claim ${key}`);
				result[key] = claim[key];
			}
		}
		if (claim.effect !== undefined) {
			if (!Number.isFinite(claim.effect)) throw new Error("Invalid memory claim effect");
			result.effect = claim.effect;
		}
		return result;
	});
}

export function summaryReviewPacket(
	prepared: PreparedResearchDelivery,
	memoryClaims: readonly SummaryMemoryClaim[],
): ResearchSummaryReviewPacket {
	const blocks = [...prepared.body.matchAll(/\S[\s\S]*?(?=\n\s*\n|$)/g)].map((match, index) => ({
		blockId: `block-${index + 1}`,
		text: match[0],
		start: match.index,
		end: match.index + match[0].length,
		proposedClaimIds: prepared.claims.map((claim) => claim.id),
	}));
	const packet = {
		version: 1 as const,
		body: prepared.body,
		bodySha256: prepared.bodySha256,
		gateSha256: prepared.gateSha256,
		claimsSha256: prepared.claimsSha256,
		evidenceRevision: prepared.evidenceRevision,
		blocks,
		claims: prepared.claims,
		readReceipts: prepared.readReceipts,
		memoryClaims: memoryClaims.map((claim) => ({
			...claim,
			memoryClaimSha256: summaryHash(JSON.stringify(claim)),
		})),
	};
	const bytes = JSON.stringify(packet);
	if (Buffer.byteLength(bytes) > 512 * 1024)
		throw new Error("Summary evidence packet exceeds 512 KiB; narrow the delivery before review");
	return { ...packet, packetSha256: summaryHash(bytes) };
}

/** Structural consistency and provenance only: the model's assessment is never scientific verification. */
export function validateSummaryAssessment(
	value: unknown,
	packet: ResearchSummaryReviewPacket,
): ResearchSummaryAssessment {
	if (!value || typeof value !== "object") throw new Error("Missing summary semantic assessment");
	const review = value as ResearchSummaryAssessment;
	if (review.packetSha256 !== packet.packetSha256 || review.bodySha256 !== packet.bodySha256)
		throw new Error("Summary semantic assessment belongs to different body/evidence bytes");
	if (
		typeof review.provider !== "string" ||
		!review.provider.trim() ||
		typeof review.model !== "string" ||
		!review.model.trim() ||
		!Array.isArray(review.blocks) ||
		review.blocks.length !== packet.blocks.length
	)
		throw new Error("Incomplete summary semantic assessment");
	const validateRead = (ref: SummaryEvidenceReference) => {
		const read = packet.readReceipts.find(
			(item) => item.receiptId === ref.readReceiptId && item.path === ref.path && item.sha256 === ref.sha256,
		);
		if (
			!read ||
			!Number.isInteger(ref.startLine) ||
			!Number.isInteger(ref.endLine) ||
			ref.startLine < read.startLine ||
			ref.endLine < ref.startLine ||
			ref.endLine > read.endLine
		)
			throw new Error("Summary assessment cites evidence that was not read in this scope");
	};
	const seen = new Set<string>();
	for (const block of review.blocks) {
		if (
			!block ||
			!packet.blocks.some((item) => item.blockId === block.blockId) ||
			seen.has(block.blockId) ||
			!["claim", "limitation", "navigation"].includes(block.role) ||
			!["supported", "contradicted", "out-of-scope", "unknown"].includes(block.assessment) ||
			typeof block.reason !== "string" ||
			!block.reason.trim() ||
			!Array.isArray(block.claimIds) ||
			!Array.isArray(block.evidence)
		)
			throw new Error("Invalid summary block assessment");
		seen.add(block.blockId);
		const claims: ClaimBinding[] = block.claimIds.map((id: string) => {
			const claim = packet.claims.find((candidate) => candidate.id === id);
			if (!claim) throw new Error("Summary block references an unknown claim");
			return claim;
		});
		if (!claims.length) throw new Error("Every summary block requires a valid claim mapping");
		for (const ref of block.evidence) validateRead(ref);
		if (block.assessment === "supported")
			for (const claim of claims) {
				if (claim.relationship !== "direct" && claim.relationship !== "indirect") continue;
				let mapped = false;
				for (const ref of block.evidence) {
					if (
						claim.sources.some(
							(source) =>
								source.path === ref.path &&
								source.hash === ref.sha256 &&
								ref.startLine >= source.start_line &&
								ref.endLine <= source.end_line,
						)
					)
						mapped = true;
				}
				if (!mapped)
					throw new Error(`Summary factual block lacks evidence from its mapped claim: ${claim.id}`);
			}
	}
	if (!Array.isArray(review.memoryClaims) || review.memoryClaims.length !== packet.memoryClaims.length)
		throw new Error("Incomplete summary memory claim assessment");
	const reviewedMemory = new Set<string>();
	for (const result of review.memoryClaims) {
		const memory = packet.memoryClaims.find((claim) => claim.bindingId === result.bindingId);
		if (
			!memory ||
			reviewedMemory.has(result.bindingId) ||
			result.memoryClaimSha256 !== memory.memoryClaimSha256 ||
			!["supported", "contradicted", "out-of-scope", "unknown"].includes(result.assessment) ||
			typeof result.reason !== "string" ||
			!result.reason.trim() ||
			!Array.isArray(result.evidence)
		)
			throw new Error("Invalid summary memory claim assessment or object hash");
		reviewedMemory.add(result.bindingId);
		for (const ref of result.evidence) validateRead(ref);
		if (result.assessment === "supported") {
			const spans = result.evidence
				.filter(
					(ref: SummaryEvidenceReference) =>
						ref.path === memory.sourcePath &&
						ref.sha256 === memory.sourceHash &&
						ref.startLine >= memory.startLine &&
						ref.endLine <= memory.endLine,
				)
				.sort((a: SummaryEvidenceReference, b: SummaryEvidenceReference) => a.startLine - b.startLine);
			let nextLine = memory.startLine;
			for (const ref of spans) {
				if (ref.startLine > nextLine) break;
				nextLine = Math.max(nextLine, ref.endLine + 1);
			}
			if (nextLine <= memory.endLine)
				throw new Error(
					`Summary memory claim lacks complete evidence from its bound source: ${memory.bindingId}`,
				);
		}
	}
	const unresolved = review.blocks.filter((block) => block.assessment !== "supported");
	if (unresolved.length)
		throw new Error(
			`Summary semantic review is unresolved: ${unresolved.map((block) => `${block.blockId} ${block.assessment}: ${block.reason}`).join("; ")}`,
		);
	const unresolvedMemory = review.memoryClaims.filter((claim) => claim.assessment !== "supported");
	if (unresolvedMemory.length)
		throw new Error(
			`Summary memory claim review is unresolved: ${unresolvedMemory.map((claim) => `${claim.bindingId} ${claim.assessment}: ${claim.reason}`).join("; ")}`,
		);
	return {
		status: "model-assessed",
		packetSha256: packet.packetSha256,
		bodySha256: packet.bodySha256,
		provider: review.provider,
		model: review.model,
		blocks: review.blocks,
		memoryClaims: review.memoryClaims,
		...(review.usage === undefined ? {} : { usage: review.usage }),
	};
}

export interface ResearchDeliveryCopy {
	role: "run" | "latest" | "history" | "vault";
	path: string;
	/** UTF-8 byte region containing the canonical summary inside a managed note. */
	bodyRegion?: { start: number; end: number };
}

export interface ResearchDeliveryReceipt {
	version: 1;
	receiptScope: "current-session-current-turn";
	id: string;
	runId: string;
	evidenceRevision: number;
	committedRevision: number;
	gateSha256: string;
	claimsSha256: string;
	bodySha256: string;
	copies: readonly {
		role: ResearchDeliveryCopy["role"];
		path: string;
		artifactSha256: string;
		bodySha256: string;
	}[];
	memoryClaimsSha256: string;
	sources: readonly {
		path: string;
		sha256: string;
		readReceiptIds: readonly string[];
	}[];
	semanticAssessment: { status: "not-reviewed" } | ResearchSummaryAssessment;
	scientificallyVerified: false;
}
