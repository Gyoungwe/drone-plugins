import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, expect, it } from "vitest";
import {
	closeKnowledgeServices,
	configureKnowledgeWorker,
	getKnowledgeService,
	saveKnowledgeBinding,
} from "../src/core/index.js";

let root: string;
afterEach(async () => {
	await closeKnowledgeServices();
	delete process.env.DRONE_KNOWLEDGE_DIR;
	await rm(root, { recursive: true, force: true });
});

it("keeps worker counts and recent method/software groups aligned after reopening the index", async () => {
	root = await mkdtemp(join(tmpdir(), "pi-knowledge-category-"));
	const vault = join(root, "Vault");
	process.env.DRONE_KNOWLEDGE_DIR = join(root, "state");
	configureKnowledgeWorker(
		(_url, options) =>
			new Worker(new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url), options as never),
	);
	const methods = ["Library/Methods/mapping-tools.md", "Library/Software/paper-protocol.md"];
	const software = "Library/Software/paper-tools.md";
	for (const [path, body] of [
		[methods[0], "# Mapping tools"],
		[methods[1], "---\ntype: method\n---\n# Paper protocol"],
		[software, "---\ntype: software\n---\n# Paper tools"],
	]) {
		const absolute = join(vault, path);
		await mkdir(dirname(absolute), { recursive: true });
		await writeFile(absolute, body);
	}
	const binding = await saveKnowledgeBinding({
		vault,
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "none",
	});
	for (let attempt = 0; attempt < 2; attempt++) {
		const service = await getKnowledgeService(binding);
		await service.request("reconcile", { force: true });
		const status = await service.request("status", {});
		const { groups: recent } = await service.request("recentByCategory", { limit: 10 });
		expect(status.categoryCounts).toMatchObject({ method: 2, software: 1, paper: 0 });
		expect(recent.method.map((note: { path: string }) => note.path).sort()).toEqual([...methods].sort());
		expect(recent.software.map((note: { path: string }) => note.path)).toEqual([software]);
		await closeKnowledgeServices();
	}
});
