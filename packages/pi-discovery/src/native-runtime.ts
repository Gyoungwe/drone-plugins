import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import {
	link,
	lstat,
	mkdir,
	readFile,
	readdir,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { PluginResourceReservations } from "@gyoungwe/plugin-api/node/reservations";
import type {
	PluginRuntimeCapabilities,
	PluginRuntimeScope,
	PluginStateReadResult,
	PluginStateWriteInput,
} from "@gyoungwe/plugin-api/runtime";
import { createDiscoveryRuntime } from "./runtime.js";

interface NativeCaller {
	readonly scope: Extract<PluginRuntimeScope, { kind: "session" }>;
	readonly signal: AbortSignal;
	readonly root: string;
	readonly handle: string;
}
/** Explicit adapters may point at an already-selected Desktop root; defaults stay in the native workspace. */
export interface NativeDiscoveryOptions {
	readonly stateDirectory?: string;
	/** Isolated acceptance seam only. The standard entry always uses the shared local-user directory. */
	readonly leaseDirectory?: string;
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export async function nativeDiscoveryExtension(
	pi: ExtensionAPI,
	options: NativeDiscoveryOptions = {},
): Promise<void> {
	const calls = new AsyncLocalStorage<NativeCaller>();
	const reservations = new PluginResourceReservations(options.leaseDirectory);
	const active = new Map<string, NativeCaller>();
	const pending = new Set<Promise<unknown>>();
	let cleanupFailure: unknown;
	const current = () => {
		const caller = calls.getStore();
		if (!caller)
			throw new Error("Discovery capability has no live native caller");
		caller.signal.throwIfAborted();
		return caller;
	};
	const filePath = async (root: string, path: string) => {
		if (
			isAbsolute(path) ||
			path.includes("\\") ||
			path.includes("\0") ||
			(path !== "" &&
				path.split("/").some((part) => !part || part === "." || part === ".."))
		)
			throw new Error("Expected a discovery state-relative path");
		if ((await lstat(root)).isSymbolicLink())
			throw new Error("Discovery state root contains a symlink");
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
	const read = async (
		root: string,
		path: string,
	): Promise<PluginStateReadResult> => {
		const selected = await filePath(root, path);
		let bytes: Buffer;
		try {
			const metadata = await lstat(selected);
			if (!metadata.isFile() || metadata.size > 1048576)
				throw new Error("Discovery JSON state must be a file of at most 1 MiB");
			bytes = await readFile(selected);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT")
				return { kind: "missing", version: null };
			throw error;
		}
		if (bytes.length > 1048576)
			throw new Error("Discovery JSON state exceeds 1 MiB");
		return {
			kind: "value",
			value: JSON.parse(bytes.toString("utf8")),
			version: hash(bytes.toString("utf8")),
		};
	};
	const write = async (caller: NativeCaller, input: PluginStateWriteInput) => {
		if (!input.path.endsWith(".json"))
			throw new Error("Discovery state writes require JSON files");
		const selected = await filePath(caller.root, input.path);
		const bytes = `${JSON.stringify(input.value, null, 2)}\n`;
		if (Buffer.byteLength(bytes) > 1048576)
			throw new Error("Discovery JSON state exceeds 1 MiB");
		const check = async () => {
			caller.signal.throwIfAborted();
			if (
				(await read(caller.root, input.path)).version !== input.expectedVersion
			)
				throw new Error("Discovery state version conflict");
		};
		await check();
		const temporary = join(dirname(selected), `.discovery-${randomUUID()}.tmp`);
		try {
			await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
			await check();
			if (input.expectedVersion === null) await link(temporary, selected);
			else await rename(temporary, selected);
		} catch (error) {
			const [cleanup] = await Promise.allSettled([
				rm(temporary, { force: true }),
			]);
			if (cleanup.status === "rejected") {
				cleanupFailure = cleanup.reason;
				throw new AggregateError(
					[error, cleanup.reason],
					"Discovery write and cleanup failed",
				);
			}
			throw error;
		}
		try {
			await rm(temporary, { force: true });
		} catch (error) {
			cleanupFailure = error;
			throw error;
		}
		const stored = await read(caller.root, input.path);
		if (stored.version !== hash(bytes))
			throw new Error("Discovery state did not read back after write");
		return stored;
	};
	const capabilities: PluginRuntimeCapabilities = {
		async call(name, input) {
			const caller = current();
			if (name === "caller.scope") return { ...caller.scope };
			if (name === "roots.describe") {
				try {
					if (!(await lstat(caller.root)).isDirectory())
						throw new Error("Discovery state root is not a directory");
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
					throw error;
				}
				return [
					{
						handle: caller.handle,
						kind: "state",
						path: caller.root,
						access: "read-write",
					},
				];
			}
			const request = input as { root: string; path: string };
			if (request.root !== caller.handle)
				throw new Error("Discovery state root was not granted for this caller");
			if (name === "state.readJson") return read(caller.root, request.path);
			if (name === "state.list")
				return Promise.all(
					(await readdir(await filePath(caller.root, request.path))).map(
						async (name) => ({
							name,
							kind: (
								await lstat(join(caller.root, request.path, name))
							).isDirectory()
								? "directory"
								: "file",
						}),
					),
				);
			if (name === "state.reserve") {
				const directory = await realpath(
					await filePath(caller.root, request.path),
				);
				if (!(await lstat(directory)).isDirectory())
					throw new Error("State writer requires an existing directory");
				reservations.reserve("state-writers", [directory]);
				return { reserved: true };
			}
			if (name === "state.writeJson")
				return write(caller, input as PluginStateWriteInput);
			throw new Error(`Discovery native capability is unavailable: ${name}`);
		},
	};
	const abort = new AbortController();
	const runtime = await createDiscoveryRuntime({
		applicationId: randomUUID(),
		signal: abort.signal,
		resources: [],
		capabilities,
		events: { changed() {} },
	});
	const native = await runtime.createNativeSession!();
	const resolveCaller = async (
		context: ExtensionContext,
		signal: AbortSignal,
	): Promise<NativeCaller> => {
		signal.throwIfAborted();
		const canonical = await realpath(context.cwd);
		if (!options.stateDirectory)
			for (const path of [
				join(canonical, "runs"),
				join(canonical, "runs", ".drone-discovery"),
			]) {
				try {
					if ((await lstat(path)).isSymbolicLink())
						throw new Error("Discovery state path contains a symlink");
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
					break;
				}
			}
		const workspaceId =
			process.platform === "darwin" || process.platform === "win32"
				? canonical.replaceAll("\\", "/").toLowerCase()
				: canonical;
		let caller = active.get(workspaceId);
		if (!caller) {
			const root = options.stateDirectory
				? await realpath(options.stateDirectory)
				: join(canonical, "runs", ".drone-discovery");
			if (options.stateDirectory) {
				const stored = await read(root, "workspace-binding.json");
				if (stored.kind === "value") {
					const binding = stored.value as { workspaceId?: unknown };
					if (binding.workspaceId !== workspaceId)
						throw new Error(
							"Explicit discovery root belongs to another workspace",
						);
				}
			}
			caller = {
				scope: {
					kind: "session",
					workspaceId,
					workspaceDirectory: context.cwd,
					sessionId: context.sessionManager.getSessionId(),
				},
				root,
				handle: randomUUID(),
				signal,
			};
			active.set(workspaceId, caller);
		}
		return {
			...caller,
			signal,
			scope: {
				...caller.scope,
				sessionId: context.sessionManager.getSessionId(),
			},
		};
	};
	const prepare = async (caller: NativeCaller) => {
		if (options.stateDirectory) return;
		const runs = dirname(caller.root);
		for (const directory of [runs, caller.root]) {
			caller.signal.throwIfAborted();
			await mkdir(directory, { recursive: true, mode: 0o700 });
			if ((await lstat(directory)).isSymbolicLink())
				throw new Error("Discovery native state path contains a symlink");
		}
		const canonical = await realpath(caller.root);
		const outside = relative(
			await realpath(caller.scope.workspaceDirectory),
			canonical,
		);
		if (
			isAbsolute(outside) ||
			outside === ".." ||
			outside.startsWith(`..${sep}`)
		)
			throw new Error("Discovery native state escaped the workspace");
	};
	const adapted = Object.create(pi) as ExtensionAPI;
	adapted.registerTool = ((definition: ToolDefinition) => {
		const execute = definition.execute;
		return pi.registerTool({
			...definition,
			execute(id, input, signal, update, context) {
				const running = (async () => {
					const caller = await resolveCaller(
						context,
						signal ? AbortSignal.any([abort.signal, signal]) : abort.signal,
					);
					if (
						definition.name === "discovery_status" ||
						definition.name === "discovery_list_records" ||
						definition.name === "discovery_search_records"
					)
						input = {
							...(input as Record<string, unknown>),
							root: caller.handle,
						};
					if (definition.name === "discovery_bind_workspace") {
						caller.signal.throwIfAborted();
						await prepare(caller);
						if ((input as { root: string }).root === "native-state")
							input = {
								...(input as Record<string, unknown>),
								root: caller.handle,
							};
					}
					const result = await calls.run(caller, () =>
						execute(id, input, caller.signal, update, context),
					);
					caller.signal.throwIfAborted();
					return result;
				})();
				pending.add(running);
				void running.then(
					() => pending.delete(running),
					() => pending.delete(running),
				);
				return running;
			},
		});
	}) as ExtensionAPI["registerTool"];
	await native.extension(adapted);
	pi.on("session_shutdown", async () => {
		abort.abort(new Error("Discovery native session closed"));
		await Promise.allSettled([...pending]);
		await native.dispose();
		await runtime.dispose();
		if (cleanupFailure)
			throw new Error(
				"Discovery native state cleanup failed; writer lease retained",
				{ cause: cleanupFailure },
			);
		reservations.dispose();
		active.clear();
	});
}
export default nativeDiscoveryExtension;
