import type {
	EventBus,
	ExtensionAPI,
	ExtensionContext,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { PluginNativeSession } from "@gyoungwe/plugin-api/native";
import type { TSchema } from "typebox";
import {
	acceptanceVerifier,
	acceptanceVerifiers,
	bindAcceptanceVerifierEvents,
	registerAcceptanceVerifier,
	type TaskAcceptanceVerifier,
} from "./acceptance.js";
import { createTaskApplicationState } from "./application-state.js";
import type { NativeTaskHost } from "./native-adapter.js";
import { registerTaskRuntime, requestSharedTaskRuntime, type TaskRuntimeRegistry } from "./runtime.js";
import { bindRuntime, createStandaloneRuntime, withHostRuntime, withRuntime } from "./runtime-bridge.js";
import type { HookRegistration } from "./workbench-adapter.js";

type SessionOwner = { dispose(): Promise<void> };
type SignalFor = (signal?: AbortSignal) => AbortSignal;

function guardHost(
	pi: NativeTaskHost,
	active: () => boolean,
	requireActive: () => void,
	signalFor: SignalFor,
	cleanups: Set<() => void>,
) {
	const contextFor = <Context extends ExtensionContext>(context: Context, signal?: AbortSignal) =>
		new Proxy(context, {
			get(target, name) {
				return name === "signal" ? signalFor(signal || target.signal) : Reflect.get(target, name);
			},
		});
	const events: EventBus = {
		on(channel, handler) {
			const unsubscribe = pi.events.on(channel, (data) => {
				if (active()) return withHostRuntime(pi, () => handler(data));
			});
			cleanups.add(unsubscribe);
			return () => {
				unsubscribe();
				cleanups.delete(unsubscribe);
			};
		},
		emit: pi.events.emit.bind(pi.events),
	};
	const on: HookRegistration = (name, handler) =>
		(pi.on as HookRegistration)(name, (value, context) => {
			if (active()) return withHostRuntime(pi, () => handler(value, contextFor(context)));
		});
	const registerTool = <Params extends TSchema, Details, State>(
		tool: ToolDefinition<Params, Details, State>,
	) =>
		pi.registerTool({
			...tool,
			execute: (id, input, signal, update, context) => {
				requireActive();
				const scopedSignal = signalFor(signal);
				return withHostRuntime(pi, () =>
					tool.execute(id, input, scopedSignal, update, contextFor(context, scopedSignal)),
				);
			},
		});
	const registerCommand: ExtensionAPI["registerCommand"] = (command, definition) =>
		pi.registerCommand(command, {
			...definition,
			handler: (args, context) => {
				requireActive();
				return withHostRuntime(pi, () => definition.handler(args, contextFor(context)));
			},
		});
	const guarded = { events, on, registerTool, registerCommand };
	return new Proxy(pi, {
		get(target, name) {
			if (Object.hasOwn(guarded, name)) return Reflect.get(guarded, name);
			const value: unknown = Reflect.get(target, name);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

function scopeJournal(
	journal: NonNullable<TaskRuntimeRegistry["journal"]>,
	runtime: TaskRuntimeRegistry["runtime"],
	requireActive: () => void,
) {
	for (const [name, method] of Object.entries(journal) as [string, (...args: unknown[]) => unknown][]) {
		Reflect.set(journal, name, (...args: unknown[]) => {
			requireActive();
			return withRuntime(runtime, () => method(...args));
		});
	}
}

function registerVerifiers(verifiers: readonly TaskAcceptanceVerifier[]) {
	for (const verifier of verifiers) registerAcceptanceVerifier(verifier.kind, verifier);
}

function ownedVerifiers(runtime: TaskRuntimeRegistry["runtime"], requireActive: () => void) {
	const scoped = <Result>(operation: () => Result) => {
		requireActive();
		return withRuntime(runtime, operation);
	};
	return {
		registerAcceptanceVerifier: (kind: string, definition: Readonly<Record<string, unknown>>) =>
			scoped(() => registerAcceptanceVerifier(kind, definition)),
		readAcceptanceVerifier: (kind: string) => scoped(() => acceptanceVerifier(kind)),
		definitions: () => scoped(acceptanceVerifiers),
	};
}

function bindOwnedJournal(
	pi: NativeTaskHost,
	guarded: NativeTaskHost,
	runtime: TaskRuntimeRegistry["runtime"],
	application: ReturnType<typeof createTaskApplicationState>,
	owner: SessionOwner,
	requireActive: () => void,
) {
	const unbind = bindRuntime(guarded, runtime);
	const journal = registerTaskRuntime(guarded, { runtime, application });
	scopeJournal(journal, runtime, requireActive);
	const registry = requestSharedTaskRuntime(pi);
	if (registry) registry.owner = owner;
	return { journal, unbind };
}

/** One owner per loader/session; both public entrypoints use this constructor. */
function createTaskRuntimeOwner(
	definitions: readonly TaskAcceptanceVerifier[],
	application: ReturnType<typeof createTaskApplicationState>,
) {
	const runtime = createStandaloneRuntime();
	withRuntime(runtime, () => registerVerifiers(definitions));
	let active = true;
	const lifetime = new AbortController();
	const signalFor: SignalFor = (signal) =>
		signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
	let attached = false;
	let unbindGuarded: (() => void) | undefined;
	let unbind: (() => void) | undefined;
	let unlisten: (() => void) | undefined;
	let linkedOwner: SessionOwner | undefined;
	const eventCleanups = new Set<() => void>();
	const requireActive = () => {
		if (!active) throw new Error("Task plugin session is unavailable: owner disposed");
	};
	return {
		...ownedVerifiers(runtime, requireActive),
		attach(pi: NativeTaskHost) {
			requireActive();
			if (attached) throw new Error("Task owner already attached to a Pi session");
			attached = true;
			const shared = requestSharedTaskRuntime(pi);
			const current = shared?.runtime || runtime;
			unbind = bindRuntime(pi, current);
			withRuntime(current, () => {
				registerVerifiers(withRuntime(runtime, acceptanceVerifiers));
				unlisten = bindAcceptanceVerifierEvents(pi);
			});
			if (shared?.journal) {
				linkedOwner = shared.owner;
				pi.on("session_shutdown", () => this.dispose());
				return shared.journal;
			}
			const guarded = guardHost(pi, () => active, requireActive, signalFor, eventCleanups);
			const owned = bindOwnedJournal(pi, guarded, current, application, this, requireActive);
			unbindGuarded = owned.unbind;
			pi.on("session_shutdown", () => this.dispose());
			return owned.journal;
		},
		async dispose() {
			if (!active) return;
			active = false;
			lifetime.abort(new Error("Task owner disposed"));
			unlisten?.();
			unbindGuarded?.();
			unbind?.();
			for (const cleanup of eventCleanups) cleanup();
			eventCleanups.clear();
			await linkedOwner?.dispose();
			await runtime.dispose();
		},
	};
}

/** The package application owns verifier declarations and real session lifetimes.
 * Both the official Pi entry and Desktop host loader delegate to this module. */
export function createTaskApplication(definitions: TaskAcceptanceVerifier[] = []) {
	const application = createTaskApplicationState();
	const registry = createTaskRuntimeOwner(definitions, application);
	const sessions = new Set<SessionOwner>();
	let active = true;
	const requireActive = () => {
		if (!active) throw new Error("Task application is disposed");
	};
	const createSession = () => {
		requireActive();
		const owner = createTaskRuntimeOwner(registry.definitions(), application);
		const session = {
			attach: (pi: ExtensionAPI) => owner.attach(pi),
			dispose: async () => {
				await owner.dispose();
				sessions.delete(session);
			},
		};
		sessions.add(session);
		return session;
	};
	return {
		registerAcceptanceVerifier: registry.registerAcceptanceVerifier,
		readAcceptanceVerifier: registry.readAcceptanceVerifier,
		attach: (pi: ExtensionAPI) => createSession().attach(pi),
		createNativeSession: (): PluginNativeSession => {
			const session = createSession();
			return {
				extension: (pi) => {
					session.attach(pi);
				},
				dispose: session.dispose,
			};
		},
		dispose: async () => {
			if (!active) return;
			active = false;
			await Promise.all([...sessions].map((session) => session.dispose()));
			await registry.dispose();
		},
	};
}
