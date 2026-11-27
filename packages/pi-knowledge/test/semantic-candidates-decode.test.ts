import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { semanticCandidates } from "../src/core/semantic-candidates.js";
import {
	cosineSimilarity,
	cosineWithQueryNorm,
	decodeVector,
	decodeVectorInto,
	encodeVector,
	squaredNorm,
	storedVectorNorm,
	vectorNorm,
} from "../src/core/vector-codec.js";

const dimension = 768;

function randomGenerator(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 0x1_0000_0000;
	};
}

it("scores blobs bit-for-bit like the existing decoder for seeded vectors", () => {
	const random = randomGenerator(0x619);
	const query = Array.from({ length: dimension }, (_, index) => {
		const value = random() * 2 - 1;
		return index % 23 === 0 ? value * 1e-12 : value;
	});
	const queryNorm = squaredNorm(query);
	const target = new Float32Array(dimension);
	for (let vectorIndex = 0; vectorIndex < 200; vectorIndex++) {
		const vector = Array.from({ length: dimension }, (_, index) => {
			const value = random() * 2 - 1;
			return index % 29 === 0 ? value * 1e-12 : value;
		});
		const row = { bytes: encodeVector(vector), dimension };
		const decoded = decodeVector(row);
		const norm = vectorNorm(vector);
		expect(decodeVectorInto(row, target)).toBe(true);
		expect(
			Object.is(cosineWithQueryNorm(query, queryNorm, target, norm), cosineSimilarity(query, decoded, norm)),
		).toBe(true);
	}
});

it("decodes a blob whose byte offset is not aligned", () => {
	const expected = [0.25, -0.5, 0.75, -1.125];
	const encoded = encodeVector(expected);
	const backing = new Uint8Array(encoded.length + 2);
	const unaligned = backing.subarray(1, 1 + encoded.length);
	unaligned.set(encoded);
	expect(unaligned.byteOffset % 4).not.toBe(0);
	const target = new Float32Array(expected.length);
	expect(decodeVectorInto({ bytes: unaligned, dimension: expected.length }, target)).toBe(true);
	expect(Array.from(target)).toEqual(decodeVector({ bytes: unaligned, dimension: expected.length }));
	expect(decodeVector({ bytes: unaligned, dimension: expected.length })).toEqual(expected);
});

it("validates blob and target lengths, and leaves JSON targets untouched", () => {
	expect(() => decodeVectorInto({ bytes: new Uint8Array(4), dimension: 2 }, new Float32Array(2))).toThrow();
	expect(() => decodeVectorInto({ bytes: encodeVector([1]), dimension: 1 }, new Float32Array(2))).toThrow();
	const target = new Float32Array([7, 9]);
	expect(decodeVectorInto({ bytes: "[1,2]", dimension: 2 }, target)).toBe(false);
	expect(Array.from(target)).toEqual([7, 9]);
});

it("returns NaN when a stored component is not finite", () => {
	expect(Number.isNaN(cosineWithQueryNorm([1, 0], 1, [Number.NaN, 0], 1))).toBe(true);
	expect(Number.isNaN(cosineWithQueryNorm([1, 0], 1, [1, Number.POSITIVE_INFINITY], 1))).toBe(true);
});

it("keeps candidate results equal across blobs, legacy rows, and invalid dimensions", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-knowledge-semantic-decode-"));
	const database = join(root, "index.sqlite");
	const fingerprint = "decode-test";
	const query = [0.6, 0.8];
	const rows = [
		{ path: "Library/blob.md", bytes: encodeVector([1, 0]), dimension: 2, norm: 1 },
		{ path: "Library/legacy.md", bytes: "[0,1]", dimension: 2, norm: null },
		{ path: "Library/wrong-dimension.md", bytes: encodeVector([0.8, 0.6]), dimension: 3, norm: 1 },
		{ path: "Library/null-norm.md", bytes: encodeVector([0.6, 0.8]), dimension: 2, norm: null },
	];
	const db = new DatabaseSync(database);
	try {
		db.exec("CREATE TABLE notes(path TEXT PRIMARY KEY, title TEXT, hash TEXT, scope TEXT, kind TEXT)");
		db.exec(
			"CREATE TABLE semantic_chunks(path TEXT, chunk_index INTEGER, hash TEXT, fingerprint TEXT, vector BLOB, dimension INTEGER, norm REAL, start_char INTEGER, end_char INTEGER, PRIMARY KEY(path, chunk_index, hash, fingerprint))",
		);
		const insertNote = db.prepare("INSERT INTO notes VALUES(?,?,?,?,?)");
		const insertChunk = db.prepare("INSERT INTO semantic_chunks VALUES(?,?,?,?,?,?,?,?,?)");
		for (const [index, row] of rows.entries()) {
			const hash = `hash-${index}`;
			insertNote.run(row.path, row.path, hash, "shared", "note");
			insertChunk.run(row.path, index, hash, fingerprint, row.bytes, row.dimension, row.norm, null, null);
		}
		const expected = rows
			.map((row, chunkIndex) => ({ row, chunkIndex }))
			.filter(({ row }) => row.dimension === query.length)
			.map(({ row, chunkIndex }) => {
				const decoded = decodeVector({ bytes: row.bytes, dimension: row.dimension });
				const score = cosineSimilarity(query, decoded, storedVectorNorm(decoded, row, row.norm));
				return { path: row.path, score, chunkIndex };
			})
			.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
		const actual = semanticCandidates(db, { vector: query, fingerprint }).items.map(
			({ path, score, chunkIndex }) => ({ path, score, chunkIndex }),
		);
		expect(actual).toEqual(expected);
	} finally {
		db.close();
		await rm(root, { recursive: true, force: true });
	}
});
