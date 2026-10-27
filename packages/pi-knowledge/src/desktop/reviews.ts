import type { KnowledgeBinding } from "../core/config.js";
import type { createKnowledgeWikiReview } from "../core/wiki-review.js";
import type { KnowledgeReadOwner } from "./read-model.js";
import type {
	KnowledgeReviewsInput,
	KnowledgeReviewsResult,
	KnowledgePreviewReviewInput,
	KnowledgePreviewReviewResult,
	KnowledgeApplyReviewInput,
	KnowledgeApplyReviewResult,
	KnowledgeRejectReviewInput,
	KnowledgeRejectReviewResult,
	KnowledgeReviewHistoryInput,
	KnowledgeReviewHistoryResult,
	KnowledgeUndoReviewInput,
	KnowledgeUndoReviewResult,
} from "./contract.js";

type Wiki = ReturnType<typeof createKnowledgeWikiReview>;
type ReviewService = {
	binding: KnowledgeBinding;
	request(operation: string, input?: object): Promise<unknown>;
};
export interface KnowledgeReviewOwner extends KnowledgeReadOwner {
	wiki: Wiki;
}
/** UI and native callers use the same owner-owned review rules; UI never mints evidence tickets. */
export function createKnowledgeReviewModel(
	owner: KnowledgeReviewOwner,
	canWriteState: boolean,
	canWriteFiles: boolean,
) {
	async function bound<T>(
		revision: number,
		project: string | null,
		operation: (service: ReviewService) => Promise<T>,
	): Promise<T> {
		return owner.run(async () => {
			const binding = await owner.config.readKnowledgeBinding({ fresh: true });
			if (!binding) throw new Error("No application knowledge Vault is bound");
			if (binding.revision !== revision)
				throw new Error("Knowledge binding changed; refresh before reviewing");
			if (project === null) throw new Error("Select a project session to review Wiki proposals");
			const service = {
				binding,
				async request(operation: string, input?: object) {
					const index = await owner.services.getKnowledgeService(binding);
					return index.request(operation, input);
				},
			};
			return owner.config.withKnowledgeBinding(binding, () => operation(service));
		});
	}
	function requireWrite(files = false) {
		if (!canWriteState) throw new Error("Application-state write permission is required");
		if (files && !canWriteFiles) throw new Error("Configured Vault write permission is required");
	}
	return {
		async reviews(input: KnowledgeReviewsInput, project: string | null): Promise<KnowledgeReviewsResult> {
			if (project === null) {
				return owner.run(async () => {
					const binding = await owner.config.readKnowledgeBinding({ fresh: true });
					if (!binding || binding.revision !== input.revision)
						throw new Error("Knowledge binding changed; refresh before reviewing");
					return {
						bindingRevision: binding.revision,
						project,
						items: [],
						problems: [],
						total: 0,
						offset: 0,
						nextOffset: null,
					};
				});
			}
			return bound(input.revision, project, async (service) => {
				const { items, problems } = await owner.wiki.listWikiProposals(service, project);
				const offset = input.offset ?? 0,
					limit = input.limit ?? 12;
				return {
					bindingRevision: service.binding.revision,
					project,
					items: items.slice(offset, offset + limit),
					problems,
					total: items.length,
					offset,
					nextOffset: offset + limit < items.length ? offset + limit : null,
				};
			});
		},
		previewReview(
			input: KnowledgePreviewReviewInput,
			project: string | null,
		): Promise<KnowledgePreviewReviewResult> {
			return bound(input.revision, project, async (service) => {
				const preview = await owner.wiki.previewWikiProposal(service, input.id, project);
				if (preview.proposalHash !== input.expectedProposalHash)
					throw new Error("Wiki proposal changed; refresh before previewing");
				return { ...preview, bindingRevision: service.binding.revision };
			});
		},
		rejectReview(
			input: KnowledgeRejectReviewInput,
			project: string | null,
		): Promise<KnowledgeRejectReviewResult> {
			requireWrite();
			return bound(input.revision, project, async (service) => {
				const result = await owner.wiki.decideWikiProposal(
					service,
					input.id,
					project,
					input.expectedProposalHash,
					"reject",
				);
				if (result.alreadyReviewed)
					throw new Error("Wiki proposal was already reviewed; refresh before reviewing");
				return { id: result.id, status: "rejected", vaultWritten: false, reviewRecorded: true };
			});
		},
		applyReview(
			input: KnowledgeApplyReviewInput,
			project: string | null,
		): Promise<KnowledgeApplyReviewResult> {
			requireWrite(true);
			return bound(input.revision, project, async (service) => {
				const result = await owner.wiki.decideWikiProposal(
					service,
					input.id,
					project,
					input.expectedProposalHash,
					"apply",
				);
				if (result.alreadyReviewed)
					throw new Error("Wiki proposal was already reviewed; refresh before reviewing");
				const {
					id,
					status,
					path,
					vaultWritten,
					reviewRecorded,
					indexed,
					recovered,
					recordError,
					indexError,
				} = result;
				return {
					id,
					status,
					path,
					vaultWritten,
					reviewRecorded,
					indexed,
					recovered,
					recordError,
					indexError,
				};
			});
		},
		history(
			input: KnowledgeReviewHistoryInput,
			project: string | null,
		): Promise<KnowledgeReviewHistoryResult> {
			return bound(input.revision, project, async (service) => ({
				bindingRevision: service.binding.revision,
				project: project!,
				items: await owner.wiki.wikiHistory(service, project),
			}));
		},
		undoReview(input: KnowledgeUndoReviewInput, project: string | null): Promise<KnowledgeUndoReviewResult> {
			requireWrite(true);
			return bound(input.revision, project, (service) =>
				owner.wiki.undoWikiUpdate(service, project, input.id, input.expectedHash),
			);
		},
	};
}
