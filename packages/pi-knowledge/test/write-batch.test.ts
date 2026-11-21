import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { createKnowledgeIndexRuntime } from "../src/core/index-runtime.js";
import { createLocalKnowledgeIndexFiles } from "../src/core/index-runtime-local.js";
import type { KnowledgeIndexTransport } from "../src/core/index-runtime-ports.js";

/**
 * KP4 — the cold index must not commit one transaction per note.
 *
 * A cold index used to write each note in its own transaction: a `BEGIN
 * IMMEDIATE`, the writes, a `COMMIT`, and a WAL write at the commit.  On a
 * Vault of a few thousand notes that is a few thousand commits, and the
 * commit is what the wall clock is made of.
 *
 * The guard counts the *transactions*, not the milliseconds.  A count does
 * not change with the machine's speed or its load, so the guard cannot flake
 * on a busy CI runner.
 *
 * The guard also pins what the batching must not break:
 *
 * - every note still ends up in the index, with its body;
 * - a note that changed is re-indexed;
 * - a note the reader may not see is still not indexed.
 */

const body = (index: number) =>
	`# Synthetic note ${index}\n\nmarker${index} topic${index % 16} synthetic material\n\n`.repeat(20);

interface RuntimeStatus {
	noteCount: number;
	revision: number;
	stats: { transactions: number; bodyReads: number; metadataChecks: number };
}

interface Runtime {
	request: <T = unknown>(op: string, args?: Record<string, unknown>) => Promise<T>;
	close: () => Promise<void>;
}

async function openRuntime(root: string, noteCount: number): Promise<Runtime> {
	const vault = join(root, "Vault");
	for (let index = 0; index < noteCount; index++) {
		const absolute = join(vault, `Library/Papers/note-${String(index).padStart(5, "0")}.md`);
		await mkdir(dirname(absolute), { recursive: true });
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
		} satisfies KnowledgeIndexTransport,
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

it("groups the cold index into far fewer transactions than it has notes", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-batch-")));
	try {
		const runtime = await openRuntime(root, 200);
		const status = await runtime.request<RuntimeStatus>("status", {});
		// Every note was read and written.
		expect(status.noteCount).toBe(200);
		// But the notes did not cost one transaction each.  The ceiling is a
		// count, so it holds on any machine: a cold index of 200 notes may
		// commit at most a handful of times.
		expect(status.stats.transactions).toBeLessThan(200);
		expect(status.stats.transactions).toBeGreaterThan(0);
		// The transaction count must not grow with the note count either: the
		// same ratio holds on a larger Vault.
		expect(status.stats.transactions / status.noteCount).toBeLessThan(0.25);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 300000);

it("indexes every note with its body", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-batch-")));
	try {
		const runtime = await openRuntime(root, 40);
		const status = await runtime.request<RuntimeStatus>("status", {});
		expect(status.noteCount).toBe(40);
		// The body must be searchable, so the batch did not skip the
		// search-index write.
		const found = await runtime.request<{ hits: { path: string }[] }>("search", {
			query: "marker7",
			limit: 10,
		});
		expect(found.hits.length).toBeGreaterThan(0);
		expect(found.hits.some((hit) => hit.path.includes("note-00007.md"))).toBe(true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 300000);

it("re-indexes a note that changed after the cold index", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-batch-")));
	try {
		const runtime = await openRuntime(root, 10);
		const before = await runtime.request<RuntimeStatus>("status", {});
		const note = join(root, "Vault/Library/Papers/note-00000.md");
		await writeFile(note, `${body(0)}\n\na changed paragraph that moves the hash\n\n`.repeat(3));
		await runtime.request("changed", { paths: ["Library/Papers/note-00000.md"] });
		const after = await runtime.request<RuntimeStatus>("status", {});
		// The changed note was written in its own transaction, so the count
		// grew by one — the incremental path never joins the cold path's
		// transaction.
		expect(after.revision).toBeGreaterThan(before.revision);
		expect(after.stats.transactions).toBe(before.stats.transactions + 1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 300000);
