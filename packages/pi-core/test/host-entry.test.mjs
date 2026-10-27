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
