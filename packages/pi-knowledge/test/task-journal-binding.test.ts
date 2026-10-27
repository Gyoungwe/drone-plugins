import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createKnowledgeInterface, type KnowledgeInterfaceDependencies } from "../src/extension/internal-knowledge-extension.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function fixture(readOnly = false) {
	const cwd = await mkdtemp(join(tmpdir(), "knowledge-task-binding-"));
	roots.push(cwd);
	const emitter = new EventEmitter();
	const hooks = new Map<string, Array<(...args: any[]) => unknown>>();
	const tools = new Map<string, any>();
	const entries: any[] = [];
	const binding = { vaultId: "a".repeat(24), revision: 1, vault: cwd };
	const readKnowledgeBinding = async () => binding;
	let journal: any = null;
	const provider = () => { if (journal) emitter.emit("drone:task-runtime/v1", { version: 1, registry: { journal } }); };
	emitter.on("drone:task-runtime/request/v1", provider);
	const pi = {
		events: { on(name: string, callback: (...args: any[]) => void) { emitter.on(name, callback); return () => emitter.off(name, callback); }, emit: (name: string, value: unknown) => emitter.emit(name, value) },
		on(name: string, callback: (...args: any[]) => unknown) { hooks.set(name, [...(hooks.get(name) ?? []), callback]); },
		registerTool: (tool: any) => tools.set(tool.name, tool),
		registerCommand() {},
		appendEntry: (customType: string, data: unknown) => entries.push({ customType, data }),
	};
	let publicationOptions: any;
	const publication = {
		registerAnswerPublication(_pi: unknown, options: unknown) { publicationOptions = options; return { begin() {}, invalidate() {} }; },
	};
	const service = {
		prepare: async () => ({ navigation: [], ticket: "read-ticket", status: { coverage: "complete", problems: [] } }),
		read: vi.fn(async () => ({ path: "Library/note.md", hash: "b".repeat(64), text: "Synthetic evidence", startLine: 2, endLine: 2 })),
		request: async () => ({ outgoing: [], incoming: [] }),
	};
	const ui = Object.fromEntries(["beginKnowledgeFlow", "invalidateKnowledgeUi", "noteKnowledgeOperation", "noteKnowledgeRead", "noteKnowledgeSearch", "notifyKnowledgeUi", "requestWikiReviewUi", "updateKnowledgeFlow"].map(name => [name, vi.fn()]));
	const oldRegister = vi.fn(() => { throw new Error("Knowledge must not register task hooks"); });
	const knowledge = createKnowledgeInterface({
		host: { deliveryContract: () => null },
		config: { knowledgeDirectory: () => cwd, readKnowledgeBinding, withKnowledgeBinding: async (_binding: unknown, run: () => unknown) => run() },
		services: { getKnowledgeService: async () => service },
		publication, delivery: {}, specialists: { createKnowledgeSpecialists: () => ({ close: async () => {} }) },
		topics: { createTopicMemory: () => ({}) }, ui, wiki: {},
	} as unknown as KnowledgeInterfaceDependencies, { registerTaskRuntime: oldRegister });
	const registration = knowledge.registerKnowledgeInterface(pi, { readOnly });
	const ctx = { cwd, sessionManager: { getSessionId: () => "session", getBranch: () => entries } };
	const emitHook = async (name: string) => { for (const handler of hooks.get(name) ?? []) await handler({}, ctx); };
	return { emitter, tools, entries, service, oldRegister, publication: () => publicationOptions, setJournal: (value: any) => { journal = value; }, emitHook, ctx, registration, readKnowledgeBinding };
}

it("consumes only the current session bus owner and clears stale journal references on tree changes", async () => {
	const a = await fixture(), b = await fixture();
	const journal = { snapshot: () => ({ id: "task-a" }), configure: vi.fn() };
	try {
		expect(a.publication().getTaskRuntime()).toBeNull();
		a.setJournal(journal);
		await a.emitHook("session_start");
		await b.emitHook("session_start");
		expect(a.publication().getTaskRuntime()).toBe(journal);
		const attachedOwner = { snapshot: () => ({ id: "restored-task" }), configure: vi.fn() };
		a.setJournal(attachedOwner);
		expect(a.publication().getTaskRuntime()).toBe(attachedOwner);
		expect(b.publication().getTaskRuntime()).toBeNull();
		expect(journal.configure).toHaveBeenCalledWith({ readKnowledgeBinding: a.readKnowledgeBinding });
		expect(a.emitter.listenerCount("drone:task-runtime/v1")).toBe(0);
		expect(b.emitter.listenerCount("drone:task-runtime/v1")).toBe(0);
		expect(a.oldRegister).not.toHaveBeenCalled();
		expect(a.tools.has("task_plan")).toBe(false);
		a.setJournal(null);
		await a.emitHook("session_tree");
		expect(a.publication().getTaskRuntime()).toBeNull();
	} finally { await a.registration.dispose(); await b.registration.dispose(); }
});

it("binds recovery receipts and publication to the same existing task and rejects recovery after that owner disappears", async () => {
	const state = await fixture();
	const journal = { snapshot: () => ({ id: "task-with-evidence" }), configure: vi.fn() };
	state.setJournal(journal);
	try {
		await state.emitHook("session_start");
		const read = state.tools.get("research_read_knowledge");
		await read.execute("read-1", { path: "Library/note.md", start_line: 2 }, undefined, undefined, state.ctx);
		const receipt = state.entries.filter(entry => entry.customType === "drone-knowledge-recovery-v1").at(-1).data.records[0];
		expect(receipt.taskId).toBe("task-with-evidence");
		expect(state.publication().getTaskRuntime()).toBe(journal);
		state.emitter.emit("drone:context-evicted", { sessionId: "session", toolCallIds: ["read-1"] });
		state.setJournal(null);
		await state.emitHook("session_tree");
		await expect(state.tools.get("research_restore_evidence").execute("restore-1", { receipt_id: "read-1" }, undefined, undefined, state.ctx)).rejects.toThrow("evidence-recovery-unavailable");
		expect(state.service.read).toHaveBeenCalledOnce();
	} finally { await state.registration.dispose(); }
});

it("keeps read-only knowledge projections from configuring task write-side state", async () => {
	const state = await fixture(true);
	const configure = vi.fn();
	state.setJournal({ configure });
	try {
		await state.emitHook("session_start");
		expect(configure).not.toHaveBeenCalled();
		expect(state.publication().getTaskRuntime()).toBeNull();
		expect(state.emitter.listenerCount("drone:task-runtime/v1")).toBe(0);
	} finally { await state.registration.dispose(); }
});
