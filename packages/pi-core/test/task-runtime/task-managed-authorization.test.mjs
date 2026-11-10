import { expect, it } from "vitest";
import { contractHash } from "../../src/task-runtime/consent.mjs";
import { harness, plan } from "./managed-harness.mjs";

function heldGrant() {
	let show, approve;
	const shown = new Promise((resolve) => {
		show = resolve;
	});
	const answer = new Promise((resolve) => {
		approve = resolve;
	});
	return {
		shown,
		approve,
		beforeGrant: (request) => {
			show(request);
			return answer;
		},
	};
}

it("authorizes the shown contract after parallel task_status accounting changes the revision", async () => {
	const dialog = heldGrant();
	const t = await harness({ beforeGrant: dialog.beforeGrant });
	try {
		await t.hooks.input({ text: plan.goal, images: [] }, t.ctx);
		t.host.streaming = true;
		await t.hooks.before_agent_start({ prompt: plan.goal, systemPrompt: "" }, t.ctx);
		const planning = { toolName: "task_plan", toolCallId: "task_plan-1", input: plan };
		expect(await t.hooks.tool_call({ type: "tool_call", ...planning }, t.ctx)).toBeUndefined();
		const planned = t.tool("task_plan", plan);
		const shown = await dialog.shown;
		const before = t.host.records.at(-1).data.workbench.revision;
		const status = { toolName: "task_status", toolCallId: "status-1", input: {} };
		expect(await t.hooks.tool_call({ type: "tool_call", ...status }, t.ctx)).toBeUndefined();
		const result = await t.tools.task_status.execute("status-1", {}, t.ctx.signal, undefined, t.ctx);
		expect(t.host.records.at(-1).data.workbench.revision).toBe(before);
		await t.hooks.tool_result({ type: "tool_result", ...status, ...result, isError: false }, t.ctx);
		expect(t.host.records.at(-1).data.workbench.revision).toBe(before + 1);
		expect(t.host.grant).toBeNull();
		dialog.approve();
		const authorized = await planned;
		expect(authorized.authorized).toBe(true);
		await t.hooks.tool_result(
			{ type: "tool_result", ...planning, content: [{ type: "text", text: JSON.stringify(authorized) }] },
			t.ctx,
		);
		const task = t.host.records.at(-1).data.workbench.tasks.find((task) => task.id === shown.taskId);
		expect(task.executionConsent).toMatchObject({ contractHash: shown.contractHash });
		expect(
			await t.hooks.tool_call(
				{ type: "tool_call", toolName: "write", toolCallId: "w1", input: { path: "out/a.md", content: "A" } },
				t.ctx,
			),
		).toBeUndefined();
	} finally {
		dialog.approve();
		await t.close();
	}
});

it("rejects a grant when the shown task contract changes while authorization is pending", async () => {
	const dialog = heldGrant();
	const t = await harness({ beforeGrant: dialog.beforeGrant });
	try {
		await t.hooks.input({ text: plan.goal, images: [] }, t.ctx);
		t.host.streaming = true;
		await t.hooks.before_agent_start({ prompt: plan.goal, systemPrompt: "" }, t.ctx);
		expect(
			await t.hooks.tool_call(
				{ type: "tool_call", toolName: "task_plan", toolCallId: "task_plan-1", input: plan },
				t.ctx,
			),
		).toBeUndefined();
		const planned = t.tool("task_plan", plan);
		const shown = await dialog.shown;
		const before = t.host.records.at(-1).data.workbench.revision;
		const status = { toolName: "task_status", toolCallId: "status-1", input: {} };
		expect(await t.hooks.tool_call({ type: "tool_call", ...status }, t.ctx)).toBeUndefined();
		const result = await t.tools.task_status.execute("status-1", {}, t.ctx.signal, undefined, t.ctx);
		await t.hooks.tool_result({ type: "tool_result", ...status, ...result, isError: false }, t.ctx);
		expect(t.host.records.at(-1).data.workbench.revision).toBe(before + 1);
		// Reload a host checkpoint with an edited plan, preserving the task identity.
		const edited = structuredClone(t.host.records.at(-1));
		edited.id = `r${t.host.records.length}`;
		edited.data.workbench.revision++;
		const changedTask = edited.data.workbench.tasks.find((task) => task.id === shown.taskId);
		changedTask.authorizationSummary = "Write different reports into out/";
		t.host.records.push(edited);
		await t.hooks.session_tree({}, t.ctx);
		const changed = await t.app.withCurrentSession(t.ctx.signal, ({ controller }) =>
			controller.journal.snapshot(),
		);
		expect(changed.id).toBe(shown.taskId);
		expect(contractHash(changed)).not.toBe(shown.contractHash);
		expect(t.host.grant).toBeNull();
		dialog.approve();
		await expect(planned).rejects.toThrow("Task changed. Refresh before acting.");
		const current = await t.app.withCurrentSession(t.ctx.signal, ({ controller }) =>
			controller.journal.snapshot(),
		);
		expect(current.executionConsent).toBeUndefined();
		expect(
			await t.hooks.tool_call(
				{ type: "tool_call", toolName: "write", toolCallId: "w1", input: { path: "out/a.md", content: "A" } },
				t.ctx,
			),
		).toMatchObject({ block: true });
	} finally {
		dialog.approve();
		await t.close();
	}
});
