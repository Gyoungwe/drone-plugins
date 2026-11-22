import { noteFilename } from "./note-filename.js";
import {
	applyNoteRemoval,
	applyNoteWrite,
	applySignatureUpdate,
	type NoteFile,
	type NoteWriteSink,
	type PreparedNote,
	type PreviousNote,
} from "./note-write.js";

/**
 * KP4 — the runtime's side of the note write.
 *
 * The write is split into a prepare phase and an apply phase, so the cold
 * path can group several notes into one transaction.  This module holds the
 * apply phase: it turns a prepared note into the database statements that
 * write it.
 *
 * The apply phase must not await.  It runs inside the caller's transaction,
 * and a transaction that spans an `await` holds the database's write lock
 * while the filesystem is read — which would also fail any other writer with
 * "cannot start a transaction within a transaction".
 */

/** One note row, as the index stores it. */
export type StoredNote = PreviousNote;

/** The prepared statements the write path uses. */
export interface NoteWriteStatements {
	get: { get(path: string): StoredNote | undefined };
	removeFts: { run(id: number): unknown };
	remove: { run(path: string): unknown };
	semanticDelete: { run(path: string): unknown };
	upsertNote: { run(...params: unknown[]): unknown };
	insertSearch: { run(id: number, titleTerms: string, terms: string): unknown };
	setSignature: { run(signature: string, path: string): unknown };
	links: { run(path: string): unknown };
	addLink: { run(path: string, target: string): unknown };
	clearProblem: { run(path: string): unknown };
	problem: { run(path: string, message: string): unknown };
}

/** What the runtime supplies to the write path. */
export interface NoteWriteRuntime {
	statements: NoteWriteStatements;
	/** Advances the index revision. */
	bump(): void;
	/** Records the note's dependents and jobs. */
	changed(path: string, previous: StoredNote | null): void;
}

/** What a prepared update decided to do with a note. */
export type NoteUpdate =
	| { kind: "unchanged"; path: string; previous: StoredNote | null }
	| { kind: "signature"; path: string; previous: StoredNote | null; file: NoteFile }
	| { kind: "remove"; path: string; previous: StoredNote | null; error: NodeJS.ErrnoException }
	| { kind: "write"; path: string; note: PreparedNote };

/**
 * Builds the database side of a note write.
 *
 * The sink is where the prepared statements meet the note's values, so the
 * apply functions in `note-write.ts` stay free of the database.
 */
export function createNoteWriteSink(runtime: NoteWriteRuntime): NoteWriteSink {
	const { statements } = runtime;
	return {
		get: (path) => statements.get.get(path) ?? null,
		removeFts: (id) => statements.removeFts.run(id),
		remove: (path) => statements.remove.run(path),
		semanticDelete: (path) => statements.semanticDelete.run(path),
		upsertNote: (note) => {
			statements.upsertNote.run(
				note.path,
				note.title,
				note.file.text,
				note.file.hash,
				note.file.signature,
				note.scope,
				note.kind,
				note.file.bytes,
				noteFilename(note.path),
			);
		},
		insertSearch: (id, titleTerms, terms) => statements.insertSearch.run(id, titleTerms, terms),
		clearLinks: (path) => statements.links.run(path),
		addLink: (path, target) => statements.addLink.run(path, target),
		clearProblem: (path) => statements.clearProblem.run(path),
		bump: () => runtime.bump(),
		changed: (path, previous) => runtime.changed(path, previous),
	};
}

/**
 * Applies one prepared update inside the caller's transaction.
 *
 * The caller decides the transaction: the reconcile groups its notes into
 * one, and every other path writes on its own.
 *
 * An unreadable note is recorded as a problem and does not fail the group:
 * one bad file must not cost the whole batch its other notes.
 *
 * A note that is simply gone is the one exception.  A file that cannot be
 * read for any other reason — a symlink, a permission error, a path that
 * escapes the Vault — is a fault, not an absence, and the fault is raised
 * again.  Swallowing it would report the note as missing, and the caller
 * would read a symlinked note as if it had never been indexed.
 */
export function applyUpdate(
	update: NoteUpdate,
	transaction: { within(work: () => void): void },
	runtime: NoteWriteRuntime,
	sink: NoteWriteSink,
): StoredNote | null {
	const { statements } = runtime;
	if (update.kind === "unchanged") return statements.get.get(update.path) ?? null;
	if (update.kind === "signature") {
		transaction.within(() =>
			applySignatureUpdate(update.path, update.file, sink, (path, signature) =>
				statements.setSignature.run(signature, path),
			),
		);
		return statements.get.get(update.path) ?? null;
	}
	if (update.kind === "remove") {
		const path: string = update.path;
		const error = update.error;
		const code = error.code ?? "";
		const gone = ["ENOENT", "ENOTDIR"].includes(code);
		if (gone) statements.clearProblem.run(path);
		else statements.problem.run(path, String(error.message).slice(0, 400));
		transaction.within(() => applyNoteRemoval(path, update.previous, sink));
		// A note that is gone leaves the index quietly; a note that cannot be
		// read is a fault, and the fault belongs to the caller.
		if (!gone) throw error;
		return null;
	}
	transaction.within(() => applyNoteWrite(update.note, sink));
	return statements.get.get(update.note.path) ?? null;
}
