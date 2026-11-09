import { type CapabilityCall } from "./capability-fetch.js";
/**
 * Zotero tools in the Drone Desktop managed runtime. Every request goes through the host's network
 * capabilities; the host's write dialog is the only confirmation (the managed session has no UI of its
 * own), so these tools ask no question themselves.
 */
/** Zotero desktop connector endpoints that only read. Must equal the manifest's `drone.networkReads`. */
export declare const ZOTERO_NETWORK_READS: readonly string[];
/** The manifest's `drone.credentials` slot: the host keeps the Web API key and attaches it toward these hosts. */
export declare const ZOTERO_WEB_CREDENTIAL: Readonly<{
    slot: "zotero-web";
    header: "Zotero-API-Key";
    hosts: readonly string[];
}>;
export declare function saveToZotero(call: CapabilityCall, params: Record<string, any>, signal?: AbortSignal): Promise<Record<string, any>>;
export declare function updateInZotero(call: CapabilityCall, params: Record<string, any>, cwd: string, signal?: AbortSignal): Promise<{
    consent: {
        via: string;
    };
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
} | {
    consent: {
        via: string;
    };
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
export declare function zoteroStatus(call: CapabilityCall, signal?: AbortSignal): Promise<{
    runtime: string;
    connector: {
        reachable: boolean;
        status: number;
        version: string | null;
        error?: undefined;
    } | {
        reachable: boolean;
        error: string;
        status?: undefined;
        version?: undefined;
    };
    webApi: {
        configured: boolean;
        reason: string;
    } | {
        library: boolean;
        write: boolean;
        libraryType: string;
        libraryId: string;
        configured: boolean;
        reason?: undefined;
    } | {
        error: string;
        libraryType: string;
        libraryId: string;
        configured: boolean;
        reason?: undefined;
    };
    localWrite: {
        configured: boolean;
        reason: string;
    };
    note: string;
}>;
/** Every tool declares read: the only write is the host's own dialog for each network write. */
export declare const ZOTERO_TOOL_EFFECTS: Readonly<{
    readonly research_zotero_status: "read";
    readonly research_zotero_save: "read";
    readonly research_zotero_update: "read";
}>;
export declare function registerManagedZoteroTools(pi: {
    registerTool(tool: unknown): void;
}, call: CapabilityCall): void;
