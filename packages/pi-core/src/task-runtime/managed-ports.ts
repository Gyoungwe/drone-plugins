import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type {
	PluginProviderInspection,
	PluginRuntimeCapabilities,
	PluginRuntimeScope,
	PluginSessionInputResult,
	PluginSessionRecordAppendResult,
	PluginSessionRecordReadResult,
	PluginSessionSelectResult,
	PluginSessionTool,
} from "@gyoungwe/plugin-api/runtime";
import { inspectTaskBytes, type TaskFileDescriptor } from "./file-inspection.js";
import type { PdfIdentity } from "./pdf-identity.js";
import { createRemoteAcceptance } from "./remote-acceptance.js";
import type { KnowledgeBinding, WorkbenchHook, WorkbenchPorts } from "./workbench-adapter.js";
import { type FileExpectation, taskError } from "./workbench-state.js";

interface ManagedResults {
	"caller.scope": PluginRuntimeScope;
	"document.pdfText": PdfIdentity;
	"provider.inspect": PluginProviderInspection;
	"session.capabilities": string[];
	"session.input": PluginSessionInputResult;
	"session.inspect": { agentActive: boolean };
	"session.records.append": PluginSessionRecordAppendResult;
	"session.records.read": PluginSessionRecordReadResult;
	"session.select": PluginSessionSelectResult;
	"session.tools": PluginSessionTool[];
	"task.continue": { continuationId: string };
	"task.grant.current": { taskId: string; contractHash: string } | null;
	"workspace.readFile": { base64: string; path: string; workspacePath: string | null };
}

export type ManagedCall = (<Name extends keyof ManagedResults>(
	name: Name,
	input: unknown,
	signal?: AbortSignal,
) => Promise<ManagedResults[Name]>) &
	PluginRuntimeCapabilities["call"];

const privatePath = (path: string) =>
	path
		.split(/[\\/]/)
		.some(
			(part) => part.startsWith(".") || /^(?:auth|credentials|secrets?|tokens?|password)(?:\.|$)/i.test(part),
		);

async function knowledgeBinding(call: ManagedCall, signal?: AbortSignal) {
	const found = await call("provider.inspect", { alias: "knowledge" }, signal);
	if (found.state !== "available") return null;
	return (await call("provider.read", { alias: "knowledge", operation: "binding", input: null }, signal)) as
		| (KnowledgeBinding & { vault: string })
		| null;
}

async function readWorkspaceFile(call: ManagedCall, path: string, signal?: AbortSignal) {
	const read = await call("workspace.readFile", { path }, signal);
	return { ...read, bytes: Buffer.from(read.base64, "base64") };
}

function inspectBytes(
	call: ManagedCall,
	bytes: Buffer,
	descriptor: TaskFileDescriptor,
	expected: FileExpectation,
	signal?: AbortSignal,
) {
	return inspectTaskBytes(bytes, descriptor, expected, {
		readPdfText: (pdf) => call("document.pdfText", { base64: pdf.toString("base64") }, signal),
	});
}

function filePorts(call: ManagedCall) {
	const inspectWorkspace = async (
		ctx: ExtensionContext | undefined,
		cwd: string,
		path: string,
		expected: FileExpectation = {},
	) => {
		if (expected.rootKind === "vault")
			throw new Error("Vault file acceptance requires a current knowledge binding.");
		const read = await readWorkspaceFile(call, resolve(cwd, path), ctx?.signal);
		if (!read.workspacePath || privatePath(read.workspacePath))
			throw taskError("file-scope", "Choose an explicit non-private file within this task workspace.");
		const artifact = await inspectBytes(
			call,
			read.bytes,
			{ path: read.workspacePath, absolutePath: read.path, rootKind: "workspace" },
			expected,
			ctx?.signal,
		);
		return { ...artifact, path: isAbsolute(path) ? read.path : read.workspacePath };
	};
	const inspect: WorkbenchPorts["inspect"] = async (ctx, cwd, path, expected, { journal }) => {
		const binding = await knowledgeBinding(call, ctx?.signal);
		const declared = journal.snapshot()?.binding;
		if (
			journal.snapshot()?.reason === "binding-changed" ||
			(declared !== undefined && declared !== (binding ? `${binding.vaultId}:${binding.revision}` : null))
		)
			throw new Error("Knowledge binding changed; reconcile the original task scope first.");
		if (expected.rootKind !== "vault") return inspectWorkspace(ctx, cwd, path, expected);
		if (!binding) throw new Error("Vault file acceptance requires a current knowledge binding.");
		const { vault } = binding;
		const read = await readWorkspaceFile(call, resolve(vault, path), ctx?.signal);
		const rel = relative(vault, read.path);
		if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`) || privatePath(rel))
			throw taskError("file-scope", "Vault artifact must remain inside the bound Vault.");
		const vaultPath = rel.split(sep).join("/");
		const artifact = await inspectBytes(
			call,
			read.bytes,
			{ path: vaultPath, absolutePath: read.path, rootKind: "vault" },
			expected,
			ctx?.signal,
		);
		return { ...artifact, path: vaultPath };
	};
	return {
		readKnowledgeBinding: () => knowledgeBinding(call),
		authorizeRead: async () => undefined,
		inspect,
		evidenceFiles: {
			inspect: (cwd: string, path: string, expected: FileExpectation = {}) =>
				inspectWorkspace(undefined, cwd, path, expected),
			readText: async (path: string) => (await readWorkspaceFile(call, path)).bytes.toString("utf8"),
		},
	};
}

function storagePorts(call: ManagedCall): Pick<WorkbenchPorts, "storage" | "persist" | "readOnlyHint"> {
	let tools = new Map<string, boolean | null>();
	return {
		readOnlyHint: (name) => tools.get(name) ?? undefined,
		async storage(ctx) {
			const observed = await call("session.records.read", null, ctx.signal);
			tools = new Map(
				(await call("session.tools", null, ctx.signal)).map((tool) => [tool.name, tool.readOnlyHint]),
			);
			return {
				mode: observed.mode,
				state: observed.state,
				code: observed.error,
				entries: observed.records.map((row) => ({
					type: "custom",
					id: row.id,
					customType: row.type,
					data: row.data,
				})),
			};
		},
		async persist(_ctx, record, signal) {
			const receipt = await call(
				"session.records.append",
				{ type: record.customType, data: record.data },
				signal,
			);
			const observed = await call("session.records.read", null, signal);
			if (observed.state === "needs-reopen") throw new Error(`Task storage needs-reopen: ${observed.error}`);
			if (!observed.records.some((row) => row.id === receipt.id && row.type === record.customType))
				throw new Error("Task checkpoint is no longer on the actual SDK branch");
			return { mode: observed.mode, state: observed.state };
		},
	};
}

function grantPorts(
	call: ManagedCall,
	acceptance: ReturnType<typeof createRemoteAcceptance>,
): Pick<WorkbenchPorts, "authorizeTask" | "amendAllowance"> {
	return {
		async authorizeTask(_ctx, task, contract, signal) {
			const current = await call("task.grant.current", null, signal);
			if (current?.taskId === task.id && current.contractHash === contract.contractHash) return true;
			try {
				const allowances = acceptance.allowances(task.milestones);
				await call(
					"task.grant.request",
					{
						taskId: task.id,
						contractHash: contract.contractHash,
						goal: task.goal,
						...(task.authorizationSummary && task.authorizationSummary !== task.goal
							? { summary: task.authorizationSummary.slice(0, 2000) }
							: {}),
						writeDirectories: [...(task.writeRoots || [])],
						acceptance: task.milestones.map((milestone) => milestone.title).slice(0, 32),
						...(contract.compute ? { compute: contract.compute.slice(0, 2000) } : {}),
						...(allowances.length ? { allowances } : {}),
						maxCalls: contract.maxCalls,
						maxAutoResumes: contract.maxAutoResumes,
					},
					signal,
				);
				return true;
			} catch (error) {
				if (/denied/i.test((error as Error).message)) return false;
				throw error;
			}
		},
		async amendAllowance(_ctx, task, milestone, next, signal) {
			const described = (await acceptance.describeNow(next, signal)) as {
				consent?: unknown;
				label?: string;
			} | null;
			if (!described?.consent) throw new Error("The acceptance provider cannot name this item.");
			try {
				await call(
					"task.grant.amend",
					{
						taskId: task.id,
						id: milestone.id,
						label: String(described.label || next.kind).slice(0, 300),
						consent: described.consent,
					},
					signal,
				);
				return true;
			} catch (error) {
				if (/denied/i.test((error as Error).message)) return false;
				throw error;
			}
		},
	};
}

export function managedPorts(
	call: ManagedCall,
	on: (name: string, handler: WorkbenchHook) => void,
): WorkbenchPorts {
	const acceptance = createRemoteAcceptance(call);
	const question = async (name: "session.select" | "session.input", input: unknown, signal?: AbortSignal) => {
		const answer = await call(name, input, signal);
		return answer.kind === "cancelled" ? undefined : answer.value;
	};
	return {
		acceptance,
		...filePorts(call),
		...storagePorts(call),
		...grantPorts(call, acceptance),
		// Managed capabilities reject status posts until the SDK settles.
		statusAfterRun: true,
		post: (ctx, { content, view }) => call("session.notify", { content, view }, ctx?.signal),
		notifyError: (ctx, text) => call("session.notify", { content: text }, ctx?.signal),
		hasUI: () => true,
		select: (_ctx, text, options, signal) => question("session.select", { title: text, options }, signal),
		input: (_ctx, title, placeholder, signal) => question("session.input", { title, placeholder }, signal),
		idle: async (ctx) => !(await call("session.inspect", null, ctx?.signal)).agentActive,
		capabilities: (ctx) => call("session.capabilities", null, ctx?.signal),
		onHostEvent: (name, handler) => {
			if (name === "drone:context-evicted") on(name, handler);
		},
		decision: ({ id, kind, summary, basis }) =>
			call("session.decision.record", { id, kind, summary: summary.slice(0, 2000), basis }),
		inlineHandoff: true,
		continueTask: async (ctx, { taskId, prompt }) =>
			(await call("task.continue", { taskId, prompt }, ctx?.signal)).continuationId,
		continuationId: (message) =>
			message?.role === "custom" && String(message.customType).startsWith("plugin-continue:")
				? (message.details as { continuationId?: string } | undefined)?.continuationId
				: undefined,
		sendUserMessage: (ctx, text) =>
			call("session.notify", { content: `请在对话里发送「${text}」，接着做剩下的部分。` }, ctx?.signal),
		writeRoots: async (cwd, directories) => directories.map((directory) => resolve(cwd, directory)),
	};
}
