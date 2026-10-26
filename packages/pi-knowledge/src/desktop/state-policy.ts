import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import type {
	KnowledgeReviewPolicyStorage,
	ReviewPolicyDocument,
} from "../core/review-policy.js";

export function createBrokerReviewPolicyStorage(
	capabilities: PluginRuntimeCapabilities,
	root: string,
): KnowledgeReviewPolicyStorage {
	return {
		async read() {
			try {
				return (await capabilities.call("state.readJson", {
					root,
					path: "review-policy.json",
				})) as ReviewPolicyDocument;
			} catch (error) {
				if ((error as { code?: string }).code !== "ESTATECORRUPTED")
					throw error;
				// Damaged JSON is a visible strict policy; authorization failures still reject.
				return { kind: "corrupt", version: null };
			}
		},
		write: (value, expectedVersion) =>
			capabilities.call("state.writeJson", {
				root,
				path: "review-policy.json",
				value,
				expectedVersion,
			}) as Promise<ReviewPolicyDocument>,
	};
}
