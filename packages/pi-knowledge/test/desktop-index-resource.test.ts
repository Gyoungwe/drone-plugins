import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import type { PluginResourceInstance } from "@gyoungwe/plugin-api/resource";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { inspectNote, readNoteFile } from "../src/core/files.js";
import createIndexResource from "../src/desktop/index-resource.js";
import createDesktopRuntime from "../src/desktop/runtime.js";
import { createKnowledgeRuntimeStore } from "../ui/runtime-store.js";
import type { KnowledgeOverview, KnowledgeSearchResult } from "../src/desktop/contract.js";

it("Desktop complete native registration and its read tools use one real broker-backed index without background Vault access", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-resource-entry-")));
	const vault = join(root, "Vault");
	const storage = join(root, "cache");
	await mkdir(join(vault, "Library/Methods"), { recursive: true });
	await mkdir(storage);
	const binding = await createKnowledgeConfigApi(undefined, join(root, "state"))
		.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	await writeFile(join(vault, "Library/Methods/orchid.md"), "# Orchid method\nOrchid controlled assay.\n");
	let activeCall = true;
	let outsideCallReads = 0;
	let workspaceReads = 0;
	let created = 0;
	let index!: PluginResourceInstance;
	const resourceCalls: unknown[] = [];
	const listeners = new Set<(event: { type: "changed"; revision: number }) => void>();
	let eventRevision = 0;
	const changed = vi.fn(() => { for (const listener of listeners) listener({ type: "changed", revision: ++eventRevision }); });
	const controller = new AbortController();
	// In-process capability fixture exercises the package adapter and real SQLite.
	// Host authorization and subprocess filesystem restrictions are separate gates.
	const capabilities = { async call(name: string, raw: unknown): Promise<unknown> {
		const input = raw as any;
		if (name.startsWith("files.")) {
			if (!activeCall) { outsideCallReads++; throw new Error("No active caller"); }
			if (input.root === "workspace-root") {
				expect(name).toBe("files.readText");
				expect(input.path).toBe(".pi/research-workspace.json");
				workspaceReads++;
				throw Object.assign(new Error("No research workspace configuration"), { code: "ENOENT" });
			}
			expect(input.root).toBe("vault-root");
		}
		if (name === "state.readJson") return { kind: "value", value: binding };
		if (name === "roots.resolve") {
			if (input.path === vault) return { handle: "vault-root" };
			if (input.path === root) return { handle: "workspace-root" };
			throw new Error("Root was not authorized");
		}
		if (name === "files.list") return (await readdir(join(vault, input.path), { withFileTypes: true })).map(entry => ({
			name: entry.name, kind: entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "file",
		}));
		if (name === "files.stat") {
			const { stat } = await inspectNote(vault, input.path);
			return { kind: "file", version: stat };
		}
		if (name === "files.readText") {
			const note = await readNoteFile(vault, input.path);
			const { stat } = await inspectNote(vault, input.path);
			return { text: note.text, sha256: note.hash, bytes: note.bytes, version: stat };
		}
		if (name === "resource.create") {
			created++; resourceCalls.push(input);
			index = await createIndexResource({ parameters: input.parameters, storageDirectory: storage, signal: controller.signal, capabilities, events: { changed } });
			return { handle: "index-handle" };
		}
		if (name === "resource.invoke") return index.invoke(input.operation, input.input);
		if (name === "resource.dispose") { await index.dispose(); return null; }
		throw new Error(`Capability not provided: ${name}`);
	} };
	vi.useFakeTimers();
	const runtime = await createDesktopRuntime({ applicationId: "test", resourcesLifecycle: {dispose: async () => {if(index) await index.dispose();}}, resources: [{ kind: "state", handle: "state-root" }], signal: controller.signal, capabilities, events: { changed } });
	const call = { scope: { kind: "application" as const }, signal: controller.signal, capabilities };
	try {
		const overview = await runtime.operations.overview.execute(null, call) as KnowledgeOverview;
		expect(overview.index?.noteCount).toBe(1);
		const tools = new Map<string, any>();
		const session = await runtime.createNativeSession!();
		expect(session.toolEffects).toEqual({ knowledge_status: "read", knowledge_search: "read" });
		expect(session.eventEffects).toEqual({ session_start: "read", session_tree: "read", tool_execution_start: "read", tool_result: "read" });
		for (const event of ["before_agent_start", "message_start", "context", "tool_execution_end"]) expect(session.eventEffects?.[event]).not.toBe("read");
		await session.extension({ events: createEventBus(), on: () => undefined, registerTool: (tool: any) => tools.set(tool.name, tool), registerCommand: () => {} } as any);
		const manifest = JSON.parse(await readFile(new URL("../plugin.manifest.json", import.meta.url), "utf8"));
		expect([...tools.keys()].sort()).toEqual([...manifest.tools].sort());
		// Application-scoped native reads have no workspace project selection.
		const native = await tools.get("knowledge_search").execute("search", { query: "Orchid" }, undefined, undefined, { cwd: null });
		const fromUi = await runtime.operations.search.execute({ query: "Orchid", revision: binding.revision }, call) as KnowledgeSearchResult;
		expect(native.details.hits).toEqual(fromUi.hits);
		const sessionCall = { ...call, scope: { kind: "session" as const, sessionId: "session", workspaceId: "opaque-workspace-identity", workspaceDirectory: root } };
		const scopedUi = await runtime.operations.search.execute({ query: "Orchid", revision: binding.revision }, sessionCall) as KnowledgeSearchResult;
		expect(scopedUi.hits).toEqual(fromUi.hits);
		expect(workspaceReads).toBe(1);
		expect(created).toBe(1);
		expect(resourceCalls).toEqual([{ resource: "index", storage: { root: "state-root", key: binding.vaultId }, parameters: { vaultRoot: "vault-root" },
			reservation: { namespace: "knowledge-writers", roots: [{ root: "vault-root", path: "", kind: "vault" }], storage: { path: "index.sqlite", kind: "index" } } }]);
		expect((await index.invoke("status", {}) as any).watching).toBe(false);
		activeCall = false;
		await vi.advanceTimersByTimeAsync(240000);
		expect(outsideCallReads).toBe(0);
		activeCall = true;
		const beforeRefresh = changed.mock.calls.length;
		await runtime.operations.overview.execute(null, call);
		await vi.advanceTimersByTimeAsync(1000);
		expect(changed.mock.calls.length).toBe(beforeRefresh);
		await writeFile(join(vault, "Library/Methods/willow.md"), "# Willow method\nWillow assay.\n");
		const fresh = await runtime.operations.search.execute({ query: "Willow", revision: binding.revision }, call) as KnowledgeSearchResult;
		expect(fresh.hits[0].path).toBe("Library/Methods/willow.md");
		// Real reconciliation emits a delayed invalidation after search has already returned.
		// The UI must refresh then repeat its current query, rather than erase a successful result.
		const uiCalls: string[] = [];
		const store = createKnowledgeRuntimeStore({
			invoke: async (operation, input) => { uiCalls.push(operation); return runtime.operations[operation].execute(input, call); },
			subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
		});
		const waitForStore = (ready: () => boolean) => ready() ? Promise.resolve() : new Promise<void>(resolve => {
			const stop = store.subscribe(() => { if (ready()) { stop(); resolve(); } });
		});
		const disconnect = store.connect();
		try {
			await waitForStore(() => store.getSnapshot().overview !== null);
			await writeFile(join(vault, "Library/Methods/cedar.md"), "# Cedar method\nCedar controlled assay.\n");
			await store.search("Cedar");
			expect(store.getSnapshot().searchResult?.hits[0].path).toBe("Library/Methods/cedar.md");
			await vi.advanceTimersByTimeAsync(500);
			await waitForStore(() => store.getSnapshot().searchResult !== null);
			expect(uiCalls).toEqual(["overview", "search", "overview", "search"]);
			expect(store.getSnapshot().searchResult?.hits[0].path).toBe("Library/Methods/cedar.md");
		} finally { disconnect(); }
		await session.dispose();
		expect((await runtime.operations.overview.execute(null, call) as KnowledgeOverview).index?.noteCount).toBe(3);
	} finally {
		vi.useRealTimers();
		await runtime.dispose();
		await index.dispose(); // Host-owned child cleanup follows plugin owner drain.
		await rm(root, { recursive: true, force: true });
	}
});
