import type { PluginNativeFactOwner, PluginNativeSession } from "@gyoungwe/plugin-api/native";
import type { PluginRuntimeFactoryContext } from "@gyoungwe/plugin-api/runtime";
import { Type } from "typebox";
import {
	type ReadInput,
	readMetadata,
	readSchema,
	type WriteInput,
	writeMetadata,
	writeSchema,
} from "./runtime-schema.js";

export function createInquiryNativeSessionFactory(
	context: PluginRuntimeFactoryContext,
	read: (input: ReadInput) => Promise<unknown>,
	write: (input: WriteInput, signal: AbortSignal) => Promise<unknown>,
	factOwner: PluginNativeFactOwner,
): () => PluginNativeSession {
	const createNativeSession = (): PluginNativeSession => {
		let disposed = false;
		return {
			toolEffects: { inquiry_read: "read", inquiry_write: "write" },
			factOwner,
			extension(pi) {
				pi.registerTool({
					name: "inquiry_read",
					label: "Inquiry · read",
					description:
						"Read only this actual workspace’s explicitly bound Inquiry ledger. Imported/asserted records are not host provenance proofs.",
					parameters: Type.Object({ request: readSchema }, { additionalProperties: false }),
					annotations: { readOnlyHint: true },
					...readMetadata,
					async execute(_id, input) {
						if (disposed) throw new Error("Inquiry native projection is disposed");
						const value = await read(input.request);
						return {
							content: [{ type: "text", text: JSON.stringify(value) }],
							details: value,
						};
					},
				});
				pi.registerTool({
					name: "inquiry_write",
					label: "Inquiry · write",
					description:
						"Explicitly bind, update, reconcile or restore this workspace’s original Inquiry SQLite ledger. Every host write still requires its own approved root, version and caller checks.",
					parameters: Type.Object({ request: writeSchema }, { additionalProperties: false }),
					...writeMetadata,
					async execute(_id, input, signal) {
						if (disposed) throw new Error("Inquiry native projection is disposed");
						const value = await write(input.request, signal ?? context.signal);
						return {
							content: [{ type: "text", text: JSON.stringify(value) }],
							details: value,
						};
					},
				});
			},
			async dispose() {
				disposed = true;
			},
		};
	};
	return createNativeSession;
}
