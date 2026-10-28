/** A package application owns failed-storage state across native adapter reloads.
 * SDK extension subscriptions are revoked on reload and cannot retain authority.
 * Standalone Pi has no public application-generation port; that cutover is S2.
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
