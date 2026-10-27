import { createEventBus } from "@earendil-works/pi-coding-agent";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

process.env.DRONE_TASK_WORKBENCH = "off";
const { registerPiCore, createNativePiHostPort } = await import("../dist/index.mjs");

test("registerPiCore exposes the portable tools and task runtime", () => {
	const tools = [];
	const commands = new Map();
	const pi = {
		on() {},
		registerTool(tool) {
			tools.push(tool);
		},
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
		getAllTools() {
			return tools.map((tool) => ({ name: tool.name }));
		},
		getCommands() {
			return [...commands.keys()].map((name) => ({ name }));
		},
		appendEntry() {},
		sendMessage() {},
		events: createEventBus(),
	};
	const result = registerPiCore(pi);
	assert.deepEqual(result.tools.slice(-5), [
		"ask_user",
		"set_status",
		"todo",
		"deliver_files",
		"memory_save",
	]);
	for (const name of ["ask_user", "set_status", "todo", "deliver_files", "memory_save", "task_status"])
		assert.ok(
			tools.some((tool) => tool.name === name),
			`missing ${name}`,
		);
	assert.ok(commands.has("drone-doctor"));
	assert.ok(commands.has("drone-example"));
});

test("drone-doctor resolves the installed Pi host and reports blocked dependencies", async () => {
	const { buildDoctorReport, buildExampleReport, parseExampleArgs } = await import("../dist/index.mjs");
	const doctor = buildDoctorReport({
		getAllTools: () => [
			{ name: "ask_user" },
			{ name: "set_status" },
			{ name: "todo" },
			{ name: "deliver_files" },
			{ name: "memory_save" },
			{ name: "task_plan" },
			{ name: "task_status" },
			{ name: "task_wait" },
			{ name: "task_reconcile" },
			{ name: "task_evidence_restore" },
		],
		getCommands: () => [{ name: "drone-doctor" }, { name: "drone-example" }],
	});
	assert.equal(doctor.schemaVersion, 1);
	assert.equal(doctor.command, "drone-doctor");
	assert.equal(doctor.status, "pass");
	assert.equal(doctor.host.version, "1.1.0");
	assert.equal(doctor.host.source, "resolved-package");

	const blockedDoctor = buildDoctorReport(
		{
			getAllTools: () => [{ name: "ask_user" }],
			getCommands: () => [{ name: "drone-doctor" }, { name: "drone-example" }],
		},
		{ hostVersion: "1.1.0" },
	);
	assert.equal(blockedDoctor.status, "blocked");
	assert.ok(blockedDoctor.checks.find((check) => check.id === "core-tools")?.missing.includes("task_plan"));
	const incompatibleDoctor = buildDoctorReport(
		{
			getAllTools: () => [],
			getCommands: () => [{ name: "drone-doctor" }, { name: "drone-example" }],
		},
		{ hostVersion: "2.0.0" },
	);
	assert.equal(incompatibleDoctor.status, "blocked");
	assert.equal(
		incompatibleDoctor.checks.find((check) => check.id === "pi-host-version")?.status,
		"incompatible",
	);

	const example = buildExampleReport({ getAllTools: () => [] });
	assert.equal(example.command, "drone-example");
	assert.equal(example.status, "blocked");
	assert.ok(example.missingTools.includes("research_search_sources"));
	assert.equal(parseExampleArgs("analysis --run assess RNA-seq inputs").example, "analysis");
	assert.equal(parseExampleArgs("analysis --run assess RNA-seq inputs").mode, "run");
	assert.equal(parseExampleArgs("analysis --run assess RNA-seq inputs").question, "assess RNA-seq inputs");

	const allTools = [
		"knowledge_status",
		"knowledge_search",
		"research_search_sources",
		"research_read_source",
		"research_answer_sources",
		"analysis_list_adapters",
		"analysis_assess_readiness",
		"evidence_validate_manifest",
		"evidence_validate_capsule",
		"evidence_verify_replay",
	].map((name) => ({ name }));
	const fakePi = { getAllTools: () => allTools };
	assert.equal(
		buildExampleReport(fakePi, "preview", undefined, { example: "knowledge" }).status,
		"unconfigured",
	);
	assert.equal(
		buildExampleReport(fakePi, "preview", "find sources", { example: "research" }).title,
		"Evidence-gated local research example",
	);
	assert.equal(
		buildExampleReport(fakePi, "preview", undefined, { example: "analysis" }).title,
		"Analysis readiness example",
	);
	assert.equal(
		buildExampleReport(fakePi, "preview", "assess inputs", { example: "analysis" }).status,
		"needs-container",
	);
	assert.equal(
		buildExampleReport(fakePi, "preview", "assess inputs", { example: "analysis", containerAvailable: true })
			.status,
		"ready",
	);
	assert.equal(
		buildExampleReport(fakePi, "preview", undefined, { example: "evidence" }).title,
		"Evidence validation example",
	);
});

test("native host adapter uses ctx.ui authorization and advertises native Pi", async () => {
	const host = createNativePiHostPort({
		signal: new AbortController().signal,
		ui: { confirm: async () => true },
	});
	assert.equal(host.host, "native-pi");
	assert.equal((await host.requestAuthorization({ action: "write" })).granted, true);
	assert.equal(host.capabilities().capabilities.includes("requestAuthorization"), true);
});


test("task service responds with the current journal after SDK session attachment switches owners", async () => {
	function host() {
		const emitter = new EventEmitter(), hooks = new Map(), tools = [];
		const pi = {
			events: { on(name, handler) { emitter.on(name, handler); return () => emitter.off(name, handler); }, emit: (name, value) => emitter.emit(name, value) },
			on(name, handler) { hooks.set(name, [...(hooks.get(name) || []), handler]); },
			registerTool(tool) { tools.push(tool); }, registerCommand() {},
			getAllTools: () => tools, getCommands: () => [], appendEntry() {}, sendMessage() {},
		};
		registerPiCore(pi);
		const readJournal = () => {
			let journal;
			const remove = pi.events.on("drone:task-runtime/v1", value => { journal = value.registry.journal; });
			pi.events.emit("drone:task-runtime/request/v1", { version: 1 });
			remove();
			return journal;
		};
		return { hooks, readJournal };
	}
	const first = host(), restored = host();
	const original = first.readJournal();
	assert.notEqual(restored.readJournal(), original);
	const manager = { getSessionId: () => "restored", getBranch: () => [] };
	Object.defineProperty(manager, "__drone_task_workbench_v2", { value: { version: 2, journal: original } });
	for (const handler of restored.hooks.get("session_start") || []) await handler({}, { cwd: process.cwd(), sessionManager: manager });
	assert.equal(restored.readJournal(), original);
	for (const handler of restored.hooks.get("session_tree") || []) await handler({}, { cwd: process.cwd(), sessionManager: manager });
	assert.equal(restored.readJournal(), original);
});
