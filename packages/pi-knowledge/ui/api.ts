/**
 * Narrow host boundary: services retain host authorization and persistence rules.
 *
 * The host keeps one route table per domain group, and the operation name
 * inside the envelope selects the implementation.  This module is the only
 * place that knows those names, so adding a domain operation is one entry
 * here instead of a change in every consumer.
 *
 * The routed channel carries an opaque payload, so the request and response
 * shapes below belong to this plugin: the host authorizes the operation name,
 * the plugin owns the domain schema.
 */
import type {
	AppUiPort,
	DailyDiscoveryState,
	DroneUiRuntime,
	InstitutionalStatus,
	InstitutionalTestResult,
	InstitutionalUiPort,
	KnowledgeGraph,
	KnowledgeGraphView,
	KnowledgeJob,
	KnowledgeNote,
	KnowledgeNoteLinks,
	KnowledgeOverview,
	KnowledgePage,
	KnowledgeSearchResult,
	KnowledgeSemanticConfig,
	KnowledgeSemanticIndexResult,
	KnowledgeSemanticSettings,
	KnowledgeSemanticStatus,
	KnowledgeSetupPreview,
	KnowledgeTopicListResult,
	SessionUiPort,
	WikiModelReviewResult,
	WikiReviewItem,
	WikiReviewPreview,
	WikiReviewResult,
	ZoteroLocalWriteStatus,
	ZoteroStatus,
} from "@gyoungwe/plugin-api/ui";

const host = (window as unknown as { DroneUI: DroneUiRuntime }).DroneUI;

/** The routed knowledge domain group. */
export const knowledgeRoute = host.knowledge.knowledge;
/** The routed daily discovery domain group. */
export const dailyRoute = host.knowledge.daily;
/** The routed Zotero domain group. */
export const zoteroRoute = host.knowledge.zotero;
/** Host mechanisms that are not domain operations. */
export const appPort = host.app;
export const institutionalPort = host.institutional;
export const sessionPort = host.sessions;

/** One routed call, narrowed to the plugin's own expectation for the result. */
async function call<T>(
	route: { invoke(operation: string, input?: unknown): Promise<unknown> },
	operation: string,
	input?: unknown,
): Promise<T> {
	return (await route.invoke(operation, input)) as T;
}

/** Read the knowledge overview for a project and session. */
export const getKnowledgeOverview = (input?: {
	cwd?: string | null;
	sessionId?: string | null;
}): Promise<KnowledgeOverview> => call(knowledgeRoute, "overview", input);

/** Search the knowledge index. */
export const searchKnowledge = (input: {
	cwd?: string | null;
	bindingRevision?: number;
	query: string;
	limit?: number;
}): Promise<KnowledgeSearchResult> => call(knowledgeRoute, "search", input);

/** Read one note's body. */
export const readKnowledgeNote = (input: {
	cwd?: string | null;
	path: string;
	startLine?: number;
	revision: number;
}): Promise<KnowledgeNote> => call(knowledgeRoute, "read", input);

/** Read the bidirectional links of one note. */
export const getKnowledgeNoteLinks = (input: {
	path: string;
	revision: number;
}): Promise<KnowledgeNoteLinks> => call(knowledgeRoute, "noteLinks", input);

/** Read the knowledge graph. */
export const getKnowledgeGraph = (input: {
	revision: number;
	limit?: number;
	view?: KnowledgeGraphView;
	mergeMirrors?: boolean;
}): Promise<KnowledgeGraph> => call(knowledgeRoute, "graph", input);

/** The graph surface the knowledge graph view needs from the host. */
export interface KnowledgeGraphApi {
	getGraph: (input: {
		revision: number;
		limit?: number;
		view?: KnowledgeGraphView;
		mergeMirrors?: boolean;
	}) => Promise<KnowledgeGraph>;
	getLinks: (input: { path: string; revision: number }) => Promise<KnowledgeNoteLinks>;
}

/** List the maintenance jobs. */
export const getKnowledgeJobs = (input?: {
	cwd?: string | null;
	offset?: number;
	limit?: number;
	revision?: number;
}): Promise<KnowledgePage<KnowledgeJob>> => call(knowledgeRoute, "jobs", input);

/** Read the persisted automatic maintenance settings. */
export const getKnowledgeMaintenanceSettings = (): Promise<{
	enabled: boolean;
	maxItems: number;
	dailyLimit: number;
	model?: string | null;
}> => call(knowledgeRoute, "maintenance.settings");

/** Read the automatic maintenance run history. */
export const getKnowledgeMaintenanceRuns = (): Promise<
	Array<{
		startedAt: string;
		processed: number;
		modelCalls: number;
		items: Array<{ id: string; kind: string; status: string; reason?: string }>;
	}>
> => call(knowledgeRoute, "maintenance.runs");

/** Persist the automatic maintenance settings. */
export const saveKnowledgeMaintenanceSettings = (input: {
	enabled: boolean;
	maxItems: number;
	dailyLimit: number;
	model?: string | null;
}): Promise<{
	enabled: boolean;
	maxItems: number;
	dailyLimit: number;
	model?: string | null;
}> => call(knowledgeRoute, "maintenance.saveSettings", input);

/** Run the automatic maintenance once. */
export const runKnowledgeMaintenance = (input: {
	cwd: string;
}): Promise<{
	startedAt: string;
	processed: number;
	modelCalls: number;
	items: Array<{ id: string; kind: string; status: string; reason?: string }>;
}> => call(knowledgeRoute, "maintenance.run", input);

/** Run one maintenance action over the knowledge base. */
export const maintainKnowledge = (input: {
	cwd?: string | null;
	action: "reconcile" | "refresh-navigation" | "review-automatic" | "review-strict" | "undo-wiki";
	id?: string;
	expectedHash?: string;
	revision: number;
}): Promise<{ navigation?: { error?: string }[] }> => call(knowledgeRoute, "maintain", input);

/** Open a note or a local path through the host's target resolution. */
export const openKnowledgeTarget = (input: {
	cwd?: string | null;
	path?: string | null;
	revision: number;
}): Promise<void> => call(knowledgeRoute, "openTarget", input);

/** Preview the knowledge setup without changing anything. */
export const previewKnowledgeSetup = (input?: {
	cwd?: string | null;
	path?: string | null;
}): Promise<KnowledgeSetupPreview> => call(knowledgeRoute, "setup.preview", input);

/** Start the session-bound knowledge setup interview. */
export const startKnowledgeSetup = (input: { sessionId: string; path?: string }): Promise<void> =>
	call(knowledgeRoute, "setup.start", input);

/** Resume a pending setup check for one session. */
export const resumeKnowledgeCheck = (sessionId: string): Promise<void> =>
	call(knowledgeRoute, "setup.resume", sessionId);

/** Persist the specialist role settings. */
export const setKnowledgeSpecialistSettings = (input: {
	mode: string;
	revision: number;
	bindingRevision: number;
	maxRunsPerTurn?: number;
	maxRunsPerSession?: number;
	maxToolOperations?: number;
	concurrency?: number;
	queueLimit?: number;
	queueWaitMs?: number;
	timeoutMs?: number;
	maxTokensPerTurn?: number;
	maxTokensPerSession?: number;
	maxCostPerTurn?: number;
	maxCostPerSession?: number;
}): Promise<unknown> => call(knowledgeRoute, "specialist.settings", input);

/** Read the semantic index status. */
export const getKnowledgeSemanticStatus = (input?: {
	cwd?: string | null;
	bindingRevision?: number;
}): Promise<KnowledgeSemanticStatus> => call(knowledgeRoute, "semantic.status", input);

/** Persist the semantic index settings. */
export const saveKnowledgeSemanticSettings = (input: {
	config: KnowledgeSemanticConfig;
	bindingRevision: number;
	expectedSettingsRevision: number;
}): Promise<KnowledgeSemanticSettings> => call(knowledgeRoute, "semantic.saveSettings", input);

/** Check whether the configured semantic provider answers. */
export const testKnowledgeSemanticProvider = (input: {
	config: KnowledgeSemanticConfig;
	bindingRevision: number;
}): Promise<unknown> => call(knowledgeRoute, "semantic.testProvider", input);

/** Start a semantic indexing run. */
export const indexKnowledgeSemantic = (input: {
	cwd: string;
	bindingRevision: number;
	requestId: string;
	limit?: number;
}): Promise<KnowledgeSemanticIndexResult> => call(knowledgeRoute, "semantic.index", input);

/** Cancel a running semantic indexing run. */
export const cancelKnowledgeSemanticIndex = (input: {
	cwd: string;
	bindingRevision: number;
	requestId: string;
}): Promise<void> => call(knowledgeRoute, "semantic.cancelIndex", input);

/** List the knowledge topics. */
export const getKnowledgeTopics = (input: {
	cwd: string;
	bindingRevision: number;
	query?: string;
}): Promise<KnowledgeTopicListResult> => call(knowledgeRoute, "topics.list", input);

/** Archive one knowledge topic. */
export const archiveKnowledgeTopic = (input: {
	cwd: string;
	bindingRevision: number;
	id: string;
	expectedRevision: number;
}): Promise<unknown> => call(knowledgeRoute, "topics.archive", input);

/** List the pending Wiki review proposals. */
export const getKnowledgeReviews = (input: {
	cwd?: string | null;
	offset?: number;
	limit?: number;
	revision?: number;
}): Promise<KnowledgePage<WikiReviewItem>> => call(knowledgeRoute, "reviews.list", input);

/** Preview one Wiki review proposal. */
export const previewKnowledgeReview = (input: {
	cwd: string;
	id: string;
	revision: number;
}): Promise<WikiReviewPreview> => call(knowledgeRoute, "reviews.preview", input);

/** Apply or reject one Wiki review proposal. */
export const decideKnowledgeReview = (input: {
	cwd: string;
	token: string;
	decision: "apply" | "reject";
}): Promise<WikiReviewResult> => call(knowledgeRoute, "reviews.decide", input);

/** Review one Wiki proposal with the model. */
export const reviewKnowledgeWithModel = (input: {
	cwd: string;
	sessionId: string;
	requestId: string;
	token: string;
	acknowledged: boolean;
	autoApply: boolean;
}): Promise<WikiModelReviewResult> => call(knowledgeRoute, "reviews.withModel", input);

/** Cancel a running model review. */
export const cancelKnowledgeModelReview = (input: { sessionId: string; requestId: string }): Promise<void> =>
	call(knowledgeRoute, "reviews.cancelModel", input);

/** Read the daily discovery state. */
export const getDailyDiscovery = (): Promise<DailyDiscoveryState> => call(dailyRoute, "state");

/** Enable, disable or trigger the daily discovery run. */
export const updateDailyDiscovery = (input: {
	enabled?: boolean;
	run?: boolean;
}): Promise<DailyDiscoveryState> => call(dailyRoute, "update", input);

/** Keep or dismiss one discovery idea. */
export const decideDailyIdea = (input: {
	id: string;
	action: "save" | "dismiss";
}): Promise<DailyDiscoveryState> => call(dailyRoute, "decideIdea", input);

/** Capture or dismiss one radar paper. */
export const decideDailyRadarPaper = (input: {
	id: string;
	action: "capture" | "dismiss";
}): Promise<DailyDiscoveryState> => call(dailyRoute, "decideRadarPaper", input);

/** Read the Zotero library connection status. */
export const getZoteroStatus = (): Promise<ZoteroStatus> => call(zoteroRoute, "status");

/** Read the Zotero local write authorization status. */
export const getZoteroLocalWrite = (): Promise<ZoteroLocalWriteStatus> => call(zoteroRoute, "localWrite.get");

/** Ask Zotero for the local write authorization. */
export const authorizeZoteroLocalWrite = (): Promise<ZoteroLocalWriteStatus> =>
	call(zoteroRoute, "localWrite.authorize");

/** Clear the stored Zotero local write authorization. */
export const clearZoteroLocalWrite = (): Promise<ZoteroLocalWriteStatus> =>
	call(zoteroRoute, "localWrite.clear");

/** Choose a directory on disk. */
export const pickDirectory = (): Promise<string | null> => appPort.pickDirectory();

/** Resolve the formal release knowledge vault. */
export const formalKnowledgeVault = (): Promise<string | null> => appPort.formalKnowledgeVault();

/** Open a link with the system browser. */
export const openExternal = (url: string): Promise<void> => host.helpers.openExternal(url);

/** Send a prompt to one session. */
export const prompt = (sessionId: string, text: string): ReturnType<SessionUiPort["prompt"]> =>
	sessionPort.prompt(sessionId, text);

/** Read the institutional access status. */
export const getInstitutionalStatus = (): Promise<InstitutionalStatus> => institutionalPort.getStatus();

/** Open the institutional login window. */
export const openInstitutionalLogin = (url?: string): Promise<{ url: string }> =>
	institutionalPort.openLogin(url);

/** Clear the institutional session. */
export const clearInstitutionalSession = (): Promise<InstitutionalStatus> => institutionalPort.clear();

/** Check whether an institutional URL is reachable. */
export const testInstitutionalAccess = (url: string): Promise<InstitutionalTestResult> =>
	institutionalPort.testAccess(url);

export const {
	Button,
	StatePanel,
	Switch,
	ActionSurface,
	PageHeader,
	Markdown,
	ChevronDownIcon,
	ObsidianIcon,
	RoadmapLane,
	PluginEntryHost,
} = host.components;
export const { useAgentActive, usePluginEntries, useT, useLanguage } = host.hooks;
export const {
	isDraftSessionId,
	selectTranscript,
	pushToast,
	relativeTime,
	roadmapStatus,
	legacyEvidenceNotice,
	COMPOSER_FOCUS_EVENT,
	PROTECTED_KNOWLEDGE_AGENTS,
	SUBAGENT_THINKING_LEVELS,
} = host.helpers;
export const {
	useKnowledgeStore,
	useSessionsStore,
	useSettingsStore,
	useTranscriptStore,
	useUiStore,
	useDraftStore,
} = host.stores;
export type KnowledgeTab = "overview" | "network" | "reviews" | "settings";
export const UI_REGIONS = { KnowledgeTab: "knowledge.tab" } as const;
export type { AppUiPort, InstitutionalUiPort };
