import type { TaskStorageFailure } from "./task-session-storage.js";

/** A package application owns failed-storage state across native adapter reloads.
 * SDK extension subscriptions are revoked on reload and cannot retain authority.
 * Standalone reload reconstructs this fence from the public SDK branch/JSONL
 * boundary in native-storage.ts; no event-bus or process-global keeper is used.
 */
export function createTaskApplicationState() {
	const failures = new Map<string | undefined, TaskStorageFailure>();
	return {
		readFailure: (scope: string | undefined) => failures.get(scope),
		recordFailure: (scope: string | undefined, failure: TaskStorageFailure) => {
			failures.set(scope, failure);
		},
	};
}
