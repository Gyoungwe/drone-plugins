/**
 * KP4 — the write path of a cold index.
 *
 * A cold index writes one note at a time, and each note costs its own
 * transaction: a `BEGIN IMMEDIATE`, the writes, a `COMMIT`, and a WAL fsync at
 * the commit. On a Vault of a few thousand notes that is a few thousand
 * commits, and the fsync dominates the wall clock.
 *
 * The batcher changes the *grouping*, not the *semantics*. A group of notes is
 * written in one transaction instead of one transaction each, so the same
 * writes reach the same database in the same order — only the number of
 * commits falls.
 *
 * The batcher is deliberately conservative about what it may group:
 *
 * - **Only the cold path.** A batch is opened by the reconcile walk, which
 *   indexes notes that are not in the database yet. The incremental path — a
 *   note that changed while the app was running — writes on its own, because
 *   its caller expects the write to be visible as soon as it returns.
 *
 * - **The transaction never spans an `await`.** A batch holds the write lock
 *   only while the database statements run, never across a filesystem call.
 *   The caller reads the note first, then hands the finished write to the
 *   batch, so the lock is held for the statements alone.
 *
 * - **A failure rolls the whole batch back.** The notes in a failed batch are
 *   re-indexed on the next reconcile, so losing the batch loses nothing that
 *   was not already lost.
 */

/** How many notes one batch may hold before it commits on its own. */
export const BATCH_LIMIT = 64;

export interface WriteBatch {
	/**
	 * Runs `work` inside the open transaction, opening it first if needed.
	 *
	 * `work` must not await: a transaction held across an `await` would hold
	 * the database's write lock while the filesystem is read.
	 */
	within(work: () => void): void;
	/** Whether the batch currently holds an open transaction. */
	readonly open: boolean;
}

/**
 * A batcher that groups the cold path's writes into one transaction.
 *
 * The transaction is opened by the first write and closed by the commit. The
 * caller decides when to commit; the batcher only decides how many notes
 * share a transaction.
 */
export function createWriteBatcher(exec: (sql: string) => void): {
	/** Opens a batch, or returns the one already open. */
	begin(): WriteBatch;
	/** Commits the open batch, if there is one. */
	commit(): void;
	/** Rolls the open batch back, if there is one. */
	rollback(): void;
	/** The number of transactions committed. */
	commits: () => number;
	/** The number of notes written through the batcher. */
	writes: () => number;
} {
	let open = false;
	let commits = 0;
	let writes = 0;

	function begin(): WriteBatch {
		return {
			get open() {
				return open;
			},
			within(work: () => void) {
				if (!open) {
					exec("BEGIN IMMEDIATE");
					open = true;
				}
				work();
				writes++;
			},
		};
	}

	function commit() {
		if (!open) return;
		try {
			exec("COMMIT");
		} finally {
			open = false;
			commits++;
		}
	}

	function rollback() {
		if (!open) return;
		try {
			exec("ROLLBACK");
		} finally {
			open = false;
		}
	}

	return {
		begin,
		commit,
		rollback,
		commits: () => commits,
		writes: () => writes,
	};
}
