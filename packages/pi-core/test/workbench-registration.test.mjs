import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { registerPiCore, registerPiWorkbench } from "../dist/index.mjs";

function harness(register = registerPiWorkbench) {
	const tools = new Map();
	const registration = register({
		on: () => undefined,
		registerCommand: () => undefined,
		registerTool(tool) {
			assert.ok(!tools.has(tool.name), `duplicate tool: ${tool.name}`);
			tools.set(tool.name, tool);
		},
		events: createEventBus(),
	});
	return { tools, registration };
}

test("pi-core registers 14 distinct tools matching the manifest", async () => {
	const { tools } = harness(registerPiCore);
	const manifest = JSON.parse(readFileSync(new URL("../plugin.manifest.json", import.meta.url), "utf8"));
	assert.equal(tools.size, 14);
	assert.deepEqual([...tools.keys()].sort(), manifest.tools.toSorted());
	await tools.get("workbench_plan").execute("1", { items: ["Verify the merge"] });
	const { details } = await tools.get("workbench_status").execute("2", {});
	assert.equal(details.tasks[0].content, "Verify the merge");
	assert.deepEqual((await harness(registerPiCore).tools.get("workbench_status").execute("3", {})).details, {
		tasks: [],
		memory: [],
	});
});

test("registers scoped task and memory tools", async () => {
	const first = harness();
	const second = harness();
	assert.deepEqual(first.registration.tools, [
		"workbench_plan",
		"workbench_status",
		"workbench_todo",
		"workbench_memory_save",
	]);
	await first.tools.get("workbench_plan").execute("1", { items: ["Read sources", "Write a bounded note"] });
	await first.tools
		.get("workbench_memory_save")
		.execute("2", { title: "Scoped finding", body: "Only this activation can see it." });
	const snapshot = (await first.tools.get("workbench_status").execute("3", {})).details;
	assert.equal(snapshot.tasks.length, 2);
	assert.equal(snapshot.memory.length, 1);
	assert.deepEqual((await second.tools.get("workbench_status").execute("4", {})).details, {
		tasks: [],
		memory: [],
	});
});

test("updates planned work and rejects unknown ids", async () => {
	const { tools } = harness();
	const planned = (await tools.get("workbench_plan").execute("1", { items: ["Verify receipt"] })).details
		.tasks[0];
	const updated = (await tools.get("workbench_todo").execute("2", { id: planned.id, state: "completed" }))
		.details.task;
	assert.equal(updated.state, "completed");
	await assert.rejects(
		() => tools.get("workbench_todo").execute("3", { id: "missing", state: "blocked" }),
		/Unknown task/,
	);
});
