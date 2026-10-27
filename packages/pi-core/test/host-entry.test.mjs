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

 test("two task loaders keep verifier registries and shutdown isolated", async () => {
 const first = host.taskHostLoader.load(), second = host.taskHostLoader.load();
 first.registerAcceptanceVerifier("loader_first", { fields: ["doi"] });
 assert.equal(second.readAcceptanceVerifier("loader_first"), null);
 second.registerAcceptanceVerifier("loader_second", { fields: ["title"] });
 assert.equal(first.readAcceptanceVerifier("loader_second"), null);
 await first.dispose();
 assert.equal(second.readAcceptanceVerifier("loader_second").kind, "loader_second");
 assert.throws(() => first.createNativeSession(), /disposed/);
 await second.dispose();
 });

test("native entry and loader share one owner per event bus, while two sessions remain isolated", async () => {
 const { createEventBus } = await import("@earendil-works/pi-coding-agent");
 const { registerPiCore } = await import("../dist/index.mjs");
 const loader = host.taskHostLoader.load();
 const secondLoader = host.taskHostLoader.load();
 const sessions = [loader.createNativeSession(), loader.createNativeSession(), secondLoader.createNativeSession()];
 const makePi = () => {
  const hooks = new Map(), tools = [], events = createEventBus();
  return { events, tools, hooks, on(name, handler) { hooks.set(name, [...hooks.get(name) || [], handler]); },
   registerTool(tool) { tools.push(tool); }, registerCommand() {},
   getAllTools: () => tools, getCommands: () => [], appendEntry() {}, sendMessage() {},
  };
 };
 const first = makePi(), second = makePi(), third = makePi();
 registerPiCore(first);
 await sessions[0].extension(first);
 await sessions[1].extension(second);
 await sessions[2].extension(third);
 first.events.emit("drone:acceptance-verifier/v1", { version: 1, kind: "first_session", definition: { fields: ["firstField"], verify: () => "first" } });
 const schema = (pi) => pi.tools.find((tool) => tool.name === "task_plan").parameters.properties.milestones.items.properties.acceptance;
 assert.equal(first.tools.filter((tool) => tool.name === "task_plan").length, 1);
 assert(schema(first).properties.kind.enum.includes("first_session"));
 assert(!schema(second).properties.kind.enum.includes("first_session"));
 assert(!schema(third).properties.kind.enum.includes("first_session"));
 await loader.dispose();
 assert.throws(() => first.tools.find((tool) => tool.name === "task_plan").execute(), /disposed/);
 assert.throws(() => second.tools.find((tool) => tool.name === "task_plan").execute(), /disposed/);
 assert.doesNotThrow(() => third.events.emit("drone:acceptance-verifier/v1", { version: 1, kind: "third_session", definition: { fields: [] } }));
 await secondLoader.dispose();
});
