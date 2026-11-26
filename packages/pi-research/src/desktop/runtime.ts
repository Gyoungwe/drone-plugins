import type { PluginNativeRuntimeFactory } from "@gyoungwe/plugin-api/native";
import type { PluginRuntimeOperation, PluginRuntimeScope } from "@gyoungwe/plugin-api/runtime";
import {
	createResearchHost,
	type ResearchHostOperations,
	type ResearchHostPort,
	type ResearchRunDetailInput,
} from "../research-host.js";
import { queryFailureCandidates } from "./failure-candidate-client.js";
import { zoteroAcceptanceOperations, zoteroIdentifyNativeOperation } from "./zotero-acceptance.js";
import { registerManagedZoteroTools, ZOTERO_TOOL_EFFECTS } from "./zotero-tools.js";

export { createDesktopFailureCandidateSink } from "./failure-candidate-client.js";

function scopeWorkspace(scope: PluginRuntimeScope): string {
	if (scope.kind === "application") throw new Error("Research status requires a selected workspace");
	return scope.workspaceDirectory;
}

function paramsOf(input: unknown): Record<string, unknown> {
	return input && typeof input === "object" && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: {};
}

function portFor(capabilities: { call(name: string, input: unknown): Promise<unknown> }): ResearchHostPort {
	return {
		async resolveRoot(path) {
			const response = (await capabilities.call("roots.resolve", { path, kind: "files" })) as {
				handle?: unknown;
			};
			if (!response || typeof response.handle !== "string" || !response.handle)
				throw new Error("Host did not grant a workspace files root");
			return { handle: response.handle };
		},
		async readText(root, path) {
			const response = (await capabilities.call("files.readText", { root, path })) as { text?: unknown };
			if (!response || typeof response.text !== "string")
				throw new Error(`Host returned invalid text for ${path}`);
			return response.text;
		},
		async listFiles(root, path) {
			const response = await capabilities.call("files.list", { root, path });
			if (!Array.isArray(response)) throw new Error(`Host returned invalid directory listing for ${path}`);
			return response.map((value) => {
				if (!value || typeof value !== "object" || Array.isArray(value))
					throw new Error("directory entry must be an object");
				const entry = value as Record<string, unknown>;
				if (typeof entry.name !== "string" || typeof entry.kind !== "string")
					throw new Error("Host returned an invalid directory entry");
				return {
					name: entry.name,
					kind: ["file", "directory", "symlink", "other"].includes(entry.kind)
						? (entry.kind as "file" | "directory" | "symlink" | "other")
						: "other",
				};
			});
		},
	};
}

async function readDetail(operations: ResearchHostOperations, input: ResearchRunDetailInput) {
	if (operations.detail)
		return { ...(await operations.detail(input)), scientificallyVerified: false as const };
	const result = await operations.status(input);
	const item = "item" in result ? result.item : result.items.find((run) => run.runId === input.runId);
	if (!item) throw new Error("Research plugin did not return a run detail");
	return {
		...item,
		scientificallyVerified: false as const,
		route: [],
		sources: [],
		claims: [],
		warnings: ["The installed research plugin exposes run metadata only; detailed evidence is unavailable."],
		coverage: null,
		archive: { count: 0, reused: 0, verified: false },
	};
}

function operation(name: "status" | "listRuns" | "detail"): PluginRuntimeOperation {
	return {
		inputSchema: { type: "object" },
		resultSchema: { type: "object" },
		effect: "read",
		execute: async (input, callContext) => {
			const workspace = scopeWorkspace(callContext.scope);
			const params = paramsOf(input);
			const adapter = createResearchHost(portFor(callContext.capabilities));
			const base = {
				workspace,
				project: params.project === undefined || params.project === null ? undefined : String(params.project),
				limit: params.limit === undefined ? undefined : Number(params.limit),
			};
			const runDir = params.runDir === undefined ? undefined : String(params.runDir);
			if (name === "status") return adapter.operations.status({ ...base, runDir });
			if (name === "detail") {
				return readDetail(adapter.operations, {
					...base,
					runDir,
					runId: params.runId === undefined ? undefined : String(params.runId),
				});
			}
			const result = await adapter.operations.listRuns(base);
			return {
				items: result.items.map((item) => ({ ...item, scientificallyVerified: false as const })),
				total: result.total,
			};
		},
	};
}

/**
 * Desktop runtime: read-only research operations over host-granted roots, and per session the
 * Zotero tools, whose network goes through the host.
 */
const createDesktopRuntime: PluginNativeRuntimeFactory = async (context) => {
	return {
		operations: {
			status: operation("status"),
			listRuns: operation("listRuns"),
			detail: operation("detail"),
			queryFailureCandidates,
			...zoteroAcceptanceOperations(),
		},
		createNativeSession: async () => ({
			toolEffects: ZOTERO_TOOL_EFFECTS,
			nativeOperations: { identify: zoteroIdentifyNativeOperation },
			extension: (pi: { registerTool(tool: unknown): void }) =>
				registerManagedZoteroTools(pi, (name, input, signal) =>
					context.capabilities.call(name, input, signal),
				),
			dispose: async () => {},
		}),
		dispose: async () => {},
	};
};

export default createDesktopRuntime;
