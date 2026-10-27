import { watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { inspectNote, readNoteFile } from "./files.js";
import type { KnowledgeIndexFiles } from "./index-runtime-ports.js";

/** Local CLI access retains containment, no-symlink and stable-read checks. */
export function createLocalKnowledgeIndexFiles(vault: string): KnowledgeIndexFiles {
	return {
		inspect: path => inspectNote(vault, path),
		read: path => readNoteFile(vault, path),
		list: async path => (await readdir(join(vault, path), { withFileTypes: true })).map(entry => ({
			name: entry.name,
			kind: entry.isSymbolicLink() ? "symlink" : entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
		})),
		async watch(change, error) {
			const watcher = watch(vault, { recursive: true, persistent: false }, (_event, name) => change(name));
			watcher.on("error", error);
			return { close: () => watcher.close() };
		},
	};
}
