import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import {
	deliveryMemoryClaims,
	type PreparedResearchDelivery,
	type ResearchSummaryReviewPacket,
	summaryReviewPacket,
	validateSummaryAssessment,
} from "../../src/core/research-delivery.js";

const observedScopeDrift = JSON.parse(
	await readFile(new URL("../fixtures/online-memory-scope-drift-2026-10-25.json", import.meta.url), "utf8"),
);

const prepared: PreparedResearchDelivery = {
	runId: "run-test",
	evidenceRevision: 1,
	body: "A faithful paraphrase of the limited observation.\n",
	bodySha256: "b".repeat(64),
	gateSha256: "c".repeat(64),
	claimsSha256: "d".repeat(64),
	claims: [
		{
			id: "claim-1",
			claim: "Association observed in cell culture.",
			relationship: "direct",
			limitations: "No clinical evidence.",
			sources: [
				{
					path: "source.md",
					hash: "a".repeat(64),
					start_line: 2,
					end_line: 2,
					quote: "Association observed in cell culture.",
				},
			],
			supportAssessment: "model-asserted-unreviewed",
			provenanceChecked: true,
			scientificallyVerified: false,
		},
	],
	readReceipts: [
		{
			receiptId: "read-one",
			path: "source.md",
			sha256: "a".repeat(64),
			startLine: 1,
			endLine: 3,
			text: "Study\nAssociation observed in cell culture.\nNo clinical evidence.",
		},
	],
};

it("preserves interpretation and binds the returned memory claim to the actual body/source", () => {
	const claims = deliveryMemoryClaims(
		[
			{
				bindingId: "claim-1",
				subject: "cells",
				predicate: "association",
				relation: "interpretation",
				sourcePath: "source.md",
				sourceHash: "a".repeat(64),
			},
		],
		prepared,
	);
	expect(claims[0]).toMatchObject({
		relation: "interpretation",
		claim: prepared.claims[0].claim,
		deliveryBodySha256: prepared.bodySha256,
	});
});

it("accepts paraphrases through reviewed mappings while rejecting a citation outside the mapped claim", () => {
	const packet = summaryReviewPacket(prepared, []);
	const review = {
		packetSha256: packet.packetSha256,
		bodySha256: packet.bodySha256,
		provider: "fixture",
		model: "test",
		usage: { input: 10 },
		memoryClaims: [],
		blocks: [
			{
				blockId: "block-1",
				role: "claim",
				assessment: "supported",
				claimIds: ["claim-1"],
				evidence: [
					{
						path: "source.md",
						sha256: "a".repeat(64),
						readReceiptId: "read-one",
						startLine: 2,
						endLine: 2,
					},
				],
				reason: "Port contract fixture; no scientific acceptance.",
			},
		],
	};
	expect(validateSummaryAssessment(review, packet)).toMatchObject({
		status: "model-assessed",
		usage: { input: 10 },
	});
	expect(() =>
		validateSummaryAssessment(
			{
				...review,
				blocks: [
					{
						...review.blocks[0],
						evidence: [{ ...review.blocks[0].evidence[0], startLine: 3, endLine: 3 }],
					},
				],
			},
			packet,
		),
	).toThrow("mapped claim");
	expect(() => validateSummaryAssessment({ ...review, blocks: [] }, packet)).toThrow("Incomplete");
});

const memory = {
	bindingId: "claim-1",
	subject: "cells",
	predicate: "association",
	relation: "observation",
	sourcePath: "source.md",
	sourceHash: "a".repeat(64),
	organism: "cultured cells",
	method: "observational comparison",
};
const reference = {
	path: "source.md",
	sha256: "a".repeat(64),
	readReceiptId: "read-one",
	startLine: 2,
	endLine: 2,
};
function memoryReview(packet: ResearchSummaryReviewPacket) {
	return {
		packetSha256: packet.packetSha256,
		bodySha256: packet.bodySha256,
		provider: "engineering-port",
		model: "no-scientific-acceptance",
		blocks: packet.blocks.map((block) => ({
			blockId: block.blockId,
			role: "claim",
			assessment: "supported",
			claimIds: ["claim-1"],
			evidence: [reference],
			reason: "Body support is assessed separately.",
		})),
		memoryClaims: packet.memoryClaims.map((claim) => ({
			bindingId: claim.bindingId,
			memoryClaimSha256: claim.memoryClaimSha256,
			assessment: "supported",
			evidence: [reference],
			reason: "Engineering port fixture for an independently assessed complete memory object.",
		})),
	};
}

it("rejects the observed online supported-body response without a separate memory-scope judgment", () => {
	const packet = summaryReviewPacket(
		prepared,
		deliveryMemoryClaims(
			[
				{
					...memory,
					organism: "human patients",
					method: "randomized clinical trial",
				},
			],
			prepared,
		),
	);
	const review = memoryReview(packet);
	const observed = {
		...review,
		blocks: review.blocks.map((block) => ({
			...block,
			role: observedScopeDrift.block.role,
			assessment: observedScopeDrift.block.assessment,
			reason: observedScopeDrift.block.reasonExcerpt,
		})),
	};
	delete (observed as Partial<typeof review>).memoryClaims;
	expect(observedScopeDrift.observedDelivery).toBe("committed");
	expect(observedScopeDrift.memoryClaimsAssessmentPresent).toBe(false);
	expect(() => validateSummaryAssessment(observed, packet)).toThrow(
		"Incomplete summary memory claim assessment",
	);
});

it.each(["contradicted", "out-of-scope", "unknown"])(
	"rejects %s memory scope even when every body block is supported",
	(assessment) => {
		const packet = summaryReviewPacket(prepared, deliveryMemoryClaims([memory], prepared));
		const review = memoryReview(packet);
		review.memoryClaims[0].assessment = assessment;
		review.memoryClaims[0].reason =
			"The body remains supported; this independent memory assessment does not.";
		expect(() => validateSummaryAssessment(review, packet)).toThrow(`claim-1 ${assessment}`);
	},
);

it("binds reviewed memory conditions, limitations and complete source spans to the exact object", () => {
	const normalized = deliveryMemoryClaims([memory], prepared);
	const packet = summaryReviewPacket(prepared, normalized);
	expect(packet.memoryClaims[0]).toMatchObject({
		limitations: "No clinical evidence.",
		startLine: 2,
		endLine: 2,
		method: "observational comparison",
	});
	const review = memoryReview(packet);
	expect(validateSummaryAssessment(review, packet).memoryClaims).toEqual(review.memoryClaims);
	expect(() => validateSummaryAssessment({ ...review, memoryClaims: [] }, packet)).toThrow(
		"Incomplete summary memory",
	);
	expect(() =>
		validateSummaryAssessment(
			{
				...review,
				memoryClaims: [{ ...review.memoryClaims[0], bindingId: "invented" }],
			},
			packet,
		),
	).toThrow("Invalid summary memory");
	expect(() =>
		validateSummaryAssessment(
			{
				...review,
				memoryClaims: [{ ...review.memoryClaims[0], memoryClaimSha256: "b".repeat(64) }],
			},
			packet,
		),
	).toThrow("object hash");
	expect(() =>
		validateSummaryAssessment(
			{
				...review,
				memoryClaims: [{ ...review.memoryClaims[0], evidence: [] }],
			},
			packet,
		),
	).toThrow("complete evidence");
	expect(() =>
		validateSummaryAssessment(
			{
				...review,
				memoryClaims: [
					{
						...review.memoryClaims[0],
						evidence: [{ ...reference, readReceiptId: "invented" }],
					},
				],
			},
			packet,
		),
	).toThrow("not read in this scope");
	expect(() => deliveryMemoryClaims([memory, memory], prepared)).toThrow("one memory claim per bindingId");
});

it("requires coverage of the complete memory source span, allowing multiple adjacent real read references", () => {
	const expanded = {
		...prepared,
		claims: [
			{
				...prepared.claims[0],
				sources: [{ ...prepared.claims[0].sources[0], end_line: 3 }],
			},
		],
	};
	const packet = summaryReviewPacket(expanded, deliveryMemoryClaims([memory], expanded));
	const review = memoryReview(packet);
	expect(() => validateSummaryAssessment(review, packet)).toThrow("complete evidence");
	review.memoryClaims[0].evidence.push({
		...reference,
		startLine: 3,
		endLine: 3,
	});
	expect(validateSummaryAssessment(review, packet).status).toBe("model-assessed");
});
