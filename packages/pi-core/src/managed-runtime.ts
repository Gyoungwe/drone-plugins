import type { PluginNativeRuntimeFactory } from "@gyoungwe/plugin-api/native";
import { createManagedTaskApplication } from "./task-runtime/managed-application.mjs";

export { createManagedTaskApplication };
export { inspectTaskBytes } from "./task-runtime/file-inspection.mjs";

/** Candidate data adapter; the production manifest stays on the native entry until full cutover. */
const create: PluginNativeRuntimeFactory = async (context) => {
	const application = createManagedTaskApplication(context);
	return {
		operations: application.operations,
		createNativeSession: application.createNativeSession,
		dispose: application.dispose,
	};
};
export default create;
