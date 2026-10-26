import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { expect, it, vi } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createKnowledgeUi } from "../src/core/ui-state.js";
import { createKnowledgeServicePool } from "../src/core/service.js";
import { createSemanticSettingsApi } from "../src/core/semantic-settings.js";
import { createKnowledgeReviewPolicy } from "../src/core/review-policy.js";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";
import { createKnowledgeSpecialistHost } from "../src/core/specialist-host.js";

it("keeps real SQLite workers, binding checks and persisted policies on their injected owners", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-runtime-instances-")));
	async function owner(name: string) {
		const directory = join(root, name, "state");
		const vault = join(root, name, "Vault");
		await mkdir(join(vault, "Library/Methods"), { recursive: true });
		await writeFile(join(vault, "Library/Methods/method.md"), `# ${name} method\n${name} evidence.\n`);
		const config = createKnowledgeConfigApi(undefined, directory);
		const binding = await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
		const runtime = createKnowledgeRuntimeHost();
		const live = new Set<Worker>();
		let version = name;
		runtime.configureKnowledgeWorker((_url, options) => {
			expect(live.size).toBe(0);
			const worker = new Worker(new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url), options);
			live.add(worker);
			worker.once("exit", () => live.delete(worker));
			return worker;
		}, () => ({ version }));
		const ui = createKnowledgeUi(runtime, config);
		const semantic = createSemanticSettingsApi(undefined, directory);
		const review = createKnowledgeReviewPolicy(config);
		const services = createKnowledgeServicePool(runtime, config, ui, semantic, review,
			(input) => acquireKnowledgeWriterLease(input, join(root, "leases")));
		const specialists = createKnowledgeSpecialistHost(runtime, config, ui);
		return { directory, binding, live, services, review, semantic, specialists, replace: () => { version = `${name}-replacement`; } };
	}
	const a = await owner("a");
	const b = await owner("b");
	try {
		vi.stubEnv("DRONE_KNOWLEDGE_DIR", join(root, "wrong-environment-directory"));
		const [firstA, firstB] = await Promise.all([a.services.getKnowledgeService(), b.services.getKnowledgeService()]);
		expect(firstA).not.toBe(firstB);
		// Even direct construction cannot bypass an explicit owner's writer lease.
		expect(() => new a.services.KnowledgeService(a.binding, join(root, "another-index")))
			.toThrow("already reserved");
		await Promise.all([firstA.request("reconcile", { force: true }), firstB.request("reconcile", { force: true })]);
		await a.review.saveReviewMode("strict");
		await b.review.saveReviewMode("automatic");
		expect(a.review.readReviewMode()).toBe("strict");
		expect(b.review.readReviewMode()).toBe("automatic");
		await a.specialists.setSpecialistSettings({ mode: "manual", revision: 0, bindingRevision: a.binding.revision });
		expect((await a.specialists.specialistSettings()).mode).toBe("manual");
		expect((await b.specialists.specialistSettings()).mode).toBe("automatic");
		const settings = await a.semantic.readSemanticSettings(a.binding.vaultId);
		await a.semantic.saveSemanticSettings(a.binding.vaultId, { ...settings, enabled: true, provider: "ollama", baseUrl: "http://127.0.0.1:11434", model: "test-embedding", chunkChars: 800 }, settings.revision);
		expect((await a.semantic.readSemanticSettings(a.binding.vaultId)).chunkChars).toBe(800);
		expect(await b.semantic.readSemanticSettings(b.binding.vaultId)).toMatchObject({ enabled: false, revision: 0 });
		a.replace();
		const [newA, sameA] = await Promise.all([a.services.getKnowledgeService(), a.services.getKnowledgeService()]);
		expect(newA).toBe(sameA);
		expect(newA).not.toBe(firstA);
		expect(firstA.closed).toBe(true);
		expect(await b.services.getKnowledgeService()).toBe(firstB);
		expect(firstB.closed).toBe(false);
		for (const value of [a, b]) {
			expect(value.live.size).toBe(1);
			const db = new DatabaseSync(join(value.directory, value.binding.vaultId, "index.sqlite"), { readOnly: true });
			try {
				expect(db.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe("ok");
				expect(db.prepare("SELECT count(*) AS count FROM notes").get()?.count).toBe(1);
			} finally { db.close(); }
		}
	} finally {
		await Promise.all([a.services.closeKnowledgeServices(), b.services.closeKnowledgeServices()]);
		vi.unstubAllEnvs();
		await rm(root, { recursive: true, force: true });
	}
	expect(a.live.size).toBe(0);
	expect(b.live.size).toBe(0);
});
