export type ResearchConnectorKind = "literature" | "citation" | "dataset" | "protocol" | "institutional" | "project-storage";
export interface ResearchConnectorContext {
    readonly cwd?: string;
    readonly signal?: AbortSignal;
    readonly config?: Readonly<Record<string, unknown>>;
}
export interface ResearchProjectStorageItem {
    readonly relativePath: string;
    readonly title?: string;
    readonly summary?: string;
    readonly format?: string;
    readonly size?: number;
    readonly modifiedAt?: string;
    readonly contentHash?: string;
}
export interface ResearchProjectStoragePort {
    search(input: {
        readonly cwd: string;
        readonly query: string;
        readonly limit: number;
        readonly signal?: AbortSignal;
    }): Promise<readonly ResearchProjectStorageItem[]>;
}
export interface ResearchConnectorDescriptor {
    readonly id: string;
    readonly kind: ResearchConnectorKind;
    readonly label: string;
    readonly enabled: true;
}
export interface ResearchConnectorSourceReceipt {
    readonly sourceRef: string;
    readonly locator: string;
    readonly sourceType: ResearchConnectorKind;
    readonly title?: string;
    readonly version?: string;
    readonly license?: string;
    readonly accessedAt: string;
    readonly contentHash: string;
    readonly readOnly: true;
}
export interface ResearchConnectorHit {
    readonly id: string;
    readonly title: string;
    readonly summary: string;
    readonly locator: string;
    readonly sourceType: ResearchConnectorKind;
    readonly sourceReceipt: ResearchConnectorSourceReceipt;
    readonly authors?: readonly string[];
    readonly year?: number;
    readonly doi?: string;
    readonly publishedAt?: string;
    readonly arxivId?: string;
}
export interface ResearchConnectorFailure {
    readonly connectorId: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly at: string;
}
export interface ResearchSearchRequest {
    readonly query: string;
    readonly cwd?: string;
    readonly connectorIds?: readonly string[];
    readonly limit?: number;
    readonly signal?: AbortSignal;
}
export interface ResearchSearchResponse {
    readonly query: string;
    readonly hits: readonly ResearchConnectorHit[];
    readonly failures: readonly ResearchConnectorFailure[];
    readonly connectors: readonly string[];
    readonly complete: boolean;
}
export interface ResearchConnectorHostAdapter {
    readonly contractVersion: 1;
    readonly status: "ready" | "degraded" | "unavailable";
    readonly list: () => readonly ResearchConnectorDescriptor[];
    readonly recommend: (seed: string, connectorId: string, context?: ResearchConnectorContext, limit?: number) => Promise<{
        readonly hits: readonly ResearchConnectorHit[];
        readonly failures: readonly ResearchConnectorFailure[];
    }>;
    readonly search: (input: ResearchSearchRequest, context?: ResearchConnectorContext) => Promise<ResearchSearchResponse>;
}
export interface ResearchConnectorHostLoader {
    readonly contractVersion: 1;
    readonly load: () => ResearchConnectorHostAdapter;
}
export interface ResearchConnectorHostOptions {
    /** Host-owned transport. The plugin never creates a client or stores credentials. */
    readonly fetchImpl?: typeof fetch;
    /** Host-owned project index. Paths and workspace authorization stay in the host. */
    readonly projectStorage?: ResearchProjectStoragePort;
}
export declare function createResearchConnectorHostLoader(options: ResearchConnectorHostOptions): ResearchConnectorHostLoader;
