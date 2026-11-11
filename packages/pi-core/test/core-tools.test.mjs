import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { formatTodoList, makeStatusTool, makeTodoTool, normalizeTodos } from "../dist/host.mjs";

describe("normalizeTodos", () => {
	test("多 in_progress：保留第一个、其余降 pending", () => {
		assert.deepEqual(
			normalizeTodos([
				{ content: "a", status: "in_progress" },
				{ content: "b", status: "in_progress" },
				{ content: "c", status: "pending" },
			]),
			[
				{ content: "a", status: "in_progress" },
				{ content: "b", status: "pending" },
				{ content: "c", status: "pending" },
			],
		);
	});

	test("空 content 过滤（含纯空白）", () => {
		assert.deepEqual(
			normalizeTodos([
				{ content: "  ", status: "pending" },
				{ content: "", status: "completed" },
				{ content: "ok", status: "pending" },
			]),
			[{ content: "ok", status: "pending" }],
		);
	});

	test("上限 50 条截断", () => {
		const raw = Array.from({ length: 60 }, (_, i) => ({ content: `t${i}`, status: "pending" }));
		assert.equal(normalizeTodos(raw).length, 50);
	});

	test("空数组保持空（清空语义）", () => {
		assert.deepEqual(normalizeTodos([]), []);
	});
});

describe("formatTodoList", () => {
	test("编号 + 状态标记文本", () => {
		assert.equal(
			formatTodoList([
				{ content: "重构", status: "in_progress" },
				{ content: "测试", status: "completed" },
			]),
			"1. [in_progress] 重构\n2. [completed] 测试",
		);
	});
});

describe("makeTodoTool execute", () => {
	test("content 为文本清单、details 为规整后的 todos", async () => {
		const tool = makeTodoTool();
		const result = await tool.execute(
			"c1",
			{
				todos: [
					{ content: "重构", status: "in_progress" },
					{ content: "测试", status: "pending" },
				],
			},
			undefined,
			undefined,
			undefined,
		);
		assert.deepEqual(result.details, {
			todos: [
				{ content: "重构", status: "in_progress" },
				{ content: "测试", status: "pending" },
			],
		});
		assert.equal(result.content[0].type, "text");
		assert.equal(result.content[0].text, "Current task list:\n1. [in_progress] 重构\n2. [pending] 测试");
	});

	test("空数组：content 提示已清空、details 空列表", async () => {
		const tool = makeTodoTool();
		const result = await tool.execute("c1", { todos: [] }, undefined, undefined, undefined);
		assert.equal(result.content[0].type, "text");
		assert.equal(result.content[0].text, "Todo list cleared (empty).");
		assert.deepEqual(result.details, { todos: [] });
	});
});

describe("set_status", () => {
	const run = (params) => makeStatusTool().execute("id", params, undefined, undefined, undefined);

	test('accepts kind "progress" as an alias of "update"', async () => {
		assert.equal((await run({ text: "检索文献", kind: "progress" })).details.kind, "update");
		assert.equal((await run({ text: "检索文献", kind: "summary" })).details.kind, "summary");
		assert.equal("kind" in (await run({ text: "检索文献" })).details, false);
	});

	test("asks for the user's language and localizes the host result", async (t) => {
		const savedLanguage = process.env.DRONE_REPLY_LANGUAGE;
		t.after(() => {
			if (savedLanguage === undefined) delete process.env.DRONE_REPLY_LANGUAGE;
			else process.env.DRONE_REPLY_LANGUAGE = savedLanguage;
		});
		delete process.env.DRONE_REPLY_LANGUAGE;
		const schema = JSON.stringify(makeStatusTool().parameters);
		assert.ok(schema.includes("user's language"));
		assert.equal((await run({ text: "Searching" })).content[0].text, "Status updated: Searching");
		process.env.DRONE_REPLY_LANGUAGE = "zh";
		assert.equal((await run({ text: "正在检索  文献" })).content[0].text, "状态已更新：正在检索 文献");
	});
});

describe("public summary → tools → next summary timeline", () => {
	test("preserves the public summary kind in the real status tool result", async () => {
		const tool = makeStatusTool();
		const result = await tool.execute("s", {
			text: "Evidence gap remains",
			kind: "summary",
			detail: "The queried source did not resolve the parameter version.",
		});
		assert.equal(result.details.kind, "summary");
	});
});
