import type { TaskView } from "@gyoungwe/plugin-api/ui";
import { expect, it } from "vitest";
import { storageTaskReason, taskStorage } from "./storage";

const view: TaskView = {
	version: 2,
	revision: 1,
	activeTaskId: null,
	selectionRequired: false,
	tasks: [],
	limits: { stageCalls: 48, totalCalls: 192 },
};
it("keeps old 0.1.9/earlier 0.2 messages explicitly unknown and avoids saved-checkpoint claims", () => {
	expect(taskStorage(view)).toBeNull();
	expect(storageTaskReason(view, "automatic-handoff", "zh")).toBe(
		"当前是实时任务记录，尚无已落盘回执。",
	);
});
it("shows actual memory and persistent receipt facts without treating them as grants", () => {
	for (const mode of ["memory", "persistent"] as const) {
		const live = { ...view, storage: { mode, state: "deferred" } };
		expect(taskStorage(live)).toEqual({ mode, state: "deferred" });
		expect(storageTaskReason(live, "automatic-stage-checkpoint", "en")).toBe(
			"This is live task progress without a confirmed disk receipt.",
		);
	}
	const durable = {
		...view,
		storage: { mode: "persistent", state: "durable" },
	};
	expect(storageTaskReason(durable, "automatic-stage-checkpoint", "en")).toBe(
		"Progress was saved and the next part is continuing.",
	);
});
