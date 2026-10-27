import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TaskAcceptanceVerifier } from "./acceptance.mjs";
import type { TaskJournal } from "./runtime.mjs";
export interface TaskRuntimeOwner {
  registerAcceptanceVerifier(kind: string, definition: Readonly<Record<string, unknown>>): TaskAcceptanceVerifier;
  readAcceptanceVerifier(kind: string): TaskAcceptanceVerifier | null;
  definitions(): TaskAcceptanceVerifier[];
  attach(pi: ExtensionAPI): TaskJournal;
  dispose(): Promise<void>;
}
export function createTaskRuntimeOwner(definitions?: TaskAcceptanceVerifier[]): TaskRuntimeOwner;
