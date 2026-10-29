import assert from "node:assert/strict";
import test from "node:test";
import registerPiWorkbench from "../dist/index.mjs";

function harness() {
	const tools = new Map();
	const registration = registerPiWorkbench({ registerTool(tool) { tools.set(tool.name, tool); } });
	return { tools, registration };
}

test("registers scoped task and memory tools", async () => {
	const first = harness();
	const second = harness();
	assert.deepEqual(first.registration.tools, ["workbench_plan", "workbench_status", "workbench_todo", "workbench_memory_save"]);
	await first.tools.get("workbench_plan").execute("1", { items: ["Read sources", "Write a bounded note"] });
	await first.tools.get("workbench_memory_save").execute("2", { title: "Scoped finding", body: "Only this activation can see it." });
	const snapshot = (await first.tools.get("workbench_status").execute("3", {})).details;
	assert.equal(snapshot.tasks.length, 2);
	assert.equal(snapshot.memory.length, 1);
	assert.deepEqual((await second.tools.get("workbench_status").execute("4", {})).details, { tasks: [], memory: [] });
});

test("updates planned work and rejects unknown ids", async () => {
	const { tools } = harness();
	const planned = (await tools.get("workbench_plan").execute("1", { items: ["Verify receipt"] })).details.tasks[0];
	const updated = (await tools.get("workbench_todo").execute("2", { id: planned.id, state: "completed" })).details.task;
	assert.equal(updated.state, "completed");
	await assert.rejects(() => tools.get("workbench_todo").execute("3", { id: "missing", state: "blocked" }), /Unknown task/);
});
