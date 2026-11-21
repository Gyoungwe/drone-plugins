import { BATCH_LIMIT, createWriteBatcher } from "./write-batch.js";

/**
 * KP4 — the cold index's write grouping.
 *
 * A cold index used to write one note per transaction, and each transaction
 * cost a `BEGIN IMMEDIATE`, a `COMMIT`, and a WAL write.  The commit was the
 * wall clock.
 *
 * The batcher groups the notes, but the grouping cannot be done around the
 * read: a transaction that spans an `await` holds the database's write lock
 * while the filesystem is read, and any other writer — a note the user just
 * changed — would fail with "cannot start a transaction within a
 * transaction".
 *
 * So the reconcile is split into two phases:
 *
 * - **Prepare** reads a group of notes and works out what each needs.  This
 *   phase awaits and holds no lock.
 * - **Apply** writes the whole group in one transaction.  This phase never
 *   awaits, so the transaction is held for the statements alone.
 *
 * The group size is a trade-off.  A larger group commits less often, but a
 * failed group loses more notes, and the next reconcile has to re-index them.
 */

/** One prepared update, as the batcher sees it. */
export type PreparedUpdate = { kind: string; path?: string; note?: { path: string } };

/** What the batcher needs from the runtime. */
export interface ReconcileBatchSink<T extends PreparedUpdate> {
	/** Prepares one note: reads it and works out what its write needs. */
	prepare(path: string): Promise<T>;
	/** Applies one prepared update inside the caller's transaction. */
	apply(update: T, transaction: { within(work: () => void): void }): void;
	/** Records a note's failure, so it is visible in the status. */
	problem(path: string, message: string): void;
	/** Counts one committed transaction. */
	committed(): void;
	/** Runs a transaction statement against the database. */
	exec(sql: string): void;
}

/**
 * Writes a walk of notes in groups, one transaction per group.
 *
 * `paths` is the walk: an async generator over the note paths, so the
 * reconcile does not hold every path in memory.
 */
export async function reconcileInBatches<T extends PreparedUpdate>(
	paths: AsyncIterable<string>,
	sink: ReconcileBatchSink<T>,
): Promise<void> {
	const batcher = createWriteBatcher((sql) => sink.exec(sql));
	const batch = batcher.begin();
	const prepared: T[] = [];

	const flush = () => {
		if (!prepared.length) return;
		const group = prepared.splice(0, prepared.length);
		try {
			batch.within(() => {
				for (const update of group) sink.apply(update, batch);
			});
			batcher.commit();
			sink.committed();
		} catch (error) {
			// A failed group loses its notes; the next reconcile re-indexes
			// them, so nothing is lost that was not already lost.
			batcher.rollback();
			const message = String((error as Error).message).slice(0, 400);
			for (const update of group) sink.problem(update.path ?? update.note?.path ?? "", message);
		}
	};

	for await (const path of paths) {
		const update = await sink.prepare(path);
		prepared.push(update);
		if (prepared.length >= BATCH_LIMIT) flush();
	}
	flush();
}
