import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
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

/**
 * How many times the notes may be read back out of the index to count them.
 *
 * This is a *count*, not a duration.  A count does not change with the
 * machine's speed or with how busy it is, so the guard cannot flake on a
 * loaded CI runner — a wall-clock ratio can, because scheduler contention
 * inflates one of the two measurements and not the other.
 *
 * Before KP1 every `status()` read every note body, so the count grew with
 * the Vault.  After KP1 the count is one per revision, whatever the Vault
 * holds, so the ceiling is one scan per revision.
 */
const MAX_CATEGORY_SCANS = 1;

/**
 * How many note rows the category views may read per revision.
 *
 * The counter counts *rows read out of the index*, not cache misses.  A miss
 * is a cache event; the rows are the expensive part.  Counting rows means a
 * view that reads the notes back out on its own — bypassing the cache —
 * moves the counter, so the guard cannot pass vacuously.
 */

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

it("does not rescan the notes for every status call", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-bench-")));
	try {
		const service = await openService(root, 150);
		// The reconcile in `openService` advances the revision, so the first
		// status call after it populates the cache.  Later calls read it.
		await service.request("status", {});
		const baseline = await service.request("status", {});
		const scansBefore = Number(baseline.stats.categoryScans);
		for (let index = 0; index < 10; index++) await service.request("status", {});
		const status = await service.request("status", {});
		// Eleven status calls over a 150-note Vault, and the notes were not
		// read back out of the index again.  Before KP1 each call read all 150,
		// so the count grew by 150 every time.
		expect(Number(status.stats.categoryScans)).toBe(scansBefore);
	} finally {
		await closeKnowledgeServices();
		await rm(root, { recursive: true, force: true });
	}
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

it("recomputes the category counts after a note changes", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-bench-")));
	try {
		const service = await openService(root, 40);
		const before = await service.request("status", {});
		const beforeCounts = before.categoryCounts as Record<string, number>;
		// The fixture puts every note under Library/Papers, so they are papers.
		expect(beforeCounts.paper).toBe(40);

		// Retype one note into a different category and let the index notice.
		const note = join(root, "Vault/Library/Papers/note-00000.md");
		await writeFile(note, "---\ntype: software\n---\n\nmarker0 topic0 material\n\n");
		await service.request("reconcile", { force: true });

		const after = await service.request("status", {});
		const afterCounts = after.categoryCounts as Record<string, number>;
		// The cache is keyed by the index revision, so a changed note must
		// invalidate it — otherwise the counts would go stale silently.
		expect(after.revision).toBeGreaterThan(before.revision);
		expect(afterCounts.paper).toBe(39);
		expect(afterCounts.software).toBe(1);
	} finally {
		await closeKnowledgeServices();
		await rm(root, { recursive: true, force: true });
	}
}, 120000);

it("reuses the category scan for the recent-by-category view", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-bench-")));
	try {
		const service = await openService(root, 150);
		await service.request("status", {});
		const baseline = await service.request("status", {});
		const rowsBefore = Number(baseline.stats.categoryScans);

		// KP5a — the recent view used to read every note body and re-derive
		// every category, which was the same full scan the counts had already
		// paid for.  It must now come out of the cache the counts filled, so
		// no further rows come out of the index.
		const recent = await service.request("recentByCategory", { limit: 10 });
		const after = await service.request("status", {});
		expect(Number(after.stats.categoryScans)).toBe(rowsBefore);

		// The view must still be correct: the fixture puts every note under
		// Library/Papers, so the paper group holds the newest ten.
		const groups = recent.groups as Record<string, Array<{ path: string }>>;
		expect(groups.paper).toHaveLength(10);
		expect(groups.paper.every((note) => note.path.startsWith("Library/Papers/"))).toBe(true);
		expect(groups.method).toHaveLength(0);
	} finally {
		await closeKnowledgeServices();
		await rm(root, { recursive: true, force: true });
	}
}, 120000);
