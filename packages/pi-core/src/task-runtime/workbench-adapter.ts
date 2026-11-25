import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext, MessageStartEvent } from "@earendil-works/pi-coding-agent";
import type { createTaskApplicationState } from "./application-state.js";
import { createTaskAuthorization } from "./ask-authorization.js";
import type { createEvidenceRecovery } from "./evidence.js";
import type { TaskFileInspection } from "./file-inspection.js";
import { createTaskProgression } from "./progress-action.js";
import type { createRemoteAcceptance } from "./remote-acceptance.js";
import { currentRuntime, type RuntimeHost, withHostRuntime } from "./runtime-bridge.js";
import { createTaskController } from "./task-controller.js";
import { createTaskSession } from "./task-session.js";
import type {
	TaskSessionRecord,
	TaskSessionStatus,
	TaskStorage,
	TaskStorageRead,
} from "./task-session-storage.js";
import { isReadOnlyTool } from "./tool-manifest.js";
import { registerWorkbenchCommands } from "./workbench-adapter-commands.js";
import { registerWorkbenchHooks } from "./workbench-adapter-hooks.js";
import { registerWorkbenchTools } from "./workbench-adapter-tools.js";
import { createHandoff } from "./workbench-handoff.js";
import type { FileExpectation } from "./workbench-state.js";

type MaybePromise<Value> = Value | Promise<Value>;
type TaskUi = Parameters<typeof createTaskAuthorization>[2] &
	NonNullable<Parameters<typeof createTaskProgression>[1]["ui"]>;
type CommandHost = Pick<ExtensionAPI, "on" | "registerTool" | "registerCommand"> & RuntimeHost;
export type HookRegistration = (
	name: string,
	handler: (event: never, ctx: ExtensionContext) => unknown,
) => () => void;
type Controller = ReturnType<typeof createTaskController>;
type WorkbenchApplication = ReturnType<typeof createTaskApplicationState>;
export type WorkbenchMessage = MessageStartEvent["message"];
export type WorkbenchHook = (event: unknown, ctx?: ExtensionContext) => unknown;
export type SendStatus = (content?: string, command?: string | null) => unknown;

export interface KnowledgeBinding {
	vaultId: string;
	revision: number;
	vault?: string;
}

interface WorkbenchConfiguration {
	readKnowledgeBinding?(): MaybePromise<KnowledgeBinding | null>;
}

export interface WorkbenchAdapterOptions extends WorkbenchConfiguration {
	application: WorkbenchApplication;
	onJournalAttached?(journal: TaskJournal): void;
}

export type TaskJournal = Controller["journal"] & {
	status(): TaskSessionStatus;
	configure(options?: WorkbenchConfiguration): void;
	refresh(signal?: AbortSignal): Promise<void>;
	isAutoContinuation(message: WorkbenchMessage): boolean;
};

interface StatusCard {
	content: string;
	command: string | null;
	view: TaskSessionStatus["view"];
	storage: TaskSessionStatus["storage"];
}

export interface WorkbenchPorts extends TaskUi {
	acceptance?: ReturnType<typeof createRemoteAcceptance>;
	inlineHandoff?: boolean;
	statusAfterRun?: boolean;
	readKnowledgeBinding(): MaybePromise<KnowledgeBinding | null>;
	onHostEvent?(name: string, handler: WorkbenchHook): void;
	readOnlyHint(name: string): boolean | undefined;
	storage(ctx: Pick<ExtensionContext, "signal">): MaybePromise<TaskStorageRead>;
	persist(
		ctx: ExtensionContext | undefined,
		record: TaskSessionRecord,
		signal: AbortSignal,
	): Promise<TaskStorage>;
	post(ctx: ExtensionContext | undefined, card: StatusCard): unknown;
	notifyError(ctx: ExtensionContext, text: string): unknown;
	capabilities(ctx: ExtensionContext): MaybePromise<readonly string[]>;
	continueTask(
		ctx: ExtensionContext,
		input: { taskId: string; prompt: string; nonce: string },
	): MaybePromise<string>;
	continuationId(message: WorkbenchMessage): string | undefined;
	sendUserMessage(
		ctx: ExtensionContext | undefined,
		text: string,
		options: { expandPromptTemplates: boolean },
	): unknown;
	decision?(record: {
		id: string;
		kind: "task-authorization" | "rebind";
		summary: string;
		basis: string[];
		at: string;
	}): unknown;
	writeRoots(cwd: string, directories: readonly string[]): Promise<string[]>;
	authorizeRead(ctx: ExtensionContext | undefined, cwd: string, path: string): Promise<void>;
	inspect(
		ctx: ExtensionContext | undefined,
		cwd: string,
		path: string,
		expected: FileExpectation,
		access: {
			journal: TaskJournal;
			readKnowledgeBinding(): MaybePromise<KnowledgeBinding | null>;
			authorize(cwd: string, path: string): Promise<void>;
		},
	): Promise<TaskFileInspection>;
	evidenceFiles: Parameters<typeof createEvidenceRecovery>[0]["files"];
}

function callbackScope(pi: CommandHost) {
	const invocation = new AsyncLocalStorage<ExtensionContext | undefined>();
	const bind =
		<Args extends unknown[], Result>(
			handler: (...args: Args) => Result,
			context: (...args: Args) => ExtensionContext | undefined,
		) =>
		(...args: Args) =>
			withHostRuntime(pi, () => invocation.run(context(...args), () => handler(...args)));
	const on: ExtensionAPI["on"] = ((name, handler) =>
		(pi.on as HookRegistration)(
			name,
			bind(handler, (_event, ctx) => ctx),
		)) as HookRegistration;
	return { bind, on, callbackContext: () => invocation.getStore() };
}

interface Attachment {
	context?: ExtensionContext;
	sessionId?: string;
	prepared: boolean;
	halted: boolean;
	awaitingUser: boolean;
}

export const taskScope = (sessionId: string, cwd: string) =>
	createHash("sha256")
		.update(`${sessionId}\0${resolve(cwd)}`)
		.digest("hex");

async function attachWorkbench(
	ctx: ExtensionContext,
	force: boolean,
	attachment: Attachment,
	session: ReturnType<typeof createTaskSession>,
	ports: WorkbenchPorts,
	fence: ReturnType<typeof storageFence>,
) {
	attachment.context = ctx;
	attachment.sessionId = ctx.sessionManager.getSessionId();
	const scope = taskScope(attachment.sessionId, ctx.cwd);
	const storage = await ports.storage(ctx);
	if (fence.readFailure()) return;
	await session.turn({ kind: "attach", scope, entries: storage.entries, storage, force }, ctx.signal);
	fence.observeFailure(storage, session.status);
}

function statusSender(
	session: ReturnType<typeof createTaskSession>,
	ports: WorkbenchPorts,
	context: () => ExtensionContext | undefined,
	recordFailure: (failure: Parameters<WorkbenchApplication["recordFailure"]>[1]) => void,
) {
	let providerTurnOpen = false;
	let pending: Pick<StatusCard, "content" | "command"> | null = null;
	const send: SendStatus = (content = session.status().render, command = null) => {
		const state = session.status();
		if (state.persistence)
			throw new Error(
				`Task storage needs-reopen; last committed revision ${state.view.revision}. ${state.persistence.message}`,
			);
		if (providerTurnOpen) {
			pending = { content, command };
			return;
		}
		pending = null;
		const failed = (error: Error) =>
			recordFailure({ state: "needs-reopen", message: error.message, lastCommitted: state });
		try {
			const posted = ports.post(context(), {
				content,
				command,
				view: session.status().view,
				storage: state.storage,
			});
			return posted instanceof Promise ? posted.catch(failed) : posted;
		} catch (error) {
			failed(error as Error);
			throw error;
		}
	};
	return {
		send,
		start: () => {
			providerTurnOpen = true;
		},
		reset: () => {
			providerTurnOpen = false;
			pending = null;
		},
		flush: () => {
			providerTurnOpen = false;
			const held = pending;
			pending = null;
			return held ? send(held.content, held.command) : undefined;
		},
	};
}

function workbenchBinding(readKnowledgeBinding: WorkbenchPorts["readKnowledgeBinding"]) {
	let current = readKnowledgeBinding;
	return {
		read: () => current(),
		key: async () => {
			const binding = await current();
			return binding ? `${binding.vaultId}:${binding.revision}` : null;
		},
		configure(next: WorkbenchConfiguration = {}) {
			if (next.readKnowledgeBinding) current = next.readKnowledgeBinding;
		},
	};
}

function isReadOnly(pi: CommandHost, ports: WorkbenchPorts, name: string) {
	const declared = ports.readOnlyHint(name);
	return declared !== undefined ? declared : withHostRuntime(pi, () => isReadOnlyTool(name));
}

function storageFence(application: WorkbenchApplication, attachment: Attachment) {
	const readFailure = () => application.readFailure(attachment.sessionId);
	const recordFailure = (failure: Parameters<WorkbenchApplication["recordFailure"]>[1]) =>
		application.recordFailure(attachment.sessionId, failure);
	const observeFailure = (storage: TaskStorageRead, status: () => TaskSessionStatus) => {
		if (storage.state === "needs-reopen" && !readFailure())
			recordFailure({ state: "needs-reopen", message: storage.code, lastCommitted: status() });
	};
	return { readFailure, recordFailure, observeFailure };
}

function createWorkbenchAdapter(pi: CommandHost, ports: WorkbenchPorts, options: WorkbenchAdapterOptions) {
	const scope = callbackScope(pi);
	const attachment: Attachment = { prepared: false, halted: false, awaitingUser: false };
	const context = () => scope.callbackContext() || attachment.context;
	const fence = storageFence(options.application, attachment);
	const authorize = (cwd: string, path: string) => ports.authorizeRead(context(), cwd, path);
	const binding = workbenchBinding(options.readKnowledgeBinding || ports.readKnowledgeBinding);
	const session = createTaskSession({
		evidenceFiles: ports.evidenceFiles,
		readFailure: fence.readFailure,
		onPersistenceFailed: fence.recordFailure,
		authorize,
		readOnly: (name) => isReadOnly(pi, ports, name),
		persist: (record, signal) => ports.persist(context(), record, signal),
		onChanged: () => status.send(),
		inspect: (cwd, path, expected = {}) =>
			ports.inspect(context(), cwd, path, expected, {
				journal,
				readKnowledgeBinding: binding.read,
				authorize,
			}),
		...(ports.acceptance ? { prepare: ports.acceptance.prepare } : {}),
	});
	const status = statusSender(session, ports, context, fence.recordFailure);
	const controller = createTaskController(session, () => scope.callbackContext()?.signal);
	const journal: TaskJournal = {
		...controller.journal,
		status: session.status,
		configure: binding.configure,
		async refresh(signal) {
			const storage = await ports.storage({ signal });
			fence.observeFailure(storage, session.status);
			if (!fence.readFailure()) await session.turn({ kind: "storage", storage }, signal);
		},
		isAutoContinuation: (message) => handoff.isAutoContinuation(message),
	};
	const handoff = createHandoff({ journal, ports, attachment, bindingKey: binding.key, send: status.send });
	const attach = async (ctx: ExtensionContext, force = false) => {
		options.onJournalAttached?.(journal);
		await attachWorkbench(ctx, force, attachment, session, ports, fence);
	};
	currentRuntime().registerDisposable({ dispose: () => session.close() });
	currentRuntime().registerDisposable({ dispose: handoff.cancel });
	return {
		pi,
		ports,
		...scope,
		session,
		context,
		bindingKey: binding.key,
		attachment,
		journal,
		evidence: controller.evidence,
		attach,
		status,
		handoff,
	};
}

export type WorkbenchAdapter = ReturnType<typeof createWorkbenchAdapter>;

export function registerWorkbenchAdapter(
	pi: CommandHost,
	ports: WorkbenchPorts,
	options: WorkbenchAdapterOptions,
): TaskJournal {
	const adapter = createWorkbenchAdapter(pi, ports, options);
	const { journal, handoff, bindingKey, status, context } = adapter;
	const askAuthorization = createTaskAuthorization(journal, bindingKey, ports);
	const progress = createTaskProgression(journal, {
		getGeneration: handoff.generation,
		askAuthorization,
		checkBinding: bindingKey,
		continueAuthorized: (ctx) => handoff.continueAuthorized(ctx as ExtensionContext),
		prepareRemaining: () => ports.sendUserMessage(context(), "继续", { expandPromptTemplates: false }),
		send: status.send,
		ui: ports,
	});
	registerWorkbenchHooks(adapter, progress);
	registerWorkbenchTools(adapter, askAuthorization);
	registerWorkbenchCommands(adapter, askAuthorization, progress);
	return journal;
}
