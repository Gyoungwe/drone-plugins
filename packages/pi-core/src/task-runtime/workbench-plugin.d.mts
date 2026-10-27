export interface WorkbenchPluginClient {
	invoke(operation: string, input: unknown, signal?: AbortSignal): Promise<unknown>;
}

export interface WorkbenchPluginPort {
	status(): Promise<unknown>;
	plan(items: readonly string[]): Promise<unknown>;
	todo(input: unknown): Promise<unknown>;
	memorySave(input: unknown): Promise<unknown>;
	persist(): Promise<unknown>;
}

export function createWorkbenchPluginPort(client: WorkbenchPluginClient): WorkbenchPluginPort;
