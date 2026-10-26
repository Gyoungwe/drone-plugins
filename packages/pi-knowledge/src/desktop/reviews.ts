import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { createWikiReviewReader } from "../core/wiki-review-reader.js";
import type { KnowledgeReadOwner } from "./read-model.js";
import type {
	KnowledgeReviewsInput,
	KnowledgeReviewsResult,
	KnowledgePreviewReviewInput,
	KnowledgePreviewReviewResult,
} from "./contract.js";

/** Pending proposal JSON remains plugin-owned; UI reads never mint write/evidence tickets. */
export function createKnowledgeReviewReads(
	owner: KnowledgeReadOwner,
	capabilities: PluginRuntimeCapabilities,
	root: string,
) {
	const storage = {
		async read(path: string) {
			const result = (await capabilities.call("state.readJson", {
				root,
				path,
			})) as { kind: "missing" } | { kind: "value"; value: unknown };
			if (result.kind === "missing") return undefined;
			if (Buffer.byteLength(JSON.stringify(result.value)) > 256 * 1024)
				throw new Error("Wiki proposal exceeds its storage budget");
			return result.value;
		},
		async list(path: string) {
			const entries = (await capabilities.call("state.list", {
				root,
				path,
			})) as { name: string; kind: string }[];
			return entries
				.filter((entry) => entry.kind === "file")
				.map((entry) => entry.name);
		},
	};
	const reader = createWikiReviewReader(storage, async (service, path) => {
		const note = await service.request("read", {
			path,
			project: service.project,
			maxChars: 1,
			reviewMaxChars: 1,
		});
		return note.missing ? null : { hash: note.hash };
	});
	async function bound<T>(
		revision: number,
		read: (
			binding: NonNullable<
				Awaited<
					ReturnType<KnowledgeReadOwner["config"]["readKnowledgeBinding"]>
				>
			>,
		) => Promise<T>,
	) {
		return owner.run(async () => {
			const binding = await owner.config.readKnowledgeBinding({ fresh: true });
			if (!binding) throw new Error("No application knowledge Vault is bound");
			if (binding.revision !== revision)
				throw new Error(
					"Knowledge binding changed; refresh before reading reviews",
				);
			const result = await read(binding);
			return owner.config.withKnowledgeBinding(binding, () => result);
		});
	}
	return {
		reviews(
			input: KnowledgeReviewsInput,
			project: string | null,
		): Promise<KnowledgeReviewsResult> {
			return bound(input.revision, async (binding) => {
				const offset = input.offset ?? 0,
					limit = input.limit ?? 12;
				if (project === null)
					return {
						bindingRevision: binding.revision,
						project,
						items: [],
						problems: [],
						total: 0,
						offset,
						nextOffset: null,
					};
				const { items, problems } = await reader.listWikiProposals(
					{ binding },
					project,
				);
				return {
					bindingRevision: binding.revision,
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
			return bound(input.revision, async (binding) => {
				if (project === null)
					throw new Error(
						"Select a project session to preview a Wiki proposal",
					);
				const service = await owner.services.getKnowledgeService(binding);
				await service.request("reconcile");
				const preview = await reader.previewWikiProposal(
					{ binding, project, request: service.request.bind(service) },
					input.id,
					project,
				);
				if (preview.proposalHash !== input.expectedProposalHash)
					throw new Error("Wiki proposal changed; refresh before previewing");
				return { ...preview, bindingRevision: binding.revision };
			});
		},
	};
}
