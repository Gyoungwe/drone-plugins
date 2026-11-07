import type { PluginNativeRuntimeFactory, PluginNativeSession } from "@gyoungwe/plugin-api/native";
import type {
	PluginNativeSessionFacts,
	PluginRuntimeCapabilities,
	PluginRuntimeContext,
} from "@gyoungwe/plugin-api/runtime";
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
import { createManagedNativeSession } from "../extension/knowledge-extension.js";
import {
	applyReviewInputSchema,
	applyReviewResultSchema,
	graphInputSchema,
	graphResultSchema,
	jobsInputSchema,
	jobsResultSchema,
	type KnowledgeApplyReviewInput,
	type KnowledgeGraphInput,
	type KnowledgeJobsInput,
	type KnowledgeLinksInput,
	type KnowledgeModelReviewInfoInput,
	type KnowledgeModelReviewInput,
	type KnowledgePreviewReviewInput,
	type KnowledgeReadNoteInput,
	type KnowledgeRecentByCategoryInput,
	type KnowledgeRejectReviewInput,
	type KnowledgeReviewHistoryInput,
	type KnowledgeReviewsInput,
	type KnowledgeSearchInput,
	type KnowledgeSetReviewPolicyInput,
	type KnowledgeSetSemanticSettingsInput,
	type KnowledgeUndoReviewInput,
	linksInputSchema,
	linksResultSchema,
	modelReviewInfoInputSchema,
	modelReviewInfoResultSchema,
	modelReviewInputSchema,
	modelReviewResultSchema,
	overviewInputSchema,
	overviewResultSchema,
	preferencesInputSchema,
	preferencesResultSchema,
	previewReviewInputSchema,
	previewReviewResultSchema,
	readNoteInputSchema,
	readNoteResultSchema,
	recentByCategoryInputSchema,
	recentByCategoryResultSchema,
	rejectReviewInputSchema,
	rejectReviewResultSchema,
	reviewHistoryInputSchema,
	reviewHistoryResultSchema,
	reviewsInputSchema,
	reviewsResultSchema,
	searchInputSchema,
	searchResultSchema,
	semanticPreferencesInputSchema,
	semanticPreferencesResultSchema,
	setReviewPolicyInputSchema,
	setSemanticSettingsInputSchema,
	undoReviewInputSchema,
	undoReviewResultSchema,
} from "./contract.js";
import { createKnowledgeModelReviewModel, parseModelReviewCommandInput } from "./model-review.js";
import { registerDesktopKnowledgeNativeReadTools } from "./native.js";
import { createBrokerKnowledgeState } from "./native-state.js";
import { createKnowledgePreferences } from "./preferences.js";
import { createKnowledgeReadModel, type KnowledgeReadOwner } from "./read-model.js";
import { createKnowledgeRecoveryMigration } from "./recovery-migration.js";
import { createBrokerWikiReviewPorts } from "./review-storage.js";
import { createKnowledgeReviewModel } from "./reviews.js";
import { createKnowledgeSemanticPreferences } from "./semantic-preferences.js";
import { createBrokerSemanticSettings } from "./semantic-settings.js";
import { createResourceServiceTransportFactory } from "./service-transport.js";
import { createManagedKnowledgeSessionPorts } from "./session-ports.js";
import { createBrokerKnowledgeSpecialist } from "./specialist-model.js";
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

/** One granted knowledge owner composes the same native interface, services and UI operations. */
/** Every tool the read-only knowledge interface registers in a child session; none of them writes. */
const CHILD_READ_TOOLS = [
	"knowledge_status",
	"knowledge_search",
	"research_check_answer",
	"research_knowledge_status",
	"research_prepare_knowledge",
	"research_read_knowledge",
	"research_restore_evidence",
	"research_resume_topic",
	"research_search_explainers",
	"research_search_knowledge",
	"research_task_status",
	"research_topics",
] as const;

/** Every hook the read-only knowledge interface registers in a child session. */
const CHILD_SESSION_EVENTS = [
	"session_start",
	"session_tree",
	"before_agent_start",
	"context",
	"message_start",
	"tool_execution_start",
	"tool_execution_end",
	"tool_result",
] as const;

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
	const modelReview = createKnowledgeModelReview(host, config, wiki, reviewIo, async () => {
		const document = (await reviewIo.state.read("specialists.json"))?.value as { mode?: unknown } | undefined;
		if (document === undefined) return { mode: "automatic" };
		if (!["automatic", "manual", "off"].includes(document.mode as string))
			throw new Error("Invalid knowledge specialist settings");
		return document;
	});
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
	return {
		operations: {
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
						await callerProject(call),
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
		createNativeSession: async (facts?: PluginNativeSessionFacts) => {
			const sessionPorts = createManagedKnowledgeSessionPorts(context.capabilities);
			const composition = {
				session: sessionPorts.ports,
				registerReadTools: (pi: any) =>
					registerDesktopKnowledgeNativeReadTools(pi, owner, (native: { cwd: string }) =>
						projectFor(context.capabilities, native.cwd),
					),
				project: async (cwd: string) => {
					const project = await projectFor(context.capabilities, cwd);
					if (project === null) throw new Error("Knowledge native session has no workspace project");
					return project;
				},
			};
			if (facts?.kind === "child") {
				// The host fact is not a grant. "none" never touches the Vault binding. "read" offers the
				// read-only interface, and every call re-reads this package's own subagent policy with the
				// live caller the host supplies at that moment (none exists while the session is created).
				const readable = facts.files === "read";
				const child = createManagedNativeSession(owner, {
					...composition,
					child: readable ? "read" : "evidence",
					childReadAllowed: async () => (await readKnowledgeBinding())?.subagentPolicy === "read-local",
				});
				if (!child.projection) throw new Error("Knowledge child session requires its publication projection");
				const session: PluginNativeSession = {
					...child,
					// A child's answers only take the evidence-only path (label, no task report), so its
					// finalizer runs with read capabilities; any write it attempted would fail at the broker.
					projection: { ...child.projection, finalizeEffect: "read" },
					toolEffects: readable
						? Object.fromEntries(CHILD_READ_TOOLS.map((tool) => [tool, "read" as const]))
						: {},
					// A child is read-only: its hooks get read capabilities only, so any write attempt fails at the broker.
					eventEffects: Object.fromEntries(CHILD_SESSION_EVENTS.map((event) => [event, "read" as const])),
					commandEffects: {},
				};
				return session;
			}
			const migrateRecovery = createKnowledgeRecoveryMigration(context.capabilities, config);
			const native = createManagedNativeSession(owner, composition);
			let unregister: (() => void) | undefined;
			return {
				...native,
				toolEffects: { knowledge_status: "read", knowledge_search: "read" },
				eventEffects: {
					session_start: "read",
					session_tree: "read",
					tool_execution_start: "read",
					tool_result: "read",
				},
				commandEffects: {
					"knowledge-review-model": "write",
					"obsidian-review": "write",
					"knowledge-migrate-recovery": "write",
				},
				async extension(pi) {
					await native.extension(pi);
					pi.on("session_start", (_event, caller) => {
						unregister = specialists.registerKnowledgeSpecialistHost(
							caller.sessionManager.getSessionId(),
							createBrokerKnowledgeSpecialist(context.capabilities),
						);
					});
					pi.registerCommand("knowledge-migrate-recovery", {
						description:
							"Explicitly import an authorized 0.2.0/0.2.1 historical read-window checkpoint; no current proof is restored",
						async handler(args, caller) {
							if (args.trim()) throw new Error("Checkpoint migration accepts no scope or target arguments");
							const result = await migrateRecovery(caller);
							await sessionPorts.ports.notify(JSON.stringify(result), caller);
						},
					});
					pi.registerCommand("knowledge-review-model", {
						description:
							"Review one exact Wiki proposal with explicit JSON cost/data acknowledgement; read the audit in the knowledge review UI",
						async handler(args, caller) {
							const input = parseModelReviewCommandInput(args);
							const scope = (await context.capabilities.call(
								"caller.scope",
								null,
							)) as import("@gyoungwe/plugin-api/runtime").PluginRuntimeScope;
							if (scope.kind !== "session" || scope.sessionId !== caller.sessionManager.getSessionId())
								throw new Error("Model review command requires its originating live session");
							const binding = await owner.config.readKnowledgeBinding({ fresh: true });
							if (!binding) throw new Error("No application knowledge Vault is bound");
							const signal = caller.signal ? AbortSignal.any([native.signal, caller.signal]) : native.signal;
							await modelReviews.review(
								{ ...input, revision: binding.revision },
								await projectFor(context.capabilities, scope.workspaceDirectory),
								{ scope, signal, capabilities: context.capabilities },
							);
							context.events.changed();
						},
					});
				},
				async dispose() {
					unregister?.();
					await native.dispose();
				},
			};
		},
		dispose: () => owner.dispose(),
	};
};
export default createDesktopRuntime;
