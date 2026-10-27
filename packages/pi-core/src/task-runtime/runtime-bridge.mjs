import { AsyncLocalStorage } from "node:async_hooks";
const contexts = new AsyncLocalStorage();
let installedRuntime = null;
let standaloneRuntime = null;
const runtimeBindings = /* @__PURE__ */ new WeakSet();
const hostRuntimes = /* @__PURE__ */ new WeakMap();
class KeyedScheduler {
  #tails = /* @__PURE__ */ new Map();
  #disposed = false;
  async acquire(key) {
    if (this.#disposed) throw new Error("Runtime scheduler has been disposed");
    const previous = this.#tails.get(key) || Promise.resolve();
    let unlock;
    const gate = new Promise((resolve) => {
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
  async run(key, task) {
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
function createStandaloneRuntime(log = {}) {
  const disposables = /* @__PURE__ */ new Set();
  let disposed = false;
  let disposal;
  const registerDisposable = (resource) => {
    if (!resource || typeof resource.dispose !== "function" && typeof resource.close !== "function")
      return () => {
      };
    if (disposed) {
      void (resource.dispose?.() ?? resource.close?.());
      return () => {
      };
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
          })
        );
        await scheduler.dispose();
      })();
      return disposal;
    }
  };
  return runtime;
}
function setRuntime(runtime) {
  if (!runtime || typeof runtime !== "object" || !runtime.scheduler)
    throw new TypeError("A DroneRuntime with a scheduler is required");
  const previous = installedRuntime;
  installedRuntime = runtime;
  return () => {
    if (installedRuntime === runtime) installedRuntime = previous;
  };
}
function withRuntime(runtime, operation) {
  if (!runtime || typeof runtime !== "object" || !runtime.scheduler)
    throw new TypeError("A DroneRuntime with a scheduler is required");
  return contexts.run(runtime, operation);
}
function bindRuntime(pi, ownedRuntime) {
  if (runtimeBindings.has(pi)) return () => {};
  runtimeBindings.add(pi);
  const runtime = ownedRuntime || createStandaloneRuntime();
  hostRuntimes.set(pi, runtime);
  const receive = (payload) => {
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
function runtimeForHost(pi) {
  return hostRuntimes.get(pi) ?? currentRuntime();
}
function withHostRuntime(pi, operation) {
  return withRuntime(runtimeForHost(pi), operation);
}
function currentRuntime() {
  const scoped = contexts.getStore();
  if (scoped) return scoped;
  if (installedRuntime) return installedRuntime;
  if (!standaloneRuntime) standaloneRuntime = createStandaloneRuntime();
  return standaloneRuntime;
}
function hasRuntimeContext() {
  return Boolean(contexts.getStore() || installedRuntime);
}
function resolveSlot(domain, slot, create) {
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
  return group[slot];
}
function runtimeSlot(domain, slot, create) {
  if (typeof create !== "function") throw new TypeError("runtimeSlot requires a factory");
  const proxy = new Proxy(
    {},
    {
      get(_target, property) {
        const value = resolveSlot(domain, slot, create)[property];
        return typeof value === "function" ? value.bind(resolveSlot(domain, slot, create)) : value;
      },
      set(_target, property, value) {
        resolveSlot(domain, slot, create)[property] = value;
        return true;
      },
      ownKeys() {
        return Reflect.ownKeys(resolveSlot(domain, slot, create));
      },
      getOwnPropertyDescriptor(_target, property) {
        const descriptor = Object.getOwnPropertyDescriptor(resolveSlot(domain, slot, create), property);
        return descriptor ? { ...descriptor, configurable: true } : void 0;
      }
    }
  );
  return proxy;
}
function runRuntimeExclusive(namespace, key, operation) {
  return currentRuntime().scheduler.run(`${namespace}:${key}`, operation);
}
const RUNTIME_BRIDGE_VERSION = 1;
export {
  RUNTIME_BRIDGE_VERSION,
  bindRuntime,
  createStandaloneRuntime,
  currentRuntime,
  hasRuntimeContext,
  runRuntimeExclusive,
  runtimeForHost,
  runtimeSlot,
  setRuntime,
  withHostRuntime,
  withRuntime
};
