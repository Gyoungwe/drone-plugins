import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTaskMilestones, taskHostLoader } from "../dist/host.mjs";

const catalog = {
	kinds: ["file", "human_review", "zotero_item"],
	fields: { zotero_item: ["doi"] },
};
const milestone = (id, extra = {}) => ({
	id,
	title: id,
	acceptance: { kind: "file", path: `${id}.txt` },
	...extra,
});

test("normalizes a bounded plan without mutating model input", () => {
	const input = [
		milestone("first_step"),
		milestone("paper", {
			dependsOn: ["first_step"],
			acceptance: {
				kind: "zotero_item",
				doi: "10.1/a",
				undeclared: "drop",
				rootKind: "vault",
			},
		}),
	];
	const before = structuredClone(input);
	const normalized = taskHostLoader.load().normalizeMilestones(input, catalog);
	assert.deepEqual(input, before);
	assert.equal(normalized[1].state, "pending");
	assert.equal(normalized[1].evidence, null);
	assert.deepEqual(normalized[1].acceptance, {
		kind: "zotero_item",
		path: "",
		sha256: null,
		rootKind: "vault",
		doi: "10.1/a",
	});
	assert.deepEqual(normalized[1].dependsOn, ["first_step"]);
});

test("rejects invalid milestone counts, identifiers, duplicates and forward dependencies", () => {
	assert.throws(() => normalizeTaskMilestones([], catalog), /Plan needs/);
	assert.throws(
		() =>
			normalizeTaskMilestones(
				Array.from({ length: 25 }, (_, i) => milestone(String(i))),
				catalog,
			),
		/Plan needs/,
	);
	assert.throws(
		() => normalizeTaskMilestones([milestone("bad id!")], catalog),
		/invalid: use/,
	);
	assert.throws(
		() =>
			normalizeTaskMilestones([milestone("same"), milestone("same")], catalog),
		/must be unique/,
	);
	assert.throws(
		() =>
			normalizeTaskMilestones(
				[milestone("first", { dependsOn: ["second"] }), milestone("second")],
				catalog,
			),
		/Dependencies/,
	);
	assert.throws(
		() =>
			normalizeTaskMilestones(
				[milestone("first", { dependsOn: ["first"] })],
				catalog,
			),
		/Dependencies/,
	);
});

test("acceptance comes from the extension catalog and never from model completion flags", () => {
	assert.throws(
		() =>
			normalizeTaskMilestones(
				[
					milestone("one", {
						acceptance: { kind: "mystery", completed: true },
					}),
				],
				catalog,
			),
		/Acceptance must/,
	);
	assert.deepEqual(
		normalizeTaskMilestones(
			[milestone("one", { state: "completed", evidence: { verified: true } })],
			catalog,
		)[0],
		{
			id: "one",
			title: "one",
			dependsOn: [],
			acceptance: { kind: "file", path: "one.txt", sha256: null },
			state: "pending",
			evidence: null,
		},
	);
});

for (const path of [
	".pi/mcp.json",
	"C:\\proj\\.mcp.json",
	"mcp.json",
	".pi/mcp-adapter.json",
]) {
	test(`configuration write ${path} cannot prove tools loaded`, () => {
		assert.throws(
			() =>
				normalizeTaskMilestones(
					[milestone("one", { acceptance: { kind: "file", path } })],
					catalog,
				),
			/does not load MCP tools/,
		);
	});
}

test("native task_plan executes the plugin policy before appending task state", async () => {
	const { registerPiCore } = await import("../dist/index.mjs");
	const { tmpdir } = await import("node:os");
	const tools = new Map();
	const checkpoints = [];
	const pi = {
		on() {},
		registerTool(tool) {
			tools.set(tool.name, tool);
		},
		registerCommand() {},
		getAllTools() {
			return [...tools.values()].map((tool) => ({ name: tool.name }));
		},
		getCommands() {
			return [];
		},
		appendEntry(customType, data) {
			checkpoints.push({ customType, data });
		},
		sendMessage() {},
		events: { on() {}, emit() {} },
	};
	registerPiCore(pi, {
		host: {
			host: "drone-desktop",
			capabilities: () => ({ capabilities: ["requestAuthorization"] }),
			requestAuthorization: async () => ({ granted: false }),
		},
	});
	const ctx = {
		cwd: tmpdir(),
		sessionManager: {
			getSessionId: () => "native-plan-policy",
			getBranch: () => [],
		},
	};
	await assert.rejects(
		tools
			.get("task_plan")
			.execute(
				"invalid-plan",
				{ goal: "Report", milestones: [milestone("bad id")] },
				undefined,
				undefined,
				ctx,
			),
		/invalid: use/,
	);
	assert.equal(checkpoints.length, 0);
	await tools
		.get("task_plan")
		.execute(
			"valid-plan",
			{ goal: "Report", milestones: [milestone("report")] },
			undefined,
			undefined,
			ctx,
		);
	const task = checkpoints.findLast(
		(entry) => entry.customType === "drone-task-workbench-v2",
	).data.tasks[0];
	assert.equal(task.milestones[0].id, "report");
	assert.equal(task.state, "waiting_user");
	assert.equal(task.planApproved, false);
});
