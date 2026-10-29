import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createKnowledgeRuntime } from "../src/core/knowledge-runtime.js";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";
import { createNativeSession } from "../src/extension/knowledge-extension.js";
import { createKnowledgeReadModel } from "../src/desktop/read-model.js";

it("reads and refreshes Desktop overview/search through the native owner's one real index", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-desktop-read-")));
	const vault = join(root, "Vault");
	await mkdir(join(vault, "Library/Methods"), { recursive: true });
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	const host = createKnowledgeRuntimeHost();
	let workers = 0;
	host.configureKnowledgeWorker((_url, options) => {
		workers++;
		return new Worker(new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url), options);
	});
	const owner = createKnowledgeRuntime(config, host, {}, input => acquireKnowledgeWriterLease(input, join(root, "leases")));
	const readModel = createKnowledgeReadModel(owner);
	try {
		expect(await readModel.overview(null)).toEqual({ state: "unconfigured", binding: null, project: null, index: null, recentNotes: [] });
		expect(workers).toBe(0);
		const binding = await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
		await writeFile(join(vault, "Library/Methods/first.md"), "# Orchid method\nOrchid controlled assay.\n");
		const native = createNativeSession(owner);
		const tools = new Map<string, any>();
		native.extension({ events: createEventBus(), on: () => undefined, appendEntry: () => undefined,
			getCommands: () => [], registerCommand: () => undefined, registerTool: (tool: any) => tools.set(tool.name, tool) });
		const overview = await readModel.overview(null);
		expect(overview.binding).toEqual({ vaultId: binding.vaultId, revision: binding.revision, label: "Vault" });
		expect(overview.index?.noteCount).toBe(1);
		const context = { cwd: root, sessionId: "read-model", sessionManager: { getSessionId: () => "read-model", getBranch: () => [] } };
		const fromNative = await tools.get("knowledge_search").execute("search", { query: "Orchid" }, undefined, undefined, context);
		const fromDesktop = await readModel.search({ query: "Orchid", revision: binding.revision }, null);
		expect(fromDesktop.hits.map(hit => hit.path)).toEqual(fromNative.details.hits.map((hit: any) => hit.path));
		expect(fromDesktop.complete).toBe(true);
		expect(workers).toBe(1);
		const service = await owner.services.getKnowledgeService(binding);
		const prepared = await service.prepare({ cwd: root, project: null, query: "Orchid" });
		const humanRead = await readModel.readNote({ path: "Library/Methods/first.md", revision: binding.revision }, null);
		expect(humanRead.missing).toBe(false);
		await expect(service.evidenceReceipts(prepared.ticket, root, ["Library/Methods/first.md"]))
			.rejects.toThrow("Source was not read this turn");
		await service.read(prepared.ticket, root, { path: "Library/Methods/first.md" });
		expect((await service.evidenceReceipts(prepared.ticket, root, ["Library/Methods/first.md"])).sources).toHaveLength(1);
		await writeFile(join(vault, "Library/Methods/second.md"), "# Willow method\nWillow independent assay.\n");
		expect((await readModel.overview(null)).index?.noteCount).toBe(2);
		expect((await readModel.search({ query: "Willow", revision: binding.revision }, null)).hits[0].path).toBe("Library/Methods/second.md");
		await config.saveKnowledgeBinding({ vault, profile: "project", depositMode: "verified", subagentPolicy: "none" }, binding.revision);
		await expect(readModel.search({ query: "Orchid", revision: binding.revision }, null)).rejects.toThrow("binding changed");
	} finally {
		await owner.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
