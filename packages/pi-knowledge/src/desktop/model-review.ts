import type { PluginModelSelection, PluginRuntimeContext } from "@gyoungwe/plugin-api/runtime";
import type { createKnowledgeModelReview } from "../core/wiki-model-review.js";
import { generateWikiModelReview } from "../core/wiki-model-review.js";
import { createKnowledgeReviewContext, type KnowledgeReviewOwner } from "./reviews.js";
import type {
	KnowledgeModelReviewInput,
	KnowledgeModelReviewInfoInput,
	KnowledgeModelReviewResult,
	KnowledgeModelReviewInfo,
} from "./contract.js";

/** One foreground operation on the same owner and scoped Wiki IO as human review/history/undo. */
export function createKnowledgeModelReviewModel(
	owner: KnowledgeReviewOwner & { modelReview: ReturnType<typeof createKnowledgeModelReview> },
	canWriteState: boolean,
	canWriteFiles: boolean,
) {
	const { bound, requireWrite } = createKnowledgeReviewContext(owner, canWriteState, canWriteFiles);
	async function selection(
		call: PluginRuntimeContext,
		profile?: string,
	): Promise<PluginModelSelection> {
		if (call.scope.kind !== "session")
			throw new Error("Choose the originating live session before model review");
		return (await call.capabilities.call(
			"model.selection",
			profile === undefined ? {} : { profile },
		)) as PluginModelSelection;
	}
	return {
		info(
			input: KnowledgeModelReviewInfoInput,
			project: string | null,
			call: PluginRuntimeContext,
		): Promise<KnowledgeModelReviewInfo> {
			return bound(input.revision, project, async (service) => {
				const preview = await owner.wiki.previewWikiProposal(service, input.id, project);
				if (preview.proposalHash !== input.expectedProposalHash)
					throw new Error("Wiki proposal changed; refresh before model review");
				return {
					selection: await selection(call, input.profile),
					lastReview: await owner.modelReview.lastWikiModelReview(
						service,
						input.id,
						input.expectedProposalHash,
					),
				};
			});
		},
		review(
			input: KnowledgeModelReviewInput,
			project: string | null,
			call: PluginRuntimeContext,
		): Promise<KnowledgeModelReviewResult> {
			requireWrite(input.autoApply);
			return bound(input.revision, project, async (service) => {
				const initial = await selection(call, input.profile);
				const check = async () => {
					call.signal.throwIfAborted();
					const state = (await call.capabilities.call("session.inspect", null)) as {
						agentActive: boolean;
					};
					if (state.agentActive)
						throw new Error("Wait for the current conversation to finish before model review");
					const current = await selection(call, input.profile);
					if (
						current.provider !== initial.provider ||
						current.model !== initial.model ||
						current.thinkingLevel !== initial.thinkingLevel ||
						current.profile !== initial.profile
					)
						throw new Error("Model selection changed; review again before applying");
				};
				return owner.modelReview.reviewWikiWithModel(
					{
						service,
						project,
						id: input.id,
						hash: input.expectedProposalHash,
						binding: service.binding,
					},
					input,
					{
						signal: call.signal,
						check,
						evaluate: (request: unknown) =>
							generateWikiModelReview(call.capabilities, initial, request),
					},
				);
			});
		},
	};
}

/** A slash command is external user input; it never accepts caller identity or a filesystem path. */
export function parseModelReviewCommandInput(
	args: string,
): Omit<KnowledgeModelReviewInput, "revision"> {
	let input: unknown;
	try {
		input = JSON.parse(args);
	} catch {
		throw new Error(
			"Expected model-review command JSON; raw arguments are not included in diagnostics",
		);
	}
	if (!input || typeof input !== "object" || Array.isArray(input))
		throw new Error(
			"Expected JSON with id, expectedProposalHash, acknowledged:true and autoApply:boolean",
		);
	const value = input as Record<string, unknown>;
	if (
		Object.keys(value).some(
			(key) =>
				!["id", "expectedProposalHash", "acknowledged", "autoApply", "profile"].includes(key),
		) ||
		typeof value.id !== "string" ||
		!/^[0-9a-f-]{36}$/.test(value.id) ||
		typeof value.expectedProposalHash !== "string" ||
		!/^[0-9a-f]{64}$/.test(value.expectedProposalHash) ||
		value.acknowledged !== true ||
		typeof value.autoApply !== "boolean" ||
		(value.profile !== undefined && value.profile !== "knowledge-wiki-reviewer")
	)
		throw new Error(
			"Expected the exact proposal ID/hash, explicit cost/data acknowledgement and autoApply choice",
		);
	return {
		id: value.id,
		expectedProposalHash: value.expectedProposalHash,
		acknowledged: true,
		autoApply: value.autoApply,
		...(value.profile === undefined ? {} : { profile: "knowledge-wiki-reviewer" as const }),
	};
}
