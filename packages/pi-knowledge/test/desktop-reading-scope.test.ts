import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createLocalKnowledgeIndexFiles } from "../src/core/index-runtime-local.js";
import { createKnowledgeIndexRuntime } from "../src/core/index-runtime.js";
import type { KnowledgeIndexTransport } from "../src/core/index-runtime-ports.js";
import { createKnowledgeOwnerLifecycle } from "../src/core/owner-lifecycle.js";
import { createKnowledgeReadModel } from "../src/desktop/read-model.js";

it("scopes graph, links, categories, jobs and paged human reads through one actual SQLite index", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-reading-scope-")));
	const vault = join(root, "Vault");
	for (const path of ["Library/Methods", "Projects/alpha/Methods", "Projects/beta/Methods"])
		await mkdir(join(vault, path), { recursive: true });
	const shared = "Library/Methods/assay.md", alpha = "Projects/alpha/Methods/alpha.md", beta = "Projects/beta/Methods/beta.md";
	await writeFile(join(vault, shared), `# Assay method\n[[${alpha.slice(0, -3)}]]\n[[${beta.slice(0, -3)}]]\n`);
	await writeFile(join(vault, alpha), `# Alpha method\n[[${shared.slice(0, -3)}]]\n` + Array.from({ length: 120 }, (_, index) => `line ${index} ${"a".repeat(90)}`).join("\n"));
	await writeFile(join(vault, beta), `# Beta method\n[[${shared.slice(0, -3)}]]\n`);
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	const binding = await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	let receive!: Parameters<KnowledgeIndexTransport["onMessage"]>[0];
	let next = 0;
	const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
	const runtime = await createKnowledgeIndexRuntime({ database: join(root, "index.sqlite"), backgroundReconcile: false },
		{ ...createLocalKnowledgeIndexFiles(vault), watch: null }, {
			onMessage: handler => { receive = handler; }, close: () => undefined,
			send(message: any) {
				if (message.ready || message.uiChanged) return;
				const request = pending.get(message.id)!; pending.delete(message.id);
				if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
			},
		});
	const request = async (op: string, args = {}) => {
		const id = ++next;
		const response = new Promise<any>((resolve, reject) => pending.set(id, { resolve, reject }));
		await receive({ id, op, args }); return response;
	};
	const owner = { config, services: { getKnowledgeService: async () => ({ request }) },
		...createKnowledgeOwnerLifecycle({ dispose: () => runtime.close() }) };
	const reads = createKnowledgeReadModel(owner);
	try {
		const sharedGraph = await reads.graph({ revision: binding.revision, view: "all" }, null);
		expect(sharedGraph.nodes.map(node => node.path)).toEqual([shared]);
		const alphaGraph = await reads.graph({ revision: binding.revision, view: "all" }, "alpha");
		expect(alphaGraph.nodes.map(node => node.path).sort()).toEqual([shared, alpha].sort());
		expect(JSON.stringify(alphaGraph)).not.toContain(beta);
		const betaGraph = await reads.graph({ revision: binding.revision, view: "all" }, "beta");
		expect(betaGraph.nodes.map(node => node.path).sort()).toEqual([shared, beta].sort());
		expect((await reads.graph({ revision: binding.revision, view: "all" }, null)).nodes).toEqual(sharedGraph.nodes);
		const links = await reads.links({ path: shared, revision: binding.revision }, "alpha");
		expect(links.outgoing.map(link => link.path)).toEqual([alpha]);
		expect(links.incoming.map(link => link.path)).toEqual([alpha]);
		await expect(reads.links({ path: beta, revision: binding.revision }, "alpha")).rejects.toThrow("scope");
		const categories = await reads.recentByCategory({ revision: binding.revision }, "alpha");
		expect(categories.groups.method.map(note => note.path).sort()).toEqual([shared, alpha].sort());
		expect(categories.counts.method).toBe(2);
		expect((await reads.recentByCategory({ revision: binding.revision }, null)).counts.method).toBe(1);
		const jobs = await reads.jobs({ revision: binding.revision, limit: 1 }, "alpha");
		expect(jobs.items).toHaveLength(1);
		expect(jobs.total).toBeGreaterThan(1);
		expect(jobs.nextOffset).toBe(1);
		const allJobs = await reads.jobs({ revision: binding.revision, limit: 50 }, "alpha");
		expect(allJobs.items.every(job => job.scope === "shared" || job.scope === "alpha")).toBe(true);
		const first = await reads.readNote({ path: alpha, revision: binding.revision }, "alpha");
		if (first.missing) throw new Error("Expected indexed note");
		expect(first).toMatchObject({ path: alpha, title: "Alpha method", category: "method", startLine: 1, truncated: true });
		expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
		const nextPage = await reads.readNote({ path: alpha, revision: binding.revision, startLine: first.endLine + 1, expectedHash: first.hash }, "alpha");
		if (nextPage.missing) throw new Error("Expected indexed note");
		expect(nextPage.startLine).toBe(first.endLine + 1);
		expect(nextPage.hash).toBe(first.hash);
		await expect(reads.readNote({ path: beta, revision: binding.revision }, "alpha")).rejects.toThrow("scope");
		await writeFile(join(vault, alpha), "# Alpha method\nChanged after first page.\n");
		await expect(reads.readNote({ path: alpha, revision: binding.revision, expectedHash: first.hash }, "alpha")).rejects.toThrow("Note changed");
		expect(await reads.readNote({ path: "Library/Methods/missing.md", revision: binding.revision }, null)).toMatchObject({ missing: true, bindingRevision: binding.revision, project: null });
		await expect(reads.jobs({ revision: binding.revision + 1 }, "alpha")).rejects.toThrow("binding changed");
	} finally {
		await owner.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
