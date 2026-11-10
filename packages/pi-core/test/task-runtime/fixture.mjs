/** Canonical plugin-owned rules; no host implementation or copied test algorithm. */

import { createTaskApplicationState } from "../../src/task-runtime/application-state.mjs";
import { recordApproval } from "../../src/task-runtime/approval-record.mjs";
import { registerWorkbench as registerNativeWorkbench } from "../../src/task-runtime/native-adapter.mjs";
import { createTaskWorkbench as createWorkbench } from "../../src/task-runtime/workbench.mjs";
export function registerWorkbench(pi, options = {}) {
	return registerNativeWorkbench(pi, { ...options, application: createTaskApplicationState() });
}
export function createTaskWorkbench(options) {
	const workbench = createWorkbench(options);
	workbench.recordApproval = (input) => recordApproval(workbench, input);
	return workbench;
}
export * from "../../src/task-runtime/runtime.mjs";
export * from "../../src/task-runtime/workbench.mjs";
