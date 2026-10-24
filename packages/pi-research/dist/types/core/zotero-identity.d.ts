/** The fixed-width resource key used by Zotero item and attachment records. */
export declare const ZOTERO_KEY_PATTERN: RegExp;
export interface ZoteroIdentityItem {
    key?: unknown;
    data?: {
        DOI?: unknown;
        collections?: unknown;
        itemType?: unknown;
        parentItem?: unknown;
        contentType?: unknown;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export interface ZoteroIdentityQuery {
    doi: unknown;
    collection?: unknown;
}
export interface ZoteroAttachmentIdentity {
    key: string;
    contentType: string | null;
    metadataOnly: true;
}
/** Normalize DOI identity using the same canonical policy as research receipts. */
export declare function normalizeZoteroDoi(value: unknown): string | null;
/** A DOI is eligible for exact Zotero lookup only when it has a valid DOI shape. */
export declare function isValidZoteroDoi(value: unknown): boolean;
export declare function isZoteroItemKey(value: unknown): value is string;
/** Read the bibliographic DOI field without accepting a title or URL as identity. */
export declare function zoteroItemDoi(item: ZoteroIdentityItem | null | undefined): string | null;
/**
 * Return only records whose DOI (and optional collection) exactly matches the
 * expected identity. This function performs no network, filesystem or write
 * operation and preserves the input record references.
 */
export declare function findZoteroItemsByIdentity(items: readonly ZoteroIdentityItem[], query: ZoteroIdentityQuery): ZoteroIdentityItem[];
/** Project child records into safe attachment identity metadata only. */
export declare function summarizeZoteroAttachments(children: readonly ZoteroIdentityItem[], parentKey: unknown): ZoteroAttachmentIdentity[];
