import { parseFrontmatter } from "./ingest-frontmatter.js";

export type KnowledgeCategory = "paper" | "software" | "method" | "idea";

function keywordCategory(value: string): KnowledgeCategory | "other" {
	if (/paper|literature|文献|论文/.test(value)) return "paper";
	if (/software|tool|软件/.test(value)) return "software";
	if (/method|protocol|方法/.test(value)) return "method";
	if (/idea|hypothes|想法|假设/.test(value)) return "idea";
	return "other";
}

/** Explicit metadata wins; an untyped note uses its category folder before its filename. */
export function noteCategory(row: { path: string; body: string }): KnowledgeCategory | "other" {
	const type = String(parseFrontmatter(row.body).data?.type || "").trim().toLowerCase();
	if (type) return keywordCategory(type);
	const segments = row.path.toLowerCase().split("/");
	const filename = segments.pop()!;
	for (const directory of segments.reverse()) {
		if (/^(papers?|literature|文献|论文|software|tools?|软件|methods?|protocols?|方法|ideas?|hypotheses|想法|假设)$/.test(directory))
			return keywordCategory(directory);
	}
	return keywordCategory(filename);
}
