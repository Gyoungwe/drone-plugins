export interface ZoteroListResponse {
    data?: unknown;
    total?: number;
}
export type ZoteroReadRequest = (path: string) => Promise<ZoteroListResponse>;
export interface ZoteroReconcileExpectation {
    doi: unknown;
    collection?: unknown;
}
export interface ZoteroReconcileContext {
    libraryType?: string;
    libraryId?: string;
    verifier?: string;
    observedAt?: string;
}
/**
 * Perform the network-free part of a read-only Zotero identity reconciliation.
 * The caller owns credentials, transport, response size limits and retries.
 * This helper never writes, retries, downloads attachments or returns bodies.
 */
export declare function lookupZoteroByDoi(get: ZoteroReadRequest, expected: ZoteroReconcileExpectation, context?: ZoteroReconcileContext): Promise<Record<string, unknown>>;
