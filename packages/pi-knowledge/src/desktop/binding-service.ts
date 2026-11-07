import type { PluginRuntimeOperation } from "@gyoungwe/plugin-api/runtime";
import type { KnowledgeBinding } from "../core/config.js";

/**
 * The knowledge.binding service: which Vault is bound (id, revision, real path), or null. Other
 * plugins (the managed task runtime) use it to accept Vault files; it never returns Vault content.
 */
export function bindingOperation(read: () => Promise<KnowledgeBinding | null>): PluginRuntimeOperation {
	return {
		inputSchema: { type: "null" },
		resultSchema: {
			anyOf: [
				{ type: "null" },
				{
					type: "object",
					properties: {
						vaultId: { type: "string", pattern: "^[a-f0-9]{24}$" },
						revision: { type: "integer", minimum: 1 },
						vault: { type: "string" },
					},
					required: ["vaultId", "revision", "vault"],
					additionalProperties: false,
				},
			],
		},
		effect: "read",
		execute: async () => {
			const binding = await read();
			return binding && { vaultId: binding.vaultId, revision: binding.revision, vault: binding.vault };
		},
	};
}
