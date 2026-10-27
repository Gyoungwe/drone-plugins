import type { createKnowledgeServicePool, KnowledgeService } from "./service.js";

/** Share the application worker while keeping read-ticket authority in this session. */
export function createKnowledgeSessionServices(pool: Pick<ReturnType<typeof createKnowledgeServicePool>, "getKnowledgeService">, signal: AbortSignal) {
	const views = new WeakMap<KnowledgeService, KnowledgeService>();
	const ticketStores = new Set<Map<string, unknown>>();
	const operations = new Set<Promise<unknown>>();
	let closed = false;
	function assertOpen() {
		signal.throwIfAborted();
		if (closed) throw new Error("Knowledge session has been disposed");
	}
	async function getKnowledgeService(...args: Parameters<typeof pool.getKnowledgeService>) {
		assertOpen();
		const service = await pool.getKnowledgeService(...args);
		assertOpen();
		const existing = views.get(service);
		if (existing) return existing;
		const tickets = new Map<string, unknown>();
		ticketStores.add(tickets);
		// Internal calls share the session ticket map but must finish their cleanup
		// after revocation. Only external method entries and receipts are revoked.
		const receiver = new Proxy(service, {
			get(target, property) { return property === "tickets" ? tickets : Reflect.get(target, property, target); },
		});
		const view = new Proxy(service, {
			get(target, property) {
				if (property === "tickets") return tickets;
				const value = Reflect.get(target, property, target);
				if (typeof value !== "function") return value;
				return (...parameters: unknown[]) => {
					assertOpen();
					// Methods execute against this view so prepare/check/read all see the
					// session ticket map. Worker queues and counters remain on the target.
					const result = Reflect.apply(value, receiver, parameters);
					// Synchronous state access remains synchronous. Async operations may
					// finish cleanup after revocation, but cannot return a success receipt.
					if (!(result instanceof Promise)) return result;
					const operation = result.then((value) => {
						assertOpen();
						return value;
					});
					operations.add(operation);
					return operation.finally(() => {
						operations.delete(operation);
						if (closed) tickets.clear();
					});
				};
			},
		});
		views.set(service, view);
		return view;
	}
	async function dispose() {
		closed = true;
		for (const tickets of ticketStores) tickets.clear();
		ticketStores.clear();
		// Individual callers retain their failures; shutdown waits for real cleanup.
		await Promise.allSettled([...operations]);
	}
	return { getKnowledgeService, dispose };
}
