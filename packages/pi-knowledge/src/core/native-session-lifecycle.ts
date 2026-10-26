import type { KnowledgeOwnerLifecycle } from "./owner-lifecycle.js";

/** Official Pi calls are revoked before draining, while the shared owner remains alive. */
export function createKnowledgeNativeAdapter(
 owner: KnowledgeOwnerLifecycle,
 controller: AbortController,
 register: (pi: any) => void,
 cleanup?: () => Promise<void>,
) {
	const operations = new Set<Promise<unknown>>();
	let registered = false;
	let closed = false;
	let disposal: Promise<void> | null = null;
	function run<T>(work: () => T | Promise<T>, signal = controller.signal): Promise<T> {
		if (closed) throw new Error("Knowledge session has been disposed");
		const operation = owner.run(async () => {
			signal.throwIfAborted();
			const result = await work();
			signal.throwIfAborted();
			return result;
		});
		operations.add(operation);
		return operation.finally(() => operations.delete(operation));
	}
	function dispose(): Promise<void> {
		if (disposal) return disposal;
		closed = true;
		controller.abort(new Error("Knowledge session has been disposed"));
		const sessionCleanup = cleanup?.();
		disposal = (async () => {
			const cleanupResult = await Promise.allSettled([sessionCleanup]);
			// Callers still receive their individual operation failures. Shutdown
			// waits for settlement before releasing this session's owner reference.
			await Promise.allSettled([...operations]);
			detach();
			if (cleanupResult[0].status === "rejected") throw cleanupResult[0].reason;
		})();
		return disposal;
	}
	const detach = owner.attachSession(dispose);
	function extension(pi: any): void {
		owner.assertActive();
		if (closed || registered) throw new Error("A native knowledge session can only be registered once");
		registered = true;
		const scopedContext = (context: any, signal: AbortSignal) => new Proxy(context, {
			get(target, property) { return property === "signal" ? signal : Reflect.get(target, property, target); },
		});
		const scopedSignal = (signal?: AbortSignal) => signal
			? AbortSignal.any([controller.signal, signal]) : controller.signal;
		const ownedPi = new Proxy(pi, {
			get(target, property) {
				if (property === "registerTool") return (definition: any) => target.registerTool({
					...definition,
					execute: (id: string, input: unknown, signal: AbortSignal | undefined, update: unknown, context: any) => {
						const combined = scopedSignal(signal);
						return run(() => definition.execute(id, input, combined, update, scopedContext(context, combined)), combined);
					},
				});
				if (property === "registerCommand") return (name: string, definition: any) => target.registerCommand(name, {
					...definition,
					handler: (args: string, context: any) => {
						const signal = scopedSignal(context.signal);
						return run(() => definition.handler(args, scopedContext(context, signal)), signal);
					},
				});
				if (property === "on") return (event: string, handler: (...args: any[]) => unknown) => target.on(
					event, event === "session_shutdown" ? handler : (value: unknown, context: any) =>
						{
						const signal = scopedSignal(context.signal);
						return run(() => handler(value, scopedContext(context, signal)), signal);
					},
				);
				return Reflect.get(target, property, target);
			},
		});
		register(ownedPi);
		pi.on("session_shutdown", dispose);
	}
	return { extension, signal: controller.signal, dispose };
}
