import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { inspectTaskBytes } from "./file-inspection.js";
import { type FileExpectation, LIMITS, taskError } from "./workbench-state.js";

export const ARTIFACT_ROOT_KINDS = Object.freeze(["workspace", "vault", "research-run"]);

export async function inspectTaskFile(cwd: string, input: string, expected: FileExpectation = {}) {
	const base = await realpath(cwd),
		path = await realpath(resolve(cwd, input));
	const rel = relative(base, path);
	if (
		!rel ||
		isAbsolute(rel) ||
		rel === ".." ||
		rel.startsWith(`..${sep}`) ||
		rel
			.split(sep)
			.some(
				(part) =>
					part.startsWith(".") || /^(?:auth|credentials|secrets?|tokens?|password)(?:\.|$)/i.test(part),
			)
	)
		throw taskError("file-scope", "Choose an explicit non-private file within this task workspace.");
	const stat = await lstat(path);
	if (!stat.isFile() || stat.size > LIMITS.fileBytes)
		throw taskError(
			"file-limit",
			"Expected a regular file of at most 8 MiB; larger files need a dedicated read-only adapter.",
		);
	const file = await open(path, "r");
	try {
		const opened = await file.stat();
		if (
			(await realpath(path)) !== path ||
			opened.ino !== stat.ino ||
			opened.dev !== stat.dev ||
			opened.size > LIMITS.fileBytes
		)
			throw taskError("file-changed", "File scope/version changed before inspection.");
		const bytes = await file.readFile();
		if (bytes.length > LIMITS.fileBytes)
			throw taskError("file-limit", "File changed beyond the inspection limit.");
		return await inspectTaskBytes(
			bytes,
			{
				path: rel.split(sep).join("/"),
				absolutePath: path,
				rootKind:
					expected.rootKind && ARTIFACT_ROOT_KINDS.includes(expected.rootKind)
						? expected.rootKind
						: "workspace",
			},
			expected,
		);
	} finally {
		await file.close();
	}
}
