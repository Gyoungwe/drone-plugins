/** Shared lifetime for full native owners and the Desktop read-only resource adapter. */
export function createKnowledgeOwnerLifecycle(resources: { beforeDrain?(): void; dispose(): Promise<void> }) {
	const operations = new Set<Promise<unknown>>();
	const sessions = new Set<() => Promise<void>>();
	let disposed = false;
	let disposal: Promise<void> | null = null;
	function assertActive() {
		if (disposed) throw new Error("Knowledge runtime has been disposed");
	}
	function run<T>(work: () => T | Promise<T>): Promise<T> {
		assertActive();
		const operation = Promise.resolve().then(work);
		operations.add(operation);
		return operation.finally(() => operations.delete(operation));
	}
	function attachSession(close: () => Promise<void>) {
		assertActive();
		sessions.add(close);
		return () => { sessions.delete(close); };
	}
	function dispose(): Promise<void> {
		if (disposal) return disposal;
		disposed = true;
		disposal = (async () => {
			const sessionResults = await Promise.allSettled([...sessions].map(close => close()));
			sessions.clear();
			resources.beforeDrain?.();
			const operationResults = await Promise.allSettled([...operations]);
			const resourceResults = await Promise.allSettled([resources.dispose()]);
			const failures = [...sessionResults, ...operationResults, ...resourceResults]
				.filter((result): result is PromiseRejectedResult => result.status === "rejected");
			if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Knowledge runtime disposal failed");
		})();
		return disposal;
	}
	return { assertActive, run, attachSession, dispose };
}
export type KnowledgeOwnerLifecycle = ReturnType<typeof createKnowledgeOwnerLifecycle>;
