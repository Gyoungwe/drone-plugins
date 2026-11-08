import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { harness, plan, taskAction } from "./managed-harness.mjs";

const latestTask = (host) => host.records.findLast((row) => row.data?.workbench)?.data.workbench.tasks.at(-1);

it("the task takes the host's capability checkpoint as the native adapter does", async () => {
	const t = await harness();
	t.host.checkpoint = ["literature", "analysis"];
	await t.hooks.input({ text: plan.goal, images: [] }, t.ctx);
	await t.hooks.before_agent_start({ prompt: plan.goal, systemPrompt: "" }, t.ctx);
	await t.tool("task_plan", plan);
	expect(latestTask(t.host).capabilities).toEqual(["literature", "analysis"]);
	await t.close();
});

it("approving the task from the panel records the decision through the host", async () => {
	const t = await harness();
	t.host.denyGrant = true;
	await t.hooks.input({ text: plan.goal, images: [] }, t.ctx);
	await t.tool("task_plan", plan);
	t.host.denyGrant = false;
	const { snapshot } = await t.app.operations.status.execute(null, { signal: t.ctx.signal });
	const { revision } = t.host.notices.at(-1).view;
	await t.command("task-action", taskAction({ action: "authorize-task", taskId: snapshot.id, revision }));
	expect(t.host.decisions).toEqual([
		{
			id: `task-authorization:${snapshot.id}:${revision}`,
			kind: "task-authorization",
			summary: plan.summary,
			basis: [`task:${snapshot.id}`, `revision:${revision}`],
		},
	]);
	await t.close();
});

it("a forwarded context eviction makes the read window recoverable", async () => {
	const t = await harness();
	await writeFile(join(t.cwd, "data.txt"), "one\ntwo\nthree");
	// Evidence windows belong to a task.
	await t.hooks.input({ text: plan.goal, images: [] }, t.ctx);
	await t.tool("task_plan", plan);
	const read = { toolName: "read", toolCallId: "r1", input: { path: "data.txt", offset: 2, limit: 1 } };
	await t.hooks.tool_result({ type: "tool_result", ...read, content: [], isError: false }, t.ctx);
	const restore = () => t.tool("task_evidence_restore", { receiptId: "r1", path: "data.txt" });
	await expect(restore()).rejects.toThrow("recovery-unavailable");
	await t.hooks["drone:context-evicted"]({ sessionId: "s1", toolCallIds: ["r1"] }, t.ctx);
	expect(await restore()).toMatchObject({ status: "restored", text: "two" });
	await t.close();
});
