import { acceptanceVerifier, acceptanceVerifiers, bindAcceptanceVerifierEvents, registerAcceptanceVerifier } from "./acceptance.mjs";
import { bindRuntime, createStandaloneRuntime, withHostRuntime, withRuntime } from "./runtime-bridge.mjs";
import { registerTaskRuntime, requestSharedTaskRuntime } from "./runtime.mjs";

/** One owner per loader/session; both public entrypoints use this constructor. */
export function createTaskRuntimeOwner(definitions = []) {
  const runtime = createStandaloneRuntime();
  withRuntime(runtime, () => {
    for (const verifier of definitions) registerAcceptanceVerifier(verifier.kind, verifier);
  });
  let active = true;
  const lifetime = new AbortController();
  const signalFor = signal => signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
  let attached;
  let unbind;
  let unlisten;
  let linkedOwner;
  let registry;
  const eventCleanups = new Set();
  const requireActive = () => {
    if (!active) throw new Error("Task plugin session is unavailable: owner disposed");
  };
  return {
    registerAcceptanceVerifier(kind, definition) {
      requireActive();
      return withRuntime(runtime, () => registerAcceptanceVerifier(kind, definition));
    },
    readAcceptanceVerifier(kind) {
      requireActive();
      return withRuntime(runtime, () => acceptanceVerifier(kind));
    },
    definitions() {
      requireActive();
      return withRuntime(runtime, acceptanceVerifiers);
    },
    attach(pi) {
      requireActive();
      if (attached) throw new Error("Task owner already attached to a Pi session");
      attached = pi;
      const shared = requestSharedTaskRuntime(pi);
      const current = shared?.runtime || runtime;
      unbind = bindRuntime(pi, current);
      withRuntime(current, () => {
        for (const verifier of withRuntime(runtime, acceptanceVerifiers))
          registerAcceptanceVerifier(verifier.kind, verifier);
        unlisten = bindAcceptanceVerifierEvents(pi);
      });
      if (shared?.journal) {
        linkedOwner = shared.owner;
        pi.on("session_shutdown", () => this.dispose());
        return shared.journal;
      }
      const guardedEvents = {
        on(event, handler) {
          const unsubscribe = pi.events.on(event, (...args) => {
            if (active) return withHostRuntime(pi, () => handler(...args));
          });
          eventCleanups.add(unsubscribe);
          return () => { unsubscribe(); eventCleanups.delete(unsubscribe); };
        },
        emit: pi.events.emit.bind(pi.events),
      };
      const guarded = new Proxy(pi, {
        get(target, name) {
          if (name === "events") return guardedEvents;
          if (name === "on") return (event, handler) => target.on(event, (value, context) => {
            if (active) return withHostRuntime(pi, () => handler(value, { ...context, signal: signalFor(context.signal) }));
          });
          if (name === "registerTool") return (tool) => target.registerTool({
            ...tool,
            execute: (id, input, signal, update, context) => {
              requireActive();
              const scopedSignal = signalFor(signal);
              return withHostRuntime(pi, () => tool.execute(id, input, scopedSignal, update, { ...context, signal: scopedSignal }));
            }
          });
          if (name === "registerCommand") return (command, definition) => target.registerCommand(command, {
            ...definition,
            handler: (...args) => {
              requireActive();
              return withHostRuntime(pi, () => definition.handler(...args));
            }
          });
          const value = target[name];
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
      // The proxy is scoped to the same explicit runtime. Existing service
      // providers win, so a root entry + host adapter never creates two writers.
      const unbindGuarded = bindRuntime(guarded, current);
      const journal = registerTaskRuntime(guarded, { runtime: current });
      const oldUnbind = unbind;
      unbind = () => { unbindGuarded(); oldUnbind(); };
      // Journal consumers may run from another extension callback. Scope every
      // operation to this owner, including direct service reads/configuration.
      for (const [name, method] of Object.entries(journal)) {
        journal[name] = (...args) => {
          requireActive();
          return withRuntime(current, () => method(...args));
        };
      }
      registry = requestSharedTaskRuntime(pi);
      registry.owner = this;
      pi.on("session_shutdown", () => this.dispose());
      return journal;
    },
    async dispose() {
      if (!active) return;
      active = false;
      lifetime.abort(new Error("Task owner disposed"));
      unlisten?.();
      unbind?.();
      for (const cleanup of eventCleanups) cleanup();
      eventCleanups.clear();
      registry?.unsubscribe?.();
      await linkedOwner?.dispose();
      await runtime.dispose();
    }
  };
}
