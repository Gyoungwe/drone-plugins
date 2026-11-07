import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createTaskApplicationState } from "./application-state.mjs";
import { inspectTaskBytes } from "./file-inspection.mjs";
import { createRemoteAcceptance } from "./remote-acceptance.mjs";
import { bindRuntime, createStandaloneRuntime, withRuntime } from "./runtime-bridge.mjs";
import { registerWorkbenchAdapter } from "./workbench-adapter.mjs";

const empty = { type: "null" };
const statusSchema = {
	type: "object",
	properties: { snapshot: {}, render: { type: "string" }, storage: {} },
	required: ["snapshot", "render", "storage"],
	additionalProperties: false,
};
const READ = "read";
// Everything the managed adapter calls is own bookkeeping, a user question or a host-rendered
// authorization (callable from read invocations), so ordinary chat raises no plugin dialogs.
const TOOL_EFFECTS = {
	task_status: READ,
	task_plan: READ,
	task_wait: READ,
	task_reconcile: READ,
	task_evidence_restore: READ,
};
const COMMAND_EFFECTS = { "task-status": READ, "task-action": READ };
const EVENT_EFFECTS = Object.fromEntries(
	[
		"session_start",
		"session_tree",
		"context",
		"input",
		"before_agent_start",
		"message_start",
		"turn_start",
		"turn_end",
		"tool_call",
		"tool_result",
		"tool_execution_end",
		"agent_end",
		"agent_settled",
	].map((name) => [name, READ]),
);
const PRIVATE_SEGMENT = /^(?:auth|credentials|secrets?|tokens?|password)(?:\.|$)/i;
const fileError = (code, message) => Object.assign(new Error(message), { code });

/** Host capabilities as the workbench adapter's ports (Drone Desktop managed runtime). */
function managedPorts(call, cache) {
	const acceptance = createRemoteAcceptance(call);
	const readFile = async (ctx, path) => {
		const read = await call("workspace.readFile", { path }, ctx?.signal);
		return { ...read, bytes: Buffer.from(read.base64, "base64") };
	};
	// The knowledge plugin's knowledge.binding service names the bound Vault; no plugin installed is no binding.
	const readKnowledgeBinding = async (signal) => {
		const found = await call("provider.inspect", { alias: "knowledge" }, signal);
		if (found.state !== "available") return null;
		return call("provider.read", { alias: "knowledge", operation: "binding", input: null }, signal);
	};
	const within = (root, path) => {
		const rel = relative(root, path);
		return rel && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`) ? rel : null;
	};
	const privatePath = (rel) =>
		rel.split(/[\\/]/).some((part) => part.startsWith(".") || PRIVATE_SEGMENT.test(part));
	const inspectBytes = (ctx, read, descriptor, expected) =>
		inspectTaskBytes(read.bytes, descriptor, expected, {
			// No worker threads in the managed process: the host parses the PDF in its own sandbox.
			readPdfText: (pdf) => call("document.pdfText", { base64: pdf.toString("base64") }, ctx?.signal),
		});
	const inspectWorkspace = async (ctx, cwd, path, expected = {}) => {
		if (expected.rootKind === "vault")
			throw new Error("Vault file acceptance requires a current knowledge binding.");
		const read = await readFile(ctx, resolve(cwd, path));
		if (!read.workspacePath || privatePath(read.workspacePath))
			throw fileError("file-scope", "Choose an explicit non-private file within this task workspace.");
		const artifact = await inspectBytes(
			ctx,
			read,
			{ path: read.workspacePath, absolutePath: read.path, rootKind: "workspace" },
			expected,
		);
		return { ...artifact, path: isAbsolute(path) ? read.path : read.workspacePath };
	};
	/** As the native adapter: the task's binding must still hold; Vault files resolve against the bound Vault. */
	const inspect = async (ctx, cwd, path, expected = {}, { journal }) => {
		const binding = await readKnowledgeBinding(ctx?.signal);
		const declared = journal.snapshot()?.binding;
		if (
			journal.snapshot()?.reason === "binding-changed" ||
			(declared !== undefined && declared !== (binding ? `${binding.vaultId}:${binding.revision}` : null))
		)
			throw new Error("Knowledge binding changed; reconcile the original task scope first.");
		if (expected.rootKind !== "vault") return inspectWorkspace(ctx, cwd, path, expected);
		if (!binding) throw new Error("Vault file acceptance requires a current knowledge binding.");
		// The host reads under the session's current read permissions and returns the real path.
		const read = await readFile(ctx, resolve(binding.vault, path));
		const rel = within(binding.vault, read.path);
		if (!rel || privatePath(rel))
			throw fileError("file-scope", "Vault artifact must remain inside the bound Vault.");
		const vaultPath = rel.split(sep).join("/");
		const artifact = await inspectBytes(
			ctx,
			read,
			{ path: vaultPath, absolutePath: read.path, rootKind: "vault" },
			expected,
		);
		return { ...artifact, path: vaultPath };
	};
	const refreshTools = async (signal) => {
		cache.tools = new Map(
			(await call("session.tools", null, signal)).map((tool) => [tool.name, tool.readOnlyHint]),
		);
	};
	const storage = async (ctx) => {
		const observed = await call("session.records.read", null, ctx.signal);
		await refreshTools(ctx.signal);
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
	};
	const question = async (name, input, signal) => {
		const answer = await call(name, input, signal);
		return answer.kind === "cancelled" ? undefined : answer.value;
	};
	return {
		acceptance,
		readKnowledgeBinding: () => readKnowledgeBinding(),
		readOnlyHint: (name) => cache.tools.get(name),
		storage,
		persist: async (ctx, record, signal) => {
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
		// The host rejects session.notify while the SDK run is active (a queued custom message would
		// extend the run), so status cards wait for agent_settled.
		statusAfterRun: true,
		post: (ctx, { content, view }) => call("session.notify", { content, view }, ctx?.signal),
		notifyError: (ctx, text) => call("session.notify", { content: text }, ctx?.signal),
		hasUI: () => true,
		select: (ctx, text, options, signal) => question("session.select", { title: text, options }, signal),
		input: (ctx, title, placeholder, signal) => question("session.input", { title, placeholder }, signal),
		idle: async (ctx) => !(await call("session.inspect", null, ctx?.signal)).agentActive,
		// Host capability checkpoints are host records, not visible to a plugin.
		capabilities: async () => [],
		inlineHandoff: true,
		continueTask: async (ctx, { taskId, prompt }) =>
			(await call("task.continue", { taskId, prompt }, ctx?.signal)).continuationId,
		// Only the host creates plugin-continue messages, and only under this plugin's grant.
		continuationId: (message) =>
			message?.role === "custom" && String(message.customType).startsWith("plugin-continue:")
				? message.details?.continuationId
				: undefined,
		// The managed host cannot type for the user; ask them to continue instead.
		sendUserMessage: (ctx, text) =>
			call("session.notify", { content: `请在对话里发送「${text}」，接着做剩下的部分。` }, ctx?.signal),
		// The host resolves and canonicalizes directories when it issues the task grant.
		writeRoots: async (cwd, directories) => directories.map((directory) => resolve(cwd, directory)),
		authorizeTask: async (ctx, task, contract, signal) => {
			const current = await call("task.grant.current", null, signal);
			if (current?.taskId === task.id && current.contractHash === contract.contractHash) return true;
			try {
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
						// External writes the providers will make for these milestones; the host shows each and admits it once.
						...(() => {
							const allowances = acceptance.allowances(task.milestones);
							return allowances.length ? { allowances } : {};
						})(),
						maxCalls: contract.maxCalls,
						maxAutoResumes: contract.maxAutoResumes,
					},
					signal,
				);
				return true;
			} catch (error) {
				if (/denied/i.test(error.message)) return false;
				throw error;
			}
		},
		// Changing which item a milestone names changes what the grant allows; the host asks.
		amendAllowance: async (ctx, task, milestone, next, signal) => {
			const described = await acceptance.describeNow(next, signal);
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
				if (/denied/i.test(error.message)) return false;
				throw error;
			}
		},
		// Reads are decided by the host's current permission policy inside workspace.readFile.
		authorizeRead: async () => {},
		inspect,
		evidenceFiles: {
			inspect: (cwd, path, expected) => inspectWorkspace(undefined, cwd, path, expected),
			readText: async (path) => (await readFile(undefined, path)).bytes.toString("utf8"),
		},
	};
}

/** The canonical task application in the Drone Desktop managed runtime: the same workbench
 * adapter as native Pi, with host capabilities as its ports.
 */
export function createManagedTaskApplication(context) {
	const application = createTaskApplicationState();
	const journals = new Set();
	const sessions = new Set();
	const lifetime = new AbortController();
	const call = (name, input, signal) => context.capabilities.call(name, input, signal);
	const keyFor = (scope) =>
		createHash("sha256")
			.update(`${scope.sessionId}\0${resolve(scope.workspaceDirectory)}`)
			.digest("hex");
	const withCurrentSession = async (signal, operation) => {
		const current = AbortSignal.any([context.signal, lifetime.signal, ...(signal ? [signal] : [])]);
		const scope = await call("caller.scope", null, current);
		if (scope.kind !== "session")
			throw new Error("Task data service requires an actual attached SDK session");
		const key = keyFor(scope);
		const entry = [...journals].find((candidate) => candidate.journal.scope() === key);
		if (!entry) throw new Error("Task data service has no native attachment for this SDK session");
		current.throwIfAborted();
		const result = await withRuntime(entry.runtime, () =>
			operation({ controller: { journal: entry.journal } }),
		);
		current.throwIfAborted();
		return result;
	};
	const project = (journal) => {
		const state = journal.status(),
			task = state.snapshot;
		return {
			snapshot: task
				? {
						id: task.id,
						goal: task.goal,
						state: task.state,
						reason: task.reason ?? null,
						milestones: task.milestones.map(({ id, title, state, dependsOn }) => ({
							id,
							title,
							state,
							dependsOn,
						})),
						budget: task.budget,
						pending: task.operations
							.filter((operation) => ["started", "unknown"].includes(operation.state))
							.map(({ id, tool, state }) => ({ id, tool, state })),
					}
				: null,
			render: state.render,
			storage: state.storage,
		};
	};
	const operation = (effect, inputSchema, execute, resultSchema = statusSchema) => ({
		effect,
		inputSchema,
		resultSchema,
		execute: (input, invocation) =>
			withCurrentSession(invocation.signal, async (session) => {
				await session.controller.journal.refresh(invocation.signal);
				return execute(input, session.controller.journal);
			}),
	});
	const withStatus = (schema, name, type) => ({
		...schema,
		properties: { ...schema.properties, [name]: type },
		required: [...schema.required, name],
	});
	const operations = {
		status: operation("read", empty, (_input, journal) => project(journal)),
		pause: operation(
			"write",
			{
				type: "object",
				properties: { reason: { type: "string", minLength: 1, maxLength: 128 } },
				required: ["reason"],
				additionalProperties: false,
			},
			async (input, journal) => {
				await journal.pause(input.reason);
				return project(journal);
			},
		),
		advanceStage: operation(
			"write",
			empty,
			async (_input, journal) => ({ ...project(journal), advanced: await journal.advanceStage() }),
			withStatus(statusSchema, "advanced", { type: "boolean" }),
		),
		takeReport: operation(
			"write",
			empty,
			async (_input, journal) => ({ ...project(journal), report: await journal.takeReport() }),
			withStatus(statusSchema, "report", { type: ["string", "null"] }),
		),
	};
	const createNativeSession = () => {
		lifetime.signal.throwIfAborted();
		const runtime = createStandaloneRuntime();
		const cache = { tools: new Map() };
		let entry;
		const session = {
			dispose: async () => {
				if (entry) journals.delete(entry);
				sessions.delete(session);
				await runtime.dispose();
			},
		};
		sessions.add(session);
		return {
			toolEffects: TOOL_EFFECTS,
			commandEffects: COMMAND_EFFECTS,
			eventEffects: EVENT_EFFECTS,
			extension: (pi) => {
				// The managed guest exposes only on/registerTool/registerCommand; the runtime bridge
				// keys this session's runtime by the facade and has no event bus to join.
				const facade = {
					on: pi.on.bind(pi),
					registerTool: pi.registerTool.bind(pi),
					registerCommand: pi.registerCommand.bind(pi),
					events: { on: () => () => {}, emit: () => {} },
				};
				bindRuntime(facade, runtime);
				withRuntime(runtime, () => {
					const journal = registerWorkbenchAdapter(facade, managedPorts(call, cache), { application });
					entry = { journal, runtime };
					journals.add(entry);
				});
			},
			dispose: session.dispose,
		};
	};
	return {
		operations,
		createNativeSession,
		withCurrentSession,
		dispose: async () => {
			lifetime.abort(new Error("Managed task application closed"));
			await Promise.all([...sessions].map((session) => session.dispose()));
		},
	};
}
