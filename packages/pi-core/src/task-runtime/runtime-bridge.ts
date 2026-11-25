import { AsyncLocalStorage } from "node:async_hooks";
import type { EventBus } from "@earendil-works/pi-coding-agent";

export type RuntimeHost = { events: EventBus };
type RuntimeDomain = "knowledge" | "tasks" | "tools";
type RuntimeResource = object & {
	dispose?(): unknown;
	close?(): unknown;
};
type RuntimeSlots = Record<string, RuntimeResource>;

interface Runtime extends Record<RuntimeDomain, RuntimeSlots> {
	scheduler: Pick<KeyedScheduler, "run">;
	log: object;
	registerDisposable(resource: RuntimeResource): () => void;
	dispose(): Promise<void>;
}

interface RuntimePublication {
	version?: number;
	runtime?: Pick<Runtime, "scheduler" | "log" | "tools">;
}

const contexts = new AsyncLocalStorage<Runtime>();
const runtimeBindings = /* @__PURE__ */ new WeakSet<RuntimeHost>();
const hostRuntimes = /* @__PURE__ */ new WeakMap<RuntimeHost, Runtime>();
class KeyedScheduler {
	#tails = /* @__PURE__ */ new Map<string, Promise<void>>();
	#disposed = false;
	async acquire(key: string) {
		if (this.#disposed) throw new Error("Runtime scheduler has been disposed");
		const previous = this.#tails.get(key) || Promise.resolve();
		let unlock: () => void;
		const gate = new Promise<void>((resolve) => {
			unlock = resolve;
		});
		const tail = previous.then(() => gate);
		this.#tails.set(key, tail);
		await previous;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			unlock();
			if (this.#tails.get(key) === tail) this.#tails.delete(key);
		};
	}
	async run<Result>(key: string, task: () => Result) {
		const release = await this.acquire(key);
		try {
			return await task();
		} finally {
			release();
		}
	}
	async dispose() {
		if (this.#disposed) return;
		this.#disposed = true;
		this.#tails.clear();
	}
}
function createStandaloneRuntime(log: object = {}): Runtime {
	const disposables = /* @__PURE__ */ new Set<RuntimeResource>();
	let disposed = false;
	let disposal: Promise<void> | undefined;
	const registerDisposable = (resource: RuntimeResource) => {
		if (!resource || (typeof resource.dispose !== "function" && typeof resource.close !== "function"))
			return () => undefined;
		if (disposed) {
			void (resource.dispose?.() ?? resource.close?.());
			return () => undefined;
		}
		disposables.add(resource);
		return () => disposables.delete(resource);
	};
	const scheduler = new KeyedScheduler();
	const runtime = {
		knowledge: {},
		tasks: {},
		tools: { tools: /* @__PURE__ */ new Map(), families: /* @__PURE__ */ new Map() },
		scheduler,
		log,
		registerDisposable,
		dispose() {
			if (disposal) return disposal;
			disposed = true;
			disposal = (async () => {
				const resources = [...disposables];
				disposables.clear();
				await Promise.allSettled(
					resources.map((resource) => {
						try {
							return resource.dispose?.() ?? resource.close?.();
						} catch (error) {
							return Promise.reject(error);
						}
					}),
				);
				await scheduler.dispose();
			})();
			return disposal;
		},
	};
	return runtime;
}
function withRuntime<Result>(runtime: Runtime, operation: () => Result) {
	if (!runtime || typeof runtime !== "object" || !runtime.scheduler)
		throw new TypeError("A DroneRuntime with a scheduler is required");
	return contexts.run(runtime, operation);
}
function bindRuntime(pi: RuntimeHost, ownedRuntime?: Runtime) {
	if (runtimeBindings.has(pi)) return () => undefined;
	runtimeBindings.add(pi);
	const runtime = ownedRuntime || createStandaloneRuntime();
	hostRuntimes.set(pi, runtime);
	const receive = (value: unknown) => {
		const payload = value as RuntimePublication | null | undefined;
		if (payload?.version !== RUNTIME_BRIDGE_VERSION || !payload.runtime?.scheduler) return;
		// The host supplies mechanisms and immutable tool declarations. Task state
		// and acceptance registries remain owned by this plugin session.
		runtime.scheduler = payload.runtime.scheduler;
		runtime.log = payload.runtime.log;
		runtime.tools = payload.runtime.tools;
	};
	const unsubscribe = pi.events.on("drone:runtime/v1", receive);
	pi.events.emit("drone:runtime/request/v1", { version: RUNTIME_BRIDGE_VERSION });
	return () => {
		unsubscribe();
		runtimeBindings.delete(pi);
		hostRuntimes.delete(pi);
	};
}
function runtimeForHost(pi: RuntimeHost) {
	return hostRuntimes.get(pi) ?? currentRuntime();
}
function withHostRuntime<Result>(pi: RuntimeHost, operation: () => Result) {
	return withRuntime(runtimeForHost(pi), operation);
}
function currentRuntime() {
	const scoped = contexts.getStore();
	if (scoped) return scoped;
	throw new Error("Task runtime is unavailable outside a session owner");
}
function hasRuntimeContext() {
	return Boolean(contexts.getStore());
}
function resolveSlot<Slot extends RuntimeResource>(domain: RuntimeDomain, slot: string, create: () => Slot) {
	const runtime = currentRuntime();
	let group = runtime[domain];
	if (!group) {
		group = {};
		runtime[domain] = group;
	}
	if (!group[slot]) {
		group[slot] = create();
		runtime.registerDisposable?.(group[slot]);
	}
	return group[slot] as Slot;
}
function runtimeSlot<Slot extends RuntimeResource>(domain: RuntimeDomain, slot: string, create: () => Slot) {
	if (typeof create !== "function") throw new TypeError("runtimeSlot requires a factory");
	const proxy = new Proxy({} as Slot, {
		get(_target, property) {
			const value = (resolveSlot(domain, slot, create) as Record<PropertyKey, unknown>)[property];
			return typeof value === "function" ? value.bind(resolveSlot(domain, slot, create)) : value;
		},
		set(_target, property, value: unknown) {
			const resource = resolveSlot(domain, slot, create) as Record<PropertyKey, unknown>;
			resource[property] = value;
			return true;
		},
		ownKeys() {
			return Reflect.ownKeys(resolveSlot(domain, slot, create));
		},
		getOwnPropertyDescriptor(_target, property) {
			const descriptor = Object.getOwnPropertyDescriptor(resolveSlot(domain, slot, create), property);
			return descriptor ? { ...descriptor, configurable: true } : void 0;
		},
	});
	return proxy;
}
function runRuntimeExclusive<Result>(namespace: string, key: string, operation: () => Result) {
	return currentRuntime().scheduler.run(`${namespace}:${key}`, operation);
}
const RUNTIME_BRIDGE_VERSION = 1;

export {
	bindRuntime,
	createStandaloneRuntime,
	currentRuntime,
	hasRuntimeContext,
	RUNTIME_BRIDGE_VERSION,
	runRuntimeExclusive,
	runtimeForHost,
	runtimeSlot,
	withHostRuntime,
	withRuntime,
};
