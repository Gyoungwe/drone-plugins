import { expect, it } from "vitest";
import {
	summaryBody,
	summaryHash,
	summaryReviewPacket,
	validateSummaryAssessment,
} from "../../src/core/research-delivery.js";

const source = "Six cultured samples showed an association.";
const claim = {
	id: "claim-1",
	claim: source,
	relationship: "direct",
	limitations: "Cell culture only; no clinical or causal inference.",
	sources: [
		{
			path: "paper.md",
			hash: summaryHash(source),
			start_line: 2,
			end_line: 2,
			read_receipt_id: "read-1",
		},
	],
};
function packet(markdown, relationship = "direct") {
	const binding = { ...claim, relationship };
	const body = summaryBody(markdown);
	return summaryReviewPacket(
		{
			runId: "run-a",
			evidenceRevision: 1,
			gateSha256: "a".repeat(64),
			claimsSha256: summaryHash(JSON.stringify([binding])),
			bodySha256: summaryHash(body),
			body,
			claims: [binding],
			readReceipts: [
				{
					receiptId: "read-1",
					path: "paper.md",
					sha256: summaryHash(source),
					startLine: 2,
					endLine: 2,
					text: source,
				},
			],
		},
		[],
	);
}
function assessment(packet, role, claimIds, evidence) {
	return {
		packetSha256: packet.packetSha256,
		bodySha256: packet.bodySha256,
		provider: "engineering-port",
		model: "none-not-a-model",
		memoryClaims: [],
		blocks: packet.blocks.map((block) => ({
			blockId: block.blockId,
			role,
			assessment: "supported",
			claimIds,
			evidence,
			reason: "Structural engineering fixture; no scientific verification.",
		})),
	};
}
const evidence = [
	{
		path: "paper.md",
		sha256: summaryHash(source),
		startLine: 2,
		endLine: 2,
		readReceiptId: "read-1",
	},
];

it.each([
	["navigation", "direct"],
	["limitation", "direct"],
	["navigation", "indirect"],
	["limitation", "indirect"],
])("a model's %s label cannot exempt an unbound %s paragraph", (role, relationship) => {
	const prepared = packet("The therapy cures all patients and increases survival by 40%.", relationship);
	expect(() => validateSummaryAssessment(assessment(prepared, role, [], []), prepared)).toThrow(
		"Every summary block",
	);
	expect(() => validateSummaryAssessment(assessment(prepared, role, [claim.id], []), prepared)).toThrow(
		"lacks evidence from its mapped claim",
	);
});
it("keeps faithful headings and limitations when each block maps its related read evidence", () => {
	const prepared = packet(
		"# Cultured-sample observations\n\nSix cultured samples showed an association.\n\nThe evidence is limited to cultured samples; no clinical or causal inference is made.",
	);
	const review = assessment(prepared, "claim", [claim.id], evidence);
	review.blocks[0].role = "navigation";
	review.blocks[2].role = "limitation";
	expect(validateSummaryAssessment(review, prepared).status).toBe("model-assessed");
});
it.each(["navigation", "limitation"])(
	"%s cannot cite unrelated read evidence instead of its mapped factual claim",
	(role) => {
		const prepared = packet("A limited observation.");
		prepared.readReceipts.push({
			receiptId: "read-other",
			path: "other.md",
			sha256: "b".repeat(64),
			startLine: 1,
			endLine: 1,
			text: "Unrelated.",
		});
		const wrong = [
			{
				path: "other.md",
				sha256: "b".repeat(64),
				startLine: 1,
				endLine: 1,
				readReceiptId: "read-other",
			},
		];
		expect(() => validateSummaryAssessment(assessment(prepared, role, [claim.id], wrong), prepared)).toThrow(
			"lacks evidence from its mapped claim",
		);
	},
);
