import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolveWriteRoots } from "./consent.js";
import { contextUi } from "./context-ui.js";
import { readNativeSessionStorage } from "./native-storage.js";
import {
	registerWorkbenchAdapter,
	type WorkbenchAdapterOptions,
	type WorkbenchPorts,
} from "./workbench-adapter.js";
import { inspectTaskFile } from "./workbench-files.js";

const AUTO_CONTINUE = "drone-task-autocontinue";
export type NativeTaskHost = ExtensionAPI & { drone?: Pick<WorkbenchPorts, "readKnowledgeBinding"> };

async function authorizeRead(
	pi: NativeTaskHost,
	ctx: ExtensionContext | undefined,
	cwd: string,
	path: string,
) {
	if (!ctx || !pi.events?.emit)
		throw new Error("Current read-permission adapter unavailable; refusing recovery read.");
	const signal = ctx.signal;
	signal?.throwIfAborted();
	let handled = false;
	const allowed = await new Promise<boolean>((resolveResult, reject) => {
		const stop = () => signal?.removeEventListener("abort", abort);
		const respond = (allowed: boolean) => {
			stop();
			resolveResult(allowed);
		};
		const abort = () => {
			stop();
			reject(signal?.reason);
		};
		signal?.addEventListener("abort", abort, { once: true });
		pi.events.emit("drone:task-read-check", {
			cwd,
			path: resolve(cwd, path),
			sessionId: ctx.sessionManager.getSessionId(),
			resolve: respond,
			claim: () => {
				handled = true;
			},
		});
		if (!handled) respond(false);
	});
	signal?.throwIfAborted();
	if (!allowed) throw new Error("Current permission policy denied this read.");
}

const inspect: WorkbenchPorts["inspect"] = async (
	_ctx,
	cwd,
	path,
	expected,
	{ journal, readKnowledgeBinding, authorize },
) => {
	const binding = await readKnowledgeBinding();
	if (journal.snapshot()?.reason === "binding-changed")
		throw new Error("Knowledge binding changed; this task cannot inspect the new destination.");
	const declaredBinding = journal.snapshot()?.binding;
	if (
		declaredBinding !== undefined &&
		declaredBinding !== (binding ? `${binding.vaultId}:${binding.revision}` : null)
	)
		throw new Error("Knowledge binding changed; reconcile the original task scope first.");
	const vault = binding?.vault ? await realpath(binding.vault) : null;
	const requestedRoot = expected.rootKind || "workspace";
	if (requestedRoot === "vault" && !vault)
		throw new Error("Vault file acceptance requires a current knowledge binding.");
	const full = resolve(requestedRoot === "vault" && vault ? vault : cwd, path);
	const contains = (root: string) => {
		const rel = relative(root, full);
		return !!rel && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
	};
	if (requestedRoot === "vault" && vault && !contains(vault))
		throw new Error("Vault artifact must remain inside the bound Vault.");
	const approvedRoot = journal.readRoots().find(contains);
	const root = requestedRoot === "vault" && vault ? vault : approvedRoot || cwd;
	await authorize(cwd, full);
	if (approvedRoot && relative(approvedRoot, await realpath(approvedRoot)) !== "")
		throw new Error("Approved directory identity changed.");
	const rootKind = vault && contains(vault) ? "vault" : requestedRoot;
	const artifact = await inspectTaskFile(root, full, { ...expected, rootKind });
	const observedPath =
		rootKind === "vault" && vault
			? relative(vault, artifact.absolutePath)
			: isAbsolute(path)
				? artifact.absolutePath
				: relative(cwd, artifact.absolutePath);
	return { ...artifact, path: observedPath.replaceAll("\\", "/") };
};

function sessionCapabilities(ctx: ExtensionContext) {
	const checkpoint = [...ctx.sessionManager.getBranch()]
		.reverse()
		.find((entry) => "customType" in entry && entry.customType === "drone-capability-checkpoint-v1");
	const data =
		checkpoint && "data" in checkpoint ? (checkpoint.data as { capabilities?: string[] } | null) : null;
	return data?.capabilities || [];
}

function nativePorts(pi: NativeTaskHost): WorkbenchPorts {
	return {
		readKnowledgeBinding: () => pi?.drone?.readKnowledgeBinding?.() || null,
		onHostEvent: (name, handler) => pi.events?.on?.(name, handler),
		readOnlyHint: (name) => pi.getAllTools().find((tool) => tool.name === name)?.annotations?.readOnlyHint,
		storage: (ctx) => readNativeSessionStorage((ctx as ExtensionContext).sessionManager),
		persist: async (ctx, record, signal) => {
			const { sessionManager } = ctx as ExtensionContext;
			signal.throwIfAborted();
			const before = readNativeSessionStorage(sessionManager);
			if (before.state === "needs-reopen") throw new Error(`Task storage needs-reopen: ${before.code}`);
			await pi.appendEntry(record.customType, record.data);
			signal.throwIfAborted();
			const after = readNativeSessionStorage(sessionManager);
			if (after.state === "needs-reopen") throw new Error(`Task storage needs-reopen: ${after.code}`);
			return { mode: after.mode, state: after.state };
		},
		post: (_ctx, { content, command, view, storage }) =>
			pi.sendMessage(
				{
					customType: "drone-task-status",
					display: true,
					content,
					details: {
						operational: true,
						reportId: randomUUID(),
						command,
						taskView: view,
						taskStorage: storage,
					},
				},
				{ triggerTurn: false },
			),
		notifyError: (ctx, text) => ctx.ui.notify(text, "error"),
		...contextUi,
		capabilities: sessionCapabilities,
		continueTask: (_ctx, { taskId, prompt, nonce }) => {
			pi.sendMessage(
				{ customType: AUTO_CONTINUE, display: false, details: { taskId, nonce }, content: prompt },
				{ triggerTurn: true, deliverAs: "followUp" },
			);
			return nonce;
		},
		continuationId: (message) =>
			message?.role === "custom" && message.customType === AUTO_CONTINUE
				? (message.details as { nonce?: string } | undefined)?.nonce
				: undefined,
		sendUserMessage: (_ctx, text, options) => pi.sendUserMessage(text, options),
		decision: (record) => pi.events?.emit?.("drone:decision-record/v1", record),
		writeRoots: resolveWriteRoots,
		authorizeRead: (ctx, cwd, path) => authorizeRead(pi, ctx, cwd, path),
		inspect,
		evidenceFiles: { inspect: inspectTaskFile, readText: (path) => readFile(path, "utf8") },
	};
}

export function registerWorkbench(pi: NativeTaskHost, options: WorkbenchAdapterOptions) {
	return registerWorkbenchAdapter(pi, nativePorts(pi), options);
}
