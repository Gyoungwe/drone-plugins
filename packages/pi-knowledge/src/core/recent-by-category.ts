import { type KnowledgeCategory, noteCategory } from "./note-category.js";

export type { KnowledgeCategory } from "./note-category.js";

export interface RecentCategoryRow {
	path: string;
	title: string;
	kind: string;
	signature: string;
	body: string;
}

export function recentByCategory(
	rows: readonly RecentCategoryRow[],
	limit = 10,
): Record<KnowledgeCategory, Array<{ path: string; title: string; kind: string; updatedAt: number }>> {
	const groups: Record<KnowledgeCategory, Array<{ path: string; title: string; kind: string; updatedAt: number }>> = {
		paper: [],
		software: [],
		method: [],
		idea: [],
	};
	for (const row of rows) {
		const category = noteCategory(row);
		if (category === "other") continue;
		groups[category].push({
			path: row.path,
			title: row.title,
			kind: row.kind,
			updatedAt: Number.parseFloat(String(row.signature).split(":", 1)[0]) || 0,
		});
	}
	const max = Math.max(1, Math.min(24, Math.floor(limit || 10)));
	for (const key of Object.keys(groups) as KnowledgeCategory[])
		groups[key] = groups[key]
			.sort((left, right) => right.updatedAt - left.updatedAt || left.path.localeCompare(right.path))
			.slice(0, max);
	return groups;
}

