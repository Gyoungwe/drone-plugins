import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { createWikiReviewReader } from "../core/wiki-review-reader.js";
import type { KnowledgeReadOwner } from "./read-model.js";
import { createHash } from "node:crypto";
import type {
	KnowledgeApplyReviewInput,
	KnowledgeApplyReviewResult,
	KnowledgeRejectReviewInput,
	KnowledgeRejectReviewResult,
} from "./contract.js";

/** Host-authorized terminal review write. Rejection retains an immutable record in pending/ and is hidden from pending lists. */
export function createKnowledgeReviewWrites(
	owner: KnowledgeReadOwner,
	capabilities: PluginRuntimeCapabilities,
	stateRoot: string,
	filesRoot: string | null,
	canWriteState: boolean,
	canWriteFiles: boolean,
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
	const readFile = async (path: string): Promise<{ text: string; sha256: string } | null> => {
		if (filesRoot === null) throw new Error("Configured Vault file access is unavailable");
		try {
			const result = (await capabilities.call("files.readText", { root: filesRoot, path })) as {
				text: string;
				sha256: string;
			};
			return result;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	};
	const reader = createWikiReviewReader(storage, async (_service, path) => {
		const note = await readFile(path);
		return note ? { hash: note.sha256 } : null;
	});
	const statePath = (vaultId: string, area: "pending" | "reviewed", id: string) =>
		`${vaultId}/wiki-review/${area}/${id}.json`;
	const reviewed = (proposal: Record<string, unknown>) => ({
		...proposal,
		status: "applied",
		reviewedAt: Date.now(),
		reviewMethod: "human",
		humanReviewed: true,
		scientificallyVerified: false,
	});
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
		apply(
			input: KnowledgeApplyReviewInput,
			project: string | null,
		): Promise<KnowledgeApplyReviewResult> {
			if (!canWriteState || !canWriteFiles)
				throw new Error("Configured Vault write permission is required");
			if (filesRoot === null) throw new Error("Configured Vault file access is unavailable");
			return owner.run(async () => {
				const binding = await owner.config.readKnowledgeBinding({ fresh: true });
				if (!binding) throw new Error("No application knowledge Vault is bound");
				if (binding.revision !== input.revision)
					throw new Error("Knowledge binding changed; refresh before reviewing");
				if (project === null) throw new Error("Select a project session to apply a Wiki proposal");
				const service = { binding };
				const preview = await reader.previewWikiProposal(service, input.id, project);
				if (preview.proposalHash !== input.expectedProposalHash)
					throw new Error("Wiki proposal changed; refresh before reviewing");
				if (!preview.canApply) throw new Error("Wiki proposal is stale or no longer applicable");
				const proposal = await reader.loadProposal(service, input.id, project);
				const current = await readFile(proposal.path);
				if ((current?.sha256 ?? null) !== proposal.beforeHash)
					throw new Error("Wiki changed after preview; no user edits were overwritten");
				const parent = proposal.path.includes("/") ? proposal.path.slice(0, proposal.path.lastIndexOf("/")) : ".";
				await capabilities.call("files.ensureDirectory", { root: filesRoot, path: parent });
				await capabilities.call("files.writeText", {
					root: filesRoot,
					path: proposal.path,
					text: proposal.after,
					expectedHash: proposal.beforeHash,
				});
				const written = await readFile(proposal.path);
				if (!written || written.sha256 !== proposal.afterHash)
					throw new Error("Vault write readback did not match the reviewed proposal");
				const pendingPath = statePath(binding.vaultId, "pending", proposal.id);
				const pending = (await capabilities.call("state.readJson", { root: stateRoot, path: pendingPath })) as
					| { kind: "missing"; version: null }
					| { kind: "value"; value: unknown; version: string };
				if (pending.kind === "missing") throw new Error("Wiki proposal disappeared; refresh before reviewing");
				await capabilities.call("state.writeJson", {
					root: stateRoot,
					path: statePath(binding.vaultId, "reviewed", proposal.id),
					value: reviewed(proposal as unknown as Record<string, unknown>),
					expectedVersion: null,
				});
				await capabilities.call("state.removeJson", {
					root: stateRoot,
					path: pendingPath,
					expectedVersion: pending.version,
				});
				return {
					id: proposal.id,
					status: "applied",
					path: proposal.path,
					vaultWritten: true,
					reviewRecorded: true,
					indexed: false,
				};
			});
		},
	};
}
