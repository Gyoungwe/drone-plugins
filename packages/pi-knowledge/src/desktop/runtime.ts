import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import type { PluginNativeRuntimeFactory } from "@gyoungwe/plugin-api/native";
import { parseKnowledgeBinding, projectIdentity, type KnowledgeBinding } from "../core/config.js";
import { createKnowledgeOwnerLifecycle } from "../core/owner-lifecycle.js";
import { createKnowledgeReadModel, type KnowledgeReadOwner } from "./read-model.js";
import { createDesktopKnowledgeNativeSession } from "./native.js";
import { overviewInputSchema, overviewResultSchema, searchInputSchema, searchResultSchema, type KnowledgeSearchInput } from "./contract.js";

async function projectFor(capabilities: PluginRuntimeCapabilities, workspace: string | null): Promise<string | null> {
	if (workspace === null) return null;
	const { handle } = await capabilities.call("roots.resolve", { path: workspace, kind: "files" }) as { handle: string };
	let text: string;
	try {
		({ text } = await capabilities.call("files.readText", { root: handle, path: ".pi/research-workspace.json" }) as { text: string });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return projectIdentity(workspace);
	}
	const document: unknown = JSON.parse(text);
	if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("Invalid research workspace configuration");
	return projectIdentity(workspace, (document as Record<string, unknown>).knowledgeProjectId);
}

/** Desktop read-only slice: one granted index resource shared by UI and native tools. */
const createDesktopRuntime: PluginNativeRuntimeFactory = async context => {
	const states = context.resources.filter(resource => resource.kind === "state");
	if (states.length !== 1) throw new Error("Knowledge runtime requires exactly one authorized application-state root");
	const state = states[0].handle;
	async function readKnowledgeBinding(): Promise<KnowledgeBinding | null> {
		const response = await context.capabilities.call("state.readJson", { root: state, path: "binding.json" }) as
			{ kind: "missing" } | { kind: "value"; value: unknown };
		return response.kind === "missing" ? null : parseKnowledgeBinding(response.value);
	}
	const config: KnowledgeReadOwner["config"] = {
		readKnowledgeBinding,
		async withKnowledgeBinding(binding, operation) {
			const current = await readKnowledgeBinding();
			if (!current || current.vaultId !== binding.vaultId || current.revision !== binding.revision)
				throw new Error("Knowledge binding changed; refresh before reading");
			return operation();
		},
	};
	type Resource = { handle: string; request(operation: string, input?: object): Promise<any> };
	const resources = new Map<string, Promise<Resource>>();
	async function getKnowledgeService(binding?: KnowledgeBinding): Promise<Resource> {
		const current = binding ?? await readKnowledgeBinding();
		if (!current) throw new Error("No application knowledge Vault is bound");
		const existing = resources.get(current.vaultId);
		if (existing) return existing;
		const opening = (async () => {
			const vault = await context.capabilities.call("roots.resolve", { path: current.vault, kind: "files" }) as { handle: string };
			const resource = await context.capabilities.call("resource.create", {
				resource: "index", storage: { root: state, key: current.vaultId }, parameters: { vaultRoot: vault.handle },
				reservation: { namespace: "knowledge-writers", roots: [{ root: vault.handle, path: "", kind: "vault" }],
					storage: { path: "index.sqlite", kind: "index" } },
			}) as { handle: string };
			return { handle: resource.handle, request: (operation: string, input: object = {}) =>
				context.capabilities.call("resource.invoke", { handle: resource.handle, operation, input }) };
		})();
		resources.set(current.vaultId, opening);
		try { return await opening; }
		catch (error) { resources.delete(current.vaultId); throw error; }
	}
	const lifecycle = createKnowledgeOwnerLifecycle({
		async dispose() {
			// The host owns resource processes and reservations. After our calls
			// drain, its activation cleanup closes children and reports failures.
			// Shutdown has no caller authority for new capability requests.
			resources.clear();
		},
	});
	const owner: KnowledgeReadOwner = { config, services: { getKnowledgeService }, ...lifecycle };
	const reads = createKnowledgeReadModel(owner);
	return {
		operations: {
			overview: { inputSchema: overviewInputSchema, resultSchema: overviewResultSchema, effect: "read",
				execute: async (_input, call) => reads.overview(await projectFor(call.capabilities, call.scope.kind === "application" ? null : call.scope.workspaceDirectory)) },
			search: { inputSchema: searchInputSchema, resultSchema: searchResultSchema, effect: "read",
				execute: async (input, call) => reads.search(input as KnowledgeSearchInput, await projectFor(call.capabilities, call.scope.kind === "application" ? null : call.scope.workspaceDirectory)) },
		},
		createNativeSession: () => createDesktopKnowledgeNativeSession(owner, native => projectFor(context.capabilities, native.cwd)),
		dispose: () => owner.dispose(),
	};
};
export default createDesktopRuntime;
