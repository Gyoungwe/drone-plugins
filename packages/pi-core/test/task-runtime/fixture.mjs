/** Canonical plugin-owned rules; no host implementation or copied test algorithm. */
import { registerWorkbench as registerNativeWorkbench } from "../../src/task-runtime/native-adapter.mjs";
import { createTaskApplicationState } from "../../src/task-runtime/application-state.mjs";
export function registerWorkbench(pi,options={}) {
 return registerNativeWorkbench(pi,{...options,application:createTaskApplicationState()});
}
export * from "../../src/task-runtime/runtime.mjs";
export * from "../../src/task-runtime/workbench.mjs";
