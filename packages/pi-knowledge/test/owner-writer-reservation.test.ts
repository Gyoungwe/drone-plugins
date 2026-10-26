import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createKnowledgeRuntime } from "../src/core/knowledge-runtime.js";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";

function latch() {
	let release!: () => void;
	const promise = new Promise<void>(resolve => { release = resolve; });
	return { promise, release };
}

it("retains the owner's writer reservation across worker failure until accepted domain writes settle", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-owner-reservation-")));
	const vault = join(root, "Vault");
	await mkdir(vault);
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	const workers: Worker[] = [];
	function owner() {
		const host = createKnowledgeRuntimeHost();
		host.configureKnowledgeWorker((_url, options) => {
   const worker = new Worker(new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url), options);
   workers.push(worker);
   return worker;
  });
		return createKnowledgeRuntime(config, host, {}, input => acquireKnowledgeWriterLease(input, join(root, "leases")));
	}
	const first = owner();
	const second = owner();
	const started = latch();
	const held = latch();
	const note = join(vault, "transaction.md");
	let closing: Promise<void> | null = null;
	try {
		await first.services.getKnowledgeService();
		const operation = first.run(async () => {
			await writeFile(note, "accepted\n");
			started.release();
			await held.promise;
			await appendFile(note, "settled\n");
		});
		await started.promise;
		await workers[0].terminate();
		await expect(second.services.getKnowledgeService()).rejects.toThrow("already reserved");
		closing = first.dispose();
		const failedClose = expect(closing).rejects.toThrow("Knowledge runtime disposal failed");
		await expect(second.services.getKnowledgeService()).rejects.toThrow("already reserved");
		held.release();
		await operation;
		await failedClose;
		expect(await readFile(note, "utf8")).toBe("accepted\nsettled\n");
		await expect((await second.services.getKnowledgeService()).request("status")).resolves.toBeDefined();
	} finally {
		held.release();
		if (!closing) await first.dispose();
		await second.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
