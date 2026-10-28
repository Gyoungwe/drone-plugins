/** A package application owns failed-storage state across native adapter reloads.
 * SDK extension subscriptions are revoked on reload and cannot retain authority.
 * Standalone reload reconstructs this fence from the public SDK branch/JSONL
 * boundary in native-storage.mjs; no event-bus or process-global keeper is used.
 */
export function createTaskApplicationState() {
  const failures = new Map();
  return {
    readFailure: (scope) => failures.get(scope),
    recordFailure: (scope, failure) => {
      failures.set(scope, failure);
    },
  };
}
