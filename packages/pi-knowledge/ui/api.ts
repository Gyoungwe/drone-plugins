/** Narrow host boundary: services retain host authorization and persistence rules. */
import type { DroneUiRuntime } from "@gyoungwe/plugin-api/ui";

const host = (window as unknown as { DroneUI: DroneUiRuntime }).DroneUI;
export const getKnowledgeApi = () => host.knowledge;
export const { Button, StatePanel, Switch, ActionSurface, PageHeader, Markdown, ChevronDownIcon, ObsidianIcon, RoadmapLane, PluginEntryHost } = host.components;
export const { useAgentActive, usePluginEntries, useT, useLanguage } = host.hooks;
export const { isDraftSessionId, selectTranscript, pushToast, relativeTime, taskArtifactLinks, roadmapStatus, legacyEvidenceNotice, COMPOSER_FOCUS_EVENT, PROTECTED_KNOWLEDGE_AGENTS, SUBAGENT_THINKING_LEVELS } = host.helpers;
export const { useKnowledgeStore, useSessionsStore, useSettingsStore, useTranscriptStore, useUiStore, useDraftStore } = host.stores;
export type KnowledgeTab = "overview" | "network" | "reviews" | "settings";
export const UI_REGIONS = { KnowledgeTab: "knowledge.tab" } as const;
