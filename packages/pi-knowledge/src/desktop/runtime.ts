import {
	reviewHistoryInputSchema,
	reviewHistoryResultSchema,
	undoReviewInputSchema,
	undoReviewResultSchema,
	type KnowledgeReviewHistoryInput,
	type KnowledgeUndoReviewInput,
} from "./contract.js";
import { createKnowledgeSemanticPreferences } from "./semantic-preferences.js";
import {
	semanticPreferencesInputSchema,
	semanticPreferencesResultSchema,
	setSemanticSettingsInputSchema,
	type KnowledgeSetSemanticSettingsInput,
} from "./contract.js";
import { createKnowledgeRuntimeHost } from "../core/runtime-host.js";
import { createKnowledgeServicePool } from "../core/service.js";
import { createStoredKnowledgeReviewPolicy } from "../core/review-policy.js";
import { createBrokerReviewPolicyStorage } from "./state-policy.js";
import { createBrokerSemanticSettings } from "./semantic-settings.js";
import { createResourceServiceTransportFactory } from "./service-transport.js";
import { createKnowledgeReviewModel } from "./reviews.js";
import { createKnowledgeWikiReview } from "../core/wiki-review.js";
import { createBrokerWikiReviewPorts } from "./review-storage.js";

import {
	reviewsInputSchema,
	reviewsResultSchema,
	previewReviewInputSchema,
	previewReviewResultSchema,
	rejectReviewInputSchema,
	rejectReviewResultSchema,
	applyReviewInputSchema,
	applyReviewResultSchema,
	type KnowledgeReviewsInput,
	type KnowledgePreviewReviewInput,
	type KnowledgeRejectReviewInput,
	type KnowledgeApplyReviewInput,
} from "./contract.js";
import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import type { PluginNativeRuntimeFactory } from "@gyoungwe/plugin-api/native";
import { parseKnowledgeBinding, projectIdentity, type KnowledgeBinding } from "../core/config.js";
import { createKnowledgeOwnerLifecycle } from "../core/owner-lifecycle.js";
import { createKnowledgeReadModel, type KnowledgeReadOwner } from "./read-model.js";
import { createKnowledgePreferences } from "./preferences.js";
import {
	preferencesInputSchema,
	preferencesResultSchema,
	setReviewPolicyInputSchema,
	type KnowledgeSetReviewPolicyInput,
} from "./contract.js";
import { createDesktopKnowledgeNativeSession } from "./native.js";
import {
	overviewInputSchema,
	overviewResultSchema,
	searchInputSchema,
	searchResultSchema,
	type KnowledgeSearchInput,
	readNoteInputSchema,
	readNoteResultSchema,
	linksInputSchema,
	linksResultSchema,
	graphInputSchema,
	graphResultSchema,
	jobsInputSchema,
	jobsResultSchema,
	recentByCategoryInputSchema,
	recentByCategoryResultSchema,
	type KnowledgeReadNoteInput,
	type KnowledgeLinksInput,
	type KnowledgeGraphInput,
	type KnowledgeJobsInput,
	type KnowledgeRecentByCategoryInput,
} from "./contract.js";

async function projectFor(
	capabilities: PluginRuntimeCapabilities,
	workspace: string | null,
): Promise<string | null> {
	if (workspace === null) return null;
	const { handle } = (await capabilities.call("roots.resolve", { path: workspace, kind: "files" })) as {
		handle: string;
	};
	let text: string;
	try {
		({ text } = (await capabilities.call("files.readText", {
			root: handle,
			path: ".pi/research-workspace.json",
		})) as { text: string });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return projectIdentity(workspace);
	}
	const document: unknown = JSON.parse(text);
	if (!document || typeof document !== "object" || Array.isArray(document))
		throw new Error("Invalid research workspace configuration");
	return projectIdentity(workspace, (document as Record<string, unknown>).knowledgeProjectId);
}

/** Desktop read-only slice: one granted index resource shared by UI and native tools. */
const createDesktopRuntime: PluginNativeRuntimeFactory = async (context) => {
	const states = context.resources.filter((resource) => resource.kind === "state");
	if (states.length !== 1)
		throw new Error("Knowledge runtime requires exactly one authorized application-state root");
	const state = states[0].handle;
	const fileRoots = context.resources.filter((resource) => resource.kind === "files");
	if (fileRoots.length > 1) throw new Error("Knowledge runtime requires at most one selected file root");
	if (!context.resourcesLifecycle)
		throw new Error("Knowledge services require the host resource shutdown barrier");
	async function readKnowledgeBinding(): Promise<KnowledgeBinding | null> {
		const response = (await context.capabilities.call("state.readJson", {
			root: state,
			path: "binding.json",
		})) as { kind: "missing" } | { kind: "value"; value: unknown };
		return response.kind === "missing" ? null : parseKnowledgeBinding(response.value);
	}
	const config: KnowledgeReadOwner["config"] = {
		readKnowledgeBinding,
		async withKnowledgeBinding(binding, operation) {
			const current = await readKnowledgeBinding();
			if (!current || current.vaultId !== binding.vaultId || current.revision !== binding.revision)
				throw new Error("Knowledge binding changed; refresh before reading");
			return operation();
		},
	};
	const host = createKnowledgeRuntimeHost();
	const semantic = createBrokerSemanticSettings(context.capabilities, state);
	const policy = createStoredKnowledgeReviewPolicy(
		createBrokerReviewPolicyStorage(context.capabilities, state),
		() => false,
	);
	const transports = createResourceServiceTransportFactory(context, state, context.resourcesLifecycle);
	const services = createKnowledgeServicePool(host, config, semantic, policy, transports);
	const lifecycle = createKnowledgeOwnerLifecycle({
		async dispose() {
			// No live-caller capability is created during shutdown. The host closes all
			// activation resources, then service views settle against that real barrier.
			await transports.dispose();
			await services.dispose();
		},
	});
	const wiki = createKnowledgeWikiReview(
		host,
		config,
		policy,
		{ invalidateKnowledgeUi: () => context.events.changed() },
		createBrokerWikiReviewPorts(context.capabilities, state),
	);
	const owner = { config, services, wiki, ...lifecycle };
	const reads = createKnowledgeReadModel(owner);
	const reviews = createKnowledgeReviewModel(
		owner,
		states[0].access === "read-write",
		fileRoots[0]?.access === "read-write",
	);
	const preferences = createKnowledgePreferences(
		owner,
		context.capabilities,
		state,
		states[0].access === "read-write",
	);
	const semanticPreferences = createKnowledgeSemanticPreferences(
		owner,
		semantic,
		states[0].access === "read-write",
	);
	return {
		operations: {
			reviewHistory: {
				inputSchema: reviewHistoryInputSchema,
				resultSchema: reviewHistoryResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reviews.history(
						input as KnowledgeReviewHistoryInput,
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					),
			},
			undoReview: {
				inputSchema: undoReviewInputSchema,
				resultSchema: undoReviewResultSchema,
				effect: "write",
				execute: async (input, call) =>
					reviews.undoReview(
						input as KnowledgeUndoReviewInput,
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					),
			},
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
			reviews: {
				inputSchema: reviewsInputSchema,
				resultSchema: reviewsResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reviews.reviews(
						input as KnowledgeReviewsInput,
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					),
			},
			previewReview: {
				inputSchema: previewReviewInputSchema,
				resultSchema: previewReviewResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reviews.previewReview(
						input as KnowledgePreviewReviewInput,
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					),
			},
			rejectReview: {
				inputSchema: rejectReviewInputSchema,
				resultSchema: rejectReviewResultSchema,
				effect: "write",
				execute: async (input, call) => {
					const result = await reviews.rejectReview(
						input as KnowledgeRejectReviewInput,
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
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
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					);
					context.events.changed();
					return result;
				},
			},
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
			overview: {
				inputSchema: overviewInputSchema,
				resultSchema: overviewResultSchema,
				effect: "read",
				execute: async (_input, call) =>
					reads.overview(
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					),
			},
			search: {
				inputSchema: searchInputSchema,
				resultSchema: searchResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reads.search(
						input as KnowledgeSearchInput,
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					),
			},
			readNote: {
				inputSchema: readNoteInputSchema,
				resultSchema: readNoteResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reads.readNote(
						input as KnowledgeReadNoteInput,
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					),
			},
			links: {
				inputSchema: linksInputSchema,
				resultSchema: linksResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reads.links(
						input as KnowledgeLinksInput,
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					),
			},
			graph: {
				inputSchema: graphInputSchema,
				resultSchema: graphResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reads.graph(
						input as KnowledgeGraphInput,
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					),
			},
			jobs: {
				inputSchema: jobsInputSchema,
				resultSchema: jobsResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reads.jobs(
						input as KnowledgeJobsInput,
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					),
			},
			recentByCategory: {
				inputSchema: recentByCategoryInputSchema,
				resultSchema: recentByCategoryResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reads.recentByCategory(
						input as KnowledgeRecentByCategoryInput,
						await projectFor(
							call.capabilities,
							call.scope.kind === "application" ? null : call.scope.workspaceDirectory,
						),
					),
			},
		},
		createNativeSession: () =>
			createDesktopKnowledgeNativeSession(owner, (native) => projectFor(context.capabilities, native.cwd)),
		dispose: () => owner.dispose(),
	};
};
export default createDesktopRuntime;
