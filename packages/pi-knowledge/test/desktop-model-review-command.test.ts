import { expect, it } from "vitest";
import { parseModelReviewCommandInput } from "../src/desktop/model-review.js";
const input = {
	id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
	expectedProposalHash: "a".repeat(64),
	acknowledged: true,
	autoApply: false,
};
it("parses an explicit exact candidate and cost/data consent without accepting a caller identity", () => {
	expect(parseModelReviewCommandInput(JSON.stringify(input))).toEqual(input);
	expect(
		parseModelReviewCommandInput(
			JSON.stringify({ ...input, profile: "knowledge-wiki-reviewer", autoApply: true }),
		),
	).toMatchObject({ profile: "knowledge-wiki-reviewer", autoApply: true });
	for (const invalid of [
		{ ...input, acknowledged: false },
		{ ...input, autoApply: "yes" },
		{ ...input, cwd: "/another-project" },
		{ ...input, profile: "unknown-profile" },
	])
		expect(() => parseModelReviewCommandInput(JSON.stringify(invalid))).toThrow("exact proposal");
});
it("does not quote raw malformed command arguments into its error", () => {
	const body = "PRIVATE_SYNTHETIC_ARGUMENT";
	let error: unknown;
	try {
		parseModelReviewCommandInput(body);
	} catch (cause) {
		error = cause;
	}
	expect(error).toBeInstanceOf(Error);
	expect((error as Error).message).not.toContain(body);
});
