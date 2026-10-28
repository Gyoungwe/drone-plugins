import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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
import { homedir } from "node:os";
import {
	ContainerSandboxRunner,
	describeContainerExecution,
	ExecutionTransactions,
	NodeExecutionReceiptStorage,
	prepareSandboxRunDirectory,
	type ContainerSandboxOptions,
	type ExecutionIdentity,
} from "@gyoungwe/plugin-api/node/execution";
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
	PluginExecutionInput,
} from "@gyoungwe/plugin-api/runtime";
import { createDiscoveryRuntime } from "./runtime.js";

interface NativeCaller {
	readonly scope: Extract<PluginRuntimeScope, { kind: "session" }>;
	readonly signal: AbortSignal;
	readonly root: string;
	readonly handle: string;
	readonly context: ExtensionContext;
}
/** Explicit adapters may point at an already-selected Desktop root; defaults stay in the native workspace. */
export interface NativeDiscoveryOptions {
	readonly stateDirectory?: string;
	/** Isolated acceptance seam only. The standard entry always uses the shared local-user directory. */
	readonly leaseDirectory?: string;
	/** Explicit Node adapter configuration; standard Pi uses the shared runner's language defaults. */
	readonly container?: Pick<ContainerSandboxOptions, "runtime" | "pythonImage" | "rImage">;
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
	const applicationId = randomUUID();
	const executionKey = randomBytes(32);
	const sourceIdentity = hash(await readFile(new URL(import.meta.url), "utf8"));
	let execution: Promise<ExecutionTransactions> | undefined;
	const executionOwner = () => {
		if (!execution)
			execution = (async () => {
				const agentRoot = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
				await mkdir(agentRoot, { recursive: true, mode: 0o700 });
				const storage = await NodeExecutionReceiptStorage.create(
					join(await realpath(agentRoot), "plugin-execution-receipts"),
					executionKey,
				);
				return new ExecutionTransactions(storage);
			})().catch((error) => {
				execution = undefined;
				throw error;
			});
		return execution;
	};
	const executionIdentity = (caller: NativeCaller): ExecutionIdentity => ({
		pluginId: "@gyoungwe/pi-discovery",
		sourceIdentity,
		applicationId,
		sessionId: caller.scope.sessionId,
		workspaceId: caller.scope.workspaceId,
	});
	const assertExecutionCaller = async (caller: NativeCaller) => {
		caller.signal.throwIfAborted();
		const workspace = await realpath(caller.context.cwd);
		const id =
			process.platform === "darwin" || process.platform === "win32"
				? workspace.replaceAll("\\", "/").toLowerCase()
				: workspace;
		if (
			id !== caller.scope.workspaceId ||
			caller.context.sessionManager.getSessionId() !== caller.scope.sessionId
		)
			throw new Error("Native execution caller or canonical workspace changed");
		return workspace;
	};
	const executeCapability = async (
		name: string,
		input: unknown,
		caller: NativeCaller,
	): Promise<unknown> => {
		await assertExecutionCaller(caller);
		if (name === "execution.describe") {
			const available = await describeContainerExecution(options.container);
			await assertExecutionCaller(caller);
			return {
				kind: available.runtime ? "container" : "unavailable",
				images: available.images,
				networkDisabled: true,
				writesOnlyToRunDirectory: true,
			};
		}
		if (name === "execution.receipt")
			return (await executionOwner()).receipt(
				executionIdentity(caller),
				(input as { requestId: string }).requestId,
			);
		if (name === "execution.cancel") {
			const owner = await executionOwner(),
				requestId = (input as { requestId: string }).requestId;
			const receipt = await owner.receipt(executionIdentity(caller), requestId);
			if (receipt.kind === "missing" || receipt.receipt.status !== "accepted") return receipt;
			if (
				!caller.context.hasUI ||
				!(await caller.context.ui.confirm(
					"Cancel owned execution",
					`Workspace: ${caller.scope.workspaceDirectory}\nCreator SDK session: ${caller.scope.sessionId}\nCancel accepted request ${requestId} and wait for its owned resources and terminal receipt?`,
					{ signal: caller.signal },
				))
			)
				throw new Error("Native execution cancellation was not approved");
			await assertExecutionCaller(caller);
			return owner.cancel(executionIdentity(caller), requestId);
		}
		if (name !== "execution.run") throw new Error(`Unknown native execution capability: ${name}`);
		const request = input as PluginExecutionInput;
		if (!/^sha256:[a-f0-9]{64}$/.test(request.image))
			throw new Error("Native execution requires an exact cached image ID");
		if (!caller.context.hasUI)
			throw new Error(
				"Native execution requires interactive approval; headless calls cannot authorize code",
			);
		const approved = await caller.context.ui.confirm(
			"Bounded container execution",
			`Workspace: ${caller.scope.workspaceDirectory}\nCreator SDK session: ${caller.scope.sessionId}\nLanguage: ${request.language}\nDirectory: ${request.runDirectory}\nConfigured image ID: ${request.image}\nData: ${request.dataClassification}\nTimeout: ${request.timeoutMs}ms; output: ${request.maxOutputBytes} bytes\nNetwork disabled; only this runs directory writable; no image pull.\nCode:\n${request.code}`,
			{ signal: caller.signal },
		);
		if (!approved) throw new Error("Native execution was not approved");
		const workspace = await assertExecutionCaller(caller);
		const available = await describeContainerExecution(options.container);
		if (!available.runtime || !available.images[request.language])
			throw Object.assign(
				new Error("Configured language image is not cached; no image was pulled"),
				{ code: "EXECUTION_IMAGE_NOT_CACHED" },
			);
		if (available.images[request.language] !== request.image)
			throw Object.assign(
				new Error("Requested image does not match the configured cached language image"),
				{ code: "EXECUTION_IMAGE_MISMATCH" },
			);
		await prepareSandboxRunDirectory(workspace, request.runDirectory, caller.signal);
		const runner = await ContainerSandboxRunner.create({
			...options.container,
			runtime: available.runtime,
			projectRoot: workspace,
			pythonImage: request.image,
			rImage: request.image,
			reservationDirectory: options.leaseDirectory,
		});
		if (!runner) throw new Error("Native container runtime became unavailable after approval");
		await assertExecutionCaller(caller);
		return (await executionOwner()).run(request, executionIdentity(caller), runner, caller.signal);
	};
	const current = () => {
		const caller = calls.getStore();
		if (!caller) throw new Error("Discovery capability has no live native caller");
		caller.signal.throwIfAborted();
		return caller;
	};
	const filePath = async (root: string, path: string) => {
		if (
			isAbsolute(path) ||
			path.includes("\\") ||
			path.includes("\0") ||
			(path !== "" && path.split("/").some((part) => !part || part === "." || part === ".."))
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
	const read = async (root: string, path: string): Promise<PluginStateReadResult> => {
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
		if (bytes.length > 1048576) throw new Error("Discovery JSON state exceeds 1 MiB");
		return {
			kind: "value",
			value: JSON.parse(bytes.toString("utf8")),
			version: hash(bytes.toString("utf8")),
		};
	};
	const write = async (caller: NativeCaller, input: PluginStateWriteInput) => {
		if (!input.path.endsWith(".json")) throw new Error("Discovery state writes require JSON files");
		const selected = await filePath(caller.root, input.path);
		const bytes = `${JSON.stringify(input.value, null, 2)}\n`;
		if (Buffer.byteLength(bytes) > 1048576) throw new Error("Discovery JSON state exceeds 1 MiB");
		const check = async () => {
			caller.signal.throwIfAborted();
			if ((await read(caller.root, input.path)).version !== input.expectedVersion)
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
			const [cleanup] = await Promise.allSettled([rm(temporary, { force: true })]);
			if (cleanup.status === "rejected") {
				cleanupFailure = cleanup.reason;
				throw new AggregateError([error, cleanup.reason], "Discovery write and cleanup failed");
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
		async call(name, input, signal) {
			const actual = current();
			const caller = signal
				? { ...actual, signal: AbortSignal.any([actual.signal, signal]) }
				: actual;
			caller.signal.throwIfAborted();
			return calls.run(caller, async () => {
				if (name === "caller.scope") return { ...caller.scope };
                // Standard Pi cross-package discovery needs an SDK event-bus transport; no global registry or invented host authority.
                if (name === "provider.inspect") return { state: "unavailable", service: "inquiry.runtime", requestedVersion: 1, provider: null };
				if (name.startsWith("execution.")) return executeCapability(name, input, caller);
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
						(await readdir(await filePath(caller.root, request.path))).map(async (name) => ({
							name,
							kind: (await lstat(join(caller.root, request.path, name))).isDirectory()
								? "directory"
								: "file",
						})),
					);
				if (name === "state.reserve") {
					const directory = await realpath(await filePath(caller.root, request.path));
					if (!(await lstat(directory)).isDirectory())
						throw new Error("State writer requires an existing directory");
					reservations.reserve("state-writers", [directory]);
					return { reserved: true };
				}
				if (name === "state.writeJson") return write(caller, input as PluginStateWriteInput);
				throw new Error(`Discovery native capability is unavailable: ${name}`);
			});
		},
	};
	const abort = new AbortController();
	const runtime = await createDiscoveryRuntime({
		applicationId,
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
			for (const path of [join(canonical, "runs"), join(canonical, "runs", ".drone-discovery")]) {
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
						throw new Error("Explicit discovery root belongs to another workspace");
				}
			}
			caller = {
				scope: {
					kind: "session",
					workspaceId,
					workspaceDirectory: canonical,
					sessionId: context.sessionManager.getSessionId(),
				},
				root,
				handle: randomUUID(),
				signal,
				context,
			};
			active.set(workspaceId, caller);
		}
		return {
			...caller,
			context,
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
		const outside = relative(await realpath(caller.scope.workspaceDirectory), canonical);
		if (isAbsolute(outside) || outside === ".." || outside.startsWith(`..${sep}`))
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
		const settled = await Promise.allSettled([
			native.dispose(),
			runtime.dispose(),
			execution?.then((owner) => owner.drain()),
		]);
		const failures = settled.filter((result) => result.status === "rejected");
		if (failures.length)
			throw new AggregateError(
				failures.map((result) => result.reason),
				"Native discovery execution/domain cleanup failed; writer lease retained",
			);
		if (cleanupFailure)
			throw new Error("Discovery native state cleanup failed; writer lease retained", {
				cause: cleanupFailure,
			});
		reservations.dispose();
		active.clear();
	});
}
export default nativeDiscoveryExtension;
