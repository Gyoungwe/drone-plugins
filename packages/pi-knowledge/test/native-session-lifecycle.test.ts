import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { expect, it, vi } from "vitest";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeNativeAdapter } from "../src/core/native-session-lifecycle.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createKnowledgeRuntime } from "../src/core/knowledge-runtime.js";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";
import type { KnowledgeService } from "../src/core/service.js";
import { createNativeSession } from "../src/extension/knowledge-extension.js";

function latch() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => { release = resolve; });
	return { promise, release };
}
async function fixture(execute?: (...args: any[]) => Promise<any>) {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-native-session-")));
	const vault = join(root, "Vault");
	await mkdir(vault);
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	const host = createKnowledgeRuntimeHost();
	host.configureKnowledgeWorker((_url, options) => new Worker(new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url), options));
	const owner = createKnowledgeRuntime(config, host, { registerTool: (pi: any, definition: any) => pi.registerTool(execute && definition.name === "research_knowledge_status" ? { ...definition, execute } : definition) }, (input) => acquireKnowledgeWriterLease(input, join(root, "leases")));
	const native = createNativeSession(owner);
	const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
	const commands = new Map<string, { handler: (...args: any[]) => Promise<any> }>();
	const events = createEventBus();
	const handshakes: unknown[] = [];
	events.on("drone:runtime/request/v1", (event) => handshakes.push(event));
	const send = vi.fn(async () => undefined);
	native.extension({
		events, on: () => undefined, appendEntry: () => undefined,
		getCommands: () => [], sendUserMessage: send,
		registerTool: (definition: any) => tools.set(definition.name, definition),
		registerCommand: (name: string, definition: any) => commands.set(name, definition),
	});
	const ctx = { cwd: root, sessionId: "native-test", sessionManager: { getSessionId: () => "native-test", getBranch: () => [] }, isProjectTrusted: () => true };
	return { root, owner, native, tools, commands, send, handshakes, ctx, cleanup: async () => {
		await owner.dispose();
		await rm(root, { recursive: true, force: true });
	} };
}

it("revokes this session's pending preparation and does not publish a late navigation state", async () => {
	const value = await fixture();
	const started = latch();
	const held = latch();
	value.owner.ui.beginKnowledgeFlow(value.ctx, await value.owner.config.readKnowledgeBinding());
	const raw = await value.owner.services.getKnowledgeService();
	const prepare = raw.prepare;
	const spy = vi.spyOn(raw, "prepare").mockImplementation(async function (this: KnowledgeService, ...args) {
		started.release();
		await held.promise;
		return prepare.apply(this, args);
	});
	const view = await value.native.services.getKnowledgeService();
	const changes: any[] = [];
	const unsubscribe = value.owner.ui.subscribeKnowledgeUi((event: unknown) => changes.push(event));
	try {
		const pending = value.tools.get("research_prepare_knowledge")!.execute("prepare", {}, undefined, undefined, value.ctx);
		await started.promise;
		let closed = false;
		const closing = value.native.dispose().then(() => { closed = true; });
		await Promise.resolve();
		expect(closed).toBe(false);
		held.release();
		await expect(pending).rejects.toThrow(/session.*(?:disposed|closed)/i);
		await closing;
		expect(view.tickets.size).toBe(0);
		expect(changes.some((event) => event.flow?.phase === "navigation")).toBe(false);
		expect(value.handshakes).toEqual([]);
		expect(() => value.tools.get("research_read_knowledge")!.execute("read", { path: "Home.md" }, undefined, undefined, value.ctx)).toThrow("session has been disposed");
	} finally {
		held.release();
		spy.mockRestore();
		unsubscribe();
		await value.cleanup();
	}
});

it("tracks a running registered command before session shutdown completes", async () => {
	const value = await fixture();
	const started = latch();
	const held = latch();
	value.send.mockImplementation(async () => { started.release(); await held.promise; });
	try {
		const pending = value.commands.get("drone-init")!.handler("", value.ctx);
		await started.promise;
		let closed = false;
		const closing = value.native.dispose().then(() => { closed = true; });
		await Promise.resolve();
		expect(closed).toBe(false);
		held.release();
		await expect(pending).rejects.toThrow("session has been disposed");
		await closing;
		expect(() => value.commands.get("drone-init")!.handler("", value.ctx)).toThrow("session has been disposed");
	} finally {
		held.release();
		await value.cleanup();
	}
});

for (const cause of ["shutdown", "upstream"] as const) {
 it(`propagates ${cause} cancellation to the running tool before its completion receipt`, async () => {
  const started = latch();
  const events: string[] = [];
  const value = await fixture(async (_id, _params, signal: AbortSignal, _update, ctx) => {
   expect(ctx.signal).toBe(signal);
   events.push("started");
   started.release();
   try {
    await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => {
     events.push("abort"); reject(signal.reason);
    }, { once: true }));
   } finally { events.push("settled"); }
  });
  const upstream = new AbortController();
  try {
   const pending = value.tools.get("research_knowledge_status")!.execute("status", {}, upstream.signal, undefined, value.ctx);
   const rejection = expect(pending).rejects.toThrow(cause === "shutdown" ? "session has been disposed" : "user stop");
   await started.promise;
   if (cause === "shutdown") await value.native.dispose();
   else { upstream.abort(new Error("user stop")); await rejection; }
   events.push("closed");
   await rejection;
   expect(events).toEqual(["started", "abort", "settled", "closed"]);
   expect(value.native.signal.aborted).toBe(cause === "shutdown");
  } finally { await value.cleanup(); }
 });
}

it("rejects a late service result after session revocation without closing another session's worker", async () => {
 const value = await fixture();
 const other = createNativeSession(value.owner);
 const started = latch();
 const held = latch();
 const service = await value.native.services.getKnowledgeService();
 const raw = await value.owner.services.getKnowledgeService();
 const request = raw.request;
 const spy = vi.spyOn(raw, "request").mockImplementation(async function(this: KnowledgeService, ...args) {
  started.release(); await held.promise; return request.apply(this, args);
 });
 try {
  const pending = service.request("status");
  const rejection = expect(pending).rejects.toThrow("session has been disposed");
  await started.promise;
  let closed = false;
  const closing = value.native.dispose().then(() => { closed = true; });
  await Promise.resolve();
  expect(closed).toBe(false);
  held.release();
  await rejection;
  await closing;
  spy.mockRestore();
  await expect((await other.services.getKnowledgeService()).request("status")).resolves.toBeDefined();
 } finally {
  held.release(); spy.mockRestore(); await value.cleanup();
 }
});

it("scopes native append, messaging, events and branch reads to the owning session", async () => {
	let ownedPi: any;
	let command: any;
	const eventBus = createEventBus();
	const appended: unknown[] = [];
	const messages: unknown[] = [];
	const owner = {
		assertActive: vi.fn(),
		attachSession: (dispose: () => Promise<void>) => () => undefined,
		run: async (work: () => Promise<unknown>) => work(),
	};
	const adapter = createKnowledgeNativeAdapter(owner as any, new AbortController(), (pi) => {
		ownedPi = pi;
		pi.registerCommand("branch-check", { handler: (_args: string, ctx: any) => ctx.sessionManager.getBranch() });
	}, async () => undefined);
	const branch = [{ type: "session", id: "native" }];
	ownedPi = undefined;
	const pi = {
		events: eventBus,
		appendEntry: (...args: unknown[]) => appended.push(args),
		sendUserMessage: async (...args: unknown[]) => messages.push(args),
		on: vi.fn(),
		registerCommand: (_name: string, definition: any) => { command = definition; },
	};
	adapter.extension(pi);
	ownedPi.appendEntry("entry", { value: 1 });
	await ownedPi.sendUserMessage("/drone-init", { deliverAs: "followUp" });
	expect(appended).toEqual([["entry", { value: 1 }]]);
	expect(messages).toEqual([["/drone-init", { deliverAs: "followUp" }]]);
	await expect(command.handler("", { signal: new AbortController().signal, sessionManager: { getBranch: () => branch } })).resolves.toEqual(branch);
	await adapter.dispose();
	expect(() => ownedPi.appendEntry("late", {})).toThrow("Knowledge session has been disposed");
	expect(() => ownedPi.events.emit("late", {})).toThrow("Knowledge session has been disposed");
	expect(() => command.handler("", { signal: new AbortController().signal, sessionManager: { getBranch: () => branch } })).toThrow("Knowledge session has been disposed");
});

it("requests the event bus only when the registered native extension uses it", async () => {
	const { createKnowledgeOwnerLifecycle } = await import("../src/core/owner-lifecycle.js");
	const owner = createKnowledgeOwnerLifecycle({ dispose: async () => undefined });
	const tools = new Map<string, any>();
	let registeredPi: any;
	const pi = new Proxy({
		registerTool: (definition: any) => tools.set(definition.name, definition),
		on: () => () => undefined,
	}, {
		get(target, property, receiver) {
			if (property === "events") throw new Error("Unsupported native Pi API: events");
			return Reflect.get(target, property, receiver);
		},
	});
	const adapter = createKnowledgeNativeAdapter(owner, new AbortController(), (scoped) => {
		registeredPi = scoped;
		scoped.registerTool({ name: "read_probe", execute: async () => "read-ok" });
	});
	try {
		adapter.extension(pi);
		expect(await tools.get("read_probe").execute("read", {}, undefined, undefined, {})).toBe("read-ok");
		expect(() => registeredPi.events).toThrow("Unsupported native Pi API: events");
	} finally {
		await adapter.dispose();
		await owner.dispose();
	}
});
