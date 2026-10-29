import { basename } from "node:path";
import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { createStoredKnowledgeReviewPolicy } from "../core/review-policy.js";
import type { KnowledgeReadOwner } from "./read-model.js";
import type {
	KnowledgePreferences,
	KnowledgeSetReviewPolicyInput,
} from "./contract.js";
import { createBrokerReviewPolicyStorage } from "./state-policy.js";

/** The policy algorithm is shared with CLI; Desktop authority comes from its state handle. */
export function createKnowledgePreferences(
	owner: KnowledgeReadOwner,
	capabilities: PluginRuntimeCapabilities,
	state: string,
	canWriteState: boolean,
) {
	const policy = createStoredKnowledgeReviewPolicy(
		createBrokerReviewPolicyStorage(capabilities, state),
		() => false,
	);
	async function snapshot(): Promise<KnowledgePreferences> {
		const binding = await owner.config.readKnowledgeBinding({ fresh: true });
		return {
			binding: binding
				? {
						vaultId: binding.vaultId,
						revision: binding.revision,
						label: basename(binding.vault),
						vault: binding.vault,
						profile: binding.profile,
						depositMode: binding.depositMode,
						subagentPolicy: binding.subagentPolicy,
						updatedAt: binding.updatedAt,
					}
				: null,
			canWriteState,
			reviewPolicy: await policy.readReviewPolicy(),
		};
	}
	return {
		read: () => owner.run(snapshot),
		write: (input: KnowledgeSetReviewPolicyInput) =>
			owner.run(async () => {
				if (!canWriteState)
					throw new Error("Application-state write permission is required");
				const binding = await owner.config.readKnowledgeBinding({
					fresh: true,
				});
				if (!binding || binding.revision !== input.bindingRevision)
					throw new Error("Knowledge binding changed; refresh before saving");
				await owner.config.withKnowledgeBinding(binding, () =>
					policy.saveReviewMode(input.mode, input.expectedVersion),
				);
				return owner.config.withKnowledgeBinding(binding, snapshot);
			}),
	};
}
