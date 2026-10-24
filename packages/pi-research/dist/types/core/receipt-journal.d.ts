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
    observeExecution(event: Record<string, unknown> & {
        cwd: string;
        runDir: string;
    }): Promise<unknown>;
    observeResearch(event: Record<string, unknown> & {
        cwd: string;
        runDir: string;
    }): Promise<unknown>;
    isJournalTool?(toolName: string): boolean;
    owners?: Map<string, symbol>;
}
export interface ResearchReceiptEvent {
    toolName?: string;
    toolCallId?: string;
    isError?: boolean;
    args?: Record<string, unknown>;
    details?: Record<string, unknown>;
    [key: string]: unknown;
}
/** Host-injected journal; the package owns bounds, deduplication and run scope. */
export declare function createResearchReceiptJournal(cwd: string, { sessionId, ports }: {
    sessionId?: string | null;
    ports: ResearchJournalPorts;
}): {
    currentRun: () => string | undefined;
    record(event: ResearchReceiptEvent): Promise<unknown>;
    execute(runDir: string | null | undefined, work: () => Promise<Record<string, unknown>>): Promise<{
        receipt_journal: {
            scope: "current-session-current-turn";
            buffered: number;
            evicted: number;
        };
    } | {
        receipt_journal: {
            scope: "current-session-current-turn";
            buffered: number;
            evicted: number;
        };
        run_dir: string;
    }>;
    close(): Promise<void>;
};
