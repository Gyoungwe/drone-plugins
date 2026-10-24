export declare const SOURCE_CATEGORIES: readonly ["papers", "supplementary", "software", "manuals"];
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];
export declare const DEFAULT_MAX_BYTES: number;
export declare const DEFAULT_TIMEOUT_MS = 30000;
export interface ContentValidation {
    ok: boolean;
    mime?: string;
    reason?: string;
}
export interface SourceMetadata {
    doi?: unknown;
    pmid?: unknown;
    pmcid?: unknown;
    commit?: unknown;
    version?: unknown;
    license?: unknown;
    title?: unknown;
    authors?: unknown;
    repository?: unknown;
    open_access?: unknown;
    [key: string]: unknown;
}
export declare function isWithin(root: string, child: string): boolean;
export declare function validateRunDir(resultsRoot: string, candidate: string): string;
export declare function safeFilename(input: unknown, fallback: string): string;
export declare function looksLikeChallenge(status: number, contentType: string, sample: string): boolean;
export declare function looksLikeCloudflare(headers: unknown, sample: string | null | undefined): boolean;
export interface CloudflareAskCopy {
    title: string;
    body: string;
    continueLabel: string;
    skipLabel: string;
    retryNote: string;
    skipNote: string;
}
/** Dialog and the two sentences written back to the model. Chinese only when the UI language is zh. */
export declare function cloudflareAskCopy(): CloudflareAskCopy;
export declare function hasMagic(bytes: Uint8Array): boolean;
export declare function validateContent(category: SourceCategory, contentType: string, filename: string, bytes: Uint8Array): ContentValidation;
export declare function normalizeMetadata(metadata?: SourceMetadata): Record<string, unknown>;
