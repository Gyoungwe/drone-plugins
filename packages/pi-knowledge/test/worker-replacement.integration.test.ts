import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeKnowledgeServices, configureKnowledgeRuntime, configureKnowledgeWorker, KNOWLEDGE_WORKER_LIFECYCLE_EVENT, getKnowledgeService, saveKnowledgeBinding } from "../src/core/index.js";

let root: string;
let vault: string;
let version: string;
let rejectStartup: boolean;
let rejectMetadata: boolean;
const live = new Set<Worker>();
const lifecycle: string[] = [];
const receipts: unknown[] = [];

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-writer-replacement-")));
	vault = join(root, "Vault");
	await mkdir(join(vault, "Library/Methods"), { recursive: true });
	await writeFile(join(vault, "Library/Methods/method.md"), "# Indexed method\nStable evidence.\n");
	vi.stubEnv("DRONE_KNOWLEDGE_DIR", join(root, "state"));
	version = "first";
	rejectStartup = false;
	rejectMetadata = false;
	lifecycle.length = 0;
	receipts.length = 0;
	configureKnowledgeRuntime({ emitProcessEvent: (event, payload) => {
		if (event === KNOWLEDGE_WORKER_LIFECYCLE_EVENT) receipts.push(payload);
	} });
	configureKnowledgeWorker((_url, options) => {
		// Actual SQLite workers must not coexist while opening the same index.
		expect(live.size).toBe(0);
		if (rejectStartup) throw new Error("Replacement resource is unavailable");
		const worker = new Worker(new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url), options);
		const startedVersion = version;
		live.add(worker);
		lifecycle.push(`start:${startedVersion}`);
		worker.once("exit", () => { live.delete(worker); lifecycle.push(`exit:${startedVersion}`); });
		return worker;
	}, () => {
		if (rejectMetadata) throw new Error("Knowledge worker resource is missing");
		return { version };
	});
});

afterEach(async () => {
	await closeKnowledgeServices();
	vi.unstubAllEnvs();
	await rm(root, { recursive: true, force: true });
});

it("drains the real SQLite writer before one replacement serves simultaneous callers", async () => {
	const binding = await saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	const first = await getKnowledgeService(binding);
	const indexing = first.request("reconcile", { force: true });
	version = "second";
	const [second, sameSecond] = await Promise.all([getKnowledgeService(binding), getKnowledgeService(binding)]);
	await indexing;
	expect(second).toBe(sameSecond);
	expect(second).not.toBe(first);
	expect(first.closed).toBe(true);
	expect(lifecycle).toEqual(["start:first", "exit:first", "start:second"]);
	expect(live.size).toBe(1);
	expect((await second.request("status")).categoryCounts.method).toBe(1);
	const db = new DatabaseSync(join(root, "state", binding.vaultId, "index.sqlite"), { readOnly: true });
	try {
		expect(db.prepare("PRAGMA integrity_check").get()?.integrity_check).toBe("ok");
		expect(db.prepare("SELECT count(*) AS count FROM notes").get()?.count).toBe(1);
	} finally { db.close(); }
});

it("reports replacement failure after draining and can explicitly retry a repaired resource", async () => {
	const binding = await saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	const first = await getKnowledgeService(binding);
	await first.request("reconcile", { force: true });
	version = "broken";
	rejectStartup = true;
	await expect(getKnowledgeService(binding)).rejects.toThrow("Replacement resource is unavailable");
	expect(first.closed).toBe(true);
	expect(live.size).toBe(0);
	expect(receipts).not.toEqual(expect.arrayContaining([expect.objectContaining({ stage: "rolled_back" })]));
	expect(receipts.at(-1)).toMatchObject({ stage: "disabled", version: "broken", previousVersion: "first", reason: "Replacement resource is unavailable" });
	await expect(first.request("status")).rejects.toThrow("closed");
	rejectStartup = false;
	version = "repaired";
	const repaired = await getKnowledgeService(binding);
	expect((await repaired.request("status")).categoryCounts.method).toBe(1);
	expect(lifecycle).toEqual(["start:first", "exit:first", "start:repaired"]);
});

it("preserves the real verified SQLite writer when replacement metadata fails before drain", async () => {
	const binding = await saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	const first = await getKnowledgeService(binding);
	await first.request("reconcile", { force: true });
	const before = await first.request("status");
	rejectMetadata = true;
	await expect(getKnowledgeService({ ...binding, revision: binding.revision + 1 })).rejects.toThrow("Knowledge worker resource is missing");
	expect(first.closed).toBe(false);
	expect(await first.request("status")).toMatchObject({ revision: before.revision, categoryCounts: { method: 1 } });
	expect(live.size).toBe(1);
	expect(lifecycle).toEqual(["start:first"]);
	expect(receipts.at(-1)).toMatchObject({ stage: "rolled_back", version: "first", previousVersion: "first", reason: "Knowledge worker resource is missing" });
	rejectMetadata = false;
	expect(await getKnowledgeService(binding)).toBe(first);
});
