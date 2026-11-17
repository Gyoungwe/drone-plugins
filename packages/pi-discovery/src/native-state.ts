import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { PluginStateReadResult } from "@gyoungwe/plugin-api/runtime";

export const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export const filePath = async (root: string, path: string) => {
	if (
		isAbsolute(path) ||
		path.includes("\\") ||
		path.includes("\0") ||
		(path !== "" && path.split("/").some((part) => !part || part === "." || part === ".."))
	)
		throw new Error("Expected a discovery state-relative path");
	if ((await lstat(root)).isSymbolicLink()) throw new Error("Discovery state root contains a symlink");
	let selected = root;
	for (const part of path === "" ? [] : path.split("/")) {
		selected = join(selected, part);
		try {
			if ((await lstat(selected)).isSymbolicLink())
				throw new Error("Discovery state path contains a symlink");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	return selected;
};
export const read = async (root: string, path: string): Promise<PluginStateReadResult> => {
	const selected = await filePath(root, path);
	let bytes: Buffer;
	try {
		const metadata = await lstat(selected);
		if (!metadata.isFile() || metadata.size > 1048576)
			throw new Error("Discovery JSON state must be a file of at most 1 MiB");
		bytes = await readFile(selected);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "missing", version: null };
		throw error;
	}
	if (bytes.length > 1048576) throw new Error("Discovery JSON state exceeds 1 MiB");
	return {
		kind: "value",
		value: JSON.parse(bytes.toString("utf8")),
		version: hash(bytes.toString("utf8")),
	};
};
