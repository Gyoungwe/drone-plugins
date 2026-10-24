export declare const ZOTERO_ITEM_SPECS: Readonly<{
    readonly journalArticle: {
        readonly container: "publicationTitle";
        readonly doi: true;
        readonly fields: readonly ["volume", "issue", "pages"];
    };
    readonly conferencePaper: {
        readonly container: "proceedingsTitle";
        readonly doi: true;
        readonly fields: readonly ["volume", "pages"];
    };
    readonly preprint: {
        readonly container: "repository";
        readonly doi: true;
        readonly fields: readonly [];
    };
    readonly dataset: {
        readonly container: "repository";
        readonly doi: true;
        readonly fields: readonly [];
    };
    readonly book: {
        readonly container: null;
        readonly doi: false;
        readonly fields: readonly ["volume"];
    };
    readonly bookSection: {
        readonly container: "bookTitle";
        readonly doi: false;
        readonly fields: readonly ["volume", "pages"];
    };
    readonly thesis: {
        readonly container: "university";
        readonly doi: false;
        readonly fields: readonly [];
    };
    readonly report: {
        readonly container: "institution";
        readonly doi: false;
        readonly fields: readonly ["pages"];
    };
    readonly webpage: {
        readonly container: "websiteTitle";
        readonly doi: false;
        readonly fields: readonly [];
    };
}>;
export declare const ZOTERO_ITEM_TYPES: readonly string[];
export declare const ZOTERO_WRITE_LIMITS: Readonly<{
    title: 1000;
    field: 500;
    abstract: 5000;
    creators: 200;
    tags: 32;
    tag: 200;
}>;
export interface ZoteroWriteInput {
    [key: string]: unknown;
}
export interface ZoteroCreator {
    creatorType: string;
    lastName?: string;
    firstName?: string;
    name?: string;
}
export interface NormalizedZoteroItem {
    doi: string;
    itemType: string;
    title: string;
    creators: ZoteroCreator[];
    date: string;
    url: string;
    abstractNote: string;
    fields: Record<string, string>;
    extra: string;
    tags: string[];
    doiField: boolean;
}
export interface NormalizedZoteroAttachment {
    url: string;
    title: string;
}
export interface ConnectorZoteroItem {
    itemType: string;
    title: string;
    creators: Array<{
        creatorType: string;
        lastName?: string;
        firstName?: string;
        fieldMode?: 1;
    }>;
    date: string;
    url: string;
    abstractNote: string;
    tags: Array<{
        tag: string;
    }>;
    attachments: Array<{
        title: string;
        url: string;
        mimeType: "application/pdf";
    }>;
    [key: string]: unknown;
}
export interface WebApiZoteroItem {
    itemType: string;
    title: string;
    creators: ZoteroCreator[];
    date: string;
    url: string;
    abstractNote: string;
    tags: Array<{
        tag: string;
    }>;
    collections: string[];
    [key: string]: unknown;
}
export declare function textField(value: unknown, max: number, name: string): string;
/** Whitelisted, size-bounded Zotero item metadata. Unknown fields are dropped. */
export declare function normalizeZoteroItem(input?: ZoteroWriteInput): NormalizedZoteroItem;
export declare function normalizeZoteroAttachment(input?: ZoteroWriteInput): NormalizedZoteroAttachment | null;
export declare function toConnectorItem(item: NormalizedZoteroItem, attachment?: NormalizedZoteroAttachment | null): ConnectorZoteroItem;
export declare function toWebApiItem(item: NormalizedZoteroItem, { collectionKey }?: {
    collectionKey?: string | null;
}): WebApiZoteroItem;
export declare function connectorTargetId(value: unknown): string | null;
