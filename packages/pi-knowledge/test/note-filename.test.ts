import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createKnowledgeIndexRuntime } from "../src/core/index-runtime.js";
import { createLocalKnowledgeIndexFiles } from "../src/core/index-runtime-local.js";
import { backfillNoteFilenames, noteFilename } from "../src/core/note-filename.js";

/**
 * KP5b — the note filename.
 *
 * A bare `[[name]]` link is resolved by matching the note's filename.  The
 * old query was `path LIKE '%/<name>'`, which has to read every path in the
 * index; the new one is an index seek on a filename column.
 *
 * The column has to match the old query **exactly**, or a link that used to
 * resolve stops resolving.  These tests pin the two cases where the naive
 * reading of "the file name" is wrong.
 */

describe("the note filename", () => {
	it("takes the last segment of the path", () => {
		expect(noteFilename("Library/Papers/a.md")).toBe("a.md");
		expect(noteFilename("Library/Sub/dir/c.md")).toBe("c.md");
	});

	it("takes the last segment, not the first", () => {
		// The old query was `path LIKE '%/<name>'`, which matches the *tail*
		// of the path.  A note in a directory whose name ends in the link
		// target must not be matched on the directory.
		expect(noteFilename("Library/Methods/b.md")).toBe("b.md");
	});

	it("gives a root note no filename, because a bare link cannot reach it", () => {
		// `path LIKE '%/Top.md'` did not match `Top.md`, so a root note was
		// not reachable by a bare link.  An empty filename keeps it that way.
		expect(noteFilename("Top.md")).toBe("");
	});

	it("keeps the filename of a note directly under the root", () => {
		expect(noteFilename("/root.md")).toBe("root.md");
	});
});

describe("the filename column against the old query", () => {
	it("selects the same notes as the leading-wildcard query", () => {
		const db = new DatabaseSync(":memory:");
		db.exec("CREATE TABLE notes(path TEXT NOT NULL UNIQUE, filename TEXT NOT NULL DEFAULT '')");
		const paths = [
			"Library/Papers/a.md",
			"Library/Methods/b.md",
			"Library/Sub/dir/c.md",
			"Library/Papers/d.md",
			"Top.md",
			"/root.md",
			"Library/Papers/a.md.bak",
		];
		for (const path of paths) db.prepare("INSERT INTO notes(path) VALUES(?)").run(path);
		backfillNoteFilenames(db);
		db.exec("CREATE INDEX notes_filename ON notes(filename)");

		const targets = ["a.md", "b.md", "c.md", "d.md", "Top.md", "root.md", "a.md.bak", "missing.md"];
		for (const target of targets) {
			const old = db
				.prepare("SELECT path FROM notes WHERE path LIKE ? ORDER BY path")
				.all(`%/${target}`)
				.map((row) => (row as { path: string }).path);
			const current = db
				.prepare("SELECT path FROM notes WHERE filename=? ORDER BY path")
				.all(target)
				.map((row) => (row as { path: string }).path);
			expect(current).toEqual(old);
		}
		db.close();
	});
});

describe("the filename lookup", () => {
	it("seeks the index instead of scanning the notes", () => {
		const db = new DatabaseSync(":memory:");
		db.exec("CREATE TABLE notes(path TEXT NOT NULL UNIQUE, filename TEXT NOT NULL DEFAULT '')");
		db.exec("CREATE INDEX notes_filename ON notes(filename)");

		const plan = db
			.prepare("EXPLAIN QUERY PLAN SELECT path FROM notes WHERE filename=? LIMIT 2")
			.all("a.md")
			.map((row) => String((row as { detail: string }).detail));
		// The plan is a structural fact, not a timing: it does not change with
		// the machine's speed or its load, so the guard cannot flake.
		expect(plan.join(" ")).toContain("USING INDEX notes_filename");
		expect(plan.join(" ")).not.toContain("SCAN notes");
		db.close();
	});

	it("scanned the notes before the filename column existed", () => {
		// The old query matched the path with a leading wildcard, which has no
		// index to use: `LIKE '%/name'` cannot seek, so it reads every path.
		const db = new DatabaseSync(":memory:");
		db.exec("CREATE TABLE notes(path TEXT NOT NULL UNIQUE)");
		const plan = db
			.prepare("EXPLAIN QUERY PLAN SELECT path FROM notes WHERE path LIKE ? LIMIT 2")
			.all("%/a.md")
			.map((row) => String((row as { detail: string }).detail));
		expect(plan.join(" ")).toContain("SCAN notes");
		db.close();
	});
});

describe("the runtime's link lookup", () => {
	it("seeks the filename index rather than scanning the notes", async () => {
		const root = await realpath(await mkdtemp(join(tmpdir(), "pi-knowledge-filename-")));
		try {
			const runtime = await openRuntime(root, 40);
			const status = await runtime.request<{ stats: { linkLookupPlan: string } }>("status", {});
			// The plan is a structural fact, not a timing: it does not change
			// with the machine's speed or its load, so the guard cannot flake.
			expect(status.stats.linkLookupPlan).toContain("USING INDEX notes_filename");
			expect(status.stats.linkLookupPlan).not.toContain("SCAN notes");
			await runtime.close();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}, 120000);
});

/** Opens a real index over a small Vault, the way the worker does. */
async function openRuntime(root: string, noteCount: number) {
	const vault = join(root, "Vault");
	for (let index = 0; index < noteCount; index++) {
		const absolute = join(vault, `Library/Papers/note-${String(index).padStart(5, "0")}.md`);
		await mkdir(join(absolute, ".."), { recursive: true });
		await writeFile(absolute, `# Note ${index}\n\nsynthetic material\n`);
	}
	let receive:
		| ((message: { id: number; op: string; args?: Record<string, unknown> }) => Promise<void>)
		| null = null;
	let next = 0;
	const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
	const runtime = await createKnowledgeIndexRuntime(
		{ database: join(root, "index.sqlite"), backgroundReconcile: false },
		{ ...createLocalKnowledgeIndexFiles(vault), watch: null },
		{
			onMessage: (handler) => {
				receive = handler;
			},
			close: () => undefined,
			send(message: object) {
				const payload = message as {
					id?: number;
					ready?: boolean;
					uiChanged?: boolean;
					error?: string;
					result?: unknown;
				};
				if (payload.ready || payload.uiChanged) return;
				if (payload.id === undefined) return;
				const request = pending.get(payload.id);
				if (!request) return;
				pending.delete(payload.id);
				if (payload.error) request.reject(new Error(payload.error));
				else request.resolve(payload.result);
			},
		},
	);
	const request = async <T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<T> => {
		const id = ++next;
		const response = new Promise<T>((resolve, reject) =>
			pending.set(id, { resolve: resolve as (value: unknown) => void, reject }),
		);
		if (!receive) throw new Error("The runtime never registered a message handler");
		await receive({ id, op, args });
		return response;
	};
	await request("reconcile", { force: true });
	return { request, close: () => runtime.close() };
}
