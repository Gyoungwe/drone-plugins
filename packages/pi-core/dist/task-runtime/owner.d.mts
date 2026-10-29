import type { PluginNativeSession } from "@gyoungwe/plugin-api/native";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TaskAcceptanceVerifier } from "./acceptance.mjs";
import type { TaskJournal } from "./runtime.mjs";
export interface TaskApplication {
  registerAcceptanceVerifier(kind: string, definition: Readonly<Record<string, unknown>>): TaskAcceptanceVerifier;
  readAcceptanceVerifier(kind: string): TaskAcceptanceVerifier | null;
  createNativeSession(): PluginNativeSession;
  attach(pi: ExtensionAPI): TaskJournal;
  dispose(): Promise<void>;
}
export function createTaskApplication(definitions?: TaskAcceptanceVerifier[]): TaskApplication;
