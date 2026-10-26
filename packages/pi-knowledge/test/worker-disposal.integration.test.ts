import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createKnowledgeUi } from "../src/core/ui-state.js";
import { createKnowledgeServicePool } from "../src/core/service.js";
import { createSemanticSettingsApi } from "../src/core/semantic-settings.js";
import { createKnowledgeReviewPolicy } from "../src/core/review-policy.js";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";

it("reports failed drain and pool disposal while releasing the lease only after actual worker exit", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-worker-disposal-")));
	const vault = join(root, "Vault");
	await mkdir(vault);
	const directory = join(root, "state");
	const config = createKnowledgeConfigApi(undefined, directory);
	const binding = await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	const runtime = createKnowledgeRuntimeHost();
	const receipts: unknown[] = [];
	runtime.configureKnowledgeRuntime({ emitProcessEvent: (event, payload) => {
		if (event === "drone:knowledge-worker-lifecycle/v1") receipts.push(payload);
	} });
	let exited = false;
	// A real worker responds to health-check but fails its graceful shutdown protocol.
	runtime.configureKnowledgeWorker(() => {
		const worker = new Worker(`const {parentPort}=require("node:worker_threads");
		parentPort.on("message", ({id,op}) => parentPort.postMessage(op === "close"
		 ? {id,error:"shutdown protocol failed"} : {id,result:{}}));
		parentPort.postMessage({ready:true});`, { eval: true });
		worker.once("exit", () => { exited = true; });
		return worker;
	});
	const acquire = (input: Parameters<typeof acquireKnowledgeWriterLease>[0]) =>
		acquireKnowledgeWriterLease(input, join(root, "leases"));
	const services = createKnowledgeServicePool(runtime, config, createKnowledgeUi(runtime, config),
		createSemanticSettingsApi(undefined, directory), createKnowledgeReviewPolicy(config), acquire);
	const service = await services.getKnowledgeService();
	try {
		await expect(service.close()).rejects.toThrow("shutdown protocol failed");
		expect(exited).toBe(true);
		expect(receipts).not.toEqual(expect.arrayContaining([expect.objectContaining({ stage: "drained" })]));
		expect(receipts.at(-1)).toMatchObject({ stage: "disabled", reason: "shutdown protocol failed" });
		const lease = acquire({ vault, indexPath: join(directory, binding.vaultId, "index.sqlite") });
		lease.release();
		const pool = runtime.runtimeSlot("knowledge", "workerPool", () => { throw new Error("Expected existing service pool"); }) as { dispose(): Promise<void> };
		await expect(pool.dispose()).rejects.toThrow("Knowledge service pool disposal failed");
		await expect(services.getKnowledgeService()).rejects.toThrow("disposed");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("releases a constructor's acquired lease when the actual worker resource cannot start", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-worker-startup-")));
	const vault = join(root, "Vault");
	await mkdir(vault);
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	const binding = await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	const runtime = createKnowledgeRuntimeHost();
	runtime.configureKnowledgeWorker(() => { throw new Error("worker resource missing"); });
	const acquire = (input: Parameters<typeof acquireKnowledgeWriterLease>[0]) =>
		acquireKnowledgeWriterLease(input, join(root, "leases"));
	const services = createKnowledgeServicePool(runtime, config, createKnowledgeUi(runtime, config),
		createSemanticSettingsApi(undefined, config.knowledgeDirectory()), createKnowledgeReviewPolicy(config), acquire);
	try {
		await expect(services.getKnowledgeService()).rejects.toThrow("worker resource missing");
		const lease = acquire({ vault, indexPath: join(root, "state", binding.vaultId, "index.sqlite") });
		lease.release();
	} finally {
		await services.closeKnowledgeServices();
		await rm(root, { recursive: true, force: true });
	}
});

it("closes accepted requests still reading their binding, then permits a later compatibility reuse", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-worker-close-race-")));
	const vault = join(root, "Vault");
	await mkdir(vault);
	const directory = join(root, "state");
	const config = createKnowledgeConfigApi(undefined, directory);
	await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	let release!: () => void;
	const bindingGate = new Promise<void>((resolve) => { release = resolve; });
	const delayedConfig = { ...config, readKnowledgeBinding: async () => {
		await bindingGate;
		return config.readKnowledgeBinding();
	} };
	const runtime = createKnowledgeRuntimeHost();
	const live = new Set<Worker>();
	runtime.configureKnowledgeWorker((_url, options) => {
		const worker = new Worker(new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url), options);
		live.add(worker);
		worker.once("exit", () => live.delete(worker));
		return worker;
	});
	const services = createKnowledgeServicePool(runtime, delayedConfig, createKnowledgeUi(runtime, config),
		createSemanticSettingsApi(undefined, directory), createKnowledgeReviewPolicy(config),
		(input) => acquireKnowledgeWriterLease(input, join(root, "leases")));
	try {
		const accepted = services.getKnowledgeService();
		let closeReturned = false;
		const closing = services.closeKnowledgeServices().then(() => { closeReturned = true; });
		await expect(services.getKnowledgeService()).rejects.toThrow("closing");
		expect(closeReturned).toBe(false);
		release();
		const first = await accepted;
		await closing;
		expect(first.closed).toBe(true);
		expect(live.size).toBe(0);
		const next = await services.getKnowledgeService();
		expect(next).not.toBe(first);
		expect(live.size).toBe(1);
	} finally {
		release();
		await services.closeKnowledgeServices();
		await rm(root, { recursive: true, force: true });
	}
	expect(live.size).toBe(0);
});

for (const failure of ["exit", "error"] as const) {
	it(`rejects close when its acknowledged shutdown is followed by worker ${failure}`, async () => {
		const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-worker-exit-failure-")));
		const vault = join(root, "Vault");
		await mkdir(vault);
		const directory = join(root, "state");
		const config = createKnowledgeConfigApi(undefined, directory);
		const binding = await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
		const runtime = createKnowledgeRuntimeHost();
		const receipts: unknown[] = [];
		runtime.configureKnowledgeRuntime({ emitProcessEvent: (event, payload) => {
			if (event === "drone:knowledge-worker-lifecycle/v1") receipts.push(payload);
		} });
		let exited = false;
		runtime.configureKnowledgeWorker(() => {
			const worker = new Worker(`const {parentPort}=require("node:worker_threads");
			parentPort.on("message", ({id,op}) => {
			 parentPort.postMessage({id,result:{}});
			 if(op === "close") setImmediate(() => { ${failure === "exit" ? "process.exit(7);" : 'throw new Error("shutdown crashed");'} });
			}); parentPort.postMessage({ready:true});`, { eval: true });
			worker.once("exit", () => { exited = true; });
			return worker;
		});
		const acquire = (input: Parameters<typeof acquireKnowledgeWriterLease>[0]) =>
			acquireKnowledgeWriterLease(input, join(root, "leases"));
		const services = createKnowledgeServicePool(runtime, config, createKnowledgeUi(runtime, config),
			createSemanticSettingsApi(undefined, directory), createKnowledgeReviewPolicy(config), acquire);
		try {
			const service = await services.getKnowledgeService();
			await expect(service.close()).rejects.toThrow(failure === "exit" ? "exited (7)" : "shutdown crashed");
			expect(exited).toBe(true);
			expect(service.workerExitCode).toBe(failure === "exit" ? 7 : 1);
			expect(receipts).not.toEqual(expect.arrayContaining([expect.objectContaining({ stage: "drained" })]));
			expect(receipts.at(-1)).toMatchObject({ stage: "disabled" });
			const lease = acquire({ vault, indexPath: join(directory, binding.vaultId, "index.sqlite") });
			lease.release();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
}
