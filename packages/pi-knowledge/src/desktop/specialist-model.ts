import type { PluginModelSelection, PluginModelToolStepResult, PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { runKnowledgeSpecialist, type SpecialistRequest } from "../core/specialist-model-loop.js";

/** The tool loop and its function-valued capabilities never leave the actual knowledge owner. */
export function createBrokerKnowledgeSpecialist(capabilities: PluginRuntimeCapabilities) {
	return (request: SpecialistRequest) => runKnowledgeSpecialist({
		select: async profile => await capabilities.call("model.selection", { optionalProfile: profile }) as PluginModelSelection,
		step: async (input, signal) => await capabilities.call("model.toolStep", input, signal) as PluginModelToolStepResult,
	}, request);
}
