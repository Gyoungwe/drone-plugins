import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createKnowledgeUi } from "../src/core/ui-state.js";
import { createKnowledgePublication } from "../src/core/publication.js";
import { createKnowledgeServicePool } from "../src/core/service.js";
import { createKnowledgeWorkerTransportFactory } from "../src/core/worker-transport.js";
import { createSemanticSettingsApi } from "../src/core/semantic-settings.js";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";
import type { ReviewMode } from "../src/core/review-policy.js";

it("publication guidance waits for the actual asynchronous review policy", async () => {
	let finish!: (mode: ReviewMode) => void;
	const policy = new Promise<ReviewMode>((resolve) => {
		finish = resolve;
	});
	const host = createKnowledgeRuntimeHost();
	const config = createKnowledgeConfigApi(undefined, null);
	const ui = createKnowledgeUi(host, config);
	const publication = createKnowledgePublication(
		ui,
		{ readReviewMode: () => policy },
		config,
		new AbortController().signal,
	);
	const adapter = publication.registerAnswerPublication(
		{ on() {} },
		{ getCurrent: () => null },
	);
	let settled = false;
	const guidance = adapter.guidance().then((value) => {
		settled = true;
		return value;
	});
	await Promise.resolve();
	expect(settled).toBe(false);
	finish("automatic");
	expect(await guidance).toContain(
		"Evidence quality reminders are nonblocking",
	);
	ui.dispose();
});

it("real answer validation waits for strict policy and rejects an unread related Wiki", async () => {
	const root = await realpath(
		await mkdtemp(join(tmpdir(), "knowledge-async-policy-")),
	);
	const vault = join(root, "Vault"),
		directory = join(root, "state");
	await mkdir(join(vault, "Library/Methods"), { recursive: true });
	await mkdir(join(vault, "Wiki"));
	await writeFile(join(vault, "Home.md"), "# Home\n[[Wiki/Orchid]]\n");
	await writeFile(join(vault, "Wiki/Index.md"), "# Wiki\n[[Wiki/Orchid]]\n");
	await writeFile(
		join(vault, "Wiki/Orchid.md"),
		"# Orchid\nOrchid method overview.\n",
	);
	await writeFile(
		join(vault, "Library/Methods/method.md"),
		"# Orchid method\nOrchid evidence.\n",
	);
	const config = createKnowledgeConfigApi(undefined, directory);
	await config.saveKnowledgeBinding({
		vault,
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "none",
	});
	const host = createKnowledgeRuntimeHost();
	host.configureKnowledgeWorker(
		(_url, options) =>
			new Worker(
				new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url),
				options,
			),
		() => ({ version: "async-policy-test" }),
	);
	const ui = createKnowledgeUi(host, config);
	let policy: Promise<ReviewMode> = Promise.resolve("automatic");
	const services = createKnowledgeServicePool(
		host,
		config,
		ui,
		createSemanticSettingsApi(undefined, directory),
		{ readReviewMode: () => policy },
		createKnowledgeWorkerTransportFactory(
			host,
			ui.invalidateKnowledgeUi,
			(input) => acquireKnowledgeWriterLease(input, join(root, "leases")),
		),
	);
	try {
		const service = await services.getKnowledgeService();
		const prepared = await service.prepare({
			cwd: root,
			project: null,
			query: "Orchid",
		});
		expect(prepared.linkedWiki).toContain("Wiki/Orchid.md");
		await service.read(prepared.ticket, root, {
			path: "Library/Methods/method.md",
		});
		await service.search(prepared.ticket, root, { query: "Orchid" });
		let finish!: (mode: ReviewMode) => void;
		policy = new Promise((resolve) => {
			finish = resolve;
		});
		let settled = false;
		const result = service
			.validateAnswer(
				prepared.ticket,
				root,
				"Orchid evidence [[Library/Methods/method.md]].",
			)
			.then(
				(value: unknown) => {
					settled = true;
					return value;
				},
				(error: unknown) => {
					settled = true;
					throw error;
				},
			);
		const rejection = expect(result).rejects.toMatchObject({
			code: "wiki-changed",
		});
		await new Promise((resolve) => setImmediate(resolve));
		expect(settled).toBe(false);
		finish("strict");
		await rejection;
	} finally {
		await services.dispose();
		ui.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
