import type { PluginNativeRuntimeFactory } from "@gyoungwe/plugin-api/native";
import { createManagedTaskApplication } from "./task-runtime/managed-application.js";
export { inspectTaskBytes } from "./task-runtime/file-inspection.ts";
export { createManagedTaskApplication };
/** Candidate data adapter; the production manifest stays on the native entry until full cutover. */
declare const create: PluginNativeRuntimeFactory;
export default create;
