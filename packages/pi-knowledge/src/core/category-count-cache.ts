import { canRead } from "./files.js";
import { createRevisionCache } from "./graph-cache.js";
import { type KnowledgeCategory, noteCategory } from "./note-category.js";

export type KnowledgeCategoryCounts = Record<KnowledgeCategory | "other", number>;

interface CountableNote {
	path: string;
	body: string;
}

function emptyCounts(): KnowledgeCategoryCounts {
	return { paper: 0, software: 0, method: 0, idea: 0, other: 0 };
}

/**
 * Category counts, cached per index revision.
 *
 * A note's category depends only on its path and body, so the counts stay valid
 * until the index changes.  Every note change bumps the revision, so a
 * revision-scoped cache needs no separate invalidation path — a stale entry is
 * unreachable the moment the revision moves on.
 *
 * Before this cache, `status()` re-read every note body on every call, so the
 * cost of a status read scaled with the size of the Vault.  `status()` sits on
 * the path of every search, so that scan was paid per search too.
 */
export function createCategoryCountCache() {
	const counts = createRevisionCache<KnowledgeCategoryCounts>();

	/**
	 * The counts for one scope.  `undefined` counts every note; a project
	 * counts only the notes that project may read.  The two scopes are
	 * different, so they get different cache keys.
	 *
	 * The loader is called only on a miss: reading the notes back out of the
	 * index is the expensive part, so a cached count must not pay for it.
	 */
	function categoryCounts(
		revision: number,
		load: () => readonly CountableNote[],
		project: string | undefined,
	): KnowledgeCategoryCounts {
		const scope = project === undefined ? "*" : project;
		const cached = counts.get(revision, scope);
		if (cached) return { ...cached };

		const result = emptyCounts();
		for (const note of load())
			if (project === undefined || canRead(note.path, project)) result[noteCategory(note)]++;
		counts.set(revision, scope, result);
		return { ...result };
	}

	return { categoryCounts };
}
