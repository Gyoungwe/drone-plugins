import { noteScope, validateNote } from "./files.js";
import { noteDisplayTitle } from "./note-title.js";
import { tokenizeKnowledgeText } from "./search-policy.js";

/**
 * KP4 — the note write, split into a prepare phase and an apply phase.
 *
 * A cold index used to write one note per transaction, and each transaction
 * cost a `BEGIN IMMEDIATE`, a `COMMIT`, and a WAL write.  Grouping the writes
 * into one transaction is the fix — but a transaction may not span an `await`,
 * because it would hold the database's write lock while the filesystem is
 * read, and any other writer (a note that changed while the app was running)
 * would fail with "cannot start a transaction within a transaction".
 *
 * So the write is split:
 *
 * - **Prepare** does the filesystem work and computes everything the write
 *   needs.  It awaits, and it holds no lock.
 * - **Apply** does only the database statements.  It never awaits.
 *
 * The reconcile prepares a group of notes and then applies the whole group in
 * one transaction, so the transaction spans only the statements.
 *
 * The split also means the incremental path — one note that changed while the
 * app was running — can prepare and apply on its own, in its own
 * transaction, at any time.  It never joins the reconcile's transaction, so a
 * note the user just wrote is never rolled back with a batch.
 */

/** The parts of a note row the write path reads. */
export interface PreviousNote {
	id: number;
	path: string;
	title: string;
	body: string;
	hash: string;
	signature: string;
	scope: string;
	kind: string;
	bytes: number;
}

/** What the filesystem returned for a note. */
export interface NoteFile {
	text: string;
	hash: string;
	signature: string;
	bytes: number;
}

/** Everything the write of one note needs, computed before the transaction. */
export interface PreparedNote {
	path: string;
	previous: PreviousNote | null;
	file: NoteFile;
	title: string;
	kind: string;
	scope: string;
	/** The tokenized body, for the search index. */
	terms: string;
	/** The tokenized title, for the search index. */
	titleTerms: string;
	/** The note's internal links, resolved to note paths. */
	links: string[];
}

/** What the prepare phase decided to do with a note. */
export type NoteUpdate =
	/** The file is unchanged; there is nothing to write. */
	| { kind: "unchanged"; path: string; previous: PreviousNote | null }
	/** The body is unchanged; only the signature moved. */
	| { kind: "signature"; path: string; previous: PreviousNote | null; file: NoteFile }
	/** The note must be written. */
	| { kind: "write"; note: PreparedNote }
	/** The note is unreadable and must leave the index. */
	| { kind: "remove"; path: string; previous: PreviousNote | null };

/**
 * The database side of a note write.
 *
 * The runtime owns the prepared statements and the revision counter, so it
 * passes them in rather than this module reaching for the connection.
 */
export interface NoteWriteSink {
	/** The note row currently stored for a path, if any. */
	get(path: string): PreviousNote | null;
	/** Removes a note's rows from the search index. */
	removeFts(id: number): void;
	/** Removes a note from the index entirely. */
	remove(path: string): void;
	/** Removes a note's semantic chunks. */
	semanticDelete(path: string): void;
	/** Writes the note row. */
	upsertNote(note: PreparedNote): void;
	/** Writes the note's search row. */
	insertSearch(id: number, titleTerms: string, terms: string): void;
	/** Removes the note's outgoing links. */
	clearLinks(path: string): void;
	/** Records one outgoing link. */
	addLink(path: string, target: string): void;
	/** Clears the note's recorded problem. */
	clearProblem(path: string): void;
	/** Advances the index revision. */
	bump(): void;
	/** Records the note's dependents and jobs. */
	changed(path: string, previous: PreviousNote | null): void;
}

/** The links a note points at, resolved to note paths. */
export function internalLinks(path: string, text: string): Set<string> {
	const out = new Set<string>();
	for (const match of text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
		let target = match[1].trim();
		if (!target.includes("/")) {
			// Only unambiguous root or sibling links are treated as dependency edges.
			target =
				["Home", "Index", "Context"].includes(target) && target !== "Home"
					? `${path.split("/").slice(0, -1).join("/")}/${target}`
					: target;
		}
		if (!target.endsWith(".md")) target += ".md";
		try {
			validateNote(target);
			out.add(target);
		} catch {
			/* unsafe/external link: never followed */
		}
	}
	return out;
}

/** The kind a note is filed under. */
export function noteKind(path: string): string {
	if (/(?:^|\/)(?:Index|Context|Home)\.md$/i.test(path)) return "navigation";
	if (/(?:^|\/)Wiki\//.test(path)) return "wiki";
	if (path.startsWith("Library/Explainers/")) return "explainer";
	return "note";
}

/**
 * Computes what a note's write needs, without touching the database.
 *
 * The caller has already read the file; this turns it into the values the
 * write will store.  Nothing here awaits, so a group of notes can be
 * prepared and then applied in one transaction.
 */
export function prepareNote(path: string, previous: PreviousNote | null, file: NoteFile): PreparedNote {
	const title = noteDisplayTitle(file.text, path);
	return {
		path,
		previous,
		file,
		title,
		kind: noteKind(path),
		scope: noteScope(path),
		terms: tokenizeKnowledgeText(file.text).join(" "),
		titleTerms: tokenizeKnowledgeText(title).join(" "),
		links: [...internalLinks(path, file.text)],
	};
}

/**
 * Applies a prepared note write.
 *
 * The note is re-read inside the write lock: another worker on the same
 * database may have indexed this path after `previous` was read, so
 * `previous` can be stale.
 *
 * This function must not await.  It runs inside the caller's transaction,
 * and a transaction that spans an `await` holds the write lock while the
 * filesystem is read.
 */
export function applyNoteWrite(note: PreparedNote, sink: NoteWriteSink): void {
	const { path, file } = note;
	const current = sink.get(path);
	if (current) sink.removeFts(current.id);
	if (current && (current.hash !== file.hash || current.signature !== file.signature))
		sink.semanticDelete(path);
	sink.upsertNote(note);
	const row = sink.get(path);
	if (!row) return;
	sink.removeFts(row.id);
	sink.insertSearch(row.id, note.titleTerms, note.terms);
	sink.clearLinks(path);
	for (const target of note.links) sink.addLink(path, target);
	sink.clearProblem(path);
	sink.bump();
	sink.changed(path, note.previous);
}

/** Applies a signature-only update: the body did not change, only its stamp. */
export function applySignatureUpdate(
	path: string,
	file: NoteFile,
	sink: NoteWriteSink,
	setSignature: (path: string, signature: string) => void,
): void {
	setSignature(path, file.signature);
	sink.clearProblem(path);
}

/** Applies a removal: the note is unreadable and must leave the index. */
export function applyNoteRemoval(path: string, previous: PreviousNote | null, sink: NoteWriteSink): void {
	if (!previous) return;
	const current = sink.get(path);
	if (current) sink.removeFts(current.id);
	sink.remove(path);
	sink.semanticDelete(path);
	sink.clearLinks(path);
	sink.bump();
	sink.changed(path, previous);
}
