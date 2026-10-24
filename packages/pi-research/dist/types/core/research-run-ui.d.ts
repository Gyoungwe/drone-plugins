export interface ResearchRunUiListInput {
    resultsRoot: string;
    project?: string | null;
    limit?: number;
}
export interface ResearchRunUiDetailInput {
    resultsRoot: string;
    runDir?: string | null;
    runId?: string | null;
    resultSlug?: string | null;
    vaultRoot?: string | null;
}
export declare function listResearchRuns(input: ResearchRunUiListInput): Promise<any>;
export declare function getResearchRun(input: ResearchRunUiDetailInput): Promise<any>;
