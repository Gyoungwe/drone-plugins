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

test("tasks host loader adapts an injected workbench client", async () => {
	const calls = [];
	const port = host.taskHostLoader.load({
		workbench: {
			invoke: async (operation, input) => {
				calls.push({ operation, input });
				return { operation, input };
			},
		},
	});
	assert.equal(typeof port.workbench?.status, "function");
	await port.workbench?.status();
	await port.workbench?.plan(["one", "two"]);
	assert.deepEqual(calls, [
		{ operation: "status", input: {} },
		{ operation: "plan", input: { items: ["one", "two"] } },
	]);
});
