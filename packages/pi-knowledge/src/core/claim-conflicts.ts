export interface KnowledgeClaim {
	claim?: string;
	subject?: string;
	predicate?: string;
	value?: string;
	organism?: string;
	tissue?: string;
	stage?: string;
	method?: string;
	direction?: "increase" | "decrease" | "affirmed" | "negated" | "unknown";
	endpoint?: string;
	unit?: string;
	effect?: number;
	relation?: string;
	[key: string]: unknown;
}

export type ClaimComparison = {
	relation: "supports" | "contradicts" | "unresolved";
	confidence: "low" | "medium" | "high";
	reason: string;
	blocking: boolean;
	missingConditions?: readonly string[];
	differingConditions?: readonly string[];
};

export type ClaimSetComparison = ClaimComparison & {
	previous: KnowledgeClaim;
	incoming: KnowledgeClaim;
};

const normalize = (value: unknown): string =>
	String(value ?? "")
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[\u0000-\u001f\u007f]/g, " ")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();

const tokens = (value: unknown): Set<string> =>
	new Set(
		normalize(value)
			.split(/\s+/)
			.filter((token) => token.length > 1),
	);

const overlap = (left: unknown, right: unknown): number => {
	const a = tokens(left);
	const b = tokens(right);
	if (!a.size || !b.size) return 0;
	let common = 0;
	for (const token of a) if (b.has(token)) common++;
	return common / Math.max(a.size, b.size);
};

/** Only explicit cues are recognized; ordinary unmatched prose has no known direction. */
function direction(claim: KnowledgeClaim): NonNullable<KnowledgeClaim["direction"]> {
	if (claim.direction) return claim.direction;
	const text = normalize(`${claim.predicate} ${claim.value || claim.claim}`);
	const negated = /\b(?:not|no|without|fails)\b|不|未|无/.test(text);
	const increase = /\b(?:increases?|increased|upregulated)\b|增加|升高|上调/.test(text);
	const decrease = /\b(?:decreases?|decreased|downregulated)\b|减少|降低|下调/.test(text);
	if ((increase && decrease) || (negated && (increase || decrease))) return "unknown";
	if (increase) return "increase";
	if (decrease) return "decrease";
	if (/\b(?:activates?|promotes?|supports?)\b|激活|促进|支持/.test(text))
		return negated ? "negated" : "affirmed";
	return "unknown";
}
function comparableValue(value: unknown): string {
	return normalize(value).replace(
		/\b(?:does|do|not|no|without|fails|increase[sd]?|decrease[sd]?|activate[sd]?)\b|不|无|未|增加|减少|降低|升高|激活/g,
		" ",
	);
}

const field = (claim: KnowledgeClaim, key: string): string => normalize(claim[key]);

/**
 * Compare a newly supplied claim with the prior claim for one topic.
 * Missing or non-comparable conditions stay unresolved; only same-condition
 * opposite observations can block a write.
 */
export function compareClaims(
	previous: KnowledgeClaim | null | undefined,
	incoming: KnowledgeClaim | null | undefined,
): ClaimComparison {
	if (!previous || !incoming) {
		return {
			relation: "unresolved",
			confidence: "low",
			reason: "缺少一方结构化主张，无法比较。",
			blocking: false,
		};
	}
	if (
		!field(previous, "subject") ||
		!field(previous, "predicate") ||
		field(previous, "subject") !== field(incoming, "subject") ||
		field(previous, "predicate") !== field(incoming, "predicate")
	)
		return {
			relation: "unresolved",
			confidence: "low",
			reason: "主语或谓词不同，不能视为同一命题。",
			blocking: false,
		};
	const conditions = ["organism", "tissue", "stage", "method"];
	const optional = ["endpoint", "unit"].filter((key) => field(previous, key) || field(incoming, key));
	const required = [...conditions, ...optional];
	const missing = required.filter((key) => !field(previous, key) || !field(incoming, key));
	if (missing.length)
		return {
			relation: "unresolved",
			confidence: "low",
			blocking: false,
			missingConditions: missing,
			reason: `缺少可比较条件（${missing.join("、")}），不能判断支持或冲突。`,
		};
	const changed = required.filter(
		(key) => field(previous, key) && field(incoming, key) && field(previous, key) !== field(incoming, key),
	);
	if (changed.length)
		return {
			relation: "unresolved",
			confidence: "medium",
			reason: `实验条件不同（${changed.join("、")}），需要按条件并列解释。`,
			differingConditions: changed,
			blocking: false,
		};
	if (field(previous, "relation") !== "observation" || field(incoming, "relation") !== "observation")
		return {
			relation: "unresolved",
			confidence: "medium",
			reason: "解释或假设不能直接推翻观察结果。",
			blocking: false,
		};
	const priorValue = comparableValue(`${previous.predicate} ${previous.value || previous.claim}`);
	const nextValue = comparableValue(`${incoming.predicate} ${incoming.value || incoming.claim}`);
	if (overlap(priorValue, nextValue) < 0.5)
		return {
			relation: "unresolved",
			confidence: "low",
			reason: "命题内容相似度不足，交由人工判断。",
			blocking: false,
		};
	const priorDirection = direction(previous),
		nextDirection = direction(incoming);
	if (priorDirection === "unknown" || nextDirection === "unknown")
		return {
			relation: "unresolved",
			confidence: "low",
			blocking: false,
			reason: "观察方向未知，不能判断支持或冲突。",
		};
	if (priorDirection === nextDirection)
		return {
			relation: "supports",
			confidence: "medium",
			blocking: false,
			reason: "同条件下方向一致，可并列保留。",
		};
	const opposite = new Set([priorDirection, nextDirection]);
	if (
		!(opposite.has("increase") && opposite.has("decrease")) &&
		!(opposite.has("affirmed") && opposite.has("negated"))
	)
		return {
			relation: "unresolved",
			confidence: "low",
			blocking: false,
			reason: "方向类型不同，不能直接比较。",
		};
	return {
		relation: "contradicts",
		confidence: "high",
		reason: "同一对象、同一条件、同一观察命题的方向相反。",
		blocking: true,
	};
}

export function compareClaimSets(
	previousClaims: readonly KnowledgeClaim[] = [],
	incomingClaims: readonly KnowledgeClaim[] = [],
): ClaimSetComparison[] {
	const comparisons: ClaimSetComparison[] = [];
	for (const incoming of incomingClaims) {
		for (const previous of previousClaims) {
			const result = compareClaims(previous, incoming);
			if (
				field(previous, "subject") &&
				field(previous, "subject") === field(incoming, "subject") &&
				field(previous, "predicate") === field(incoming, "predicate")
			)
				comparisons.push({ previous, incoming, ...result });
		}
	}
	return comparisons;
}
