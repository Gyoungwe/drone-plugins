import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import type { WikiReviewPorts, WikiReviewStateDocument } from "../core/wiki-review-ports.js";

/** Atomic, version-checked application state; all paths are relative to one actually granted handle. */
export function createBrokerKnowledgeState(capabilities: PluginRuntimeCapabilities, root: string): WikiReviewPorts["state"] {
	return {
		async read(path) {
			const result = await capabilities.call("state.readJson", { root, path }) as
				| { kind: "missing" }
				| ({ kind: "value" } & WikiReviewStateDocument);
			return result.kind === "missing" ? null : { value: result.value, version: result.version };
		},
		async list(path) {
			const entries = await capabilities.call("state.list", { root, path }) as { name: string; kind: string }[];
			return entries.filter(entry => entry.kind === "file").map(entry => entry.name);
		},
		async write(path, value, expectedVersion) {
			const parents = path.split("/").slice(0, -1);
			for (let length = 1; length <= parents.length; length++)
				await capabilities.call("state.ensureDirectory", { root, path: parents.slice(0, length).join("/") });
			const result = await capabilities.call("state.writeJson", { root, path, value, expectedVersion }) as { value: unknown };
			if (JSON.stringify(result.value) !== JSON.stringify(value)) throw new Error("Knowledge state write could not be read back");
		},
		async remove(path, expectedVersion) {
			const result = await capabilities.call("state.removeJson", { root, path, expectedVersion }) as { kind: string };
			if (result.kind !== "missing") throw new Error("Knowledge state removal could not be read back");
		},
	};
}
