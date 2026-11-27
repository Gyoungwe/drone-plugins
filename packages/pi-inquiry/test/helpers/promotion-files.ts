import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import type { PluginRuntimeCapabilities, PluginRuntimeRootDescription } from "@gyoungwe/plugin-api/runtime";
import type { WorkspaceEntry } from "../../src/workspace.js";

type FileVersion = { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number };
type FileRequest = {
	root?: string;
	path?: string;
	from?: string;
	to?: string;
	entries?: WorkspaceEntry[];
	expectedHash?: string | null;
	expectedVersion?: FileVersion;
};
type PromotionFilesOptions = {
	access?: "read" | "read-write";
	includeRoot?: boolean;
	afterWriteIndex?: (seed: (path: string, text: string) => Promise<void>) => Promise<void>;
};
type FixtureState = {
	directory: string;
	root: PluginRuntimeRootDescription;
	writes: string[];
	expectedHashes: Array<string | null>;
	includeRoot: boolean;
	afterWriteIndex?: PromotionFilesOptions["afterWriteIndex"];
};

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

function isCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function safePath(state: FixtureState, path: string): string {
	if (
		path.startsWith("/") ||
		path.includes("\\") ||
		path.split("/").some((part) => part === ".." || part === ".")
	)
		throw new Error("Promotion fixture path confinement");
	const target = resolve(state.directory, path);
	const suffix = relative(state.directory, target);
	if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`))
		throw new Error("Promotion fixture path confinement");
	return target;
}

async function seedFile(state: FixtureState, path: string, text: string): Promise<void> {
	const target = safePath(state, path);
	await mkdir(join(target, ".."), { recursive: true });
	await writeFile(target, text);
}

async function fileVersion(state: FixtureState, path: string): Promise<FileVersion> {
	const value = await lstat(safePath(state, path));
	return {
		dev: value.dev,
		ino: value.ino,
		size: value.size,
		mtimeMs: value.mtimeMs,
		ctimeMs: value.ctimeMs,
	};
}

async function indexHash(state: FixtureState): Promise<string | null> {
	try {
		return hash(await readFile(safePath(state, "results/index.json"), "utf8"));
	} catch (error) {
		if (isCode(error, "ENOENT")) return null;
		throw error;
	}
}

async function statFile(state: FixtureState, path: string) {
	const value = await lstat(safePath(state, path));
	return {
		kind: value.isFile()
			? "file"
			: value.isDirectory()
				? "directory"
				: value.isSymbolicLink()
					? "symlink"
					: "other",
		version: await fileVersion(state, path),
	};
}

async function readText(state: FixtureState, path: string) {
	const text = await readFile(safePath(state, path), "utf8");
	return {
		text,
		sha256: hash(text),
		bytes: Buffer.byteLength(text),
		version: await fileVersion(state, path),
	};
}

async function ensureDirectory(state: FixtureState, path: string) {
	state.writes.push("files.ensureDirectory");
	try {
		await mkdir(safePath(state, path));
		return { created: true };
	} catch (error) {
		if (!isCode(error, "EEXIST")) throw error;
		if (!(await lstat(safePath(state, path))).isDirectory())
			throw new Error("Promotion fixture path is not a directory");
		return { created: false };
	}
}

async function moveFile(state: FixtureState, input: FileRequest) {
	state.writes.push("files.move");
	const from = input.from ?? "";
	const to = input.to ?? "";
	const source = safePath(state, from);
	const destination = safePath(state, to);
	const sourceStat = await lstat(source);
	if (!sourceStat.isFile()) throw new Error("Promotion fixture source is not a file");
	if (JSON.stringify(await fileVersion(state, from)) !== JSON.stringify(input.expectedVersion))
		throw new Error("Promotion fixture source version changed");
	try {
		await lstat(destination);
		throw new Error("Promotion fixture target already exists");
	} catch (error) {
		if (!isCode(error, "ENOENT")) throw error;
	}
	await rename(source, destination);
	return { moved: true, version: await fileVersion(state, to) };
}

async function writeIndex(state: FixtureState, input: FileRequest) {
	state.writes.push("files.writeIndex");
	const entries = input.entries ?? [];
	const ids = entries.map((entry) => entry.artifactId);
	const paths = entries.map((entry) => entry.resultPath);
	if (new Set(ids).size !== ids.length || new Set(paths).size !== paths.length)
		throw new Error("Promotion fixture duplicate index entry");
	const actualHash = await indexHash(state);
	state.expectedHashes.push(input.expectedHash ?? null);
	if (actualHash !== (input.expectedHash ?? null)) throw new Error("Promotion fixture index CAS conflict");
	const text = `${JSON.stringify(entries, null, 2)}\n`;
	await writeFile(safePath(state, "results/index.json"), text);
	await state.afterWriteIndex?.((path, value) => seedFile(state, path, value));
	return { written: true, sha256: hash(text), bytes: Buffer.byteLength(text), entries };
}

async function callFiles(state: FixtureState, name: string, input: FileRequest) {
	if (input.root !== state.root.handle) throw new Error("Promotion fixture root mismatch");
	if (name === "files.stat") return statFile(state, input.path ?? "");
	if (name === "files.readText") return readText(state, input.path ?? "");
	if (name === "files.ensureDirectory") return ensureDirectory(state, input.path ?? "");
	if (name === "files.move") return moveFile(state, input);
	if (name === "files.writeIndex") return writeIndex(state, input);
	throw new Error(`Promotion fixture capability unavailable: ${name}`);
}

export async function createPromotionFiles(options: PromotionFilesOptions = {}) {
	const directory = await mkdtemp(join(tmpdir(), "inquiry-promotion-"));
	const state: FixtureState = {
		directory,
		root: {
			handle: "files-root",
			kind: "files",
			path: directory,
			access: options.access ?? "read-write",
		},
		writes: [],
		expectedHashes: [],
		includeRoot: options.includeRoot !== false,
		afterWriteIndex: options.afterWriteIndex,
	};
	const capabilities: PluginRuntimeCapabilities = {
		async call(name, input, signal) {
			signal?.throwIfAborted();
			if (name === "roots.describe") return state.includeRoot ? [state.root] : [];
			if (name.startsWith("files.")) {
				if (!state.includeRoot) throw new Error("Promotion fixture has no files root");
				return callFiles(state, name, input as FileRequest);
			}
			throw new Error(`Promotion fixture capability unavailable: ${name}`);
		},
	};
	return {
		root: state.includeRoot ? state.root : undefined,
		capabilities,
		writes: state.writes,
		expectedHashes: state.expectedHashes,
		seed: (path: string, text: string) => seedFile(state, path, text),
		read: (path: string) => readFile(safePath(state, path), "utf8"),
		close: () => rm(directory, { recursive: true, force: true }),
	};
}
