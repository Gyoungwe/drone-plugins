export interface ResearchJournalWorkspace {
    obsidianVault?: string | null;
    knowledgeBindingRevision?: number | null;
}
export interface ResearchJournalPorts {
    workspace(cwd: string): Promise<ResearchJournalWorkspace>;
    status(cwd: string, runDir: string): Promise<{
        run_dir: string;
    }>;
    flush(cwd: string, runDir: string): Promise<void>;
    reset(cwd: string, runDir: string): void;
    observeExecution(event: ScopedReceipt): Promise<unknown>;
    observeResearch(event: ScopedReceipt): Promise<unknown>;
    isJournalTool?(toolName: string): boolean;
    owners?: Map<string, symbol>;
}
export interface ResearchReceiptEvent {
    toolName?: string;
    toolCallId?: string;
    isError?: boolean;
    countedStep?: boolean;
    args?: Record<string, unknown>;
    details?: Record<string, unknown>;
    [key: string]: unknown;
}
type ScopedReceipt = ResearchReceiptEvent & {
    cwd: string;
    runDir: string;
    sessionId: string | null;
};
/** Host-injected journal; the package owns bounds, deduplication and run scope. */
export declare function createResearchReceiptJournal(cwd: string, { sessionId, ports }: {
    sessionId?: string | null;
    ports: ResearchJournalPorts;
}): {
    currentRun: () => string | undefined;
    record: (event: ResearchReceiptEvent) => Promise<unknown>;
    execute<T extends Record<string, unknown>>(runDir: string | null | undefined, work: () => Promise<T>): Promise<(T & {
        receipt_journal: import("./receipt-journal-policy.js").ReceiptJournalSnapshot;
    }) | (T & {
        receipt_journal: import("./receipt-journal-policy.js").ReceiptJournalSnapshot;
        run_dir: string;
    })>;
    close(): Promise<void>;
};
export {};
