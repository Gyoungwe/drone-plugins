import type { PluginModelSelection } from "@gyoungwe/plugin-api/runtime";
import { Compile } from "typebox/compile";
import { expect, it } from "vitest";
import { modelReviewInfoResultSchema } from "../src/desktop/contract.js";

const selection: PluginModelSelection = {
	provider: "host-provider",
	model: "host-model",
	thinkingLevel: "low",
	optionalProfile: "knowledge-wiki-reviewer",
	inheritedThinking: "nearest-supported",
};

it("accepts a host-shaped selection with no previous model review", () => {
	expect(Compile(modelReviewInfoResultSchema).Check({ selection, lastReview: null })).toBe(true);
});

it.each([
	{ provider: "host-provider", model: "host-model", thinkingLevel: "low" },
	{ ...selection, profile: "knowledge-wiki-reviewer" },
])("accepts optional selection metadata: %j", (selection) => {
	expect(Compile(modelReviewInfoResultSchema).Check({ selection, lastReview: null })).toBe(true);
});

it("rejects an unknown selection field", () => {
	const result = { selection: { ...selection, unknown: true }, lastReview: null };
	expect(Compile(modelReviewInfoResultSchema).Check(result)).toBe(false);
});

it("rejects an unsupported inherited thinking policy", () => {
	const result = { selection: { ...selection, inheritedThinking: "other" }, lastReview: null };
	expect(Compile(modelReviewInfoResultSchema).Check(result)).toBe(false);
});
