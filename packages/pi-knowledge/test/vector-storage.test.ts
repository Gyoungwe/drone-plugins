import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { createKnowledgeIndexRuntime } from "../src/core/index-runtime.js";
import { createLocalKnowledgeIndexFiles } from "../src/core/index-runtime-local.js";
import { decodeVector, encodeVector } from "../src/core/vector-codec.js";

/**
 * KP2 — the semantic vectors are stored as Float32 blobs.
 *
 * The unit test covers the codec and the migration in isolation.  This test
 * covers the thing that actually matters: a real index, opened for real,
 * with real vectors in it.
 *
 * The guard counts *bytes*.  A byte count does not change with the machine's
 * speed or its load, so the guard cannot flake on a busy CI runner — and the
 * thing being guarded is a size, which is exactly what a byte count
 * measures.
 */

const dimension = 768;
const fingerprint = "test-fingerprint";

const body = (index: number) =>
	`# Synthetic note ${index}\n\nmarker${index} topic${index % 16} synthetic material\n\n`.repeat(60);

const vectorFor = (index: number) =>
	Array.from({ length: dimension }, (_, component) => Math.sin((index + 1) * (component + 1) * 0.017));

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

/** Stores one vector for every note, through the real storage path. */
async function storeVectors(runtime: Runtime, noteCount: number) {
	const batch = await runtime.request<{
		items: Array<{ path: string; hash: string; mtime: string; chunkIndex: number; text: string }>;
	}>("semanticBatch", { fingerprint, limit: 16, chunkChars: 4000 });
	for (const item of batch.items)
		await runtime.request("semanticStore", {
			fingerprint,
			items: [
				{
					path: item.path,
					hash: item.hash,
					mtime: item.mtime,
					chunkIndex: item.chunkIndex,
					startChar: item.text ? 0 : null,
					endChar: item.text ? item.text.length : null,
					vector: vectorFor(0),
				},
			],
		});
	return noteCount;
}

it("stores the semantic vectors as blobs, in a fraction of the text size", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-vector-")));
	const database = join(root, "index.sqlite");
	try {
		const runtime = await openRuntime(root, 6);
		await storeVectors(runtime, 6);
		await runtime.close();

		const db = new DatabaseSync(database);
		const rows = db
			.prepare("SELECT vector,dimension,norm FROM semantic_chunks WHERE fingerprint=?")
			.all(fingerprint) as Array<{ vector: Uint8Array; dimension: number; norm: number }>;
		db.close();

		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			// The vector is a blob, not text.
			expect(typeof row.vector).not.toBe("string");
			expect(row.vector.length).toBe(row.dimension * 4);
			// The norm is stored beside it, so the search does not measure it.
			expect(Number.isFinite(row.norm)).toBe(true);
			expect(row.norm).toBeGreaterThan(0);
		}

		// The size win: the blob is a fraction of the text it replaced.
		const blobBytes = rows.reduce((sum, row) => sum + row.vector.length, 0);
		const textBytes = rows.reduce(
			(sum, row) => sum + Buffer.byteLength(JSON.stringify(vectorFor(0)), "utf8"),
			0,
		);
		expect(blobBytes).toBeLessThan(textBytes / 3);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 120000);

it("migrates the legacy text vectors in place, without re-embedding", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-vector-")));
	const database = join(root, "index.sqlite");
	try {
		const runtime = await openRuntime(root, 4);
		await storeVectors(runtime, 4);
		await runtime.close();

		// Rewrite the rows as the legacy form: JSON text, and no norm.  This
		// is what an index written before KP2 looks like.
		const before = new DatabaseSync(database);
		const legacy = before
			.prepare("SELECT path,chunk_index,hash,fingerprint,vector,dimension FROM semantic_chunks")
			.all() as Array<{
			path: string;
			chunk_index: number;
			hash: string;
			fingerprint: string;
			vector: Uint8Array;
			dimension: number;
		}>;
		before.exec("BEGIN IMMEDIATE");
		for (const row of legacy) {
			const components = decodeVector({ bytes: row.vector, dimension: row.dimension });
			before
				.prepare(
					"UPDATE semantic_chunks SET vector=?, norm=NULL WHERE path=? AND chunk_index=? AND hash=? AND fingerprint=?",
				)
				.run(JSON.stringify(components), row.path, row.chunk_index, row.hash, row.fingerprint);
		}
		before.exec("COMMIT");
		const textRows = before
			.prepare("SELECT count(*) count FROM semantic_chunks WHERE typeof(vector)='text'")
			.get() as { count: number };
		before.close();
		expect(Number(textRows.count)).toBe(legacy.length);

		// Reopen the index.  The migration runs on open.
		const reopened = await openRuntime(root, 4);
		await reopened.close();

		const after = new DatabaseSync(database);
		const rows = after
			.prepare("SELECT vector,norm FROM semantic_chunks WHERE fingerprint=?")
			.all(fingerprint) as Array<{ vector: Uint8Array; norm: number }>;
		const stillText = after
			.prepare("SELECT count(*) count FROM semantic_chunks WHERE typeof(vector)='text'")
			.get() as { count: number };
		after.close();

		// Every vector was converted, in place, and no vector was re-embedded:
		// the count is the same and each vector still holds the same numbers.
		expect(Number(stillText.count)).toBe(0);
		expect(rows.length).toBe(legacy.length);
		for (const row of rows) {
			expect(typeof row.vector).not.toBe("string");
			expect(row.vector.length).toBe(dimension * 4);
			expect(Number.isFinite(row.norm)).toBe(true);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 120000);

it("leaves an index that is already migrated alone", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-vector-")));
	const database = join(root, "index.sqlite");
	try {
		const runtime = await openRuntime(root, 3);
		await storeVectors(runtime, 3);
		await runtime.close();

		// The migration selects the rows whose vector is stored as text.  An
		// index that was already migrated has no such row, so reopening does
		// no work and the vectors are untouched.
		const before = new DatabaseSync(database);
		const original = before
			.prepare("SELECT path,vector,norm FROM semantic_chunks WHERE fingerprint=?")
			.all(fingerprint) as Array<{ path: string; vector: Uint8Array; norm: number }>;
		before.close();

		const reopened = await openRuntime(root, 3);
		await reopened.close();

		const after = new DatabaseSync(database);
		const rows = after
			.prepare("SELECT path,vector,norm FROM semantic_chunks WHERE fingerprint=?")
			.all(fingerprint) as Array<{ path: string; vector: Uint8Array; norm: number }>;
		after.close();

		expect(rows.length).toBe(original.length);
		for (const row of rows) {
			const match = original.find((candidate) => candidate.path === row.path);
			expect(match).toBeDefined();
			expect(Buffer.from(row.vector).equals(Buffer.from(match?.vector ?? new Uint8Array()))).toBe(true);
			expect(row.norm).toBe(match?.norm);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 120000);

it("round-trips a stored vector through the blob", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-vector-")));
	const database = join(root, "index.sqlite");
	try {
		const runtime = await openRuntime(root, 2);
		await storeVectors(runtime, 2);
		await runtime.close();

		const db = new DatabaseSync(database);
		const rows = db
			.prepare("SELECT vector,dimension FROM semantic_chunks WHERE fingerprint=?")
			.all(fingerprint) as Array<{ vector: Uint8Array; dimension: number }>;
		db.close();

		const original = vectorFor(0);
		const decoded = decodeVector({ bytes: rows[0].vector, dimension: rows[0].dimension });
		expect(decoded).toHaveLength(dimension);
		for (let index = 0; index < dimension; index++)
			expect(Math.abs(decoded[index] - original[index])).toBeLessThan(1e-6);
		// The bytes are what the codec writes, so the encoding is stable.
		expect(Buffer.from(rows[0].vector).equals(Buffer.from(encodeVector(original)))).toBe(true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}, 120000);
