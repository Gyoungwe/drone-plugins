import type {
	PluginRuntimeContext,
	PluginRuntimeFactoryContext,
	PluginRuntimeOperation,
} from "@gyoungwe/plugin-api/runtime";
import {
	applyReviewInputSchema,
	applyReviewResultSchema,
	type KnowledgeApplyReviewInput,
	type KnowledgeModelReviewInfoInput,
	type KnowledgeModelReviewInput,
	type KnowledgePreviewReviewInput,
	type KnowledgeRejectReviewInput,
	type KnowledgeReviewHistoryInput,
	type KnowledgeReviewsInput,
	type KnowledgeSetReviewPolicyInput,
	type KnowledgeSetSemanticSettingsInput,
	type KnowledgeUndoReviewInput,
	modelReviewInfoInputSchema,
	modelReviewInfoResultSchema,
	modelReviewInputSchema,
	modelReviewResultSchema,
	preferencesInputSchema,
	preferencesResultSchema,
	previewReviewInputSchema,
	previewReviewResultSchema,
	rejectReviewInputSchema,
	rejectReviewResultSchema,
	reviewHistoryInputSchema,
	reviewHistoryResultSchema,
	reviewsInputSchema,
	reviewsResultSchema,
	semanticPreferencesInputSchema,
	semanticPreferencesResultSchema,
	setReviewPolicyInputSchema,
	setSemanticSettingsInputSchema,
	undoReviewInputSchema,
	undoReviewResultSchema,
} from "./contract.js";
import type { createKnowledgeModelReviewModel } from "./model-review.js";
import type { createKnowledgePreferences } from "./preferences.js";
import type { createKnowledgeReviewModel } from "./reviews.js";
import type { createKnowledgeSemanticPreferences } from "./semantic-preferences.js";
import type { createKnowledgeSpecialistPreferences } from "./specialist-preferences.js";
import {
	type KnowledgeSetSpecialistSettingsInput,
	setSpecialistSettingsInputSchema,
	specialistPreferencesInputSchema,
	specialistPreferencesResultSchema,
} from "./specialist-preferences-contract.js";

interface KnowledgeReviewOperationsOptions {
	context: Pick<PluginRuntimeFactoryContext, "events">;
	modelReviews: ReturnType<typeof createKnowledgeModelReviewModel>;
	reviews: ReturnType<typeof createKnowledgeReviewModel>;
	preferences: ReturnType<typeof createKnowledgePreferences>;
	semanticPreferences: ReturnType<typeof createKnowledgeSemanticPreferences>;
	specialistPreferences: ReturnType<typeof createKnowledgeSpecialistPreferences>;
	callerProject: (call: PluginRuntimeContext) => Promise<string | null>;
}

export function createKnowledgeReviewOperations(options: KnowledgeReviewOperationsOptions) {
	return {
		...modelReviewOperations(options),
		...semanticSettingsOperations(options),
		...specialistSettingsOperations(options),
		...proposalReviewOperations(options),
		...reviewPolicyOperations(options),
	};
}

function modelReviewOperations({
	context,
	modelReviews,
	reviews,
	callerProject,
}: KnowledgeReviewOperationsOptions) {
	return {
		modelReviewInfo: {
			inputSchema: modelReviewInfoInputSchema,
			resultSchema: modelReviewInfoResultSchema,
			effect: "read",
			execute: async (input, call) =>
				modelReviews.info(input as KnowledgeModelReviewInfoInput, await callerProject(call), call),
		},
		modelReview: {
			inputSchema: modelReviewInputSchema,
			resultSchema: modelReviewResultSchema,
			effect: "write",
			execute: async (input, call) => {
				const result = await modelReviews.review(
					input as KnowledgeModelReviewInput,
					() => callerProject(call),
					call,
				);
				context.events.changed();
				return result;
			},
		},
		reviewHistory: {
			inputSchema: reviewHistoryInputSchema,
			resultSchema: reviewHistoryResultSchema,
			effect: "read",
			execute: async (input, call) =>
				reviews.history(input as KnowledgeReviewHistoryInput, await callerProject(call)),
		},
		undoReview: {
			inputSchema: undoReviewInputSchema,
			resultSchema: undoReviewResultSchema,
			effect: "write",
			execute: async (input, call) =>
				reviews.undoReview(input as KnowledgeUndoReviewInput, await callerProject(call)),
		},
	} satisfies Record<string, PluginRuntimeOperation>;
}

function semanticSettingsOperations({ context, semanticPreferences }: KnowledgeReviewOperationsOptions) {
	return {
		semanticSettings: {
			inputSchema: semanticPreferencesInputSchema,
			resultSchema: semanticPreferencesResultSchema,
			effect: "read",
			execute: () => semanticPreferences.read(),
		},
		setSemanticSettings: {
			inputSchema: setSemanticSettingsInputSchema,
			resultSchema: semanticPreferencesResultSchema,
			effect: "write",
			execute: async (input) => {
				const saved = await semanticPreferences.write(input as KnowledgeSetSemanticSettingsInput);
				context.events.changed();
				return saved;
			},
		},
	} satisfies Record<string, PluginRuntimeOperation>;
}

function specialistSettingsOperations({ context, specialistPreferences }: KnowledgeReviewOperationsOptions) {
	return {
		specialistSettings: {
			inputSchema: specialistPreferencesInputSchema,
			resultSchema: specialistPreferencesResultSchema,
			effect: "read",
			execute: () => specialistPreferences.read(),
		},
		setSpecialistSettings: {
			inputSchema: setSpecialistSettingsInputSchema,
			resultSchema: specialistPreferencesResultSchema,
			effect: "write",
			execute: async (input) => {
				const saved = await specialistPreferences.write(input as KnowledgeSetSpecialistSettingsInput);
				context.events.changed();
				return saved;
			},
		},
	} satisfies Record<string, PluginRuntimeOperation>;
}

function proposalReviewOperations({ context, reviews, callerProject }: KnowledgeReviewOperationsOptions) {
	return {
		reviews: {
			inputSchema: reviewsInputSchema,
			resultSchema: reviewsResultSchema,
			effect: "read",
			execute: async (input, call) =>
				reviews.reviews(input as KnowledgeReviewsInput, await callerProject(call)),
		},
		previewReview: {
			inputSchema: previewReviewInputSchema,
			resultSchema: previewReviewResultSchema,
			effect: "read",
			execute: async (input, call) =>
				reviews.previewReview(input as KnowledgePreviewReviewInput, await callerProject(call)),
		},
		rejectReview: {
			inputSchema: rejectReviewInputSchema,
			resultSchema: rejectReviewResultSchema,
			effect: "write",
			execute: async (input, call) => {
				const result = await reviews.rejectReview(
					input as KnowledgeRejectReviewInput,
					await callerProject(call),
				);
				context.events.changed();
				return result;
			},
		},
		applyReview: {
			inputSchema: applyReviewInputSchema,
			resultSchema: applyReviewResultSchema,
			effect: "write",
			execute: async (input, call) => {
				const result = await reviews.applyReview(
					input as KnowledgeApplyReviewInput,
					await callerProject(call),
				);
				context.events.changed();
				return result;
			},
		},
	} satisfies Record<string, PluginRuntimeOperation>;
}

function reviewPolicyOperations({ context, preferences }: KnowledgeReviewOperationsOptions) {
	return {
		preferences: {
			inputSchema: preferencesInputSchema,
			resultSchema: preferencesResultSchema,
			effect: "read",
			execute: () => preferences.read(),
		},
		setReviewPolicy: {
			inputSchema: setReviewPolicyInputSchema,
			resultSchema: preferencesResultSchema,
			effect: "write",
			execute: async (input) => {
				const saved = await preferences.write(input as KnowledgeSetReviewPolicyInput);
				context.events.changed();
				return saved;
			},
		},
	} satisfies Record<string, PluginRuntimeOperation>;
}
