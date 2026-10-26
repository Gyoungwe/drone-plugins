import type { DroneUiRuntime } from "@gyoungwe/plugin-api/ui";

/** Generic host presentation and caller context only; no legacy knowledge service or store. */
const host = (window as unknown as { DroneUI: DroneUiRuntime }).DroneUI;
export const { Button, Markdown } = host.components;
export const { useLanguage, usePluginRuntime } = host.hooks;
export const { useSessionsStore } = host.stores;
