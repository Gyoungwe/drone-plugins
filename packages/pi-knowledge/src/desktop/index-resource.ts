import { join } from "node:path";
import type { PluginResourceFactory } from "@gyoungwe/plugin-api/resource";
import { createKnowledgeIndexRuntime } from "../core/index-runtime.js";
import type { KnowledgeIndexTransport } from "../core/index-runtime-ports.js";
import { fileVersion, validateNote } from "../core/files.js";

interface FileVersion { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }
interface ReadText { text: string; bytes: number; sha256: string; version: FileVersion }
interface FileStat { kind: "file" | "directory" | "symlink" | "other"; version: FileVersion }

/** The only direct filesystem access in this resource is the host-granted SQLite cache. */
const createIndexResource: PluginResourceFactory = async context => {
	const parameters = context.parameters;
	if (!parameters || typeof parameters !== "object" || !("vaultRoot" in parameters) || typeof parameters.vaultRoot !== "string")
		throw new Error("Knowledge index requires an authorized Vault root handle");
	const root = parameters.vaultRoot;
	let handler!: Parameters<KnowledgeIndexTransport["onMessage"]>[0];
	let next = 0;
	let closed = false;
	const requests = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
	const runtime = await createKnowledgeIndexRuntime({ database: join(context.storageDirectory, "index.sqlite"), backgroundReconcile: false }, {
		async inspect(path) {
			validateNote(path);
			const value = await context.capabilities.call("files.stat", { root, path }) as FileStat;
			if (value.kind !== "file") throw new Error("Expected a regular note");
			return { signature: fileVersion(value.version) };
		},
		async read(path) {
			validateNote(path);
			const value = await context.capabilities.call("files.readText", { root, path }) as ReadText;
			return { path, text: value.text, bytes: value.bytes, hash: value.sha256, signature: fileVersion(value.version) };
		},
		list: async path => await context.capabilities.call("files.list", { root, path }) as Array<{ name: string; kind: FileStat["kind"] }>,
		watch: null,
	}, {
		onMessage: receive => { handler = receive; },
		send(message: any) {
			if (message.uiChanged) { context.events.changed(); return; }
			if (message.ready) return; // Factory resolves only after real SQLite initialization and reconciliation below.
			const request = requests.get(message.id)!;
			requests.delete(message.id);
			if (message.error) request.reject(new Error(message.error));
			else request.resolve(message.result);
		},
		close: () => { closed = true; },
	});
	async function invoke(operation: string, input: unknown) {
		context.signal.throwIfAborted();
		if (closed) throw new Error("Knowledge index resource is closed");
		const id = ++next;
		const result = new Promise<unknown>((resolve, reject) => requests.set(id, { resolve, reject }));
		await handler({ id, op: operation, args: input as Record<string, unknown> });
		return result;
	}
	try {
		const initial = await invoke("reconcile", {}) as { coverage: string };
		if (initial.coverage !== "ready") throw new Error("Knowledge index could not read the authorized Vault inventory");
	} catch (error) {
		await runtime.close();
		throw error;
	}
	return { invoke, async dispose() { closed = true; await runtime.close(); } };
};
export default createIndexResource;
