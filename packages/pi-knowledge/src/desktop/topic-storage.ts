import type { TopicMemoryStorageFactory } from "../core/topic-memory.js";
import type { WikiReviewPorts } from "../core/wiki-review-ports.js";

/** Topic algorithms use logical plugin-state keys and the same authorized source read port as Wiki review. */
export function createBrokerTopicMemoryStorage(io: WikiReviewPorts): TopicMemoryStorageFactory {
	return (binding, project) => {
		const key = `${binding.vaultId}/topic-memory/${project}.json`;
		return {
			key,
			async read() { return (await io.state.read(key))?.value ?? null; },
			async write(value, expectedRevision) {
				const current = await io.state.read(key);
				if (current !== null && (current.value as { revision: number }).revision !== expectedRevision)
					throw new Error("Topic memory revision changed");
				if (current === null && expectedRevision !== 0) throw new Error("Topic memory was removed");
				await io.state.write(key, value, current?.version ?? null);
			},
			async readSource(path) {
				const source = await io.files.read(binding, path);
				if (source === null) throw new Error("Topic source is missing");
				return source;
			},
		};
	};
}
