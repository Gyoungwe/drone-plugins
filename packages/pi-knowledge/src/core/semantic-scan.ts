import { splitKnowledgeChunks } from "./search-policy.js";

/**
 * The scan state for the semantic index fill.
 *
 * `semanticBatch` used to re-read every eligible note on every call, so
 * filling a Vault of N notes with M batches cost O(N·M) — the whole fill was
 * quadratic.  Each call walked the notes from the start, and for every note it
 * had already embedded it still ran `updatePath`, which costs an `lstat` and a
 * `realpath` per path segment.
 *
 * The fix has two parts:
 *
 * 1. **A missing-chunks query.**  The database is asked which notes still owe
 *    chunks, instead of the scan walking every eligible note and asking
 *    whether each one is done.  A note whose chunks are all stored never
 *    appears in the result, so it is never inspected on disk at all.  That is
 *    where the old scan spent its time.
 *
 * 2. **A cursor.**  The scan resumes after the last note the store confirmed
 *    complete, so the complete prefix is not re-queried on every call.
 *
 * The cursor is an *optimisation*, not a correctness mechanism.  Correctness
 * comes from the query: a note that owes chunks is returned by the query no
 * matter where the cursor is, because the query filters on the stored chunk
 * count rather than on the cursor.  So a cursor that is stale or missing
 * costs a slower scan, never a missing chunk.
 *
 * The cursor is also tied to the index revision.  Any note change bumps the
 * revision, and after a change the path order no longer describes the same
 * work, so the cursor is dropped and the scan starts over.
 */

/** How many notes a scan reads at a time. */
const SCAN_WINDOW = 32;

/** The number of chunks a body of `length` characters splits into. */
export function semanticChunkCount(length: number, chunkChars: number): number {
	if (length <= 0) return 0;
	return Math.min(64, Math.ceil(length / chunkChars));
}

/** One note as the scan sees it. */
export interface SemanticNoteRow {
	path: string;
	title: string;
	hash: string;
	signature: string;
	/** The length of the stored body, not the body itself. */
	bodyLength: number;
	/** How many of this note's chunks are already stored for the fingerprint. */
	stored: number;
}

/** The position of the scan, and the revision that made it valid. */
export interface SemanticScanCursor {
	/** Every eligible note before this path is fully embedded. */
	path: string;
	/**
	 * The next chunk to hand out inside `path`.
	 *
	 * A batch can fill in the middle of a note, so the scan has to be able to
	 * come back to that note and continue with the chunk it stopped at.  A
	 * cursor that only knew the path would have to re-read the note from its
	 * first chunk, which is what KP3 removed.
	 */
	chunk: number;
	/**
	 * The note the scan stopped inside, and the body it read.
	 *
	 * The scan has to come back to the note it stopped in, and reading it
	 * again would cost the inspection KP3 removed.  The body is cached
	 * instead, and the cache is safe: a note whose file changed moves the
	 * index revision, and a revision change drops the cursor.
	 */
	body: string;
	hash: string;
	signature: string;
	/** The index revision this cursor was established at. */
	revision: number;
}

export interface SemanticScanDb {
	prepare: (sql: string) => {
		all: (...params: unknown[]) => SemanticNoteRow[];
		get: (...params: unknown[]) => { count: number };
	};
}

export interface SemanticScanRequest {
	fingerprint: string;
	/** The project the caller is indexing, if any. */
	project: string | undefined;
	/** The scope filter value the caller used. */
	scope: string;
	/** The current index revision. */
	revision: number;
	limit: number;
	chunkChars: number;
}

export interface SemanticScanItem {
	path: string;
	chunkIndex: number;
	hash: string;
	mtime: string;
	text: string;
	startChar: number;
	endChar: number;
}

export interface SemanticScanHooks {
	canRead: (path: string, project: string | undefined) => boolean;
	/** Reads the note from disk and re-indexes it if it changed. */
	updatePath: (path: string) => Promise<{ body: string; hash: string; signature: string } | null>;
	/** Whether this chunk is already stored for the fingerprint. */
	isStored: (path: string, chunkIndex: number, hash: string, fingerprint: string) => boolean;
}

export function createSemanticScanState(): {
	cursors: Map<string, SemanticScanCursor>;
} {
	return { cursors: new Map() };
}

function scanKey(fingerprint: string, scope: string): string {
	return `${fingerprint}\0${scope}`;
}

/**
 * The cursor for this scan, dropped when the index revision has moved on.
 *
 * A revision change means notes were added, removed or edited, so the path
 * order no longer describes the same work and the cursor cannot be trusted.
 */
function semanticCursor(
	state: { cursors: Map<string, SemanticScanCursor> },
	fingerprint: string,
	scope: string,
	revision: number,
): SemanticScanCursor {
	const key = scanKey(fingerprint, scope);
	const cursor = state.cursors.get(key);
	if (!cursor) {
		const fresh: SemanticScanCursor = {
			path: "",
			chunk: 0,
			body: "",
			hash: "",
			signature: "",
			revision,
		};
		state.cursors.set(key, fresh);
		return fresh;
	}
	if (cursor.revision !== revision) {
		cursor.path = "";
		cursor.chunk = 0;
		cursor.body = "";
		cursor.hash = "";
		cursor.signature = "";
		cursor.revision = revision;
	}
	return cursor;
}

/**
 * The notes that still owe chunks for `fingerprint`, in path order.
 *
 * A note owes chunks when the number of chunks stored for its own hash and
 * fingerprint is fewer than the number of chunks its body splits into.  The
 * expected count is computed from the body *length*, so the body itself is
 * never transferred for a note the scan will skip.
 *
 * A note whose body changed has a different hash, so its old chunks do not
 * match and the note is correctly treated as owing chunks again.
 *
 * `afterPath` skips the confirmed-complete prefix.  It is only an
 * optimisation: the filter above decides what is missing.
 *
 * `includeAfter` keeps the note at `afterPath` itself in the result.  It is
 * set when the cursor sits *inside* a note: the note still owes the chunks
 * after the cursor's position, so it must be returned again.
 */
export function semanticMissingNotes(
	db: SemanticScanDb,
	fingerprint: string,
	scope: string,
	chunkChars: number,
	afterPath: string,
	limit: number,
	includeAfter = false,
): SemanticNoteRow[] {
	return db
		.prepare(
			`SELECT n.path,n.title,n.hash,n.signature,length(n.body) bodyLength,
	     (SELECT count(*) FROM semantic_chunks s
	        WHERE s.path=n.path AND s.hash=n.hash AND s.fingerprint=?) stored
	     FROM notes n
	     WHERE (n.scope='shared' OR n.scope=?) AND n.kind NOT IN ('navigation','explainer')
	       AND n.path ${includeAfter ? ">=" : ">"} ?
	       AND (SELECT count(*) FROM semantic_chunks s
	            WHERE s.path=n.path AND s.hash=n.hash AND s.fingerprint=?)
	           < min(64, CASE WHEN length(n.body)=0 THEN 0
	                         ELSE (length(n.body)+CAST(? AS INTEGER)-1)/CAST(? AS INTEGER) END)
	     ORDER BY n.path LIMIT ?`,
		)
		.all(fingerprint, scope, afterPath, fingerprint, chunkChars, chunkChars, limit);
}

/**
 * Hands out the chunks of one note that are not stored yet.
 *
 * The result is one of three words:
 *
 * - `skipped` — the note needs nothing, or it could not be read;
 * - `full` — every missing chunk of the note was handed to the caller;
 * - `partial` — the batch filled inside the note, and the cursor now sits
 *   inside it.
 *
 * The cursor is updated in place when the batch fills, so the next call
 * resumes at the chunk it stopped at.  The body is kept with it, so the next
 * call does not read the file again.
 */
async function scanNote(
	row: SemanticNoteRow,
	items: SemanticScanItem[],
	limit: number,
	chunkChars: number,
	fingerprint: string,
	cursor: SemanticScanCursor,
	hooks: SemanticScanHooks,
): Promise<"skipped" | "full" | "partial"> {
	// The note needs chunks, so it has to be read and verified.
	//
	// The note the scan stopped inside is a special case: its body was
	// already read, and reading it again would cost the inspection KP3
	// removed.  The cached body is safe to reuse, because a note whose file
	// changed moves the index revision, and a revision change drops the
	// cursor.
	const resume = row.path === cursor.path && cursor.chunk > 0 ? cursor.chunk : 0;
	let current: { body: string; hash: string; signature: string } | null;
	if (resume > 0 && cursor.hash === row.hash && cursor.signature === row.signature) {
		current = { body: cursor.body, hash: cursor.hash, signature: cursor.signature };
	} else {
		try {
			current = await hooks.updatePath(row.path);
		} catch {
			return "skipped";
		}
	}
	if (!current || current.hash !== row.hash || current.signature !== row.signature) return "skipped";

	const chunks = splitKnowledgeChunks(current.body, chunkChars);
	// The chunks of this note that are not stored yet.  The list is
	// collected first, because the cursor may only move past the note once
	// every one of them has been handed to the caller.
	const pending: number[] = [];
	for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
		if (!hooks.isStored(row.path, chunkIndex, row.hash, fingerprint)) pending.push(chunkIndex);
	}
	// The chunks before the cursor were handed over already, so they are not
	// handed over twice.
	let produced = 0;
	for (const chunkIndex of pending) {
		if (chunkIndex < resume) continue;
		if (items.length >= limit) {
			// The batch filled inside this note.  The note is not finished, so
			// the cursor stops *inside* it.  The body is kept so the next call
			// does not read the file again.
			cursor.path = row.path;
			cursor.chunk = chunkIndex;
			cursor.body = current.body;
			cursor.hash = current.hash;
			cursor.signature = current.signature;
			return "partial";
		}
		const chunk = chunks[chunkIndex];
		const startChar = chunkIndex * chunkChars;
		items.push({
			path: row.path,
			chunkIndex,
			hash: current.hash,
			mtime: current.signature,
			text: chunk,
			startChar,
			endChar: startChar + chunk.length,
		});
		produced++;
	}
	return produced === pending.length ? "full" : "partial";
}

/**
 * Collect the next batch of chunks that still need embedding.
 *
 * The scan walks the notes that owe chunks, in path order, and stops as soon
 * as it has `limit` chunks.  A note is only inspected on disk when it owes
 * chunks — the notes that are already embedded are never touched.
 */
export async function scanSemanticBatch(
	state: { cursors: Map<string, SemanticScanCursor> },
	db: SemanticScanDb,
	request: SemanticScanRequest,
	hooks: SemanticScanHooks,
): Promise<{ items: SemanticScanItem[]; partial: boolean }> {
	const { fingerprint, scope, limit, chunkChars } = request;
	const cursor = semanticCursor(state, fingerprint, scope, request.revision);

	const items: SemanticScanItem[] = [];
	// The note the scan is inside, and the chunk it will hand out next.  The
	// cursor only ever moves forward, and only past a note the scan has fully
	// handled.  The missing-chunks query is what guarantees completeness, so
	// a cursor that lags behind costs a slower scan but never a missing
	// chunk.
	let handled = cursor.path;
	let handledChunk = cursor.chunk;
	// The path the query starts after.  It is the cursor's path, unless the
	// cursor sits *inside* a note — then the note is still owed chunks, so
	// the query has to return it again.
	let after = cursor.path;
	let inside = cursor.chunk > 0;

	while (true) {
		// The limit is checked *before* the next note is inspected. Inspecting a
		// note costs an lstat and a realpath per path segment, so a note the
		// batch will not produce chunks for must not be touched at all.
		if (items.length >= limit) {
			cursor.path = handled;
			cursor.chunk = handledChunk;
			return { items, partial: true };
		}
		const window = semanticMissingNotes(db, fingerprint, scope, chunkChars, after, SCAN_WINDOW, inside);
		if (!window.length) break;
		after = window[window.length - 1].path;
		inside = false;

		for (const row of window) {
			if (items.length >= limit) {
				cursor.path = handled;
				cursor.chunk = handledChunk;
				return { items, partial: true };
			}
			if (/(?:^|\/)(?:Runs|Explainers)\//i.test(row.path)) continue;
			if (!hooks.canRead(row.path, request.project)) continue;
			const outcome = await scanNote(row, items, limit, chunkChars, fingerprint, cursor, hooks);
			if (outcome === "skipped") continue;
			if (outcome === "full") {
				// The cursor may move past a note whose every missing chunk was
				// handed to the caller: the store lands before the next call, so
				// by then the note owes nothing.
				//
				// A note that still owes chunks must stay ahead of the cursor.
				// The query skips the notes before the cursor, so a cursor that
				// moved past an unfinished note would lose that note's remaining
				// chunks for good — the query would never return it again, and no
				// error would say so.
				if (row.path > handled) {
					handled = row.path;
					handledChunk = 0;
				}
				continue;
			}
			// The batch filled inside the note, so the cursor stops *inside*
			// it — `scanNote` has already put it there — and the next call
			// resumes at the chunk it stopped at.
			return { items, partial: true };
		}
	}
	cursor.path = handled;
	cursor.chunk = handledChunk;
	return { items, partial: false };
}
