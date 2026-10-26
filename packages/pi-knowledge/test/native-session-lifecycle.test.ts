import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { expect, it, vi } from "vitest";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { createKnowledgeConfigApi } from "../src/core/config.js";
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
