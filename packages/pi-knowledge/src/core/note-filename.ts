/**
 * KP5b — the note's filename.
 *
 * A bare `[[name]]` link names a note by its file name.  Resolving one used
 * to match the path with a leading wildcard, `path LIKE '%/<name>'`, which
 * has to read every path in the index.
 *
 * The filename is now a column with an index on it.  The column holds the
 * **last** segment of the path, and the lookup requires a directory, so the
 * new column matches the old query exactly:
 *
 * - `LIKE '%/a.md'` matched `Library/Papers/a.md` and `Library/Sub/dir/a.md`
 *   — the last segment, and a directory before it.
 * - `LIKE '%/Top.md'` did **not** match `Top.md` — a note at the root of the
 *   Vault was not reachable by a bare link.
 *
 * So the filename of a root note is stored as the empty string: it has no
 * directory before it, and a bare link must not find it.
 */

/**
 * The filename of a note, or the empty string for a note at the root.
 *
 * The empty string is not a name any link can use, so a root note stays
 * unreachable by a bare link — the same as before the column existed.
 */
export function noteFilename(path: string): string {
	const separator = path.lastIndexOf("/");
	if (separator < 0) return "";
	return path.slice(separator + 1);
}

/** The database the backfill reads and writes. */
export interface FilenameStore {
	exec(sql: string): void;
	prepare(sql: string): {
		all(): Array<Record<string, unknown>>;
		run(...params: unknown[]): unknown;
	};
}

/**
 * Fills in the filename of every note that does not have one.
 *
 * The column is rebuildable from the path, so the existing rows are filled
 * in one pass rather than by re-reading the Vault.  The rows are read and
 * written inside the caller's transaction, so the column is never half
 * filled.
 */
export function backfillNoteFilenames(database: FilenameStore): number {
	const rows = database.prepare("SELECT path FROM notes WHERE filename = ''").all();
	if (!rows.length) return 0;
	const update = database.prepare("UPDATE notes SET filename=? WHERE path=?");
	for (const row of rows) update.run(noteFilename(String(row.path)), String(row.path));
	return rows.length;
}

/**
 * Adds the filename column and its index to an index written before KP5b.
 *
 * The column is rebuildable from the path, so the existing rows are filled
 * in one pass rather than by re-reading the Vault.  The fill runs in one
 * transaction, so the column is never half filled: a failure rolls it back
 * and the index keeps working without the column.
 *
 * The index is created after the fill, so the fill does not pay to maintain
 * the index it is about to fill.
 */
export function ensureNoteFilenameColumn(database: FilenameStore): void {
	const columns = database
		.prepare("PRAGMA table_info(notes)")
		.all()
		.map((column) => String((column as { name?: string }).name ?? ""));
	if (columns.includes("filename")) return;
	database.exec("ALTER TABLE notes ADD COLUMN filename TEXT NOT NULL DEFAULT ''");
	database.exec("BEGIN IMMEDIATE");
	try {
		backfillNoteFilenames(database);
		database.exec("COMMIT");
	} catch {
		database.exec("ROLLBACK");
	}
	database.exec("CREATE INDEX IF NOT EXISTS notes_filename ON notes(filename)");
}
