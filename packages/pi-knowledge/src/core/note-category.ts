import { parseFrontmatter } from "./ingest-frontmatter.js";

export type KnowledgeCategory = "paper" | "software" | "method" | "idea";

function keywordCategory(value: string): KnowledgeCategory | "other" {
	if (/paper|literature|文献|论文/.test(value)) return "paper";
	if (/software|tool|软件/.test(value)) return "software";
	if (/method|protocol|方法/.test(value)) return "method";
	if (/idea|hypothes|想法|假设/.test(value)) return "idea";
	return "other";
}

/**
 * How many notes have been classified.
 *
 * Classifying a note means parsing its frontmatter, so it is the work the
 * category cache exists to avoid.  The count lives *inside* the classifier
 * rather than beside it: a counter next to the caller only measures that
 * caller, so a second view that classified the notes on its own would not
 * move it, and a guard on it would pass without guarding anything.
 *
 * Counting classifications rather than timing them keeps the number
 * independent of the machine's speed and load, so a guard on it cannot flake
 * on a busy CI runner.
 *
 * The count lives in an object's property rather than in a module-level
 * `let`: the binding never changes, only the value it holds.
 */
const classifications = { count: 0 };

/** How many notes have been classified since the process started. */
export function noteCategoryCount(): number {
	return classifications.count;
}

/** Explicit metadata wins; an untyped note uses its category folder before its filename. */
export function noteCategory(row: { path: string; body: string }): KnowledgeCategory | "other" {
	classifications.count++;
	const type = String(parseFrontmatter(row.body).data?.type || "")
		.trim()
		.toLowerCase();
	if (type) return keywordCategory(type);
	const segments = row.path.toLowerCase().split("/");
	const filename = segments.pop()!;
	for (const directory of segments.reverse()) {
		if (
			/^(papers?|literature|文献|论文|software|tools?|软件|methods?|protocols?|方法|ideas?|hypotheses|想法|假设)$/.test(
				directory,
			)
		)
			return keywordCategory(directory);
	}
	return keywordCategory(filename);
}
