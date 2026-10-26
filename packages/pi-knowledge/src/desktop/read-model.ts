import { basename } from "node:path";
import type { KnowledgeConfigApi, KnowledgeBinding } from "../core/config.js";
import type { KnowledgeOwnerLifecycle } from "../core/owner-lifecycle.js";

export interface KnowledgeReadOwner extends KnowledgeOwnerLifecycle {
 config: Pick<KnowledgeConfigApi, "readKnowledgeBinding" | "withKnowledgeBinding">;
 services: { getKnowledgeService(binding?: KnowledgeBinding): Promise<{ request(operation: string, input?: object): Promise<any> }> };
}
import type { KnowledgeOverview, KnowledgeRecentNote, KnowledgeSearchHit, KnowledgeSearchInput, KnowledgeSearchResult } from "./contract.js";

/** The same index used by native tools. Caller identity is resolved outside this domain model. */
export function createKnowledgeReadModel(owner: KnowledgeReadOwner) {
	async function overview(project: string | null): Promise<KnowledgeOverview> {
		return owner.run(async () => {
			const binding = await owner.config.readKnowledgeBinding({ fresh: true });
			if (!binding) return { state: "unconfigured", binding: null, project, index: null, recentNotes: [] };
			const service = await owner.services.getKnowledgeService(binding);
			await service.request("reconcile");
			const recent = await service.request("recentNotes", { project, limit: 10 });
			const index = await service.request("status", { flushPending: true });
			return owner.config.withKnowledgeBinding(binding, () => ({
				state: "bound" as const,
				binding: { vaultId: binding.vaultId, revision: binding.revision, label: basename(binding.vault) },
				project,
				index: { revision: index.revision, coverage: index.coverage, noteCount: index.noteCount,
					pendingChanges: index.pendingChanges, lastReconciledAt: index.lastReconciledAt },
				recentNotes: recent.items.map(({ path, title, kind, updatedAt }: KnowledgeRecentNote) => ({ path, title, kind, updatedAt })),
			}));
		});
	}
	async function search(input: KnowledgeSearchInput, project: string | null): Promise<KnowledgeSearchResult> {
		return owner.run(async () => {
			const binding = await owner.config.readKnowledgeBinding({ fresh: true });
			if (!binding) throw new Error("No application knowledge Vault is bound");
			if (input.revision !== binding.revision) throw new Error("Knowledge binding changed; refresh before searching");
			const service = await owner.services.getKnowledgeService(binding);
			await service.request("reconcile");
			const found = await service.request("search", { query: input.query, project, limit: input.limit ?? 6 });
			return owner.config.withKnowledgeBinding(binding, () => ({
				query: found.query, revision: found.revision, bindingRevision: binding.revision,
				coverage: found.coverage, complete: found.complete,
				hits: found.hits.map(({ path, title, kind, hash, text, startLine, endLine }: KnowledgeSearchHit) =>
					({ path, title, kind, hash, text, startLine, endLine })),
			}));
		});
	}
	return { overview, search };
}
