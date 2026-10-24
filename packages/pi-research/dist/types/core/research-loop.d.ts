export declare const RESEARCH_STAGES: readonly string[];
export declare const RESEARCH_DOCUMENT_KIND = "drone.research.run";
export interface ResearchLoopWorkspace {
    resultsRoot: string;
    obsidianVault?: string | null;
    knowledgeBindingRevision?: number | null;
}
export interface ResearchLoopPorts {
    resolveProject(cwd: string): Promise<string>;
    workspace(cwd: string): Promise<ResearchLoopWorkspace>;
    verifyLiteratureReceipt(input: Record<string, unknown>): Promise<any>;
    sourceStatus(input: {
        cwd: string;
        run_dir: string;
        verify?: boolean;
    }): Promise<any>;
    exclusive?<T>(key: string, work: () => Promise<T>): Promise<T>;
}
/** Each host owns one loop instance. No ledger or queue is shared across hosts. */
export declare function createResearchLoop(ports: ResearchLoopPorts): {
    startResearchRun: ({ cwd, project, resultSlug, query, requiresProvenance, }?: any) => Promise<{
        run_dir: string;
        metadata: any;
    }>;
    updateResearchLoop: (input?: any) => Promise<any>;
    completeResearchGate: ({ cwd, runDir, claimRefs, claimBindings, }?: any) => Promise<any>;
    observeResearchReceipt: (options?: any) => any;
    flushResearchReceipts: ({ cwd, runDir }?: any) => Promise<void>;
    resetResearchReceipts: ({ cwd, runDir }?: any) => void;
    topicIdFromResultSlug: (value: any) => string;
    dispose: () => any;
};
