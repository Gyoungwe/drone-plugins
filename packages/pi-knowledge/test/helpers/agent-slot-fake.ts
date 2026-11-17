import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";

/** Keep existing model-only spies scoped to the model transport they assert on. */
export function withAgentSlotFake(call: PluginRuntimeCapabilities["call"]): PluginRuntimeCapabilities {
	return {
		async call(name, ...args) {
			if (name === "agent.slot.acquire") return { lease: "synthetic-agent-slot" };
			if (name === "agent.slot.release") return { released: true };
			return call(name, ...args);
		},
	};
}
