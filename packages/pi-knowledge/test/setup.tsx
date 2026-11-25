import type { PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import React, { useEffect, useSyncExternalStore } from "react";
import * as ReactDOM from "react-dom";
import { beforeEach } from "vitest";

/** Test-only host implementing the public UI contract, with no private host imports. */
export const pluginEntries: Array<{
	id: string;
	title: string;
	pluginName: string;
}> = [];
let pluginRuntime: PluginUiRuntimeClient | undefined;
export function setPluginRuntime(runtime: PluginUiRuntimeClient | undefined) {
	pluginRuntime = runtime;
}

export const services: Record<string, (...args: unknown[]) => unknown> = {};

/**
 * The host's route tables, mirrored here so the fake host answers the same
 * operation names the real host does.  A domain group's operation name selects
 * the service method; the table is the authorization boundary.
 */
const ROUTES: Record<string, Record<string, string>> = {
	knowledge: {
		"cloud.status": "getKnowledgeCloudStatus",
		"cloud.probe": "probeKnowledgeCloud",
		"cloud.initialize": "initializeKnowledgeCloud",
		"cloud.setPassword": "setKnowledgeCloudPassword",
		"cloud.readNote": "readKnowledgeCloudNote",
		"cloud.writeNote": "writeKnowledgeCloudNote",
		"cloud.sync": "syncKnowledgeCloud",
		"specialist.settings": "setKnowledgeSpecialistSettings",
		overview: "getKnowledgeOverview",
		"research.runs": "getKnowledgeResearchRuns",
		"research.run": "runKnowledgeResearch",
		"setup.preview": "previewKnowledgeSetup",
		"setup.start": "startKnowledgeSetup",
		"setup.resume": "resumeKnowledgeCheck",
		jobs: "getKnowledgeJobs",
		"reviews.list": "getKnowledgeReviews",
		"reviews.preview": "previewKnowledgeReview",
		"reviews.withModel": "reviewKnowledgeWithModel",
		"reviews.cancelModel": "cancelKnowledgeModelReview",
		"reviews.decide": "decideKnowledgeReview",
		read: "readKnowledgeNote",
		maintain: "maintainKnowledge",
		openTarget: "openKnowledgeTarget",
		"semantic.status": "getKnowledgeSemanticStatus",
		"semantic.saveSettings": "saveKnowledgeSemanticSettings",
		"semantic.testProvider": "testKnowledgeSemanticProvider",
		"semantic.index": "indexKnowledgeSemantic",
		"semantic.cancelIndex": "cancelKnowledgeSemanticIndex",
		search: "searchKnowledge",
		noteLinks: "getKnowledgeNoteLinks",
		graph: "getKnowledgeGraph",
		"topics.list": "getKnowledgeTopics",
		"topics.archive": "archiveKnowledgeTopic",
		"maintenance.settings": "getKnowledgeMaintenanceSettings",
		"maintenance.saveSettings": "saveKnowledgeMaintenanceSettings",
		"maintenance.run": "runKnowledgeMaintenance",
		"maintenance.runs": "getKnowledgeMaintenanceRuns",
	},
	daily: {
		state: "getDailyDiscovery",
		update: "updateDailyDiscovery",
		decideIdea: "decideDailyIdea",
		decideRadarPaper: "decideDailyRadarPaper",
	},
	zotero: {
		status: "getZoteroStatus",
		"webApi.get": "getZoteroWebApi",
		"webApi.save": "saveZoteroWebApi",
		"webApi.clear": "clearZoteroWebApi",
		"localWrite.get": "getZoteroLocalWrite",
		"localWrite.authorize": "authorizeZoteroLocalWrite",
		"localWrite.clear": "clearZoteroLocalWrite",
	},
};

/** One domain group's routed channel, answering only the listed operations. */
function route(domain: string) {
	const table = ROUTES[domain];
	return {
		async invoke(operation: string, input?: unknown): Promise<unknown> {
			const method = table[operation];
			if (!method) throw new Error(`Unknown knowledge operation: ${operation}`);
			const service = services[method];
			if (!service) throw new Error(`Unknown knowledge operation: ${operation}`);
			return service(input);
		},
	};
}

export function fixtureStore(initial: Record<string, unknown>) {
	let state = initial;
	const listeners = new Set<() => void>();
	return Object.assign(
		(selector: (s: typeof state) => unknown) =>
			useSyncExternalStore(
				(listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				() => selector(state),
			),
		{
			getState: () => state,
			setState: (patch: typeof state) => {
				state = { ...state, ...patch };
				for (const f of listeners) f();
			},
		},
	);
}
export const knowledge = fixtureStore({
	revision: 0,
	dialog: null,
	review: null,
	reviewQueue: [],
	notice: null,
	open: () => undefined,
});
export const sessions = fixtureStore({
	activeSessionId: null,
	cwd: "/p",
	sessions: [],
});
export const settings = fixtureStore({ modelPrefs: null });
export const ui = fixtureStore({
	knowledgeTab: "overview",
	setKnowledgeTab: (knowledgeTab: string) => ui.setState({ knowledgeTab }),
});
knowledge.setState({
	open: (dialog: unknown) => knowledge.setState({ dialog }),
	close: () => knowledge.setState({ dialog: null }),
});
function ActionSurface({
	children,
	onEscape,
	ariaLabel,
	contentRef,
}: React.PropsWithChildren<{
	onEscape?: () => void;
	ariaLabel: string;
	contentRef: React.Ref<HTMLDivElement>;
}>) {
	useEffect(() => {
		const handle = (e: KeyboardEvent) => {
			if (e.key === "Escape") onEscape?.();
		};
		document.addEventListener("keydown", handle);
		return () => document.removeEventListener("keydown", handle);
	}, [onEscape]);
	return (
		<div role="dialog" aria-label={ariaLabel} ref={contentRef}>
			{children}
		</div>
	);
}
function Button({
	children,
	variant: _variant,
	size: _size,
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: string;
	size?: string;
}) {
	return <button {...props}>{children}</button>;
}
Object.assign(window, {
	DroneUI: {
		React,
		ReactDOM,
		knowledge: {
			knowledge: route("knowledge"),
			daily: route("daily"),
			zotero: route("zotero"),
		},
		app: {
			pickDirectory: async () => services.pickDirectory?.() ?? null,
			formalKnowledgeVault: async () => services.formalKnowledgeVault?.() ?? null,
		},
		institutional: {
			getStatus: async () => services.getInstitutionalStatus?.(),
			saveConfig: async (input: unknown) => services.saveInstitutionalConfig?.(input),
			openLogin: async (url?: string) => services.openInstitutionalLogin?.(url),
			openUrl: async (url: string) => services.openInstitutionalUrl?.(url),
			clear: async () => services.clearInstitutionalSession?.(),
			testAccess: async (url: string) => services.testInstitutionalAccess?.(url),
		},
		sessions: {
			command: async (sessionId: string, name: string, args?: string) =>
				services.command?.(sessionId, name, args),
			prompt: async (sessionId: string, text: string) => services.prompt?.(sessionId, text),
		},
		components: {
			Button,
			Markdown: ({ text, onLink }: { text: string; onLink?: (href: string) => void }) => (
				<div>
					<p>{text}</p>
					{text === "external-link" && (
						<a
							href="file:///private/not-authorized.md"
							onClick={(event) => {
								event.preventDefault();
								onLink?.("file:///private/not-authorized.md");
							}}
						>
							External target
						</a>
					)}
				</div>
			),
			ActionSurface,
			PluginEntryHost: ({ entry }: { entry: { title: string } }) => <div>Plugin {entry.title}</div>,
			PageHeader: ({ title, tabs }: { title: string; tabs: React.ReactNode }) => (
				<header>
					{title}
					{tabs}
				</header>
			),
			StatePanel: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
		},
		hooks: {
			usePluginRuntime: () => {
				if (!pluginRuntime) throw new Error("Plugin runtime is unavailable for this UI module");
				return pluginRuntime;
			},
			useLanguage: () => "zh",
			useT: () => (key: string) => key,
			usePluginEntries: () => pluginEntries,
		},
		helpers: {
			isDraftSessionId: (id: string | null) => id?.startsWith("draft:") ?? false,
			taskArtifactLinks: (task: {
				milestones: Array<{
					state: string;
					evidence?: { kind: string; path: string };
				}>;
			}) =>
				task.milestones
					.filter((m) => m.state === "completed" && m.evidence?.kind === "file-observed")
					.map((m) => ({ path: m.evidence!.path, state: "observed" })),
			pushToast: () => undefined,
			openExternal: async (url: string) => {
				await services.openExternal?.(url);
			},
		},
		stores: {
			useKnowledgeStore: knowledge,
			useSessionsStore: sessions,
			useSettingsStore: settings,
			useUiStore: ui,
		},
	},
});
beforeEach(() => {
	pluginRuntime = undefined;
	pluginEntries.splice(0);
	for (const key of Object.keys(services)) delete services[key];
});
