export type KnowledgeCategory = "paper" | "software" | "method" | "idea";

export interface RecentCategoryRow {
	path: string;
	title: string;
	kind: string;
	signature: string;
	body: string;
}

function noteCategory(row: Pick<RecentCategoryRow, "path" | "body">): KnowledgeCategory | "other" {
	const type = String(parseFrontmatter(row.body).data?.type || "").toLowerCase();
	const value = `${type}/${row.path.toLowerCase()}`;
	if (/paper|literature|文献|论文/.test(value)) return "paper";
	if (/software|tool|软件/.test(value)) return "software";
	if (/method|protocol|方法/.test(value)) return "method";
	if (/idea|hypothes|想法|假设/.test(value)) return "idea";
	return "other";
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
import { parseFrontmatter } from "./ingest-frontmatter.js";

