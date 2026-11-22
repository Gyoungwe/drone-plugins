import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createKnowledgeIndexRuntime } from "../src/core/index-runtime.js";
import { createLocalKnowledgeIndexFiles } from "../src/core/index-runtime-local.js";

/**
 * KP3 — the semantic batch scan must not rescan the whole Vault per batch.
 *
 * Before KP3, `semanticBatch` read every eligible note on every call and ran
 * `updatePath` on each one, so a fill of N notes in M batches cost O(N·M).
 * The cost was paid in filesystem calls: `updatePath` stats and realpaths
 * every path segment of every note.
 *
 * The guard measures the number of *filesystem inspections*, not wall-clock
 * time, because the machine's speed does not change how many notes a scan
 * touches. A scan that resumes where it left off touches each note once.
 */

/** A body long enough to split into several chunks at the default chunk size. */
const body = (index: number) =>
	`# Synthetic note ${index}\n\nmarker${index} topic${index % 16} synthetic material\n\n`.repeat(60);

/** One chunk the scan handed to the caller. */
interface ScanItem {
	path: string;
	chunkIndex: number;
	hash: string;
	mtime: string;
	text: string;
	startChar: number;
	endChar: number;
}

/** The batch the scan returned. */
interface ScanBatch {
	items: ScanItem[];
	partial: boolean;
}

/** The status the runtime reported. */
interface RuntimeStatus {
	revision: number;
	categoryCounts: Record<string, number>;
	stats: { metadataChecks: number; bodyReads: number; categoryScans: number };
}

interface Runtime {
	request: <T = unknown>(op: string, args?: Record<string, unknown>) => Promise<T>;
	close: () => Promise<void>;
}

async function openRuntime(root: string, noteCount: number): Promise<Runtime> {
	const vault = join(root, "Vault");
	for (let index = 0; index < noteCount; index++) {
		const absolute = join(vault, `Library/Papers/note-${String(index).padStart(5, "0")}.md`);
		await mkdir(join(absolute, ".."), { recursive: true });
		await writeFile(absolute, body(index));
	}
	let receive:
		| ((message: { id: number; op: string; args?: Record<string, unknown> }) => Promise<void>)
		| null = null;
	let next = 0;
	const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
	const runtime = await createKnowledgeIndexRuntime(
		{ database: join(root, "index.sqlite"), backgroundReconcile: false },
		{ ...createLocalKnowledgeIndexFiles(vault), watch: null },
		{
			onMessage: (handler) => {
				receive = handler;
			},
			close: () => undefined,
			send(message: object) {
				const payload = message as {
					id?: number;
					ready?: boolean;
					uiChanged?: boolean;
					error?: string;
					result?: unknown;
				};
				if (payload.ready || payload.uiChanged) return;
				if (payload.id === undefined) return;
				const request = pending.get(payload.id);
				if (!request) return;
				pending.delete(payload.id);
				if (payload.error) request.reject(new Error(payload.error));
				else request.resolve(payload.result);
			},
		},
	);
	const request = async <T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<T> => {
		const id = ++next;
		const response = new Promise<T>((resolve, reject) =>
			pending.set(id, { resolve: resolve as (value: unknown) => void, reject }),
		);
		if (!receive) throw new Error("The runtime never registered a message handler");
		await receive({ id, op, args });
		return response;
	};
	await request("reconcile", { force: true });
	return { request, close: () => runtime.close() };
}

/**
 * The number of chunks the fill produces, and how many notes it inspected.
 *
 * The scan's filesystem cost is measured by counting how many times the
 * runtime inspected a note on disk. The runtime does not expose that count,
 * so the test measures the scan from the outside: the number of distinct
 * notes a batch touches is visible in the returned items.
 */
async function fill(noteCount: number, batchSize: number) {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-semantic-")));
	try {
		const runtime = await openRuntime(root, noteCount);
		const fingerprint = "f".repeat(64);
		let batches = 0;
		let chunks = 0;
		const touched = new Set<string>();
		// Fill every chunk: each batch is stored before the next is asked for,
		// which is how the real fill loop works.
		for (;;) {
			const batch = await runtime.request<ScanBatch>("semanticBatch", {
				fingerprint,
				limit: batchSize,
				chunkChars: 1200,
			});
			if (!batch.items.length) break;
			batches++;
			chunks += batch.items.length;
			for (const item of batch.items) touched.add(item.path);
			await runtime.request("semanticStore", {
				fingerprint,
				items: batch.items.map((item) => ({
					...item,
					vector: new Array(8).fill(0.5),
				})),
			});
			if (batches > 5000) throw new Error("The semantic fill did not converge");
		}
		const status = await runtime.request<RuntimeStatus>("status", {});
		return {
			batches,
			chunks,
			touched: touched.size,
			notes: noteCount,
			// The number of notes the scan inspected on disk. This is the
			// cost KP3 removes: before it, every batch re-inspected every note.
			inspected: Number(status.stats.metadataChecks) - noteCount,
		};
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

it("does not rescan the vault for every semantic batch", async () => {
	const small = await fill(40, 4);
	const large = await fill(160, 4);
	expect(small.chunks).toBeGreaterThan(0);
	expect(large.chunks).toBeGreaterThan(0);
	// Every note is embedded — the fill is complete.
	expect(large.touched).toBe(large.notes);
	// The scan inspects each note on disk at most once across the whole fill.
	// Before KP3 every batch re-inspected every note, so the count grew with
	// the batch count rather than staying flat.
	expect(large.inspected).toBeLessThanOrEqual(large.notes);
	expect(small.inspected).toBeLessThanOrEqual(small.notes);
}, 300000);

it("skips the notes whose chunks are already stored", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-semantic-")));
	try {
		const runtime = await openRuntime(root, 12);
		const fingerprint = "f".repeat(64);
		const first = await runtime.request<ScanBatch>("semanticBatch", {
			fingerprint,
			limit: 8,
			chunkChars: 1200,
		});
		expect(first.items.length).toBe(8);
		await runtime.request("semanticStore", {
			fingerprint,
			items: first.items.map((item) => ({ ...item, vector: new Array(8).fill(0.5) })),
		});
		// The next batch must not return the chunks that were just stored.
		const second = await runtime.request<ScanBatch>("semanticBatch", {
			fingerprint,
			limit: 8,
			chunkChars: 1200,
		});
		const firstKeys = new Set(first.items.map((item) => `${item.path}#${item.chunkIndex}`));
		for (const item of second.items) {
			expect(firstKeys.has(`${item.path}#${item.chunkIndex}`)).toBe(false);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 120000);

it("returns no chunks once the whole vault is embedded", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-semantic-")));
	try {
		const runtime = await openRuntime(root, 6);
		const fingerprint = "f".repeat(64);
		for (;;) {
			const batch = await runtime.request<ScanBatch>("semanticBatch", {
				fingerprint,
				limit: 8,
				chunkChars: 1200,
			});
			if (!batch.items.length) break;
			await runtime.request("semanticStore", {
				fingerprint,
				items: batch.items.map((item) => ({ ...item, vector: new Array(8).fill(0.5) })),
			});
		}
		const empty = await runtime.request<ScanBatch>("semanticBatch", {
			fingerprint,
			limit: 8,
			chunkChars: 1200,
		});
		expect(empty.items).toEqual([]);
		expect(empty.partial).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 120000);

it("hands out every chunk of a note the batch stopped inside", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-semantic-")));
	try {
		// One note whose body splits into several chunks.  A batch of one
		// chunk fills inside the note, so the scan has to come back to it.
		const vault = join(root, "Vault");
		await mkdir(join(vault, "Library/Papers"), { recursive: true });
		await writeFile(join(vault, "Library/Papers/last.md"), `# Last\n${"z".repeat(700)}`);
		const runtime = await openRuntime(root, 0);
		const fingerprint = "f".repeat(64);
		const seen: Array<[string, number]> = [];
		for (let batch = 0; batch < 16; batch++) {
			const next = await runtime.request<ScanBatch>("semanticBatch", {
				fingerprint,
				limit: 1,
				chunkChars: 256,
			});
			if (!next.items.length) break;
			seen.push([next.items[0].path, next.items[0].chunkIndex]);
			await runtime.request("semanticStore", {
				fingerprint,
				items: next.items.map((item) => ({ ...item, vector: new Array(8).fill(0.5) })),
			});
		}
		// Every chunk of the note has to be handed out, in order and exactly
		// once.  A scan that dropped the note after the first chunk would
		// hand out chunk 0 and nothing else.
		expect(seen).toEqual([
			["Library/Papers/last.md", 0],
			["Library/Papers/last.md", 1],
			["Library/Papers/last.md", 2],
		]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 120000);

it("re-embeds a note whose body changed after it was indexed", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-semantic-")));
	try {
		const runtime = await openRuntime(root, 4);
		const fingerprint = "f".repeat(64);
		for (;;) {
			const batch = await runtime.request<ScanBatch>("semanticBatch", {
				fingerprint,
				limit: 8,
				chunkChars: 1200,
			});
			if (!batch.items.length) break;
			await runtime.request("semanticStore", {
				fingerprint,
				items: batch.items.map((item) => ({ ...item, vector: new Array(8).fill(0.5) })),
			});
		}
		const empty = await runtime.request<ScanBatch>("semanticBatch", {
			fingerprint,
			limit: 8,
			chunkChars: 1200,
		});
		expect(empty.items).toEqual([]);

		// Change one note's body. Its hash changes, so the stored chunks no
		// longer match it and the note owes chunks again.
		const note = join(root, "Vault/Library/Papers/note-00000.md");
		await writeFile(note, `${body(0)}\n\nan extra paragraph that changes the hash\n\n`.repeat(3));
		await runtime.request("reconcile", { force: true });

		const after = await runtime.request<ScanBatch>("semanticBatch", {
			fingerprint,
			limit: 8,
			chunkChars: 1200,
		});
		expect(after.items.length).toBeGreaterThan(0);
		expect(after.items.every((item) => item.path.endsWith("note-00000.md"))).toBe(true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 120000);
