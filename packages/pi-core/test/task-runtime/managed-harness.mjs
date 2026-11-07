import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach } from "vitest";
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

export async function harness({
	records = [],
	answer = (_title, options) => options.at(-1),
	workspace,
	extra = {},
} = {}) {
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
		// As the host answers a package that declares no consumed role.
		"provider.enumerate": ({ role }) => {
			throw new Error(`Undeclared provider role: ${role}`);
		},
		"session.records.read": () => ({
			mode: "persistent",
			state: "durable",
			error: null,
			records: [...host.records],
		}),
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
	Object.assign(capabilities, extra);
	const lifetime = new AbortController();
	const context = {
		signal: lifetime.signal,
		events: { changed: () => {} },
		capabilities: { call: async (name, input) => capabilities[name](input) },
	};
	const app = createManagedTaskApplication(context);
	const native = app.createNativeSession();
	const hooks = {},
		tools = {},
		commands = {};
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
		const result = await during(() =>
			tools[name].execute(`${name}-1`, input, lifetime.signal, undefined, ctx),
		);
		return JSON.parse(result.content[0].text);
	};
	const command = (name, args) => during(() => commands[name].handler(args, ctx));
	return { cwd, host, app, native, hooks, tools, commands, ctx, tool, command, close: () => app.dispose() };
}

export const plan = {
	goal: "Write two report files",
	summary: "Write the reports into out/",
	writeDirectories: ["out"],
	milestones: [
		{ id: "a", title: "Report A", acceptance: { kind: "file", path: "out/a.md" } },
		{ id: "b", title: "Report B", acceptance: { kind: "file", path: "out/b.md" } },
	],
};

export const taskAction = (input) => Buffer.from(JSON.stringify(input)).toString("base64url");
