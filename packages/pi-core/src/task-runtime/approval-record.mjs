import { contractHash, hasTaskConsent } from "./consent.mjs";

export const TASK_TOTAL_CALLS = 192;

/** Check the shown approval against the workbench that will record it, without yielding. */
export function recordApproval(workbench, input) {
	const view = workbench.view();
	const task = view.tasks.find((task) => task.id === input.taskId);
	if (
		workbench.scope() !== input.scope ||
		!task ||
		["completed", "cancelled", "archived"].includes(task.state) ||
		contractHash(task) !== input.contractHash ||
		(input.binding ?? null) !== (task.binding ?? null)
	)
		throw new Error("Task changed. Refresh before acting.");
	if (input.action === "acknowledge") {
		const action = task.actions.find((action) => action.id === input.actionId);
		if (action?.state !== "pending" || action.kind !== "rebind" || action.expected?.doi !== input.expectedDoi)
			throw new Error("Task changed. Refresh before acting.");
	} else if (hasTaskConsent(task, TASK_TOTAL_CALLS)) return;
	return workbench.command({
		taskId: input.taskId,
		revision: view.revision,
		action: input.action,
		actionId: input.actionId,
	});
}
