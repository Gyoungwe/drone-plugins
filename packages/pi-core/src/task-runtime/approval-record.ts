import { type ConsentTask, contractHash, hasTaskConsent } from "./consent.ts";

export const TASK_TOTAL_CALLS = 192;

export interface TaskApprovalInput {
	scope: string;
	taskId: string;
	contractHash: string;
	binding?: string | null;
	action: string;
	actionId?: string;
	expectedDoi?: string | null;
}

interface ApprovalTask extends ConsentTask {
	state: string;
	actions: readonly { id: string; state: string; kind: string; expected?: { doi?: string | null } | null }[];
}

interface ApprovalWorkbench<Result> {
	scope(): string;
	view(): { revision: number; tasks: readonly ApprovalTask[] };
	command(input: Pick<TaskApprovalInput, "taskId" | "action" | "actionId"> & { revision: number }): Result;
}

/** Check the shown approval against the workbench that will record it, without yielding. */
export function recordApproval<Result>(workbench: ApprovalWorkbench<Result>, input: TaskApprovalInput) {
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
