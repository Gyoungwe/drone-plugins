import { afterEach, expect, it, vi } from "vitest";
import { configureKnowledgeHost } from "../src/core/runtime-host.js";
import { consumeKnowledgeReviewPreviewEntry } from "../src/core/ui-service.js";
import { reviewWikiWithModel } from "../src/core/wiki-model-review.js";

afterEach(() => configureKnowledgeHost({ consumeKnowledgeReviewPreview: consumeKnowledgeReviewPreviewEntry }));

it("validates foreground consent before the public compatibility adapter consumes a single-use preview", async () => {
	const consume = vi.fn(() => { throw new Error("actual preview lookup"); });
	configureKnowledgeHost({ consumeKnowledgeReviewPreview: consume });
	const input = { cwd: "/test-project", token: "single-use-preview", acknowledged: false, autoApply: false };
	const evaluate = vi.fn();
	await expect(reviewWikiWithModel(input, { evaluate, check: async () => {} })).rejects.toThrow("Confirm");
	expect(consume).not.toHaveBeenCalled();
	expect(evaluate).not.toHaveBeenCalled();
	const result = reviewWikiWithModel({ ...input, acknowledged: true }, { evaluate, check: async () => {} });
	expect(result).toBeInstanceOf(Promise);
	await expect(result).rejects.toThrow("actual preview lookup");
	expect(consume).toHaveBeenCalledExactlyOnceWith(input.cwd, input.token);
	expect(evaluate).not.toHaveBeenCalled();
});
