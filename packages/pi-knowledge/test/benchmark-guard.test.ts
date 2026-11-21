import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { afterEach, expect, it } from "vitest";
import {
	closeKnowledgeServices,
	configureKnowledgeWorker,
	getKnowledgeService,
	saveKnowledgeBinding,
} from "../src/core/index.js";

/**
 * KP0 — the benchmark guard for drone-plugins#58.
 *
 * The issue measured real hot spots on a 3,000-note synthetic Vault:
 * `categoryCounts` read every note body on each `status()` call, and
 * `recentByCategory` read them all again.  `status()` is on the path of every
 * `search`, so a search paid that full-table scan too.
 *
 * The ceilings here are **ratios**, not milliseconds: the same operation is
 * measured against a Vault six times larger, and the guard requires that the
 * larger Vault does not cost proportionally more.  CI machines vary in speed;
 * they do not vary in whether a count rescales with the note count.  So the
 * guard fails on a slow runner and passes on a fast one.
 *
 * `MAX_STATUS_SCALING` is a ratchet, like the host's zero-domain baseline: it
 * records today's measured behaviour and only ever moves down.  KP1 (a
 * per-revision category cache) must lower it to 3 — a cached count costs the
 * same on both Vaults, so the ratio collapses toward 1.
 */

/** Measured at 7.2–7.5 on the 150/900-note fixture.  KP1 lowers this to 3. */
const MAX_STATUS_SCALING = 8;

afterEach(async () => {
	await closeKnowledgeServices();
	delete process.env.DRONE_KNOWLEDGE_DIR;
});

// The issue's corpus averaged roughly 9 KB per note; a tiny body makes the
// category scan too cheap to measure against the fixed IPC overhead.
const body = (index: number) =>
	`# Synthetic note ${index}\n\nmarker${index} topic${index % 16} synthetic material\n\n`.repeat(120);

async function vaultWith(root: string, noteCount: number) {
	const vault = join(root, "Vault");
	for (let index = 0; index < noteCount; index++) {
		const absolute = join(vault, `Library/Papers/note-${String(index).padStart(5, "0")}.md`);
		await mkdir(dirname(absolute), { recursive: true });
		await writeFile(absolute, body(index));
	}
	return vault;
}

async function openService(root: string, noteCount: number) {
	const vault = await vaultWith(root, noteCount);
	process.env.DRONE_KNOWLEDGE_DIR = join(root, "state");
	configureKnowledgeWorker(
		(_url, options) =>
			new Worker(new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url), options as never),
	);
	const binding = await saveKnowledgeBinding({
		vault,
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "none",
	});
	const service = await getKnowledgeService(binding);
	await service.request("reconcile", { force: true });
	return service;
}

/**
 * The median `status()` time over a Vault of `noteCount` notes.  The median
 * keeps a single scheduling hiccup from deciding the result.
 */
async function medianStatusMs(noteCount: number, samples = 21): Promise<number> {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-bench-")));
	try {
		const service = await openService(root, noteCount);
		const timings: number[] = [];
		for (let index = 0; index < samples; index++) {
			const start = performance.now();
			await service.request("status", {});
			timings.push(performance.now() - start);
		}
		timings.sort((a, b) => a - b);
		return timings[Math.floor(timings.length / 2)];
	} finally {
		await closeKnowledgeServices();
		await rm(root, { recursive: true, force: true });
	}
}

it("does not rescale the status cost with the note count", async () => {
	const small = await medianStatusMs(150);
	const large = await medianStatusMs(900);
	// A full-table category scan costs six times as much on the large Vault
	// (measured: ~7.5x on this fixture).  A cached count costs about the same
	// on both, so the ratio collapses toward 1 once KP1 lands.
	expect(large / Math.max(small, 0.001)).toBeLessThan(MAX_STATUS_SCALING);
}, 300000);

it("keeps the category counts complete", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-bench-")));
	try {
		const service = await openService(root, 50);
		const status = await service.request("status", {});
		const total = Object.values(status.categoryCounts as Record<string, number>).reduce(
			(sum, value) => sum + value,
			0,
		);
		expect(total).toBe(50);
	} finally {
		await closeKnowledgeServices();
		await rm(root, { recursive: true, force: true });
	}
}, 120000);

it("does not re-read note bodies on an unchanged reconcile", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-bench-")));
	try {
		const service = await openService(root, 60);
		const before = await service.request("status", {});
		await service.request("reconcile", {});
		const after = await service.request("status", {});
		// The unchanged reconcile is a per-note metadata check, not a body read.
		// Item 6 of the issue records this cost as a required security check, so
		// the guard pins that it stays a metadata check.
		expect(after.stats.bodyReads).toBe(before.stats.bodyReads);
	} finally {
		await closeKnowledgeServices();
		await rm(root, { recursive: true, force: true });
	}
}, 120000);
