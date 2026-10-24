/** First-party tools whose host observations are always recorded in a research receipt. */
export declare const CORE_RESEARCH_RECEIPT_TOOLS: readonly ["bash", "powershell", "webfetch", "fetch_content", "web_search", "research_read_knowledge", "research_search_knowledge", "research_verify_literature", "research_reconcile_literature", "research_archive_source", "read"];
export type CoreResearchReceiptTool = (typeof CORE_RESEARCH_RECEIPT_TOOLS)[number];
export interface ResearchReceiptEvent {
    toolName?: unknown;
    isError?: unknown;
    toolCallId?: unknown;
    args?: Record<string, unknown>;
    details?: Record<string, unknown>;
}
/**
 * Apply the host-observation admission rule without importing a Pi runtime module.
 * Failed shell commands remain useful evidence; other failed tools are omitted.
 */
export declare function shouldRecordResearchReceipt(event: ResearchReceiptEvent, isJournalTool?: (toolName: string) => boolean): boolean;
export interface ReceiptJournalSnapshot {
    scope: "current-session-current-turn";
    buffered: number;
    evicted: number;
}
export interface ReceiptJournalBufferOptions {
    capacity?: number;
}
/**
 * Bounded, deduplicating receipt storage for one host session and turn.
 * It deliberately stores opaque values so host-specific persistence stays outside the package.
 */
export declare class ReceiptJournalBuffer<T extends {
    toolCallId?: unknown;
}> {
    private readonly capacity;
    private readonly entries;
    private readonly seen;
    private evictedCount;
    constructor({ capacity }?: ReceiptJournalBufferOptions);
    /** Adds a receipt and returns false for a duplicate tool call id. */
    add(receipt: T): boolean;
    values(): readonly T[];
    get evicted(): number;
    snapshot(): ReceiptJournalSnapshot;
    clear(): void;
}
/** Checks whether a receipt with an optional run_dir belongs to the attached run. */
export declare function receiptBelongsToRun(receipt: Pick<ResearchReceiptEvent, "args" | "details">, cwd: string, runDir: string): boolean;
