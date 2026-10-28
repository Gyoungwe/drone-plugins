import type { TaskView } from "@gyoungwe/plugin-api/ui";
import { explainTaskReason } from "./presentation";

export interface TaskStorage {
	mode: "persistent" | "memory";
	state: "durable" | "deferred" | "needs-reopen";
}

/** Own display extension carried unchanged by the generic task-view transport.
 * Core 0.1.9 and earlier 0.2 candidate messages have no receipt; unknown is not durable.
 */
export function taskStorage(view: TaskView): TaskStorage | null {
	const value = (view as TaskView & { storage?: unknown }).storage;
	if (
		!value ||
		typeof value !== "object" ||
		!("mode" in value) ||
		!("state" in value)
	)
		return null;
	if (
		(value.mode !== "persistent" && value.mode !== "memory") ||
		(value.state !== "durable" &&
			value.state !== "deferred" &&
			value.state !== "needs-reopen")
	)
		return null;
	return { mode: value.mode, state: value.state };
}
const savedReasons = new Set([
	"automatic-recovery",
	"automatic-stage-checkpoint",
	"automatic-handoff",
	"session-restored",
]);
export function storageTaskReason(
	view: TaskView,
	reason: string | null | undefined,
	language: "zh" | "en",
) {
	if (
		reason &&
		savedReasons.has(reason) &&
		taskStorage(view)?.state !== "durable"
	)
		return language === "zh"
			? "当前是实时任务记录，尚无已落盘回执。"
			: "This is live task progress without a confirmed disk receipt.";
	return explainTaskReason(reason, language);
}
