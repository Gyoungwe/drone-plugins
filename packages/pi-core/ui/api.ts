import type { DroneUiRuntime } from "@gyoungwe/plugin-api/ui";

const host = (window as unknown as { DroneUI: DroneUiRuntime }).DroneUI;
export const { sessions } = host;
export const { useSessionMessages, useLanguage, useAgentActive } = host.hooks;
export const { useSessionsStore, useUiStore } = host.stores;
export const { openExternal, openResourceExternal } = host.helpers;

/** API installation/version boundary. Do not invoke hooks before this succeeds. */
export function uiCompatibility() {
	const missing = [];
	if (typeof host.sessions?.prompt !== "function")
		missing.push("sessions.prompt");
	if (typeof host.hooks.useSessionMessages !== "function")
		missing.push("hooks.useSessionMessages");
	return missing.length
		? { status: "incompatible" as const, missing }
		: { status: "compatible" as const, missing };
}
