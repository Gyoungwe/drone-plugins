import type { PluginNativeSession } from "@gyoungwe/plugin-api/native";
import { result } from "../core/extension-helpers.js";
import { createKnowledgeNativeAdapter } from "../core/native-session-lifecycle.js";
import { createKnowledgeReadModel, type KnowledgeReadOwner } from "./read-model.js";

/** Desktop's migrated read-only native surface. Full research hooks remain in the CLI adapter. */
export function createDesktopKnowledgeNativeSession(owner: KnowledgeReadOwner, projectFor: (context: any) => Promise<string | null>): PluginNativeSession {
	const controller = new AbortController();
	const reads = createKnowledgeReadModel(owner);
	const adapter = createKnowledgeNativeAdapter(owner, controller, pi => {
		pi.registerTool({
			name: "knowledge_status", label: "Knowledge status",
			drone: { readOnly: true, capabilities: ["knowledge"] },
			description: "Report the configured local knowledge index.",
			parameters: { type: "object", properties: {}, additionalProperties: false },
			async execute(_id: string, _input: unknown, _signal: AbortSignal, _update: unknown, context: any) {
				const overview = await reads.overview(await projectFor(context));
				return result({ status: overview.state === "bound" ? "configured" : "unconfigured", ...overview });
			},
		});
		pi.registerTool({
			name: "knowledge_search", label: "Knowledge · local search",
			drone: { readOnly: true, capabilities: ["knowledge"] },
			description: "Search the configured local knowledge index. Results are excerpts, not publication proofs.",
			parameters: { type: "object", properties: {
				query: { type: "string", minLength: 1, maxLength: 2000 },
				limit: { type: "integer", minimum: 1, maximum: 12 },
			}, required: ["query"], additionalProperties: false },
			async execute(_id: string, input: { query: string; limit?: number }, _signal: AbortSignal, _update: unknown, context: any) {
				const binding = await owner.config.readKnowledgeBinding({ fresh: true });
				if (!binding) throw new Error("No application knowledge Vault is bound");
				return result(await reads.search({ ...input, revision: binding.revision }, await projectFor(context)));
			},
		});
	});
	return { ...adapter, toolEffects: { knowledge_status: "read", knowledge_search: "read" } };
}
