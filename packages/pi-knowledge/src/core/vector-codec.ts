/**
 * KP2 — the vector codec.
 *
 * A semantic vector used to be stored as a JSON text string.  For a
 * 768-dimension vector that is about 15 KB of text, where the same numbers
 * take 3 KB as Float32.  The text also had to be parsed back on every
 * semantic search, for every candidate row.
 *
 * The stored form is a Float32 blob: the components little-endian, back to
 * back, in the order the model produced them.
 *
 * ## The precision question
 *
 * Float32 keeps about seven significant digits, so a component comes back
 * with an absolute error of roughly 1e-8.  A cosine similarity between two
 * such vectors shifts by far less than that, and the search compares the
 * score against a threshold like 0.5 — so the rounding cannot change which
 * note wins.  It could change a score in the last decimal place, which is
 * below what the search reports.
 *
 * ## The norm
 *
 * The search compares a stored vector against a query with a cosine
 * similarity, which needs the length of the stored vector.  Computing it
 * costs a pass over the vector for every candidate row.  The norm is stored
 * beside the vector instead, so the search reads a number rather than
 * measuring the vector.
 *
 * The norm is stored as Float64, because it is a sum over the vector and a
 * Float32 accumulator would lose more than the vector itself.
 */

/** How the vectors are laid out in the database. */
export type VectorStorage = "json" | "blob";

/** The stored form of one vector, with its length. */
export interface StoredVector {
	/** The Float32 bytes, little-endian, or the JSON text for a legacy row. */
	bytes: Uint8Array;
	/** The number of components. */
	dimension: number;
	/** The vector's length, for a blob.  `null` for a legacy JSON row. */
	norm: number | null;
	/** How the bytes are to be read. */
	storage: VectorStorage;
}

/** The bytes per component in a Float32 vector. */
export const FLOAT32_BYTES = 4;

/**
 * Encodes a vector as Float32 bytes.
 *
 * The components are written little-endian, which is what the decoder reads
 * back.  A value that is not finite cannot be encoded, and the caller must
 * have rejected it before this point — the search path validates vectors
 * before they reach the database.
 */
export function encodeVector(vector: readonly number[]): Uint8Array {
	const bytes = new Uint8Array(vector.length * FLOAT32_BYTES);
	const view = new DataView(bytes.buffer);
	for (let index = 0; index < vector.length; index++)
		view.setFloat32(index * FLOAT32_BYTES, vector[index], true);
	return bytes;
}

/**
 * The length of a vector.
 *
 * The sum is accumulated in Float64, so the result does not lose precision
 * the way a Float32 accumulator would over a few thousand components.
 */
export function vectorNorm(vector: readonly number[]): number {
	let sum = 0;
	for (const component of vector) sum += component * component;
	return Math.sqrt(sum);
}

/**
 * Decodes a stored vector into its components.
 *
 * A legacy JSON row is decoded as well, so the migration can be a plain
 * read: the caller writes the result back in the new form.
 */
export function decodeVector(row: { bytes: Uint8Array | string; dimension: number }): number[] {
	if (typeof row.bytes === "string") {
		const parsed = JSON.parse(row.bytes);
		if (!Array.isArray(parsed)) throw new Error("Stored vector is not an array");
		return parsed.map((component) => Number(component));
	}
	const view = new DataView(row.bytes.buffer, row.bytes.byteOffset, row.bytes.byteLength);
	const values: number[] = [];
	for (let index = 0; index < row.dimension; index++)
		values.push(view.getFloat32(index * FLOAT32_BYTES, true));
	return values;
}

/**
 * The norm of a stored vector.
 *
 * A blob carries its norm, so the search does not measure the vector.  A
 * legacy JSON row does not, so the norm is computed from the components that
 * were already decoded — the caller passes them in rather than the row, so
 * the vector is not decoded twice.
 */
export function storedVectorNorm(
	decoded: readonly number[],
	row: { bytes: Uint8Array | string; dimension: number },
	norm?: number | null,
): number {
	if (typeof row.bytes !== "string" && typeof norm === "number" && Number.isFinite(norm)) return norm;
	return vectorNorm(decoded);
}

/**
 * The cosine similarity between a query and a stored vector.
 *
 * The stored norm replaces measuring the vector: a cosine similarity needs
 * the length of the stored vector, and reading a number is cheaper than
 * walking 768 components for every candidate row.
 *
 * A component that is not finite poisons the score, and a poisoned score is
 * not a number, so the caller skips the row.
 */
export function cosineSimilarity(
	query: readonly number[],
	stored: readonly number[],
	storedNorm: number,
): number {
	let dot = 0;
	let queryNorm = 0;
	for (let index = 0; index < query.length; index++) {
		const q = query[index];
		const v = stored[index];
		if (typeof q !== "number" || !Number.isFinite(q) || typeof v !== "number" || !Number.isFinite(v))
			return Number.NaN;
		dot += q * v;
		queryNorm += q * q;
	}
	return dot / Math.sqrt(queryNorm * storedNorm * storedNorm);
}
