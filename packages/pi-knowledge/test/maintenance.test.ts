import { describe, expect, it } from "vitest";
import { planMaintenance } from "../src/maintenance/plan.js";
import { runMaintenance } from "../src/maintenance/run.js";

describe("maintenance planning", () => {
	it("sorts by priority, excludes infrastructure pages and truncates", () => {
		const result = planMaintenance({ items: [
			{ id: "o", kind: "orphan", path: "Library/a.md" },
			{ id: "h", kind: "missing-topic", path: "Library/b.md" },
			{ id: "i", kind: "unlinked", path: "Home.md" },
		] }, null, { enabled: true, maxItems: 2, dailyLimit: 20 });
		expect(result.map((item) => item.id)).toEqual(["h", "o"]);
	});
	it("does nothing when disabled", () => expect(planMaintenance({ items: [{ path: "a.md" }] }, null, { enabled: false, maxItems: 5, dailyLimit: 5 })).toEqual([]));
});

describe("maintenance execution", () => {
	const ports = () => ({
		readNote: async () => ({ markdown: "body", title: "Human title" }),
		complete: async (prompt: string) => prompt.includes("topic") ? '{"topic":"Topic"}' : '{"title":"Wiki","markdown":"[[a]]","rationale":"review"}',
		setTopic: async () => undefined,
		proposeWiki: async () => undefined,
	});
	it("updates only topic for missing-topic", async () => {
		const calls: string[] = [];
		const result = await runMaintenance([{ id: "a", kind: "missing-topic", path: "a.md" }], { ...ports(), setTopic: async (_path, topic) => { calls.push(topic); } });
		expect(calls).toEqual(["Topic"]);
		expect(result.items[0]?.status).toBe("topic-updated");
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
