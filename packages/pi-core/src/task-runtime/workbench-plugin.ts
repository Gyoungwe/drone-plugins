import type { PluginRuntimeClient } from "@gyoungwe/plugin-api/runtime";

export type WorkbenchPluginClient = Pick<PluginRuntimeClient, "invoke">;

export interface WorkbenchPluginPort {
	status(): Promise<unknown>;
	plan(items: readonly string[]): Promise<unknown>;
	todo(input: unknown): Promise<unknown>;
	memorySave(input: unknown): Promise<unknown>;
	persist(): Promise<unknown>;
}

function createWorkbenchPluginPort(client: WorkbenchPluginClient): WorkbenchPluginPort {
	return Object.freeze<WorkbenchPluginPort>({
		status: () => client.invoke("status", {}),
		plan: (items) => client.invoke("plan", { items: [...items] }),
		todo: (input) => client.invoke("todo", input),
		memorySave: (input) => client.invoke("memorySave", input),
		persist: () => client.invoke("persist", {}),
	});
}

export { createWorkbenchPluginPort };
