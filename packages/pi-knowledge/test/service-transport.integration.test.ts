import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createKnowledgeServicePool } from "../src/core/service.js";
import { createKnowledgeWorkerTransportFactory } from "../src/core/worker-transport.js";
import { createKnowledgeUi } from "../src/core/ui-state.js";
import { createSemanticSettingsApi } from "../src/core/semantic-settings.js";
import { createKnowledgeReviewPolicy } from "../src/core/review-policy.js";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";

it("runs the existing ticket/read/evidence algorithm through an injected real transport without a domain Worker factory", async () => {
	const root = await realpath(
		await mkdtemp(join(tmpdir(), "knowledge-transport-domain-")),
	);
	const vault = join(root, "Vault");
	const directory = join(root, "state");
	await mkdir(join(vault, "Library/Methods"), { recursive: true });
	await mkdir(join(vault, "Wiki"));
	await writeFile(join(vault, "Home.md"), "# Home\n[[Wiki/Index]]\n");
	await writeFile(join(vault, "Wiki/Index.md"), "# Wiki\n");
	await writeFile(
		join(vault, "Library/Methods/method.md"),
		"# Method\nOrchid transport evidence.\n",
	);
	const config = createKnowledgeConfigApi(undefined, directory);
	await config.saveKnowledgeBinding({
		vault,
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "none",
	});
	const domain = createKnowledgeRuntimeHost();
	// Only the adapter's runtime can create a worker; no Worker-shaped object is injected into the service.
	domain.configureKnowledgeWorker(() => {
		throw new Error("Domain service must use its transport");
	});
	const adapter = createKnowledgeRuntimeHost();
	const live = new Set<Worker>();
	adapter.configureKnowledgeWorker(
		(_url, options) => {
			const worker = new Worker(
				new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url),
				options,
			);
			live.add(worker);
			worker.once("exit", () => live.delete(worker));
			return worker;
		},
		() => ({ version: "transport-test" }),
	);
	const ui = createKnowledgeUi(domain, config);
	const acquire = (input: Parameters<typeof acquireKnowledgeWriterLease>[0]) =>
		acquireKnowledgeWriterLease(input, join(root, "leases"));
	const services = createKnowledgeServicePool(
		domain,
		config,
		createSemanticSettingsApi(undefined, directory),
		createKnowledgeReviewPolicy(config),
		createKnowledgeWorkerTransportFactory(
			adapter,
			config,
			ui.invalidateKnowledgeUi,
			acquire,
		),
	);
	try {
		const service = await services.getKnowledgeService();
		expect(service.workerVersion).toBe("transport-test");
		const prepared = await service.prepare({
			cwd: root,
			project: null,
			query: "Orchid",
		});
		const page = await service.read(prepared.ticket, root, {
			path: "Library/Methods/method.md",
		});
		expect(page.text).toContain("Orchid transport evidence");
		expect(
			(await service.check(prepared.ticket, root)).reads.get(page.path).hash,
		).toBe(page.hash);
		await expect(
			service.check(prepared.ticket, join(root, "other")),
		).rejects.toThrow("Read current navigation");
		expect(
			(await service.evidenceReceipts(prepared.ticket, root, [page.path]))
				.sources[0].hash,
		).toBe(page.hash);
		await writeFile(
			join(vault, page.path),
			"# Changed method\nNew source revision.\n",
		);
		await expect(
			service.evidenceReceipts(prepared.ticket, root, [page.path]),
		).rejects.toThrow("Source changed");
		expect(live.size).toBe(1);
		const closing = service.close();
		expect(service.close()).toBe(closing);
		await expect(service.request("status")).rejects.toThrow("closed");
		await closing;
		expect(service.tickets.size).toBe(0);
		expect(live.size).toBe(0);
		const lease = acquire({
			vault,
			indexPath: join(directory, service.binding.vaultId, "index.sqlite"),
		});
		lease.release();
		// Acceptance occurs synchronously, before the new worker can emit its ready handshake.
		const early = new services.KnowledgeService(service.binding);
		const accepted = early.request("status");
		const earlyClose = early.close();
		await expect(accepted).resolves.toBeDefined();
		await earlyClose;
		expect(live.size).toBe(0);
		const defaultServices = createKnowledgeServicePool(
			adapter,
			config,
			createSemanticSettingsApi(undefined, directory),
			createKnowledgeReviewPolicy(config),
			createKnowledgeWorkerTransportFactory(adapter, config, ui.invalidateKnowledgeUi, acquire),
		);
		try {
			await expect(
				(await defaultServices.getKnowledgeService()).request("status"),
			).resolves.toBeDefined();
		} finally {
			await defaultServices.dispose();
		}
		expect(live.size).toBe(0);
	} finally {
		await services.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
