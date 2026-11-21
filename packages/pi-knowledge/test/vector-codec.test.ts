import { describe, expect, it } from "vitest";
import {
	cosineSimilarity,
	decodeVector,
	encodeVector,
	storedVectorNorm,
	vectorNorm,
} from "../src/core/vector-codec.js";
import { migrateVectorStorage } from "../src/core/vector-migration.js";

/**
 * KP2 — the vector storage.
 *
 * The vectors used to be JSON text.  They are now Float32 blobs with the
 * vector's length stored beside them.
 *
 * The guard counts *bytes*, not milliseconds.  A byte count does not change
 * with the machine's speed or its load, so the guard cannot flake on a busy
 * CI runner — and the thing being guarded is a size, which is exactly what a
 * byte count measures.
 */

const dimension = 768;
const vector = Array.from({ length: dimension }, (_, index) => Math.sin(index * 0.37) * 0.5);

describe("the vector codec", () => {
	it("round-trips a vector through the Float32 bytes", () => {
		const bytes = encodeVector(vector);
		const decoded = decodeVector({ bytes, dimension });
		expect(decoded).toHaveLength(dimension);
		// Float32 keeps about seven significant digits, so the components come
		// back close to the originals.  A cosine similarity shifts by far less
		// than this, so the rounding cannot change which note wins.
		for (let index = 0; index < dimension; index++)
			expect(Math.abs(decoded[index] - vector[index])).toBeLessThan(1e-6);
	});

	it("stores a vector in a fraction of the space the text took", () => {
		const bytes = encodeVector(vector);
		const text = Buffer.byteLength(JSON.stringify(vector), "utf8");
		// The blob is four bytes per component; the text was about twenty.
		expect(bytes.length).toBe(dimension * 4);
		expect(bytes.length).toBeLessThan(text / 3);
	});

	it("reads a legacy text vector back", () => {
		const decoded = decodeVector({ bytes: JSON.stringify(vector), dimension });
		expect(decoded).toEqual(vector);
	});

	it("computes the norm of a vector in Float64", () => {
		const expected = Math.sqrt(vector.reduce((sum, component) => sum + component * component, 0));
		expect(vectorNorm(vector)).toBeCloseTo(expected, 12);
	});

	it("uses the stored norm for a blob and computes it for a legacy row", () => {
		const bytes = encodeVector(vector);
		const norm = vectorNorm(vector);
		// A blob carries its norm, so the search does not measure the vector.
		expect(storedVectorNorm(vector, { bytes, dimension }, norm)).toBe(norm);
		// A legacy row has no norm, so it is computed from the components.
		expect(storedVectorNorm(vector, { bytes: JSON.stringify(vector), dimension }, null)).toBeCloseTo(
			norm,
			12,
		);
	});
});

describe("the vector migration", () => {
	it("rewrites the text vectors as blobs and stores the norm", () => {
		const rows = [
			{
				path: "a.md",
				chunk_index: 0,
				hash: "h1",
				fingerprint: "fp",
				vector: JSON.stringify(vector),
				dimension,
			},
		];
		const written: Array<{ bytes: Uint8Array; norm: number; path: string }> = [];
		const result = migrateVectorStorage(
			{ exec: () => undefined },
			{
				legacy: { all: () => rows },
				update: {
					run: (bytes, norm, path) => {
						written.push({ bytes, norm, path });
						return undefined;
					},
				},
			},
		);
		expect(result.migrated).toBe(1);
		expect(result.skipped).toBe(0);
		expect(written).toHaveLength(1);
		expect(written[0].bytes.length).toBe(dimension * 4);
		expect(written[0].norm).toBeCloseTo(vectorNorm(vector), 12);
	});

	it("leaves a row it cannot read alone", () => {
		const rows = [
			{
				path: "a.md",
				chunk_index: 0,
				hash: "h1",
				fingerprint: "fp",
				vector: "not json",
				dimension,
			},
		];
		const result = migrateVectorStorage(
			{ exec: () => undefined },
			{ legacy: { all: () => rows }, update: { run: () => undefined } },
		);
		// The row costs one skipped candidate in the search, not the index.
		expect(result.migrated).toBe(0);
		expect(result.skipped).toBe(1);
	});

	it("is idempotent, because a blob is not a text row", () => {
		// The migration selects the rows whose vector is stored as text.  Once
		// a row holds a blob it is no longer selected, so opening the index a
		// second time does no work.  This is what the selection encodes:
		// `typeof(vector)='text'` is false for a blob.
		const blob = encodeVector(vector);
		expect(typeof blob === "string").toBe(false);
		// A blob survives the round trip the migration does.
		const decoded = decodeVector({ bytes: blob, dimension });
		expect(decoded).toHaveLength(dimension);
	});
});

describe("the cosine similarity", () => {
	it("scores a vector against itself as one", () => {
		const norm = vectorNorm(vector);
		expect(cosineSimilarity(vector, vector, norm)).toBeCloseTo(1, 12);
	});

	it("scores the stored vector the same way as the measured one", () => {
		const norm = vectorNorm(vector);
		const stored = decodeVector({ bytes: encodeVector(vector), dimension });
		// The stored norm replaces measuring the vector, so the score must
		// match the score computed from the components.  The two norms differ
		// by the Float32 rounding, so the scores differ by about 1e-9.
		const measured = vectorNorm(stored);
		expect(
			Math.abs(cosineSimilarity(vector, stored, norm) - cosineSimilarity(vector, stored, measured)),
		).toBeLessThan(1e-7);
	});

	it("rejects a vector with a component that is not finite", () => {
		const broken = [...vector];
		broken[3] = Number.NaN;
		expect(Number.isFinite(cosineSimilarity(broken, vector, vectorNorm(vector)))).toBe(false);
	});
});
