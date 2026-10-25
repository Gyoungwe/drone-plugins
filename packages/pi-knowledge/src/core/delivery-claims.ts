import { createHash } from "node:crypto";
import type { KnowledgeClaim } from "./claim-conflicts.js";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");

/** Host-observed delivery results, never the original model's claims arguments. */
export function summaryDeliveryClaims(details: any, markdown: string): readonly KnowledgeClaim[] {
	const receipt = details.delivery_receipt;
	if (
		!receipt ||
		receipt.version !== 1 ||
		receipt.semanticAssessment?.status !== "model-assessed" ||
		receipt.bodySha256 !== digest(`${markdown.trim()}\n`)
	)
		throw new Error("Topic memory requires a current, reviewed summary delivery receipt");
	if (!Array.isArray(details.claims) || receipt.memoryClaimsSha256 !== digest(JSON.stringify(details.claims)))
		throw new Error("Topic memory claims differ from the reviewed delivery packet");
	const reviewed = receipt.semanticAssessment.memoryClaims;
	if (!Array.isArray(reviewed) || reviewed.length !== details.claims.length)
		throw new Error("Topic memory requires a separate assessment for every delivered memory claim");
	const seen = new Set();
	for (const claim of details.claims) {
		if (
			claim.deliveryBodySha256 !== receipt.bodySha256 ||
			!receipt.sources.some(
				(source: any) => source.path === claim.sourcePath && source.sha256 === claim.sourceHash,
			)
		)
			throw new Error("Topic memory claim does not reference the delivered evidence version");
		const assessment = reviewed.find((item) => item.bindingId === claim.bindingId);
		if (
			!assessment ||
			seen.has(claim.bindingId) ||
			assessment.assessment !== "supported" ||
			assessment.memoryClaimSha256 !== digest(JSON.stringify(claim))
		)
			throw new Error("Topic memory claim lacks its exact supported scope assessment");
		seen.add(claim.bindingId);
		if (
			!Array.isArray(assessment.evidence) ||
			!assessment.evidence.some(
				(ref: { path: string; sha256: string; readReceiptId: string }) =>
					ref.path === claim.sourcePath &&
					ref.sha256 === claim.sourceHash &&
					receipt.sources.some(
						(source: any) =>
							source.path === ref.path &&
							source.sha256 === ref.sha256 &&
							source.readReceiptIds.includes(ref.readReceiptId),
					),
			)
		)
			throw new Error("Topic memory scope assessment lacks a delivered read reference");
	}
	return details.claims;
}
