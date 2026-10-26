/**
 * Host-neutral research run read adapter.
 *
 * The adapter owns the run metadata projection and registration contract, while
 * the host owns every filesystem operation.  This keeps the public host entry
 * useful to native and Desktop composition roots without importing Electron,
 * Pi runtime code, Node filesystem APIs or network clients.
 */
export interface ResearchFileEntry {
    readonly name: string;
    readonly kind: "file" | "directory" | "symlink" | "other";
}
export interface ResearchResolvedRoot {
    readonly handle: string;
    readonly path: string;
}
export interface ResearchHostPort {
    resolveRoot(path: string): Promise<{
        handle: string;
    }>;
    readText(root: string, path: string): Promise<string>;
    listFiles(root: string, path: string): Promise<readonly ResearchFileEntry[]>;
}
export interface ResearchRunListInput {
    readonly workspace: string;
    readonly project?: string | null;
    readonly limit?: number;
}
export interface ResearchRunStatusInput extends ResearchRunListInput {
    readonly runDir?: string | null;
}
export interface ResearchRunDetailInput extends ResearchRunStatusInput {
    readonly runId?: string | null;
}
export interface ResearchRunSummary {
    readonly runId: string;
    readonly resultSlug: string;
    readonly project: string;
    readonly topicId: string | null;
    readonly query: string;
    readonly status: string;
    readonly stage: string;
    readonly answerable: boolean;
    readonly startedAt: string | null;
    readonly updatedAt: string | null;
    readonly runDir: string;
}
export interface ResearchRunListResult {
    readonly items: readonly ResearchRunSummary[];
    readonly total: number;
}
export interface ResearchRunDetail extends ResearchRunSummary {
    readonly route: readonly {
        key: string;
        state: string;
        at: string | null;
        detail: string | null;
    }[];
    readonly timeline: readonly {
        type: string;
        at: string | null;
        detail: string | null;
        status: "ok" | "failed" | "observed";
    }[];
    readonly sources: readonly {
        path: string;
        status: string;
        hash: string | null;
        verified: boolean;
    }[];
    readonly claims: readonly {
        id: string | null;
        claim: string;
        support: string[];
        status: string;
    }[];
    readonly warnings: readonly string[];
    readonly coverage: Record<string, unknown> | null;
    readonly archive: {
        count: number;
        reused: number;
        verified: boolean;
    };
}
export interface ResearchHostOperations {
    status(input: ResearchRunStatusInput): Promise<ResearchRunListResult | {
        item: ResearchRunSummary;
    }>;
    listRuns(input: ResearchRunListInput): Promise<ResearchRunListResult>;
    detail?(input: ResearchRunDetailInput): Promise<ResearchRunDetail>;
}
export interface ResearchHostAdapter {
    readonly contractVersion: 1;
    readonly operations: ResearchHostOperations;
}
export interface ResearchHostRegistry {
    register(name: "status" | "listRuns" | "detail", operation: ResearchHostOperations["status"] | ResearchHostOperations["listRuns"] | NonNullable<ResearchHostOperations["detail"]>): void;
}
export interface ResearchHostLoader {
    readonly contractVersion: 1;
    load(port: ResearchHostPort): ResearchHostAdapter;
}
/** Build read-only research operations over a host-granted file port. */
export declare function createResearchHost(port: ResearchHostPort): ResearchHostAdapter;
/** Register the read-only operations in a host's operation registry. */
export declare function registerResearchHost(registry: ResearchHostRegistry, port: ResearchHostPort): ResearchHostAdapter;
export declare const researchHostLoader: ResearchHostLoader;
