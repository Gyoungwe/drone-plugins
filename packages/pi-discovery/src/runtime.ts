import type { PluginNativeRuntimeFactory } from "@gyoungwe/plugin-api/native";
import { createKernelOperations } from "./runtime-kernels.js";
import { createNativeSession } from "./runtime-native-session.js";
import { createOperations } from "./runtime-operations.js";
import { owner } from "./runtime-owner.js";
import type { BoundWorkspaceRoot, WorkspaceOwner, WorkspaceScope } from "./runtime-state.js";
import { createWorkspaceAccess, createWorkspaceOperations } from "./runtime-workspace.js";

export { planSchema } from "./runtime-schemas.js";
export type { DiscoveryWorkspaceBinding } from "./runtime-state.js";

/** One application owner; each live call resolves its canonical workspace through the host. */
export const createDiscoveryRuntime: PluginNativeRuntimeFactory = async ({
	applicationId,
	signal,
	capabilities,
	events,
}) => {
	const owners = new Map<string, WorkspaceOwner>();
	const state = { applicationId, signal, capabilities, events, owners };
	const access = createWorkspaceAccess(capabilities);
	const context = {
		...state,
		...access,
		owner: (scope: WorkspaceScope, root: BoundWorkspaceRoot) => owner({ ...state, ...access }, scope, root),
	};
	const workspace = createWorkspaceOperations(context);
	const kernels = createKernelOperations(context);
	const operations = createOperations(capabilities, workspace, kernels);
	return {
		operations,
		createNativeSession: () =>
			createNativeSession({ ...state, ...access, ...workspace, ...kernels, operations }),
		async dispose() {
			await Promise.all([...owners.values()].map((item) => item.service.dispose()));
			owners.clear();
		},
	};
};
export default createDiscoveryRuntime;
