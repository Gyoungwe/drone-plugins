import type { PluginNativeRuntimeFactory } from "@gyoungwe/plugin-api/native";
import type { PluginRuntimeCapabilities, PluginRuntimeContext } from "@gyoungwe/plugin-api/runtime";
import { type KnowledgeBinding, parseKnowledgeBinding, projectIdentity } from "../core/config.js";
import { createKnowledgeOwnerLifecycle } from "../core/owner-lifecycle.js";
import { createStoredKnowledgeReviewPolicy } from "../core/review-policy.js";
import { createKnowledgeRuntimeHost } from "../core/runtime-host.js";
import { createKnowledgeServicePool } from "../core/service.js";
import { createSpecialistDelivery } from "../core/specialist-delivery.js";
import { createKnowledgeSpecialistHost } from "../core/specialist-host.js";
import { createKnowledgeSpecialistTools } from "../core/specialists.js";
import { createTopicMemoryApi } from "../core/topic-memory.js";
import { createKnowledgeUi } from "../core/ui-state.js";
import { createKnowledgeModelReview } from "../core/wiki-model-review.js";
import { createKnowledgeWikiReview } from "../core/wiki-review.js";
import { bindingOperation } from "./binding-service.js";
import { withCloudOperations } from "./cloud-runtime.js";
import {
	graphInputSchema,
	graphResultSchema,
	jobsInputSchema,
	jobsResultSchema,
	type KnowledgeGraphInput,
	type KnowledgeJobsInput,
	type KnowledgeLinksInput,
	type KnowledgeReadNoteInput,
	type KnowledgeRecentByCategoryInput,
	type KnowledgeSearchInput,
	linksInputSchema,
	linksResultSchema,
	overviewInputSchema,
	overviewResultSchema,
	readNoteInputSchema,
	readNoteResultSchema,
	recentByCategoryInputSchema,
	recentByCategoryResultSchema,
	searchInputSchema,
	searchResultSchema,
} from "./contract.js";
import { createKnowledgeModelReviewModel } from "./model-review.js";
import { createKnowledgeNativeSessionFactory } from "./native-session.js";
import { createBrokerKnowledgeState } from "./native-state.js";
import { createKnowledgePreferences } from "./preferences.js";
import { createKnowledgeReadModel, type KnowledgeReadOwner } from "./read-model.js";
import { createKnowledgeReviewOperations } from "./review-operations.js";
import { createBrokerWikiReviewPorts } from "./review-storage.js";
import { createKnowledgeReviewModel } from "./reviews.js";
import { createKnowledgeSemanticPreferences } from "./semantic-preferences.js";
import { createBrokerSemanticSettings } from "./semantic-settings.js";
import { createResourceServiceTransportFactory } from "./service-transport.js";
import { createKnowledgeSpecialistPreferences } from "./specialist-preferences.js";
import { createBrokerSpecialistSettingsStorage } from "./specialist-settings-storage.js";
import { createBrokerReviewPolicyStorage } from "./state-policy.js";
import { createBrokerTopicMemoryStorage } from "./topic-storage.js";

/** The calling session's knowledge project; application-scoped calls have none. */
const callerProject = (call: PluginRuntimeContext) =>
	projectFor(call.capabilities, call.scope.kind === "application" ? null : call.scope.workspaceDirectory);

async function projectFor(
	capabilities: PluginRuntimeCapabilities,
	workspace: string | null,
): Promise<string | null> {
	if (workspace === null) return null;
	const { handle } = (await capabilities.call("roots.resolve", {
		path: workspace,
		kind: "files",
	})) as {
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
	const storage = createBrokerKnowledgeState(context.capabilities, state);
	const ui = createKnowledgeUi(host, undefined, {
		read: () => storage.read("answer-metrics.json"),
		write: (value, version) => storage.write("answer-metrics.json", value, version),
	});
	const unsubscribeUi = ui.subscribeKnowledgeUi(() => context.events.changed());
	const specialists = createKnowledgeSpecialistHost(
		host,
		config,
		ui,
		createBrokerSpecialistSettingsStorage(storage),
	);
	const specialistTools = createKnowledgeSpecialistTools(host, config, specialists, ui);
	const semantic = createBrokerSemanticSettings(context.capabilities, state);
	const policy = createStoredKnowledgeReviewPolicy(
		createBrokerReviewPolicyStorage(context.capabilities, state),
		() => false,
	);
	const transports = createResourceServiceTransportFactory(context, state, context.resourcesLifecycle);
	const services = createKnowledgeServicePool(host, config, semantic, policy, transports);
	const lifecycle = createKnowledgeOwnerLifecycle({
		beforeDrain: () => specialists.dispose(),
		async dispose() {
			// No live-caller capability is created during shutdown. The host closes all
			// activation resources, then service views settle against that real barrier.
			await transports.dispose();
			await services.dispose();
			unsubscribeUi();
			ui.dispose();
		},
	});
	const reviewIo = createBrokerWikiReviewPorts(context.capabilities, state);
	const wiki = createKnowledgeWikiReview(
		host,
		config,
		policy,
		{ invalidateKnowledgeUi: () => context.events.changed() },
		reviewIo,
	);
	const modelReview = createKnowledgeModelReview(
		host,
		config,
		wiki,
		reviewIo,
		specialists.specialistSettings,
	);
	const topics = createTopicMemoryApi(
		host,
		undefined,
		createBrokerTopicMemoryStorage({ state: storage, files: reviewIo.files }),
	);
	const delivery = createSpecialistDelivery(host, config);
	const owner = {
		config,
		services,
		wiki,
		modelReview,
		host,
		reviewPolicy: policy,
		ui,
		topics,
		delivery,
		specialistTools,
		extensionHost: {},
		...lifecycle,
	};
	const modelReviews = createKnowledgeModelReviewModel(
		owner,
		states[0].access === "read-write",
		fileRoots[0]?.access === "read-write",
	);
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
	const specialistPreferences = createKnowledgeSpecialistPreferences(
		owner,
		specialists,
		states[0].access === "read-write",
	);
	return {
		operations: {
			binding: bindingOperation(readKnowledgeBinding),
			...createKnowledgeReviewOperations({
				context,
				modelReviews,
				reviews,
				preferences,
				semanticPreferences,
				specialistPreferences,
				callerProject,
			}),
			overview: {
				inputSchema: overviewInputSchema,
				resultSchema: overviewResultSchema,
				effect: "read",
				execute: async (_input, call) => reads.overview(await callerProject(call)),
			},
			search: {
				inputSchema: searchInputSchema,
				resultSchema: searchResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reads.search(input as KnowledgeSearchInput, await callerProject(call)),
			},
			readNote: {
				inputSchema: readNoteInputSchema,
				resultSchema: readNoteResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reads.readNote(input as KnowledgeReadNoteInput, await callerProject(call)),
			},
			links: {
				inputSchema: linksInputSchema,
				resultSchema: linksResultSchema,
				effect: "read",
				execute: async (input, call) => reads.links(input as KnowledgeLinksInput, await callerProject(call)),
			},
			graph: {
				inputSchema: graphInputSchema,
				resultSchema: graphResultSchema,
				effect: "read",
				execute: async (input, call) => reads.graph(input as KnowledgeGraphInput, await callerProject(call)),
			},
			jobs: {
				inputSchema: jobsInputSchema,
				resultSchema: jobsResultSchema,
				effect: "read",
				execute: async (input, call) => reads.jobs(input as KnowledgeJobsInput, await callerProject(call)),
			},
			recentByCategory: {
				inputSchema: recentByCategoryInputSchema,
				resultSchema: recentByCategoryResultSchema,
				effect: "read",
				execute: async (input, call) =>
					reads.recentByCategory(input as KnowledgeRecentByCategoryInput, await callerProject(call)),
			},
		},
		createNativeSession: createKnowledgeNativeSessionFactory({
			context,
			owner,
			specialists,
			modelReviews,
			readKnowledgeBinding,
			projectFor,
		}),
		dispose: () => owner.dispose(),
	};
};
export default withCloudOperations(createDesktopRuntime);
