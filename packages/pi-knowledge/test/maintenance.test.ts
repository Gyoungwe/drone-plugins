import { describe, expect, it } from "vitest";
import { planMaintenance } from "../src/maintenance/plan.js";
import { runMaintenance } from "../src/maintenance/run.js";

describe("maintenance planning", () => {
	it("sorts by priority, excludes infrastructure pages and truncates", () => {
		const result = planMaintenance(null, {
			nodes: [
				{ path: "Library/a.md", title: "Useful topic", kind: "note", degree: 0 },
				{ path: "Library/b.md", title: "PMC7022188.1.pdf", kind: "note", degree: 1 },
				{ path: "Wiki/c.md", title: "A Wiki", kind: "wiki", degree: 1 },
				{ path: "Wiki/d.md", title: "Unused Wiki", kind: "wiki", degree: 0 },
				{ path: "Home.md", title: "Home", kind: "navigation", degree: 0 },
			],
			edges: [{ source: "Library/b.md", target: "Wiki/c.md" }],
		}, { enabled: true, maxItems: 3, dailyLimit: 20 });
		expect(result.map((item) => `${item.kind}:${item.id}`)).toEqual([
			"missing-topic:Library/b.md",
			"orphan:Library/a.md",
			"unlinked:Wiki/d.md",
		]);
	});
	it("does nothing when disabled", () => expect(planMaintenance(null, null, { enabled: false, maxItems: 5, dailyLimit: 5 })).toEqual([]));
});

describe("maintenance execution", () => {
	const ports = () => ({
		readNote: async () => ({ markdown: "body with evidence", title: "Human title" }),
		complete: async (prompt: string) => prompt.includes("Choose a concise topic") ? '{"topic":"Topic"}' : '{"target":"a","reason":"review"}',
		setTopic: async () => undefined,
		proposeWiki: async () => undefined,
	});
	it("updates only topic for missing-topic", async () => {
		const calls: string[] = [];
		const result = await runMaintenance([{ id: "a", kind: "missing-topic", path: "a.md" }], { ...ports(), setTopic: async (_path, topic) => { calls.push(topic); } });
		expect(calls).toEqual(["Topic"]);
		expect(result.items[0]?.status).toBe("topic-updated");
	});
	it("includes note content in the prompt", async () => {
		let prompt = "";
		await runMaintenance([{ id: "a", kind: "missing-topic", path: "a.md" }], {
			...ports(),
			complete: async (value) => {
				prompt = value;
				return '{"topic":"Topic"}';
			},
		});
		expect(prompt).toContain("body with evidence");
	});
	it("submits body changes as Wiki candidates", async () => {
		const calls: string[] = [];
		const result = await runMaintenance([{ id: "a", kind: "orphan", path: "a.md" }], { ...ports(), proposeWiki: async () => { calls.push("candidate"); } });
		expect(calls).toEqual(["candidate"]);
		expect(result.items[0]?.status).toBe("candidate-submitted");
	});
	it("skips malformed model JSON without writing", async () => {
		const result = await runMaintenance([{ id: "a", kind: "orphan", path: "a.md" }], { ...ports(), complete: async () => "nope" });
		expect(result.items[0]?.status).toBe("skipped");
	});
	it("parses fenced JSON and turns link suggestions into a review markdown", async () => {
		let proposal: Record<string, unknown> | null = null;
		const result = await runMaintenance([{ id: "a", kind: "orphan", path: "a.md" }], {
			...ports(),
			complete: async () => "```json\n{\"target\":\"Wiki/a\",\"reason\":\"related\"}\n```",
			proposeWiki: async (_item, value) => {
				proposal = value;
			},
		});
		expect(result.items[0]?.status).toBe("candidate-submitted");
		expect(proposal).toMatchObject({ markdown: "[[Wiki/a]]", rationale: "related" });
	});
	it("stops at the daily model budget and validates Wiki links before writing", async () => {
		const calls: string[] = [];
		const result = await runMaintenance(
			[
				{ id: "a", kind: "orphan", path: "a.md" },
				{ id: "b", kind: "orphan", path: "b.md" },
			],
			{
				...ports(),
				budget: { modelCalls: 1 },
				validateWikiLinks: async () => {
					calls.push("validate");
				},
				proposeWiki: async () => {
					calls.push("propose");
				},
			},
		);
		expect(result.modelCalls).toBe(1);
		expect(result.items.map((item) => item.reason)).toEqual([undefined, "daily-budget-exhausted"]);
		expect(calls).toEqual(["validate", "propose"]);
		await expect(
			runMaintenance([{ id: "a", kind: "orphan", path: "a.md" }], {
				...ports(),
				validateWikiLinks: async () => {
					throw new Error("unknown-wiki-target");
				},
			}),
		).resolves.toMatchObject({ items: [{ status: "skipped", reason: "unknown-wiki-target" }] });
	});
});
