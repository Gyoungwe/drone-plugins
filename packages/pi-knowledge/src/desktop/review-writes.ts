import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { createWikiReviewReader } from "../core/wiki-review-reader.js";
import type { KnowledgeReadOwner } from "./read-model.js";
import type { KnowledgeRejectReviewInput, KnowledgeRejectReviewResult } from "./contract.js";

/** Host-authorized terminal review write. Rejection retains an immutable record in pending/ and is hidden from pending lists. */
export function createKnowledgeReviewWrites(
	owner: KnowledgeReadOwner,
	capabilities: PluginRuntimeCapabilities,
	stateRoot: string,
	canWriteState: boolean,
) {
	const storage = {
		async read(path: string) {
			const result = (await capabilities.call("state.readJson", { root: stateRoot, path })) as
				| { kind: "missing"; version: null }
				| { kind: "value"; value: unknown; version: string };
			if (result.kind === "missing") return undefined;
			return result.value;
		},
		async list(_path: string) {
			throw new Error("Review writes do not list state");
		},
	};
	const reader = createWikiReviewReader(storage, async () => null);
	return {
		reject(input: KnowledgeRejectReviewInput, project: string | null): Promise<KnowledgeRejectReviewResult> {
			if (!canWriteState) throw new Error("Application-state write permission is required");
			return owner.run(async () => {
				const binding = await owner.config.readKnowledgeBinding({ fresh: true });
				if (!binding) throw new Error("No application knowledge Vault is bound");
				if (binding.revision !== input.revision) throw new Error("Knowledge binding changed; refresh before reviewing");
				if (project === null) throw new Error("Select a project session to review a Wiki proposal");
				const service = { binding };
				const proposal = await reader.loadProposal(service, input.id, project);
				if (proposal.proposalHash !== input.expectedProposalHash) throw new Error("Wiki proposal changed; refresh before reviewing");
				if (proposal.status !== "pending") throw new Error("Wiki proposal was already reviewed; refresh before reviewing");
				const current = await capabilities.call("state.readJson", {
					root: stateRoot,
					path: `${binding.vaultId}/wiki-review/pending/${proposal.id}.json`,
				}) as { kind: "missing"; version: null } | { kind: "value"; value: unknown; version: string };
				if (current.kind === "missing") throw new Error("Wiki proposal disappeared; refresh before reviewing");
				await capabilities.call("state.writeJson", {
					root: stateRoot,
					path: `${binding.vaultId}/wiki-review/pending/${proposal.id}.json`,
					value: { ...proposal, status: "rejected", reviewedAt: Date.now(), reviewMethod: "human", humanReviewed: true, scientificallyVerified: false },
					expectedVersion: current.version,
				});
				return { id: proposal.id, status: "rejected", vaultWritten: false, reviewRecorded: true };
			});
		},
	};
}
