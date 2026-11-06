/**
 * Host-neutral Zotero read adapter.
 *
 * The adapter owns only the operation contract and exact identity projection;
 * the composition root owns credentials, transport, response limits and any
 * user authorization. No network client, filesystem API or runtime is used here.
 */
import { type ZoteroListResponse, type ZoteroReconcileContext, type ZoteroReconcileExpectation } from "./core/zotero-reconcile.js";
export interface ZoteroHostPort {
    read(path: string): Promise<ZoteroListResponse>;
}
/**
 * Narrow connector-shaped transport for hosts that expose Zotero through the
 * shared connector execution boundary. The response remains the host-owned
 * Zotero list envelope; credentials, authorization and receipt persistence do
 * not cross into the research package.
 */
export interface ZoteroConnectorHostPort {
    execute(request: {
        readonly connectorId: "zotero";
        readonly operation: "read";
        readonly input: Readonly<{
            path: string;
        }>;
    }): Promise<ZoteroListResponse>;
}
export interface ZoteroHostOperations {
    lookup(input: ZoteroReconcileExpectation): Promise<Record<string, unknown>>;
}
export interface ZoteroHostAdapter {
    readonly contractVersion: 1;
    readonly operations: ZoteroHostOperations;
}
export interface ZoteroHostRegistry {
    register(name: "lookup", operation: ZoteroHostOperations["lookup"]): void;
}
export interface ZoteroHostLoader {
    readonly contractVersion: 1;
    load(port: ZoteroHostPort, context?: ZoteroReconcileContext): ZoteroHostAdapter;
}
/** Build a read-only Zotero identity adapter over a host-owned transport. */
export declare function createZoteroHost(port: ZoteroHostPort, context?: ZoteroReconcileContext): ZoteroHostAdapter;
/** Adapt a host connector executor to the same read-only Zotero host contract. */
export declare function createZoteroConnectorHost(port: ZoteroConnectorHostPort, context?: ZoteroReconcileContext): ZoteroHostAdapter;
/** Register the adapter operation without adding side effects or ambient state. */
export declare function registerZoteroHost(registry: ZoteroHostRegistry, port: ZoteroHostPort, context?: ZoteroReconcileContext): ZoteroHostAdapter;
/** Register the connector-backed adapter without exposing transport details. */
export declare function registerZoteroConnectorHost(registry: ZoteroHostRegistry, port: ZoteroConnectorHostPort, context?: ZoteroReconcileContext): ZoteroHostAdapter;
export declare const zoteroHostLoader: ZoteroHostLoader;
