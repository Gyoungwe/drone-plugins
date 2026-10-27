import assert from "node:assert/strict";
import test from "node:test";
import * as host from "../dist/host.mjs";

test("versioned host entry exposes the portable tool contracts", () => {
	for (const name of [
		"makeStatusTool",
		"makeTodoTool",
		"normalizeTodos",
		"formatTodoList",
		"makeMemorySaveTool",
		"deliverFilesParams",
		"makeDeliverFilesTool",
	]) {
		assert.equal(typeof host[name], name === "deliverFilesParams" ? "object" : "function", name);
	}
});

test("versioned host entry exports the core host loader contract", () => {
	assert.equal(host.coreHostLoader.contractVersion, 1);
	const port = host.coreHostLoader.load();
	for (const name of [
		"makeStatusTool",
		"makeTodoTool",
		"makeMemorySaveTool",
		"makeDeliverFilesTool",
		"memoryIndexPrompt",
		"writeMemory",
	]) {
		assert.equal(typeof port[name], "function", name);
	}
	assert.equal(port.contractVersion, 1);
});

test("versioned host entry exports the optional tasks host loader contract", () => {
	assert.equal(host.taskHostLoader.contractVersion, 1);
	const port = host.taskHostLoader.load();
	assert.equal(port.contractVersion, 1);
	assert.equal(typeof port.registerAcceptanceVerifier, "function");
	assert.equal(typeof port.readAcceptanceVerifier, "function");
	port.registerAcceptanceVerifier("host_test", { fields: ["doi"] });
	assert.equal(port.readAcceptanceVerifier("host_test").kind, "host_test");
});

test("tasks host loader preserves the runtime client contract", async () => {
	const calls = [];
	const listeners = new Set();
	const workbench = {
		invoke: async (operation, input) => {
			calls.push({ operation, input });
			return { operation, input };
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
	const port = host.taskHostLoader.load({ workbench });
	assert.equal(port.workbench, workbench);
	await port.workbench.invoke("status", {});
	await port.workbench.invoke("plan", { items: ["one", "two"] });
	const changed = [];
	const unsubscribe = port.workbench.subscribe((event) => changed.push(event));
	for (const listener of listeners) listener({ type: "changed", revision: 2 });
	unsubscribe();
	assert.equal(listeners.size, 0);
	assert.deepEqual(changed, [{ type: "changed", revision: 2 }]);
	assert.deepEqual(calls, [
		{ operation: "status", input: {} },
		{ operation: "plan", input: { items: ["one", "two"] } },
	]);
});
