import { basename } from "node:path";
import type { KnowledgeConfigApi, KnowledgeBinding } from "../core/config.js";
import type { KnowledgeOwnerLifecycle } from "../core/owner-lifecycle.js";

export interface KnowledgeReadOwner extends KnowledgeOwnerLifecycle {
 config: Pick<KnowledgeConfigApi, "readKnowledgeBinding" | "withKnowledgeBinding">;
 services: { getKnowledgeService(binding?: KnowledgeBinding): Promise<{ request(operation: string, input?: object): Promise<any> }> };
}
import type { KnowledgeOverview, KnowledgeRecentNote, KnowledgeSearchHit, KnowledgeSearchInput, KnowledgeSearchResult, KnowledgeReadNoteInput, KnowledgeReadNoteResult, KnowledgeLinksInput, KnowledgeLinksResult, KnowledgeGraphInput, KnowledgeGraphResult, KnowledgeJobsInput, KnowledgeJobsResult, KnowledgeRecentByCategoryInput, KnowledgeRecentByCategoryResult } from "./contract.js";

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
	async function boundRead<T extends { revision: number }>(input: { revision: number }, project: string | null,
		read: (service: Awaited<ReturnType<KnowledgeReadOwner["services"]["getKnowledgeService"]>>) => Promise<T>) {
		return owner.run(async () => {
			const binding = await owner.config.readKnowledgeBinding({ fresh: true });
			if (!binding) throw new Error("No application knowledge Vault is bound");
			if (input.revision !== binding.revision) throw new Error("Knowledge binding changed; refresh before reading");
			const service = await owner.services.getKnowledgeService(binding);
			await service.request("reconcile");
			const value = await read(service);
			return owner.config.withKnowledgeBinding(binding, () => ({ ...value, bindingRevision: binding.revision, project }));
		});
	}
	async function readNote(input: KnowledgeReadNoteInput, project: string | null): Promise<KnowledgeReadNoteResult> {
		return boundRead(input, project, async service => {
			// Human UI reads deliberately bypass session ticket/evidence APIs.
			const note = await service.request("read", { path: input.path, project, startLine: input.startLine ?? 1, maxChars: 6000, reviewMaxChars: 1600 });
			if (input.expectedHash !== undefined && note.hash !== input.expectedHash) throw new Error("Note changed; refresh before continuing");
			if (note.missing) return { path: note.path, missing: true as const, revision: note.revision };
			const { path, title, kind, category, hash, text, startLine, endLine, totalLines, truncated, humanReview, pending, revision } = note;
			return { path, missing: false as const, title, kind, category, hash, text, startLine, endLine, totalLines, truncated, humanReview, pending, revision };
		});
	}
	const links = (input: KnowledgeLinksInput, project: string | null): Promise<KnowledgeLinksResult> =>
		boundRead(input, project, service => service.request("noteLinks", { path: input.path, project }));
	const graph = (input: KnowledgeGraphInput, project: string | null): Promise<KnowledgeGraphResult> =>
		boundRead(input, project, service => service.request("graph", { project, limit: input.limit ?? 200, view: input.view ?? "semantic", mergeMirrors: input.mergeMirrors ?? true }));
	const jobs = (input: KnowledgeJobsInput, project: string | null): Promise<KnowledgeJobsResult> =>
		boundRead(input, project, service => service.request("uiJobs", { project, offset: input.offset ?? 0, limit: input.limit ?? 20 }));
	const recentByCategory = (input: KnowledgeRecentByCategoryInput, project: string | null): Promise<KnowledgeRecentByCategoryResult> =>
		boundRead(input, project, service => service.request("recentByCategory", { project, limit: input.limit ?? 10 }));
	return { overview, search, readNote, links, graph, jobs, recentByCategory };
}
