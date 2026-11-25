import type {
	DroneUiRuntime,
	KnowledgeNavigationState,
	KnowledgeSessionState,
	KnowledgeTranscript,
} from "@gyoungwe/plugin-api/ui";
import type { TodoItem } from "../src/contracts";

export type WorkbenchTranscriptState = {
	bySession: Record<string, KnowledgeTranscript & { todos?: readonly TodoItem[] }>;
};

export function getHostUi(): DroneUiRuntime | undefined {
	return globalThis.window?.DroneUI;
}

function requireHostUi(): DroneUiRuntime {
	const host = getHostUi();
	if (!host) throw new Error("Drone UI host is unavailable");
	return host;
}

export const sessions = {
	command: (...args: Parameters<DroneUiRuntime["sessions"]["command"]>) =>
		requireHostUi().sessions.command(...args),
};
export const useSessionMessages = (sessionId: string | null) =>
	requireHostUi().hooks.useSessionMessages(sessionId);
export const useLanguage = () => requireHostUi().hooks.useLanguage();
export const useAgentActive = (sessionId: string | null) => requireHostUi().hooks.useAgentActive(sessionId);

export function useSessionsStore<Selected>(selector: (state: KnowledgeSessionState) => Selected) {
	return requireHostUi().stores.useSessionsStore(selector);
}

export function useTranscriptStore<Selected>(selector: (state: WorkbenchTranscriptState) => Selected) {
	return requireHostUi().stores.useTranscriptStore(selector);
}

export function useUiStore<Selected>(selector: (state: KnowledgeNavigationState) => Selected) {
	return requireHostUi().stores.useUiStore(selector);
}

export const openExternal = (url: string) => requireHostUi().helpers.openExternal(url);
export const openResourceExternal = (target: string, cwd?: string) =>
	requireHostUi().helpers.openResourceExternal(target, cwd);

/** API installation/version boundary. Do not invoke hooks before this succeeds. */
export function uiCompatibility() {
	const host = getHostUi();
	const missing = [];
	if (typeof host?.sessions?.command !== "function") missing.push("sessions.command");
	if (typeof host?.hooks?.useSessionMessages !== "function") missing.push("hooks.useSessionMessages");
	if (typeof host?.hooks?.useLanguage !== "function") missing.push("hooks.useLanguage");
	return missing.length
		? { status: "incompatible" as const, missing }
		: { status: "compatible" as const, missing };
}
