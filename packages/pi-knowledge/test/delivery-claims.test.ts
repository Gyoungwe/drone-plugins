import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { summaryDeliveryClaims } from "../src/core/delivery-claims.js";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
it("only consumes the exact claims/body/source version returned by the reviewed delivery", () => {
	const bodySha256 = digest("Limited observation.\n");
	const claim = {
		bindingId: "claim-one",
		claim: "Limited observation.",
		deliveryBodySha256: bodySha256,
		sourcePath: "Library/Papers/one.md",
		sourceHash: "a".repeat(64),
	};
	const details = {
		claims: [claim],
		delivery_receipt: {
			version: 1,
			bodySha256,
			memoryClaimsSha256: digest(JSON.stringify([claim])),
			semanticAssessment: {
				status: "model-assessed",
				memoryClaims: [
					{
						bindingId: claim.bindingId,
						memoryClaimSha256: digest(JSON.stringify(claim)),
						assessment: "supported",
						evidence: [
							{
								path: claim.sourcePath,
								sha256: claim.sourceHash,
								readReceiptId: "read-one",
							},
						],
					},
				],
			},
			sources: [
				{
					path: claim.sourcePath,
					sha256: claim.sourceHash,
					readReceiptIds: ["read-one"],
				},
			],
		},
	};
	expect(summaryDeliveryClaims(details, "Limited observation.")).toEqual([claim]);
	expect(() => summaryDeliveryClaims(details, "A broader claim.")).toThrow("current, reviewed");
	expect(() =>
		summaryDeliveryClaims(
			{ ...details, claims: [{ ...claim, claim: "Different metadata" }] },
			"Limited observation.",
		),
	).toThrow("differ");
	expect(() =>
		summaryDeliveryClaims(
			{
				...details,
				delivery_receipt: {
					...details.delivery_receipt,
					semanticAssessment: { status: "not-reviewed" },
				},
			},
			"Limited observation.",
		),
	).toThrow("reviewed");
	expect(() =>
		summaryDeliveryClaims(
			{
				...details,
				delivery_receipt: {
					...details.delivery_receipt,
					semanticAssessment: { status: "model-assessed" },
				},
			},
			"Limited observation.",
		),
	).toThrow("separate assessment");
	const memoryReview = details.delivery_receipt.semanticAssessment.memoryClaims[0];
	for (const bad of [
		{ ...memoryReview, assessment: "out-of-scope" },
		{ ...memoryReview, memoryClaimSha256: "b".repeat(64) },
	])
		expect(() =>
			summaryDeliveryClaims(
				{
					...details,
					delivery_receipt: {
						...details.delivery_receipt,
						semanticAssessment: {
							status: "model-assessed",
							memoryClaims: [bad],
						},
					},
				},
				"Limited observation.",
			),
		).toThrow("exact supported scope");
	expect(() =>
		summaryDeliveryClaims(
			{
				...details,
				delivery_receipt: {
					...details.delivery_receipt,
					semanticAssessment: {
						status: "model-assessed",
						memoryClaims: [
							{
								...memoryReview,
								evidence: [{ ...memoryReview.evidence[0], readReceiptId: "invented" }],
							},
						],
					},
				},
			},
			"Limited observation.",
		),
	).toThrow("delivered read reference");
});
