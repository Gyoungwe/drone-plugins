import { expect } from "vitest";
import { createTaskWorkbench } from "./fixture.mjs";
import { it } from "./scoped-test.mjs";

function setup(extra = {}) {
	const j = createTaskWorkbench({ requireAuthorization: true, ...extra });
	j.attach("scope-idempotency");
	j.begin("Prepare a report");
	j.openTask("Prepare a report", null);
	j.plan({
		milestones: [{ id: "report", title: "Review the report", acceptance: { kind: "human_review" } }],
	});
	j.command({ taskId: j.snapshot().id, revision: j.view().revision, action: "authorize-task" });
	j.begin("Continue");
	return j;
}

const effect = (id, path = "report.json") => ({
	toolName: "report_tool",
	toolCallId: id,
	input: { path },
});

it("blocks an identical successful effect across turns with idempotency-check", async () => {
	const j = setup();
	const call = effect("first");
	expect(j.guard(call)).toBeNull();
	await j.observe({ ...call, isError: false });
	expect(j.snapshot().operations).toMatchObject([{ id: "first", state: "returned" }]);
	j.settle();
	j.begin("Continue");
	expect(j.guard(effect("repeat"))).toMatchObject({
		block: true,
		reason: expect.stringContaining("idempotency-check"),
	});
});

it("allows the same effect tool with different input after success", async () => {
	const j = setup();
	const call = effect("first");
	expect(j.guard(call)).toBeNull();
	await j.observe({ ...call, isError: false });
	expect(j.snapshot().operations).toMatchObject([{ id: "first", state: "returned" }]);
	j.settle();
	j.begin("Continue");
	expect(j.guard(effect("different", "other-report.json"))).toBeNull();
});

it("allows an injected read-only tool to repeat an identical successful call across turns", async () => {
	const j = setup({ readOnly: (name) => name === "report_tool" });
	const call = effect("first");
	expect(j.guard(call)).toBeNull();
	await j.observe({ ...call, isError: false });
	expect(j.snapshot()).toMatchObject({ operations: [], progressCount: 1 });
	j.settle();
	j.begin("Continue");
	expect(j.guard(effect("repeat"))).toBeNull();
});

it("allows an identical effect to retry after an isError result", async () => {
	const j = setup();
	const call = effect("first");
	expect(j.guard(call)).toBeNull();
	await j.observe({ ...call, isError: true });
	expect(j.snapshot().operations).toMatchObject([{ id: "first", state: "failed" }]);
	j.settle();
	j.begin("Continue");
	expect(j.guard(effect("retry"))).toBeNull();
});
