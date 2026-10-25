import { describe, expect, it } from "vitest";
import { compareClaims, type KnowledgeClaim } from "../src/core/index.js";

const claim = (overrides: Partial<KnowledgeClaim> = {}): KnowledgeClaim => ({
	claim: "Wg activates wing-margin growth",
	subject: "Wg",
	predicate: "activates",
	value: "wing-margin growth",
	organism: "Drosophila melanogaster",
	tissue: "wing disc",
	stage: "third instar",
	method: "RNAi",
	relation: "observation",
	...overrides,
});

describe("structured knowledge claim comparison", () => {
	it("retains missing conditions and unknown directions as unresolved", () => {
		expect(compareClaims(claim(), claim({ organism: undefined }))).toMatchObject({
			relation: "unresolved",
			blocking: false,
			missingConditions: ["organism"],
		});
		expect(
			compareClaims(
				claim({ predicate: "relates to", value: "growth" }),
				claim({ predicate: "relates to", value: "growth" }),
			),
		).toMatchObject({ relation: "unresolved", blocking: false });
	});
	it("recognizes increases/decreases and does not turn not-increased into a decrease", () => {
		const increased = claim({ predicate: "expression", value: "increases expression" });
		expect(compareClaims(increased, { ...increased, value: "decreases expression" })).toMatchObject({
			relation: "contradicts",
			blocking: true,
		});
		expect(compareClaims(increased, { ...increased, value: "does not increase expression" })).toMatchObject({
			relation: "unresolved",
			blocking: false,
		});
	});
	it("compares explicit endpoint and direction without inventing missing endpoints", () => {
		const previous = claim({ endpoint: "transcript abundance", direction: "increase" });
		expect(
			compareClaims(previous, claim({ endpoint: "protein abundance", direction: "decrease" })),
		).toMatchObject({ relation: "unresolved", blocking: false });
		expect(compareClaims(previous, claim({ direction: "decrease" }))).toMatchObject({
			relation: "unresolved",
			missingConditions: ["endpoint"],
		});
		expect(compareClaims(claim({ value: "促进生长" }), claim({ value: "不促进生长" }))).toMatchObject({
			relation: "contradicts",
		});
	});
	it("only calls same-condition opposite observations a blocking contradiction", () => {
		const result = compareClaims(
			claim(),
			claim({
				claim: "Wg does not activate wing-margin growth",
				value: "does not activate wing-margin growth",
			}),
		);
		expect(result).toMatchObject({ relation: "contradicts", confidence: "high", blocking: true });
	});

	it("treats different stages as refinement or unresolved, never as a contradiction", () => {
		const result = compareClaims(claim(), claim({ stage: "pupal" }));
		expect(result.relation).toBe("unresolved");
		expect(result.blocking).toBe(false);
	});

	it("keeps interpretation versus observation separate", () => {
		const result = compareClaims(
			claim(),
			claim({ relation: "interpretation", claim: "Wg may activate wing-margin growth" }),
		);
		expect(result.relation).toBe("unresolved");
		expect(result.blocking).toBe(false);
	});

	it("preserves legacy claim equivalence when case folding introduces a combining mark", () => {
		const result = compareClaims(
			claim({ subject: "İ" }),
			claim({ subject: "i", value: "does not activate wing-margin growth" }),
		);
		expect(result).toEqual({
			relation: "contradicts",
			confidence: "high",
			reason: "同一对象、同一条件、同一观察命题的方向相反。",
			blocking: true,
		});
	});
});
