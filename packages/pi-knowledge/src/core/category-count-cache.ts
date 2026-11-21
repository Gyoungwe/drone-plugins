import { canRead } from "./files.js";
import { createRevisionCache } from "./graph-cache.js";
import { type KnowledgeCategory, noteCategory } from "./note-category.js";

export type KnowledgeCategoryCounts = Record<KnowledgeCategory | "other", number>;

interface CountableNote {
	path: string;
	body: string;
	signature?: string;
	title?: string;
	kind?: string;
}

/**
 * One note's category, and when it was last touched.
 *
 * The category is derived from the note's frontmatter or its path, so it
 * changes only when the note changes — which also bumps the index revision
 * and invalidates this cache.
 */
export interface CategorizedNote {
	path: string;
	title: string;
	kind: string;
	category: KnowledgeCategory | "other";
	/** The note's modification time, in milliseconds. */
	updatedAt: number;
}

function emptyCounts(): KnowledgeCategoryCounts {
	return { paper: 0, software: 0, method: 0, idea: 0, other: 0 };
}

/**
 * The note's timestamp, in milliseconds.
 *
 * A note's signature is `mtime:ctime:size:ino`, so its first field is the
 * modification time.  A note without a signature sorts oldest.
 */
function updatedAt(signature: string | undefined): number {
	return Number.parseFloat(String(signature ?? "").split(":", 1)[0]) || 0;
}

/**
 * Category counts and the categorized notes behind them, cached per index
 * revision.
 *
 * A note's category depends only on its path and body, so the counts stay valid
 * until the index changes.  Every note change bumps the revision, so a
 * revision-scoped cache needs no separate invalidation path — a stale entry is
 * unreachable the moment the revision moves on.
 *
 * Before this cache, `status()` re-read every note body on every call, so the
 * cost of a status read scaled with the size of the Vault.  `status()` sits on
 * the path of every search, so that scan was paid per search too.
 *
 * The cache holds the categorized notes as well as the counts, so the views
 * that group notes by category do not each read the Vault back out.  They
 * used to: `recentByCategory` read every note body and re-derived every
 * category, which was the same full scan the counts had already paid for.
 *
 * The cache counts its own misses, but that is not the number worth guarding.
 * A miss is a *cache* event; the expensive thing is the rows read out of the
 * database.  So the runtime counts the rows it reads, and the guard watches
 * that count — a count that moves if the cache is bypassed.
 */
export function createCategoryCountCache() {
	const counts = createRevisionCache<KnowledgeCategoryCounts>();
	const notes = createRevisionCache<CategorizedNote[]>();
	/**
	 * The counts and the categorized notes of one scope.
	 *
	 * One scan serves both.  `undefined` covers every note; a project covers
	 * only the notes that project may read.  The two scopes are different, so
	 * they get different cache keys.
	 *
	 * The loader is called only on a miss: reading the notes back out of the
	 * index is the expensive part, so a cached view must not pay for it.
	 */
	function scan(
		revision: number,
		load: () => readonly CountableNote[],
		project: string | undefined,
	): { counts: KnowledgeCategoryCounts; notes: CategorizedNote[] } {
		const scope = project === undefined ? "*" : project;
		const cachedCounts = counts.get(revision, scope);
		const cachedNotes = notes.get(revision, scope);
		if (cachedCounts && cachedNotes) return { counts: cachedCounts, notes: cachedNotes };

		const result = emptyCounts();
		const categorized: CategorizedNote[] = [];
		for (const note of load()) {
			if (project !== undefined && !canRead(note.path, project)) continue;
			const category = noteCategory(note);
			result[category]++;
			categorized.push({
				path: note.path,
				title: note.title ?? note.path,
				kind: note.kind ?? "note",
				category,
				updatedAt: updatedAt(note.signature),
			});
		}
		counts.set(revision, scope, result);
		notes.set(revision, scope, categorized);
		return { counts: result, notes: categorized };
	}

	/**
	 * The counts for one scope.
	 */
	function categoryCounts(
		revision: number,
		load: () => readonly CountableNote[],
		project: string | undefined,
	): KnowledgeCategoryCounts {
		return { ...scan(revision, load, project).counts };
	}

	/**
	 * The notes of one scope, with their categories.
	 *
	 * The categories come from the same scan the counts use, so the two views
	 * agree and neither pays for a second scan.
	 */
	function categorizedNotes(
		revision: number,
		load: () => readonly CountableNote[],
		project: string | undefined,
	): CategorizedNote[] {
		return scan(revision, load, project).notes;
	}

	return { categoryCounts, categorizedNotes };
}
