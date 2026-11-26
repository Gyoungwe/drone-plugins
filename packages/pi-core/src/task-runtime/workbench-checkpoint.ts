import {
	clean,
	LIMITS,
	type TaskBook,
	type TaskEntry,
	type TaskRecord,
	WORKBENCH_ENTRY,
} from "./workbench-state.js";

function validBook(data: TaskBook | null | undefined, scope: string): data is TaskBook {
	return !!(
		data?.version === 2 &&
		data.scope === scope &&
		Array.isArray(data.tasks) &&
		data.tasks.length <= LIMITS.tasks &&
		JSON.stringify(data).length <= 22e4 &&
		data.tasks.every(
			(task) =>
				typeof task?.id === "string" &&
				typeof task.goal === "string" &&
				Array.isArray(task.operations) &&
				task.operations.length <= LIMITS.operations &&
				Array.isArray(task.milestones) &&
				Array.isArray(task.actions) &&
				task.budget &&
				Array.isArray(task.receipts),
		)
	);
}

function restoreLegacy(book: TaskBook, entries: readonly TaskEntry[], make: (goal: string) => TaskRecord) {
	for (const entry of [...entries].reverse()) {
		if (entry.customType !== "drone-task-checkpoint-v1") continue;
		const data = entry.data as { scope?: string; goal?: string; receipts?: TaskRecord["receipts"] } | null;
		if (data?.scope !== book.scope || typeof data?.goal !== "string") continue;
		const task = make(data.goal);
		task.state = "partial";
		task.reason = "legacy-checkpoint-unreviewed";
		task.receipts = (data.receipts || [])
			.slice(-24)
			.filter((receipt) => typeof receipt?.tool === "string")
			.map((receipt) => ({
				id: clean(receipt.id),
				tool: clean(receipt.tool),
				state: "legacy-unreviewed",
				at: clean(receipt.at),
			}));
		book.tasks.push(task);
		book.activeTaskId = task.id;
		return;
	}
}

export function restoreBook(
	scope: string,
	entries: readonly TaskEntry[],
	make: (goal: string) => TaskRecord,
	now: () => string,
) {
	let book: TaskBook = {
		version: 2,
		scope,
		revision: 0,
		activeTaskId: null,
		selectionRequired: false,
		tasks: [],
	};
	for (const entry of entries) {
		if (entry.customType !== WORKBENCH_ENTRY) continue;
		const data = entry.data as TaskBook | null | undefined;
		if (validBook(data, scope)) book = structuredClone(data);
	}
	if (!book.tasks.length) restoreLegacy(book, entries, make);
	for (const task of book.tasks) {
		// Checkpoints restore the plan and observations. Authorization belongs to the live activation.
		delete task.executionConsent;
		for (const operation of task.operations) {
			if (operation.state !== "started") continue;
			operation.state = "unknown";
			task.state = "blocked";
			task.reason = "reconcile-before-retry";
		}
		if (task.state === "running") {
			task.state = "partial";
			task.reason = "session-restored";
		}
		if (task.waitStartedAt) {
			task.waitMs += Math.max(0, Date.parse(now()) - Date.parse(task.waitStartedAt));
			task.waitStartedAt = now();
		}
	}
	return book;
}
