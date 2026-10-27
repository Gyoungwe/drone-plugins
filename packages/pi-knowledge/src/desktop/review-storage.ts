import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { fileVersion, validateNote } from "../core/files.js";
import type { WikiReviewPorts, WikiReviewStateDocument } from "../core/wiki-review-ports.js";

/** Only opaque granted roots cross the host boundary; the review algorithm owns no OS path. */
export function createBrokerWikiReviewPorts(
	capabilities: PluginRuntimeCapabilities,
	stateRoot: string,
): WikiReviewPorts {
	const state: WikiReviewPorts["state"] = {
		async read(path) {
			const result = (await capabilities.call("state.readJson", { root: stateRoot, path })) as
				| { kind: "missing" }
				| ({ kind: "value" } & WikiReviewStateDocument);
			if (result.kind === "missing") return null;
			if (Buffer.byteLength(JSON.stringify(result.value)) > 256 * 1024)
				throw new Error("Wiki proposal exceeds its storage budget");
			return { value: result.value, version: result.version };
		},
		async list(path) {
			const entries = (await capabilities.call("state.list", { root: stateRoot, path })) as {
				name: string;
				kind: string;
			}[];
			return entries.filter((entry) => entry.kind === "file").map((entry) => entry.name);
		},
		async write(path, value, expectedVersion) {
			const parent = path.slice(0, path.lastIndexOf("/"));
			await capabilities.call("state.ensureDirectory", { root: stateRoot, path: parent });
			const result = (await capabilities.call("state.writeJson", {
				root: stateRoot,
				path,
				value,
				expectedVersion,
			})) as { kind: "value"; value: unknown };
			if (JSON.stringify(result.value) !== JSON.stringify(value))
				throw new Error("Wiki review state write could not be read back");
		},
		async remove(path, expectedVersion) {
			const result = (await capabilities.call("state.removeJson", {
				root: stateRoot,
				path,
				expectedVersion,
			})) as { kind: "missing" };
			if (result.kind !== "missing") throw new Error("Wiki review state removal could not be read back");
		},
	};
	async function rootFor(vault: string) {
		return ((await capabilities.call("roots.resolve", { path: vault, kind: "files" })) as { handle: string })
			.handle;
	}
	const files: WikiReviewPorts["files"] = {
		async read(binding, path) {
			validateNote(path);
			const root = await rootFor(binding.vault);
			try {
				const result = (await capabilities.call("files.readText", { root, path })) as {
					text: string;
					sha256: string;
					bytes: number;
					version: { mtimeMs: number; ctimeMs: number; size: number; ino: number };
				};
				return {
					path,
					text: result.text,
					hash: result.sha256,
					bytes: result.bytes,
					signature: fileVersion(result.version),
				};
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
				throw error;
			}
		},
		async write(binding, path, text, expectedHash, check) {
			validateNote(path);
			const root = await rootFor(binding.vault);
			await capabilities.call("files.ensureDirectory", { root, path: path.slice(0, path.lastIndexOf("/")) });
			await check();
			const result = (await capabilities.call("files.writeText", { root, path, text, expectedHash })) as {
				text: string;
			};
			if (result.text !== text) throw new Error("Wiki write could not be read back");
		},
		async remove(binding, path, expectedHash, check) {
			validateNote(path);
			const root = await rootFor(binding.vault);
			await check();
			await capabilities.call("files.remove", { root, path, expectedHash });
			if (await files.read(binding, path)) throw new Error("Wiki removal could not be read back");
		},
	};
	return { state, files };
}
