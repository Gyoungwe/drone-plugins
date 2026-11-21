import { decodeVector, encodeVector, vectorNorm } from "./vector-codec.js";

/**
 * KP2 — the vector storage migration.
 *
 * The semantic vectors used to be JSON text in the `vector` column.  They are
 * now Float32 blobs, with the vector's length in a `norm` column beside them.
 *
 * The migration runs on open, inside one transaction, and is idempotent: a
 * row whose bytes are already a blob is left alone, so opening the index
 * twice does the work once.
 *
 * **The old data stays until the migration commits.**  The transaction holds
 * the write lock, so a failure rolls the whole migration back and the index
 * is left exactly as it was — with the old text vectors, which still read.
 */

/** The columns the migration reads and writes. */
export interface MigrationStatements {
	/** The rows that still hold a JSON text vector. */
	legacy: {
		all(): Array<{
			path: string;
			chunk_index: number;
			hash: string;
			fingerprint: string;
			vector: string;
			dimension: number;
		}>;
	};
	/** Rewrites one row as a blob. */
	update: {
		run(
			blob: Uint8Array,
			norm: number,
			path: string,
			chunkIndex: number,
			hash: string,
			fingerprint: string,
		): unknown;
	};
}

/** What the migration needs from the database. */
export interface MigrationDatabase {
	exec(sql: string): void;
}

/** One legacy row: a vector still stored as JSON text. */
export interface LegacyVectorRow {
	path: string;
	chunk_index: number;
	hash: string;
	fingerprint: string;
	vector: string;
	dimension: number;
}

/** The database the on-open migration reads and writes. */
export interface MigrationStore {
	exec(sql: string): void;
	prepare(sql: string): { all(): LegacyVectorRow[]; run(...params: unknown[]): unknown };
}

/** How many rows the migration rewrote. */
export interface MigrationResult {
	/** The rows that were rewritten. */
	migrated: number;
	/** The rows that were left alone. */
	skipped: number;
}

/**
 * Rewrites the JSON text vectors as Float32 blobs.
 *
 * The caller owns the transaction.  This function must not await: a
 * transaction that spans an `await` holds the database's write lock across
 * whatever the await is waiting for, and any other writer fails with
 * "cannot start a transaction within a transaction".
 */
export function migrateVectorStorage(
	database: MigrationDatabase,
	statements: MigrationStatements,
): MigrationResult {
	const rows = statements.legacy.all();
	let migrated = 0;
	let skipped = 0;
	for (const row of rows) {
		let components: number[];
		try {
			components = decodeVector({ bytes: row.vector, dimension: row.dimension });
		} catch {
			// A row that cannot be read is left as it is.  The search skips a
			// vector it cannot parse, so the row costs one skipped candidate
			// rather than the whole index.
			skipped++;
			continue;
		}
		if (components.length !== row.dimension) {
			skipped++;
			continue;
		}
		const norm = vectorNorm(components);
		if (!Number.isFinite(norm) || !(norm > 0)) {
			// A zero or non-finite norm cannot be scored against a query, so
			// there is nothing to keep.
			skipped++;
			continue;
		}
		statements.update.run(
			encodeVector(components),
			norm,
			row.path,
			row.chunk_index,
			row.hash,
			row.fingerprint,
		);
		migrated++;
	}
	return { migrated, skipped };
}

/**
 * Rewrites the JSON text vectors in a real index.
 *
 * The migration runs on open, inside one transaction, and is idempotent: a
 * row whose vector is already a blob is not a text row, so it is not
 * selected and not rewritten.  A failure rolls the whole migration back, so
 * the index keeps the old text vectors — which still read.
 *
 * The transaction is the point.  It holds the write lock, so the old data
 * stays readable until the new data is committed, and a failure leaves the
 * index exactly as it was.
 */
export function migrateVectorStorageOnOpen(database: MigrationStore): MigrationResult {
	const legacy = database
		.prepare(
			"SELECT path,chunk_index,hash,fingerprint,vector,dimension FROM semantic_chunks WHERE typeof(vector)='text'",
		)
		.all() as LegacyVectorRow[];
	if (!legacy.length) return { migrated: 0, skipped: 0 };

	database.exec("BEGIN IMMEDIATE");
	try {
		const update = database.prepare(
			"UPDATE semantic_chunks SET vector=?, norm=? WHERE path=? AND chunk_index=? AND hash=? AND fingerprint=?",
		);
		const result = migrateVectorStorage(database, { legacy: { all: () => legacy }, update });
		database.exec("COMMIT");
		if (result.migrated) database.prepare("INSERT OR REPLACE INTO meta VALUES('vectorStorage',1)").run();
		return result;
	} catch {
		database.exec("ROLLBACK");
		return { migrated: 0, skipped: legacy.length };
	}
}
