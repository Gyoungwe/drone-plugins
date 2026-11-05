import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createManagedTaskApplication } from "../../src/task-runtime/managed-application.mjs";

/**
 * The managed adapter drives the same workbench through host capabilities only. The fake host
 * mirrors the capability contracts (records, notices, questions, task grant, continuation,
 * workspace reads); the real host behaviour is covered by Drone's SDK tests.
 */
const dirs = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function harness({ records = [], answer = (_title, options) => options.at(-1), workspace } = {}) {
	const cwd = workspace ?? (await realpath(await mkdtemp(join(tmpdir(), "managed-task-"))));
	if (!workspace) {
		dirs.push(cwd);
		await mkdir(join(cwd, "out"));
	}
	const host = {
		records,
		notices: [],
		grants: [],
		continues: [],
		questions: [],
		grant: null,
		denyGrant: false,
		streaming: false,
	};
	// Invocations (hooks, tools) currently running; the host lends capabilities only to them.
	let live = 0;
	const during = async (invocation) => {
		live++;
		try {
			return await invocation();
		} finally {
			live--;
		}
	};
	const capabilities = {
		"caller.scope": () => ({ kind: "session", sessionId: "s1", workspaceDirectory: cwd, workspaceId: "w" }),
		"session.records.read": () => ({ mode: "persistent", state: "durable", error: null, records: [...host.records] }),
		"session.records.append": ({ type, data }) => {
			if (host.failAppend) {
				host.failAppend = false;
				throw new Error("Actual managed checkpoint append failed");
			}
			const id = `r${host.records.length}`;
			host.records.push({ id, type, data: structuredClone(data) });
			return { id, durability: "durable" };
		},
		"session.tools": () => [
			{ name: "read", readOnlyHint: true },
			{ name: "write", readOnlyHint: false },
		],
		"session.notify": async (input) => {
			// Same rules as the real host: no session message while the SDK run is active, and the
			// invoking hook/tool must still be running when the (asynchronous) write completes.
			if (host.streaming) throw new Error("Session notification requires an idle session");
			await new Promise((resolveTick) => setTimeout(resolveTick, 0));
			if (!live) throw new Error("Plugin capability caller completed");
			host.notices.push(input);
			return { durability: "durable" };
		},
		"session.inspect": () => ({ agentActive: host.streaming, projectTrusted: true, readOnly: false }),
		"session.select": ({ title, options }) => {
			host.questions.push(title);
			const value = answer(title, options);
			return value === undefined ? { kind: "cancelled" } : { kind: "selected", value };
		},
		"task.grant.current": () => host.grant,
		"task.grant.request": (input) => {
			host.grants.push(input);
			if (host.denyGrant) throw new Error("Plugin capability denied: task.grant.request");
			host.grant = {
				grantId: `g${host.grants.length}`,
				taskId: input.taskId,
				contractHash: input.contractHash,
				writeRoots: input.writeDirectories.map((dir) => resolve(cwd, dir)),
				maxCalls: input.maxCalls,
				maxAutoResumes: input.maxAutoResumes,
				issuedAt: new Date().toISOString(),
			};
			return host.grant;
		},
		"task.continue": (input) => {
			if (host.grant?.taskId !== input.taskId) throw new Error("no grant");
			host.continues.push(input);
			return { continuationId: `c${host.continues.length}`, remaining: 3 - host.continues.length };
		},
		"workspace.readFile": async ({ path }) => {
			const bytes = await readFile(path);
			return {
				path,
				workspacePath: relative(cwd, path).split("\\").join("/"),
				base64: bytes.toString("base64"),
				sha256: "0".repeat(64),
				bytes: bytes.length,
				version: { dev: 0, ino: 0, size: bytes.length, mtimeMs: 0, ctimeMs: 0 },
			};
		},
	};
	const lifetime = new AbortController();
	const context = {
		signal: lifetime.signal,
		events: { changed: () => {} },
		capabilities: { call: async (name, input) => capabilities[name](input) },
	};
	const app = createManagedTaskApplication(context);
	const native = app.createNativeSession();
	const hooks = {}, tools = {}, commands = {};
	native.extension({
		on: (name, handler) => {
			hooks[name] = (...args) => during(() => handler(...args));
		},
		registerTool: (tool) => {
			tools[tool.name] = tool;
		},
		registerCommand: (name, command) => {
			commands[name] = command;
		},
	});
	const ctx = { cwd, signal: lifetime.signal, hasUI: false, sessionManager: { getSessionId: () => "s1" } };
	await hooks.session_start({}, ctx);
	const tool = async (name, input) => {
		const result = await during(() => tools[name].execute(`${name}-1`, input, lifetime.signal, undefined, ctx));
		return JSON.parse(result.content[0].text);
	};
	const command = (name, args) => during(() => commands[name].handler(args, ctx));
	return { cwd, host, app, native, hooks, tools, commands, ctx, tool, command, close: () => app.dispose() };
}

const plan = {
	goal: "Write two report files",
	summary: "Write the reports into out/",
	writeDirectories: ["out"],
	milestones: [
		{ id: "a", title: "Report A", acceptance: { kind: "file", path: "out/a.md" } },
		{ id: "b", title: "Report B", acceptance: { kind: "file", path: "out/b.md" } },
	],
};

it("declares every hook, tool and command read so ordinary chat raises no plugin dialog", async () => {
	const t = await harness();
	expect(Object.values(t.native.eventEffects)).toEqual(Object.values(t.native.eventEffects).map(() => "read"));
	expect(Object.keys(t.native.toolEffects).sort()).toEqual(Object.keys(t.tools).sort());
	expect(Object.values(t.native.toolEffects).every((effect) => effect === "read")).toBe(true);
	expect(Object.keys(t.native.commandEffects).sort()).toEqual(Object.keys(t.commands).sort());
	// session_shutdown only releases the attachment; the host runs it without a capability caller.
	expect(Object.keys(t.hooks).filter((name) => name !== "session_shutdown").every((name) => t.native.eventEffects[name] === "read")).toBe(true);
	await t.close();
});

it("one host task grant authorizes the plan; delivered files complete it and the rest continues inline", async () => {
	const t = await harness();
	expect(await t.hooks.input({ text: plan.goal, images: [] }, t.ctx)).toEqual({ action: "continue" });
	const noticesBeforeRun = t.host.notices.length;
	t.host.streaming = true;
	await t.hooks.before_agent_start({ prompt: plan.goal, systemPrompt: "" }, t.ctx);
	const planned = await t.tool("task_plan", plan);
	expect(planned.authorized).toBe(true);
	// The host dialog is the only authorization; the plugin asked no question of its own.
	expect(t.host.questions).toEqual([]);
	expect(t.host.grants).toHaveLength(1);
	expect(t.host.grants[0]).toMatchObject({
		goal: plan.goal,
		writeDirectories: [join(t.cwd, "out")],
		acceptance: ["Report A", "Report B"],
		maxCalls: 192,
		maxAutoResumes: 3,
	});
	expect(t.host.grants[0].contractHash).toMatch(/^[a-f0-9]{64}$/);

	const write = { toolName: "write", toolCallId: "w1", input: { path: "out/a.md", content: "A" } };
	expect(await t.hooks.tool_call({ type: "tool_call", ...write }, t.ctx)).toBeUndefined();
	await writeFile(join(t.cwd, "out/a.md"), "A");
	await t.hooks.tool_result({ type: "tool_result", ...write, content: [{ type: "text", text: "ok" }], isError: false }, t.ctx);
	await t.hooks.agent_end({ messages: [{ role: "assistant", stopReason: "stop", content: [] }] }, t.ctx);

	const status = await t.app.operations.status.execute(null, { signal: t.ctx.signal });
	// The missing second file is reported as blocked; the task keeps running under the grant.
	expect(status.snapshot.milestones.map((m) => m.state)).toEqual(["completed", "blocked"]);
	expect(status.snapshot).toMatchObject({ state: "running", reason: "automatic-handoff" });
	// One remaining deliverable: the host starts the follow-up within the same invocation.
	expect(t.host.continues).toHaveLength(1);
	expect(t.host.continues[0].taskId).toBe(status.snapshot.id);
	// No status card is attempted while the run is active; the run settles before one is posted.
	expect(status.storage.state).toBe("durable");
	expect(t.host.notices).toHaveLength(noticesBeforeRun);
	t.host.streaming = false;
	await t.hooks.agent_settled({ type: "agent_settled", aborted: false }, t.ctx);
	expect(t.host.notices).toHaveLength(noticesBeforeRun + 1);
	// Status cards carry the task view for the host to render.
	expect(t.host.notices.at(-1).view?.version).toBe(2);

	// The host-started continuation message is recognized as this task's automatic turn.
	await t.hooks.message_start(
		{
			message: {
				role: "custom",
				customType: "plugin-continue:%40gyoungwe%2Fpi-core",
				details: { continuationId: "c1", taskId: status.snapshot.id },
			},
		},
		t.ctx,
	);
	expect(t.host.grants).toHaveLength(1);
	await t.close();
});

it("a status query outside a run posts its card while the input hook is still live", async () => {
	const t = await harness();
	await t.hooks.input({ text: plan.goal, images: [] }, t.ctx);
	await t.tool("task_plan", plan);
	const before = t.host.notices.length;
	expect(await t.hooks.input({ text: "任务状态", images: [] }, t.ctx)).toEqual({ action: "handled" });
	expect(t.host.notices).toHaveLength(before + 1);
	const status = await t.app.operations.status.execute(null, { signal: t.ctx.signal });
	expect(status.storage.state).toBe("durable");
	await t.close();
});

const taskAction = (input) => Buffer.from(JSON.stringify(input)).toString("base64url");

it("the progress action posts its status inside the command, so choosing to only re-check cannot fence the task", async () => {
	const t = await harness({ answer: (_title, options) => options.find((option) => option === "仅核对已有产物") });
	await t.hooks.input({ text: plan.goal, images: [] }, t.ctx);
	await t.tool("task_plan", plan);
	const { snapshot } = await t.app.operations.status.execute(null, { signal: t.ctx.signal });
	const before = t.host.notices.length;
	const { revision } = t.host.notices.at(-1).view;
	await t.command("task-action", taskAction({ action: "progress", taskId: snapshot.id, revision }));
	expect(t.host.questions).toHaveLength(1);
	expect(t.host.notices.length).toBeGreaterThan(before);
	// Let a late, unawaited post reach the host and be refused before reading the outcome.
	await new Promise((resolveLater) => setTimeout(resolveLater, 5));
	const status = await t.app.operations.status.execute(null, { signal: t.ctx.signal });
	expect(status.storage.state).toBe("durable");
	await t.close();
});

/** Runs the task to its 17th run: the first whose end finds the automatic handoffs used up. */
async function exhaustHandoffs(t) {
	const milestones = Array.from({ length: 20 }, (_, i) => ({
		id: `m${i}`,
		title: `File ${i}`,
		acceptance: { kind: "file", path: `out/${i}.md` },
	}));
	await t.hooks.input({ text: plan.goal, images: [] }, t.ctx);
	await t.tool("task_plan", { ...plan, milestones });
	for (let n = 0; n < 17; n++) {
		if (n) await settle(t);
		t.host.streaming = true;
		await t.hooks.before_agent_start({ prompt: "继续", systemPrompt: "" }, t.ctx);
		const write = { toolName: "write", toolCallId: `w${n}`, input: { path: `out/${n}.md`, content: "x" } };
		await t.hooks.tool_call({ type: "tool_call", ...write }, t.ctx);
		await writeFile(join(t.cwd, `out/${n}.md`), "x");
		await t.hooks.tool_result({ type: "tool_result", ...write, content: [{ type: "text", text: "ok" }], isError: false }, t.ctx);
		await t.hooks.agent_end({ messages: [{ role: "assistant", stopReason: "stop", content: [] }] }, t.ctx);
	}
}
const settle = async (t) => {
	t.host.streaming = false;
	await t.hooks.agent_settled({ type: "agent_settled", aborted: false }, t.ctx);
};

it("when automatic handoffs run out, the question waits until the run has settled", async () => {
	const t = await harness();
	await exhaustHandoffs(t);
	// The run is still active inside agent_end: nothing may be asked yet.
	expect(t.host.continues).toHaveLength(16);
	expect(t.host.questions).toEqual([]);
	await settle(t);
	expect(t.host.questions).toHaveLength(1);
	// The default answer takes the last option, so the task goes on under the same grant.
	expect(t.host.continues).toHaveLength(17);
	await t.close();
});

it("a new user message drops a question still waiting for the run to settle", async () => {
	const t = await harness();
	await exhaustHandoffs(t);
	await t.hooks.input({ text: "换个思路", images: [] }, t.ctx);
	await settle(t);
	expect(t.host.questions).toEqual([]);
	await t.close();
});

it("after a failed checkpoint append, status serves the last committed task and writes stay fenced", async () => {
	const t = await harness();
	await t.hooks.input({ text: plan.goal, images: [] }, t.ctx);
	await t.tool("task_plan", plan);
	const committed = await t.app.operations.status.execute(null, { signal: t.ctx.signal });
	t.host.failAppend = true;
	await expect(t.app.operations.pause.execute({ reason: "must-not-commit" }, { signal: t.ctx.signal })).rejects.toThrow(
		/Actual managed checkpoint append failed/,
	);
	const fenced = await t.app.operations.status.execute(null, { signal: t.ctx.signal });
	expect(fenced).toMatchObject({
		snapshot: { id: committed.snapshot.id, reason: committed.snapshot.reason },
		storage: { state: "needs-reopen" },
	});
	const records = t.host.records.length;
	await expect(t.app.operations.pause.execute({ reason: "no-phantom-chain" }, { signal: t.ctx.signal })).rejects.toThrow(
		/reopen the application from disk/,
	);
	expect(t.host.records).toHaveLength(records);
	await t.close();
});

it("a declined host grant leaves the task unauthorized and writes nothing", async () => {
	const t = await harness();
	t.host.denyGrant = true;
	await t.hooks.input({ text: plan.goal, images: [] }, t.ctx);
	const planned = await t.tool("task_plan", plan);
	expect(planned.authorized).toBe(false);
	const status = await t.app.operations.status.execute(null, { signal: t.ctx.signal });
	expect(status.snapshot.state).not.toBe("running");
	expect(t.host.continues).toEqual([]);
	await t.close();
});

it("a reopened session restores the task from records but its old approval cannot continue without a new host grant", async () => {
	const first = await harness();
	await first.hooks.input({ text: plan.goal, images: [] }, first.ctx);
	await first.tool("task_plan", plan);
	const records = [...first.host.records];
	await first.close();

	const reopened = await harness({ records, workspace: first.cwd });
	const restored = await reopened.app.operations.status.execute(null, { signal: reopened.ctx.signal });
	expect(restored.snapshot.goal).toBe(plan.goal);
	expect(reopened.host.grant).toBeNull();
	// Writes stay blocked until the user authorizes again; the restored record is not authority.
	const blocked = await reopened.hooks.tool_call(
		{ type: "tool_call", toolName: "write", toolCallId: "w2", input: { path: "out/a.md", content: "A" } },
		reopened.ctx,
	);
	expect(blocked).toMatchObject({ block: true });
	expect(reopened.host.grants).toEqual([]);
	await reopened.close();
});
