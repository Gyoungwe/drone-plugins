export { connectorTargetId, normalizeZoteroAttachment, normalizeZoteroItem, toConnectorItem, toWebApiItem, ZOTERO_ITEM_TYPES, } from "./zotero-write.js";
/**
 * Host-controlled Zotero writes. Two channels, one contract:
 *  - connector: the Zotero desktop connector endpoint (http://127.0.0.1:23119/connector/*), read back through the local API.
 *  - web: the Zotero Web API v3 with a write-scoped ZOTERO_API_KEY from the environment, read back through the same API.
 * Every write is dedup-checked by exact DOI first, written at most once, then read back by DOI. Nothing here retries,
 * merges, moves or deletes items; an uncertain outcome stays "unverified" for a human or a later reconcile.
 */
export declare const ZOTERO_ENDPOINTS: Readonly<{
    connector: "http://127.0.0.1:23119";
    localApi: "http://127.0.0.1:23119/api";
    webApi: "https://api.zotero.org";
}>;
export declare function probeZoteroConnector({ fetchImpl, signal, timeoutMs, }?: Record<string, any>): Promise<{
    reachable: boolean;
    status: number;
    version: string | null;
    error?: undefined;
} | {
    reachable: boolean;
    error: string;
    status?: undefined;
    version?: undefined;
}>;
/** The library/collection Zotero desktop currently has selected; the connector saves there unless a target is given. */
export declare function connectorSaveTarget({ fetchImpl, signal }?: Record<string, any>): Promise<{
    libraryId: string | null;
    libraryName: any;
    editable: boolean;
    collectionId: string | null;
    collectionName: any;
}>;
export declare function localApiSearchByDoi({ fetchImpl, doi, signal }?: Record<string, any>): Promise<{
    complete: boolean;
    items: {
        key: any;
        title: string;
        itemType: any;
        collections: any;
    }[];
}>;
export declare function localApiChildren({ fetchImpl, key, signal }?: Record<string, any>): Promise<any[]>;
export declare function zoteroWebApiConfig(env?: Record<string, string | undefined>): {
    libraryType: string;
    libraryId: string;
    apiKey: string;
    configured: boolean;
};
/**
 * Zotero 10+ local write channel: same v3 routes as the Web API on the desktop's local API (personal
 * library = users/0), authenticated by a local key that Zotero grants through its own dialog plus the
 * Zotero-Server-ID of the database the key belongs to.
 */
export declare function zoteroLocalWriteConfig(env?: Record<string, string | undefined>): {
    libraryType: string;
    libraryId: string;
    apiKey: string;
    serverId: string;
    base: "http://127.0.0.1:23119/api";
    local: boolean;
    configured: boolean;
};
/** The Zotero-Server-ID the running desktop reports (null when unreachable or older than Zotero 10). */
export declare function localServerId({ fetchImpl, signal }?: Record<string, any>): Promise<any>;
export declare function webRequest(fetchImpl: typeof fetch, config: Record<string, any>, path: string, { method, body, signal, timeoutMs, write }?: Record<string, any>): Promise<{
    status: number;
    ok: boolean;
    json: any;
    total: number;
}>;
export declare function webKeyAccess({ fetchImpl, config, signal }?: Record<string, any>): Promise<{
    userID: any;
    username: any;
    library: boolean;
    write: boolean;
}>;
export declare function webSearchByDoi({ fetchImpl, config, doi, signal }?: Record<string, any>): Promise<{
    complete: boolean;
    items: {
        key: any;
        title: string;
        itemType: any;
        collections: any;
    }[];
}>;
export declare function webCreateItems({ fetchImpl, config, items, signal }?: Record<string, any>): Promise<{
    status: number;
    ok: boolean;
    successful: {
        index: number;
        key: any;
        version: any;
    }[];
    failed: {
        index: number;
        code: any;
        message: string;
    }[];
}>;
export declare function webChildren({ fetchImpl, config, key, signal }?: Record<string, any>): Promise<any[]>;
/**
 * Read-only preparation: pick a channel, confirm the target is writable, and dedup by exact DOI.
 * action: create | reuse | ambiguous | blocked. Only "create" leads to a write, and only after consent.
 */
export declare function prepareZoteroSave(input?: Record<string, any>, { fetchImpl, env, signal }?: Record<string, any>): Promise<Record<string, any>>;
/** A receipt for plans that must not write (reuse / ambiguous / blocked). */
export declare function receiptWithoutWrite(plan: Record<string, any>, { now }?: Record<string, any>): Record<string, any>;
/** Performs exactly one write for a "create" plan, then reads back by DOI. Never retries. */
export declare function executeZoteroSave(plan: Record<string, any>, { fetchImpl, env, signal, now, sleep, readBackAttempts, readBackDelayMs, }?: Record<string, any>): Promise<Record<string, any>>;
/** A user-facing consent card body (same tone as the task authorization card). */
export declare function describeZoteroSavePlan(plan: Record<string, any>): string;
export declare function webGetItem({ fetchImpl, config, key, signal }?: Record<string, any>): Promise<{
    key: any;
    version: number;
    title: string;
    doi: string | null;
    itemType: any;
    parentItem: any;
    collections: any;
}>;
/** All collections of the library (paged, capped at 1000) as {key, name, parent}. */
export declare function webListCollections({ fetchImpl, config, signal }?: Record<string, any>): Promise<{
    key: string;
    name: string;
    parent: string | null;
}[]>;
/**
 * Read-only preparation of an update to ONE existing item: add it to a collection and/or attach a PDF
 * (linked URL or uploaded local file). action: update | unchanged | blocked. Nothing is removed or moved.
 */
export declare function prepareZoteroUpdate(input?: Record<string, any>, { fetchImpl, env, cwd, signal }?: Record<string, any>): Promise<Record<string, any>>;
/** Applies an "update" plan once (no retries), then reads the item and its children back. */
export declare function executeZoteroUpdate(plan: Record<string, any>, { fetchImpl, env, signal, now }?: Record<string, any>): Promise<{
    kind: string;
    channel: any;
    doi: any;
    title: any;
    zoteroKey: any;
    zoteroSelect: string | null;
    library: {
        type: any;
        id: any;
        name: any;
        local: boolean;
    };
    changes: Record<string, any>;
    skipped: any;
    readBack: Record<string, any>;
    write: {
        performed: boolean;
        at: any;
    };
    status: string;
    autoRetry: boolean;
    attachmentContentsVerified: boolean;
}>;
export declare function receiptWithoutUpdate(plan: Record<string, any>): {
    write: {
        performed: boolean;
    };
    collections?: any;
    candidates?: any;
    kind: string;
    channel: any;
    doi: any;
    title: any;
    zoteroKey: any;
    zoteroSelect: string | null;
    status: string;
    reason: any;
    skipped: any;
};
export declare function describeZoteroUpdatePlan(plan: Record<string, any>): string;
