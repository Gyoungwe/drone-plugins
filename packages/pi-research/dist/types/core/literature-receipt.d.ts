export interface LiteratureItem {
    data?: {
        DOI?: unknown;
        title?: unknown;
        collections?: unknown;
    };
    doi?: unknown;
    DOI?: unknown;
    [key: string]: unknown;
}
export interface LiteratureReceiptOptions {
    doi: unknown;
    zotero_key: unknown;
    note_path: unknown;
    vault: unknown;
    signal?: AbortSignal;
    fetcher?: (url: string, init?: RequestInit) => Promise<ReceiptResponse>;
}
interface ReceiptResponse {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}
export interface LiteratureReceipt {
    doi: string;
    zoteroKey: string;
    zotero: {
        status: "unavailable" | "verified" | "identity-mismatch";
        title?: unknown;
        collections?: unknown;
        pdfAttachmentKeys?: string[];
        fulltextStatus?: "attachment-indexed-not-read" | "metadata-only" | "unavailable";
        error?: string;
    };
    obsidian: {
        status: "unavailable" | "verified" | "identity-mismatch" | "missing";
        path?: string;
        vault?: string;
        hash?: string;
        error?: string;
    };
    scientificallyVerified: false;
    status?: "both-verified" | "partial";
}
export declare function normalizeDoi(value: unknown): string | null;
export declare function exactDoiItems(items: readonly LiteratureItem[], doi: unknown): LiteratureItem[];
/** Read-only verification. It never certifies claim support or proves that a PDF was read. */
export declare function verifyLiteratureReceipt({ doi, zotero_key, note_path, vault, signal, fetcher, }: LiteratureReceiptOptions): Promise<LiteratureReceipt>;
export {};
