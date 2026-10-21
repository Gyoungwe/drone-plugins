import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import {
	closeKnowledgeServices,
	configureKnowledgeWorker,
	getKnowledgeService,
	saveKnowledgeBinding,
} from "../src/core/index.js";
import { planMaintenance } from "../src/maintenance/plan.js";
import { runMaintenance } from "../src/maintenance/run.js";

const roots: string[] = [];

afterEach(async () => {
	await closeKnowledgeServices();
	delete process.env.DRONE_KNOWLEDGE_DIR;
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("maintenance against a real worker-indexed Vault", () => {
	it("indexes 20 notes, includes note body in the fake-model prompt, and writes changes", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-knowledge-maintenance-worker-"));
		roots.push(root);
		const vault = join(root, "Vault");
		const appState = join(root, "app-state");
		await mkdir(vault, { recursive: true });
		process.env.DRONE_KNOWLEDGE_DIR = appState;
		configureKnowledgeWorker((_url, options) =>
			new Worker(new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url), options as never),
		);
		for (let index = 0; index < 20; index++) {
			const path = join(vault, "Library", "Papers", `PMC${index + 1}.pdf.md`);
			await mkdir(join(path, ".."), { recursive: true });
			await writeFile(path, `---\ntype: paper\n---\n\nEvidence body ${index + 1}\n`);
		}
		const binding = await saveKnowledgeBinding({
			vault,
			profile: "literature",
			depositMode: "verified",
			subagentPolicy: "none",
		});
		const service = await getKnowledgeService(binding);
		await service.request("reconcile", { force: true });
		const graph = await service.request("graph", { revision: binding.revision, limit: 5000, view: "all", mergeMirrors: false });
		const items = planMaintenance(null, graph, { enabled: true, maxItems: 20, dailyLimit: 20 });
		expect(items).toHaveLength(20);
		expect(items.every((item) => item.kind === "missing-topic")).toBe(true);
		const prompts: string[] = [];
		const result = await runMaintenance(items, {
			readNote: async (path) => {
				const note = await service.request("read", { path, maxChars: 6000 });
				return { title: note.title, markdown: note.text, exists: !note.missing };
			},
			complete: async (prompt) => {
				prompts.push(prompt);
				return JSON.stringify({ topic: "Indexed paper" });
			},
			setTopic: async (path, topic) => {
				const absolute = join(vault, path);
				const body = await readFile(absolute, "utf8");
				await writeFile(absolute, `---\ntype: paper\ntopic: ${topic}\n---${body.split("---").slice(2).join("---")}`);
			},
			proposeWiki: async () => undefined,
		});
		expect(result.processed).toBe(20);
		expect(result.modelCalls).toBe(20);
		expect(prompts[0]).toContain("Evidence body 1");
		expect(await readFile(join(vault, "Library", "Papers", "PMC1.pdf.md"), "utf8")).toContain("topic: Indexed paper");
	});
});
