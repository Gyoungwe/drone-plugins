import { type ClaimReadRecord, claimBindingRefs, validateClaimBindings } from "./claim-bindings.js";
import { advance, type ResearchGate, type ReusedSource, recordOf } from "./research-loop-state.js";

export type ResearchExecutionMode = "fast_readonly" | "deep_research";
export const FAST_PATH_LIMITS = Object.freeze({
	targetMinSteps: 3,
	maxSteps: 5,
	maxLocalSearches: 2,
	maxReads: 3,
	maxVerifications: 2,
});
export const FAST_PATH_ESCALATION_REASONS = [
	"no_local_hits",
	"source_stale_or_changed",
	"conflict_detected",
	"original_fulltext_missing",
	"write_or_archive_required",
	"step_cap_reached",
	"explicit_deep_request",
] as const;
export type FastPathEscalationReason = (typeof FAST_PATH_ESCALATION_REASONS)[number];

export const FAST_PATH_READONLY_TOOLS: readonly string[] = Object.freeze([
	"research_search_knowledge",
	"research_read_knowledge",
	"research_verify_literature",
	"research_reconcile_literature",
	"research_loop",
]);
export const FAST_PATH_DENIED_TOOLS: readonly string[] = Object.freeze([
	"research_archive_source",
	"research_zotero_save",
	"research_deposit_knowledge",
	"research_deposit_research_note",
	"webfetch",
	"web_search",
	"fetch_content",
	"write",
	"edit",
]);

export interface ResearchToolStep {
	toolName: string;
	args?: Record<string, unknown>;
}

export interface FastPathProgress {
	stepsUsed: number;
	localSearches: number;
	reads: number;
	verifications: number;
	escalation_required: boolean;
	reason?: FastPathEscalationReason;
}

export function newFastPath(): FastPathProgress {
	return { stepsUsed: 0, localSearches: 0, reads: 0, verifications: 0, escalation_required: false };
}

function limitFor(tool: string) {
	switch (tool) {
		case "research_search_knowledge":
			return ["localSearches", FAST_PATH_LIMITS.maxLocalSearches] as const;
		case "research_read_knowledge":
			return ["reads", FAST_PATH_LIMITS.maxReads] as const;
		case "research_verify_literature":
		case "research_reconcile_literature":
			return ["verifications", FAST_PATH_LIMITS.maxVerifications] as const;
		default:
			return null;
	}
}

export function fastPathAllows({ toolName, args }: ResearchToolStep): boolean {
	if (FAST_PATH_DENIED_TOOLS.includes(toolName) || !FAST_PATH_READONLY_TOOLS.includes(toolName)) return false;
	return (
		toolName !== "research_loop" || !["record_external", "verify_archive"].includes(String(args?.action))
	);
}

export function fastPathAtLimit(progress: FastPathProgress, toolName: string): boolean {
	const cap = limitFor(toolName);
	return progress.stepsUsed >= FAST_PATH_LIMITS.maxSteps || (cap !== null && progress[cap[0]] >= cap[1]);
}

export function countFastPathStep(progress: FastPathProgress, toolName: string): FastPathProgress {
	const cap = limitFor(toolName);
	return {
		...progress,
		stepsUsed: progress.stepsUsed + 1,
		...(cap ? { [cap[0]]: progress[cap[0]] + 1 } : {}),
	};
}

export function requireEscalation(
	progress: FastPathProgress,
	reason: FastPathEscalationReason,
): FastPathProgress {
	return progress.escalation_required ? progress : { ...progress, escalation_required: true, reason };
}

export function escalationGuidance(reason: FastPathEscalationReason) {
	return `Fast path escalation required (${reason}). Call research_loop(action="escalate", reason="${reason}").`;
}

export function parseEscalationReason(value: unknown): FastPathEscalationReason {
	const reason = FAST_PATH_ESCALATION_REASONS.find((candidate) => candidate === value);
	if (!reason) throw new Error("A valid fast path escalation reason is required");
	return reason;
}

export function fastPathReceiptReason(
	toolName: string,
	details: Record<string, unknown>,
): FastPathEscalationReason | undefined {
	if (
		toolName === "research_search_knowledge" &&
		details.complete !== false &&
		Array.isArray(details.hits) &&
		details.hits.length === 0
	)
		return "no_local_hits";
	if (toolName === "research_read_knowledge" && details.missing === true) return "source_stale_or_changed";
	if (toolName === "research_verify_literature" || toolName === "research_reconcile_literature") {
		const receipt = toolName === "research_reconcile_literature" ? recordOf(details.receipt) : details;
		const noteStatus = recordOf(receipt.obsidian).status;
		if (noteStatus === "missing") return "source_stale_or_changed";
		if (noteStatus === "identity-mismatch" || recordOf(receipt.zotero).status === "identity-mismatch")
			return "conflict_detected";
	}
	return undefined;
}

export function completeFastPath(
	gate: ResearchGate,
	progress: FastPathProgress,
	sources: readonly ReusedSource[],
	bindings: unknown,
	reads: ReadonlyMap<string, readonly ClaimReadRecord[]>,
	at: string,
): ResearchGate {
	if (progress.stepsUsed >= FAST_PATH_LIMITS.maxSteps)
		throw new Error(escalationGuidance("step_cap_reached"));
	if (!sources.length) throw new Error("Fast path needs a current-turn identity-verified local source");
	const claims = validateClaimBindings(bindings, sources, reads);
	const refs = claimBindingRefs(claims);
	const paths = sources.map((source) => source.path);
	const inspected = advance({ ...gate, source_refs: paths }, "sources_inspected", at, { source_refs: paths });
	const reused = advance(
		{ ...inspected, reuse_count: sources.length, reused_sources: [...sources] },
		"sources_reused",
		at,
	);
	const bound = advance(
		{ ...reused, claim_bindings: claims, claim_refs: refs, warnings: [] },
		"claims_bound",
		at,
	);
	return advance({ ...bound, status: "ok", answerable: true }, "answerable", at);
}
