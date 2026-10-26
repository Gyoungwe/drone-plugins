import type {
	PluginRuntimeFactory,
	PluginRuntimeOperation,
	PluginRuntimeScope,
} from "@gyoungwe/plugin-api/runtime";
import { createResearchHost, type ResearchHostPort } from "../research-host.js";

function scopeWorkspace(scope: PluginRuntimeScope): string {
	if (scope.kind === "application") throw new Error("Research status requires a selected workspace");
	return scope.workspaceDirectory;
}

function paramsOf(input: unknown): Record<string, unknown> {
	return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

function portFor(capabilities: { call(name: string, input: unknown): Promise<unknown> }): ResearchHostPort {
	return {
		async resolveRoot(path) {
			const response = await capabilities.call("roots.resolve", { path, kind: "files" }) as { handle?: unknown };
			if (!response || typeof response.handle !== "string" || !response.handle)
				throw new Error("Host did not grant a workspace files root");
			return { handle: response.handle };
		},
		async readText(root, path) {
			const response = await capabilities.call("files.readText", { root, path }) as { text?: unknown };
			if (!response || typeof response.text !== "string") throw new Error(`Host returned invalid text for ${path}`);
			return response.text;
		},
		async listFiles(root, path) {
			const response = await capabilities.call("files.list", { root, path });
			if (!Array.isArray(response)) throw new Error(`Host returned invalid directory listing for ${path}`);
			return response.map(value => {
				if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("directory entry must be an object");
				const entry = value as Record<string, unknown>;
				if (typeof entry.name !== "string" || typeof entry.kind !== "string") throw new Error("Host returned an invalid directory entry");
				return {
					name: entry.name,
					kind: ["file", "directory", "symlink", "other"].includes(entry.kind)
						? entry.kind as "file" | "directory" | "symlink" | "other"
						: "other",
				};
			});
		},
	};
}

/** Read-only Desktop runtime. Host-granted roots are adapted to the public research host port. */
const createDesktopRuntime: PluginRuntimeFactory = async context => {
	const adapterFor = (capabilities: { call(name: string, input: unknown): Promise<unknown> }) =>
		createResearchHost(portFor(capabilities));
	const operation = (name: "status" | "listRuns" | "detail"): PluginRuntimeOperation => ({
		inputSchema: { type: "object" },
		resultSchema: { type: "object" },
		effect: "read",
		execute: async (input, callContext) => {
			const workspace = scopeWorkspace(callContext.scope);
			const params = paramsOf(input);
			const adapter = adapterFor(callContext.capabilities);
			const base = {
				workspace,
				project: params.project === undefined ? undefined : String(params.project),
				limit: params.limit === undefined ? undefined : Number(params.limit),
			};
			const runDir = params.runDir === undefined ? undefined : String(params.runDir);
			if (name === "status") return adapter.operations.status({ ...base, runDir });
			if (name === "detail") {
				if (!adapter.operations.detail) throw new Error("Research detail operation is unavailable");
				return adapter.operations.detail({ ...base, runDir, runId: params.runId === undefined ? undefined : String(params.runId) });
			}
			return adapter.operations.listRuns(base);
		},
	});
	return {
		operations: { status: operation("status"), listRuns: operation("listRuns"), detail: operation("detail") },
		dispose: async () => {},
	};
};

export default createDesktopRuntime;
