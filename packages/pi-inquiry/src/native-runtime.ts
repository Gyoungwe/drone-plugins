import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
	type BinaryStateWriteAccess,
	readBinaryStateFile,
	writeBinaryStateFile,
} from "@gyoungwe/plugin-api/node/binary-state";
import { PluginResourceReservations } from "@gyoungwe/plugin-api/node/reservations";
import type {
	PluginBinaryStateWriteInput,
	PluginRuntimeCapabilities,
	PluginRuntimeScope,
	PluginStateReadResult,
	PluginStateWriteInput,
} from "@gyoungwe/plugin-api/runtime";
import { createInquiryRuntime } from "./runtime.js";

interface Root {
	path: string;
	workspace: string;
	workspaceIdentity: Stats;
	identity?: Stats;
	explicit: boolean;
}
interface Caller {
	root: Root;
	context: ExtensionContext;
	signal: AbortSignal;
	scope: Extract<PluginRuntimeScope, { kind: "session" }>;
}
/** Only a trusted Node adapter may explicitly select an existing original directory. Standard Pi stays workspace-local. */
export interface NativeInquiryOptions {
	readonly stateDirectory?: string;
	readonly leaseDirectory?: string;
}
export async function nativeInquiryExtension(
	pi: ExtensionAPI,
	options: NativeInquiryOptions = {},
): Promise<void> {
	const calls = new AsyncLocalStorage<Caller>(),
		roots = new Map<string, Root>(),
		reservations = new PluginResourceReservations(options.leaseDirectory),
		abort = new AbortController(),
		pending = new Set<Promise<unknown>>();
	let cleanupFailure: unknown,
		mutationTail: Promise<void> = Promise.resolve();
	const canonicalId = (path: string) =>
		process.platform === "darwin" || process.platform === "win32"
			? path.replaceAll("\\", "/").toLowerCase()
			: path;
	const verify = async (root: Root) => {
		const workspace = await lstat(root.workspace);
		if (
			!workspace.isDirectory() ||
			workspace.dev !== root.workspaceIdentity.dev ||
			workspace.ino !== root.workspaceIdentity.ino
		)
			throw new Error("Native Inquiry workspace directory changed");
		let current: Stats;
		try {
			current = await lstat(root.path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			if (root.identity)
				throw new Error("Native Inquiry root disappeared", { cause: error });
			return;
		}
		if (!current.isDirectory() || current.isSymbolicLink())
			throw new Error("Native Inquiry root must be a real directory");
		if (
			root.identity &&
			(current.dev !== root.identity.dev || current.ino !== root.identity.ino)
		)
			throw new Error("Native Inquiry root changed after selection");
		root.identity = current;
	};
	const path = async (root: Root, value: string) => {
		if (
			isAbsolute(value) ||
			value.includes("\\") ||
			value.includes("\0") ||
			(value !== "" &&
				value.split("/").some((part) => !part || part === "." || part === ".."))
		)
			throw new Error("Expected a confined root-relative Inquiry path");
		await verify(root);
		const target = join(root.path, value);
		let current = root.path,
			complete = true;
		for (const part of value ? value.split("/") : []) {
			current = join(current, part);
			try {
				if ((await lstat(current)).isSymbolicLink())
					throw new Error("Native Inquiry paths do not follow symlinks");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				complete = false;
				break;
			}
		}
		const actual = complete ? await realpath(target) : target;
		const suffix = relative(root.path, actual);
		if (isAbsolute(suffix) || suffix === ".." || suffix.startsWith(`..${sep}`))
			throw new Error("Native Inquiry path escaped its root");
		return actual;
	};
	const live = async (caller: Caller) => {
		caller.signal.throwIfAborted();
		abort.signal.throwIfAborted();
		const workspace = await realpath(caller.context.cwd);
		if (
			workspace !== caller.scope.workspaceDirectory ||
			canonicalId(workspace) !== caller.scope.workspaceId ||
			caller.context.sessionManager.getSessionId() !== caller.scope.sessionId
		)
			throw new Error("Native Inquiry caller or workspace changed");
		await verify(caller.root);
	};
	const approve = async (caller: Caller, title: string, detail: string) => {
		await live(caller);
		if (
			!caller.context.hasUI ||
			!(await caller.context.ui.confirm(
				title,
				`Workspace: ${caller.scope.workspaceDirectory}\nCreator SDK session: ${caller.scope.sessionId}\nSelected directory: ${caller.root.path}\n${detail}`,
				{ signal: caller.signal },
			))
		)
			throw new Error("Native Inquiry write was not approved");
		await live(caller);
	};
	const ensure = async (caller: Caller) => {
		if (caller.root.explicit) {
			await verify(caller.root);
			return;
		}
		for (const directory of [
			join(caller.root.workspace, "runs"),
			caller.root.path,
		]) {
			caller.signal.throwIfAborted();
			try {
				const existing = await lstat(directory);
				if (!existing.isDirectory() || existing.isSymbolicLink())
					throw new Error(
						"Native Inquiry state directory is not a real directory",
					);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				await mkdir(directory, { mode: 0o700 });
			}
		}
		await verify(caller.root);
	};
	const access = (caller: Caller): BinaryStateWriteAccess => ({
		resolvePath: (value) => path(caller.root, value),
		checkRoot: () => verify(caller.root),
		checkWrite: () => live(caller),
		assertReserved: (directory) =>
			reservations.assertReserved("state-writers", directory),
		conflictError: () => {
			const error = new Error("Inquiry state version conflict");
			Object.assign(error, { code: "ESTATECONFLICT" });
			return error;
		},
		cleanupFailed: (error) => {
			cleanupFailure = error;
		},
	});
	const mutate = <T>(caller: Caller, execute: () => Promise<T>): Promise<T> => {
		const value = mutationTail.then(() => {
			caller.signal.throwIfAborted();
			return execute();
		});
		mutationTail = value.then(
			() => undefined,
			() => undefined,
		);
		return value;
	};
	const handle = (root: string, kind: "state" | "binary-state") => {
		if (
			root !==
			(kind === "state" ? "native-inquiry-json" : "native-inquiry-binary")
		)
			throw new Error("Native Inquiry root handle was not granted");
	};
	const capabilities: PluginRuntimeCapabilities = {
		async call(name, input, signal) {
			const parent = calls.getStore();
			if (!parent)
				throw new Error("Native Inquiry capability has no actual caller");
			const caller = signal
				? { ...parent, signal: AbortSignal.any([parent.signal, signal]) }
				: parent;
			await live(caller);
			if (name === "caller.scope") return { ...caller.scope };
			if (name === "roots.describe")
				return [
					{
						handle: "native-inquiry-json",
						kind: "state",
						path: caller.root.path,
						access: "read-write",
					},
					{
						handle: "native-inquiry-binary",
						kind: "binary-state",
						path: caller.root.path,
						access: "read-write",
					},
				];
			const request = input as { root: string; path: string };
			if (name === "state.reserve") {
				if (
					!["native-inquiry-json", "native-inquiry-binary"].includes(
						request.root,
					) ||
					request.path !== ""
				)
					throw new Error(
						"Native Inquiry reserves only the selected ledger directory",
					);
				await approve(
					caller,
					"Reserve Inquiry writer",
					"Reserve the selected original directory for one writer. A missing workspace-local directory will be created. No ledger record is changed.",
				);
				await ensure(caller);
				await live(caller);
				reservations.reserve("state-writers", [
					await realpath(caller.root.path),
				]);
				return { reserved: true };
			}
			if (name === "state.readBinary") {
				handle(request.root, "binary-state");
				const value = await readBinaryStateFile(request.path, access(caller));
				await live(caller);
				return value;
			}
			if (name === "state.readJson") {
				handle(request.root, "state");
				const raw = await readBinaryStateFile(request.path, access(caller));
				await live(caller);
				if (raw.kind === "missing") return raw;
				const bytes = Buffer.from(raw.base64, "base64");
				if (bytes.length > 1024 * 1024)
					throw new Error("Native Inquiry JSON metadata exceeds 1 MiB");
				try {
					return {
						kind: "value",
						value: JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")),
						version: raw.version,
					};
				} catch (error) {
					throw new Error("Native Inquiry JSON state is corrupt", {
						cause: error,
					});
				}
			}
			if (name === "state.writeJson") {
				const value = input as PluginStateWriteInput;
				handle(value.root, "state");
				if (!value.path.endsWith(".json"))
					throw new Error("Native Inquiry JSON writes require a .json file");
				const text = `${JSON.stringify(value.value, null, 2)}\n`;
				if (Buffer.byteLength(text) > 1024 * 1024)
					throw new Error("Native Inquiry JSON metadata exceeds 1 MiB");
				await approve(
					caller,
					"Write Inquiry JSON metadata",
					`Root-relative path: ${JSON.stringify(value.path)}\nExpected SHA: ${JSON.stringify(value.expectedVersion)}\nProposed JSON:\n${text}`,
				);
				const raw = await writeBinaryStateFile(
					{
						path: value.path,
						base64: Buffer.from(text).toString("base64"),
						expectedVersion: value.expectedVersion,
						assertAbsent: [],
					},
					{
						signal: caller.signal,
						serialize: (operation) => mutate(caller, operation),
						prepare: () => access(caller),
					},
				);
				if (raw.kind !== "value")
					throw new Error("Native Inquiry JSON write has no readback");
				return {
					kind: "value",
					value: JSON.parse(Buffer.from(raw.base64, "base64").toString("utf8")),
					version: raw.version,
				} satisfies PluginStateReadResult;
			}
			if (name === "state.writeBinary") {
				const value = input as PluginBinaryStateWriteInput;
				handle(value.root, "binary-state");
				return writeBinaryStateFile(value, {
					signal: caller.signal,
					serialize: async (operation) => {
						await approve(
							caller,
							"Replace Inquiry binary state",
							`Root-relative path: ${JSON.stringify(value.path)}\nExpected SHA: ${JSON.stringify(value.expectedVersion)}\nNew SHA: ${createHash("sha256").update(Buffer.from(value.base64, "base64")).digest("hex")}\nDecoded bytes: ${Buffer.from(value.base64, "base64").length}\nAssert absent: ${JSON.stringify(value.assertAbsent)}\nLogical content/diff is not displayed. A post-commit cancellation requires explicit SHA reconciliation.`,
						);
						return mutate(caller, operation);
					},
					prepare: () => access(caller),
				});
			}
			throw new Error(`Native Inquiry capability is unavailable: ${name}`);
		},
	};
	const runtime = await createInquiryRuntime({
		applicationId: randomUUID(),
		signal: abort.signal,
		resources: [],
		capabilities,
		events: {
			changed() {
				/* Native tool results carry the committed state; no Desktop registry exists here. */
			},
		},
	});
	if (!runtime.createNativeSession)
		throw new Error("Inquiry runtime has no native projection");
	const native = await runtime.createNativeSession();
	const adapted = Object.create(pi) as ExtensionAPI;
	adapted.registerTool = ((definition: ToolDefinition) => {
		const execute = definition.execute;
		return pi.registerTool({
			...definition,
			execute(id, input, signal, update, context) {
				const running = (async () => {
					const workspace = await realpath(context.cwd),
						workspaceId = canonicalId(workspace);
					let root = roots.get(workspaceId);
					if (!root) {
						const selected = options.stateDirectory
							? await realpath(options.stateDirectory)
							: join(workspace, "runs", ".drone-inquiry");
						root = {
							path: selected,
							workspace,
							workspaceIdentity: await lstat(workspace),
							explicit: options.stateDirectory !== undefined,
						};
						await verify(root);
						roots.set(workspaceId, root);
					}
					const caller: Caller = {
						root,
						context,
						signal: signal
							? AbortSignal.any([abort.signal, signal])
							: abort.signal,
						scope: {
							kind: "session",
							workspaceId,
							workspaceDirectory: workspace,
							sessionId: context.sessionManager.getSessionId(),
						},
					};
					await live(caller);
					return calls.run(caller, () =>
						execute(id, input, caller.signal, update, context),
					);
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
		abort.abort(new Error("Native Inquiry session closed"));
		await Promise.allSettled([...pending]);
		await native.dispose();
		await runtime.dispose();
		await mutationTail;
		if (cleanupFailure)
			throw new Error("Native Inquiry cleanup failed; writer lease retained", {
				cause: cleanupFailure,
			});
		reservations.dispose();
		roots.clear();
	});
}
export default nativeInquiryExtension;
