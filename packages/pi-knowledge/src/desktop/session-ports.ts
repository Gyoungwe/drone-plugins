import type { PluginRuntimeCapabilities, PluginProviderInspection, PluginSessionRecordReadResult } from "@gyoungwe/plugin-api/runtime";
import type { KnowledgeInterfaceSessionPorts } from "../extension/internal-knowledge-extension.js";

/** Caller-scoped ports; neither session ids nor approval grants are accepted as operation input. */
export function createManagedKnowledgeSessionPorts(capabilities: PluginRuntimeCapabilities) {
	let provider: PluginProviderInspection | undefined;
	let acceptance: unknown;
	const ports: KnowledgeInterfaceSessionPorts = {
		async initialize(context) {
			context.signal?.throwIfAborted();
			provider = await capabilities.call("provider.inspect", { alias: "tasks" }) as PluginProviderInspection;
			context.signal?.throwIfAborted();
			if (provider.state !== "absent" && provider.state !== "disabled")
				throw new Error(`Task runtime service is ${provider.state}; the function-rich task publication consumer is not yet connected`);
		},
		async inspect(context) {
			context.signal?.throwIfAborted();
			return await capabilities.call("session.inspect", null) as { agentActive: boolean; projectTrusted: boolean; readOnly: boolean };
		},
		taskRuntime() {
			if (!provider) throw new Error("Task runtime service selection has not been resolved");
			if (provider.state !== "absent" && provider.state !== "disabled")
				throw new Error(`Task runtime service is ${provider.state}; no task runtime was borrowed`);
			return null;
		},
		registerAcceptance(definition) {
			if (acceptance) throw new Error("Knowledge acceptance verifier is already registered");
			acceptance = definition;
			return () => { if (acceptance === definition) acceptance = undefined; };
		},
		async readRecords(context) {
			context.signal?.throwIfAborted();
			const result = await capabilities.call("session.records.read", null) as PluginSessionRecordReadResult;
			return { ...result, records: result.records.map(record => ({ ...record })) };
		},
		async appendRecord(type, data, context) {
			context.signal?.throwIfAborted();
			return await capabilities.call("session.records.append", { type, data }) as { durability: "durable" | "deferred" };
		},
		async select(title, options, context) {
			context.signal?.throwIfAborted();
			const inspection = await capabilities.call("session.inspect", null) as { agentActive: boolean };
			if (inspection.agentActive) throw new Error("Foreground Wiki review requires an idle session");
			const result = await capabilities.call("session.select", { title, options }) as { kind: "selected"; value: string } | { kind: "cancelled" };
			return result.kind === "selected" ? result.value : undefined;
		},
		async notify(content, context) {
			context.signal?.throwIfAborted();
			const result = await capabilities.call("session.notify", { content }) as { durability: "durable" | "deferred" };
			if (result.durability !== "durable") throw new Error("Knowledge command receipt is deferred; reopen before relying on saved history");
		},
	};
	return { ports, acceptance: () => acceptance, provider: () => provider };
}
