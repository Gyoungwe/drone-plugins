import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { expect, it, vi } from "vitest";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { createAgentSessionRuntime, createAgentSessionFromServices, createAgentSessionServices,
	ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createKnowledgeRuntime } from "../src/core/knowledge-runtime.js";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";
import { createNativeSession } from "../src/extension/knowledge-extension.js";

it("real SDK sessions share one writer while publication proofs and same-workspace read tickets stay separate", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-native-owner-")));
	const vault = join(root, "Vault");
	await mkdir(join(vault, "Library/Methods"), { recursive: true });
	await mkdir(join(vault, "Wiki"));
	await writeFile(join(vault, "Home.md"), "# Home\n[[Wiki/Index]]\n");
	await writeFile(join(vault, "Wiki/Index.md"), "# Wiki\n");
	await writeFile(join(vault, "Library/Methods/method.md"), "# Method\nBounded local method evidence.\n");
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	const host = createKnowledgeRuntimeHost();
	const live = new Set<Worker>();
	let startedWorkers = 0;
	const emitted: string[] = [];
	host.configureKnowledgeRuntime({ emitProcessEvent: (event) => emitted.push(event) });
	host.configureKnowledgeWorker((_url, options) => {
		const worker = new Worker(new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url), options);
		startedWorkers++;
		live.add(worker);
		worker.once("exit", () => live.delete(worker));
		return worker;
	}, () => ({ version: "native-owner-test" }));
	const owner = createKnowledgeRuntime(config, host, {},
		(input) => acquireKnowledgeWriterLease(input, join(root, "leases")));
	const adapters = [createNativeSession(owner), createNativeSession(owner)];
	async function sdk(index: number) {
		const agentDir = join(root, `agent-${index}`);
		await mkdir(agentDir);
		const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null,
			modelsStorePath: join(agentDir, "models.json"), allowModelNetwork: false, refreshOnCreate: false });
		const provider = fauxProvider({ provider: `native-owner-${index}`, tokensPerSecond: 100000 });
		modelRuntime.registerNativeProvider(provider.provider);
		await modelRuntime.setRuntimeApiKey(`native-owner-${index}`, "offline-test-only");
		const runtime = await createAgentSessionRuntime(async ({ cwd, agentDir, sessionManager }) => {
			const services = await createAgentSessionServices({ cwd, agentDir, modelRuntime,
				settingsManager: SettingsManager.inMemory(),
				resourceLoaderOptions: { noExtensions: true, noSkills: true, noContextFiles: true,
					extensionFactories: [adapters[index].extension] } });
			const result = await createAgentSessionFromServices({ services, sessionManager, model: provider.getModel(),
				tools: ["knowledge_status", "research_knowledge_status"] });
			return { ...result, services, diagnostics: services.diagnostics };
		}, { cwd: root, agentDir, sessionManager: SessionManager.inMemory(root) });
		const errors: unknown[] = [];
		await runtime.session.bindExtensions({ onError: (error) => errors.push(error) });
		const receipts: Array<{ tool: string; error: boolean }> = [];
		runtime.session.subscribe((event) => {
			if (event.type === "tool_execution_end") receipts.push({ tool: event.toolName, error: event.isError });
		});
		return { runtime, provider, receipts, errors };
	}
	const a = await sdk(0);
	const b = await sdk(1);
	try {
		vi.stubEnv("DRONE_KNOWLEDGE_DIR", ""); // Explicit owners must not fall back to process configuration.
		a.provider.setResponses([
			fauxAssistantMessage([fauxToolCall("knowledge_status", {}), fauxToolCall("research_knowledge_status", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("The requested index status was reported."),
		]);
		await a.runtime.session.prompt("Report index status.");
		expect([...a.receipts].sort((left, right) => left.tool.localeCompare(right.tool))).toEqual([{ tool: "knowledge_status", error: false }, { tool: "research_knowledge_status", error: false }]);
		expect(a.errors).toEqual([]);
		expect(startedWorkers).toBe(1);
		const aService = await adapters[0].services.getKnowledgeService();
		const bService = await adapters[1].services.getKnowledgeService();
		expect(aService.worker).toBe(bService.worker);
		const aTicket = await aService.prepare({ cwd: root, project: "test", query: "method" });
		const bTicket = await bService.prepare({ cwd: root, project: "test", query: "method" });
		await expect(bService.check(aTicket.ticket, root)).rejects.toThrow("Read current navigation");
		await expect(bService.check(bTicket.ticket, root)).resolves.toBeDefined();
		const lastA = a.runtime.session.messages.filter((message) => message.role === "assistant").at(-1);
		expect(lastA).toBeDefined();
		expect(adapters[0].publication.projectKnowledgeSnapshot([lastA])[0]).toBe(lastA);
		expect(adapters[1].publication.projectKnowledgeSnapshot([lastA])[0]).not.toBe(lastA);
		await a.runtime.dispose();
		expect(live.size).toBe(1);
		expect(() => adapters[0].publication.projectKnowledgeSnapshot([lastA])).toThrow("session has been disposed");
		expect(() => adapters[0].publication.projectKnowledgeEvent({ type: "agent_end", messages: [lastA] })).toThrow("session has been disposed");
		expect(() => aService.check(aTicket.ticket, root)).toThrow("session has been disposed");
		await expect(bService.check(bTicket.ticket, root)).resolves.toBeDefined();
		b.provider.setResponses([
			fauxAssistantMessage([fauxToolCall("knowledge_status", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("The binding is configured."),
		]);
		await b.runtime.session.prompt("Report binding state.");
		expect(b.receipts).toEqual([{ tool: "knowledge_status", error: false }]);
		expect(startedWorkers).toBe(1);
		expect(emitted).not.toContain("drone:knowledge-service/v1");
		expect(emitted).not.toContain("drone:knowledge-specialist-host/v1");
	} finally {
		await Promise.all([a.runtime.dispose(), b.runtime.dispose()]);
		await owner.dispose();
		vi.unstubAllEnvs();
		await rm(root, { recursive: true, force: true });
	}
	expect(live.size).toBe(0);
});
