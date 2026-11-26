import type { PluginSessionRecordReadResult } from "@gyoungwe/plugin-api/runtime";
import type { createEvidenceRecovery } from "./evidence.js";
import { hostLanguage } from "./host-language.js";
import type { createTaskWorkbench } from "./workbench.js";
import { type TaskEntry, WORKBENCH_ENTRY } from "./workbench-state.js";

export const TASK_SESSION_ENTRY = "drone-task-session-v1";
const EVIDENCE_ENTRY = "drone-task-evidence-v1";
export type TaskStorage = Pick<PluginSessionRecordReadResult, "mode" | "state">;
export type TaskStorageRead = TaskStorage & { code: string | null; entries: readonly TaskEntry[] };
type StorageStatus = TaskStorage | { mode?: undefined; state: "needs-reopen" };
type Journal = ReturnType<typeof createTaskWorkbench>;
type Evidence = ReturnType<typeof createEvidenceRecovery>;

export interface TaskStorageFailure {
	state: "needs-reopen";
	message: string | null;
	lastCommitted: TaskSessionStatus;
}

export function sessionRecord(journal: Journal, evidence: Evidence) {
	return {
		customType: TASK_SESSION_ENTRY,
		data: { version: 1, workbench: journal.checkpoint().book, evidence: evidence.checkpoint() },
	};
}
export type TaskSessionRecord = ReturnType<typeof sessionRecord>;

// Read pre-session checkpoints through the same actor while those histories remain supported.
export function taskEntries(entries: readonly TaskEntry[]) {
	return entries.flatMap((entry) => {
		const data = entry.data as TaskSessionRecord["data"] | null;
		return entry.customType === TASK_SESSION_ENTRY && data?.version === 1
			? [
					{ customType: WORKBENCH_ENTRY, data: data.workbench },
					{ customType: EVIDENCE_ENTRY, data: data.evidence },
				]
			: [entry];
	});
}

export function projection(journal: Journal, storage: StorageStatus | null) {
	const available = storage?.mode === "memory" || storage?.state === "durable";
	return {
		scope: journal.scope(),
		view: { ...journal.view(), storage: structuredClone(storage) },
		storage: structuredClone(storage),
		snapshot: journal.snapshot(),
		render: journal.render(),
		readRoots: journal.readRoots(),
		authorization: available ? journal.authorization() : null,
		writeAuthorization: available ? journal.authorization(true) : null,
	};
}

export type TaskSessionStatus = ReturnType<typeof projection> & {
	persistence?: Omit<TaskStorageFailure, "lastCommitted">;
};

export function taskSessionStatus(live: TaskSessionStatus, failure: TaskStorageFailure | null | undefined) {
	const result = structuredClone(failure?.lastCommitted || live);
	if (failure) {
		result.persistence = { state: failure.state, message: failure.message };
		result.view.storage = result.storage = { ...result.storage, state: "needs-reopen" };
		result.authorization = result.writeAuthorization = null;
		result.readRoots = [];
		result.render +=
			"\nTask storage failed. This is the last confirmed task state; reopen the application from disk before continuing.";
	} else if (result.storage?.state === "deferred") {
		result.render +=
			"\n" +
			(hostLanguage() === "zh"
				? result.storage.mode === "memory"
					? "当前任务仅保留在内存中，未保存到磁盘；重新加载不会恢复本轮授权。"
					: "任务检查点仍为 deferred，尚未保存到磁盘；外部写入须等待真实落盘回执。"
				: result.storage.mode === "memory"
					? "This task is live-only in memory, not saved to disk; reloading does not restore this activation's authorization."
					: "Task checkpoint durability is deferred; external writes require an actual disk receipt.");
	}
	return result;
}
