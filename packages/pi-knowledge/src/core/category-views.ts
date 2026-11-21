import { type CategorizedNote, createCategoryCountCache } from "./category-count-cache.js";
import type { KnowledgeCategory } from "./note-category.js";

/**
 * KP5a — the category views.
 *
 * The counts and the recent-by-category view read the same notes and derive
 * the same categories, so they share one scan.  This module holds that shared
 * scan and the two views built on it.
 *
 * Before this, `status()` read every note body on every call, and
 * `recentByCategory` read them all again.  `status()` is on the path of every
 * search, so the Vault was scanned per search too.
 */

/** The rows the category views read out of the index. */
export interface CategoryRow {
	path: string;
	title: string;
	kind: string;
	body: string;
	signature: string;
}

/** Where the category views read their rows from. */
export type CategoryRowLoader = () => readonly CategoryRow[];

/**
 * The rows the category views read.
 *
 * The views read every note of the index and let the cache filter by scope,
 * so the scope filter is applied once, in one place, whichever view asks
 * first.
 */
export function categoryRowLoader(query: () => readonly unknown[]): CategoryRowLoader {
	return () => query() as readonly CategoryRow[];
}

/** One note in a category group. */
export interface RecentCategoryEntry {
	path: string;
	title: string;
	kind: string;
	updatedAt: number;
}

/**
 * The most recent notes of each category.
 *
 * The categories come from the index's category cache, which already
 * classified every note for the counts.  This used to read every note body
 * and re-derive every category, which was the same full scan the counts had
 * already paid for.
 */
export function groupRecentByCategory(
	notes: readonly CategorizedNote[],
	limit = 10,
): Record<KnowledgeCategory, RecentCategoryEntry[]> {
	const groups: Record<KnowledgeCategory, RecentCategoryEntry[]> = {
		paper: [],
		software: [],
		method: [],
		idea: [],
	};
	for (const note of notes) {
		if (note.category === "other") continue;
		groups[note.category].push({
			path: note.path,
			title: note.title,
			kind: note.kind,
			updatedAt: note.updatedAt,
		});
	}
	const max = Math.max(1, Math.min(24, Math.floor(limit || 10)));
	for (const key of Object.keys(groups) as KnowledgeCategory[])
		groups[key] = groups[key]
			.sort((left, right) => right.updatedAt - left.updatedAt || left.path.localeCompare(right.path))
			.slice(0, max);
	return groups;
}

/**
 * The category views, bound to one index.
 *
 * `revision` is read through a getter rather than passed in, because the
 * revision advances as the index changes and the cache is keyed by it.
 */
export function createCategoryViews(readRevision: () => number) {
	const cache = createCategoryCountCache();

	/**
	 * The category counts, for every note or for one project.
	 *
	 * The loader reads every note and lets the cache filter by scope, so the
	 * filter is applied once, in one place, whichever view asks first.
	 */
	function counts(load: CategoryRowLoader, project?: string) {
		return cache.categoryCounts(readRevision(), load, project);
	}

	/** The notes of one scope, with their categories. */
	function notes(load: CategoryRowLoader, project?: string) {
		return cache.categorizedNotes(readRevision(), load, project);
	}

	/** The most recent notes of each category. */
	function recent(load: CategoryRowLoader, project: string | undefined, limit: number) {
		return groupRecentByCategory(notes(load, project), limit);
	}

	return { counts, notes, recent };
}
