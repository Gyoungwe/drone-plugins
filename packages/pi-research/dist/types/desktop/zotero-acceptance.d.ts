import type { PluginRuntimeOperation } from "@gyoungwe/plugin-api/runtime";
import { type CapabilityCall } from "./capability-fetch.js";
/**
 * The `zotero_item` task acceptance in the Drone Desktop managed runtime, provided as the service
 * `task.acceptance:zotero_item` (the task plugin consumes the role `task.acceptance:`). Everything runs
 * here, in this package's owner: the task plugin sends JSON and caches only the text it gets back.
 * Reading back is read-only and goes through the host's `network.read` to the Zotero desktop local API.
 */
export declare const ZOTERO_ACCEPTANCE_SERVICE = "task.acceptance:zotero_item";
export declare const ZOTERO_ACCEPTANCE_OPERATIONS: readonly string[];
type Acceptance = Record<string, unknown>;
/** Static shape with `null`; per milestone the label, the consent entry and the "what's missing" hint. */
export declare function describeZoteroAcceptance(acceptance: Acceptance | null): {
    fields: string[];
    evidenceKind: string;
    label?: undefined;
    consent?: undefined;
    pending?: undefined;
} | {
    fields: string[];
    evidenceKind: string;
    label: string;
    consent: {
        libraryId: string | null;
        collection: string | null;
        doi: string;
    } | {
        libraryId: string | null;
        collection: string | null;
        slot: boolean;
    };
    pending: {
        reason: string;
        next: string;
    };
};
/** Read-only evidence row: summary, note and an "open in Zotero" link. The task plugin knows no Zotero. */
export declare function describeZoteroEvidence(result: Record<string, any>): Record<string, any>;
/** A save receipt becomes the identity of a DOI-less milestone only when this package read it back. */
export declare function identifyZoteroReceipt(event: Record<string, any>): {
    doi: string;
} | null;
export declare function verifyZoteroAcceptance(call: CapabilityCall, acceptance: Acceptance, signal?: AbortSignal): Promise<Record<string, any>>;
/** Runtime operations behind `provider.read({ role, member: "zotero_item", operation })`. */
export declare function zoteroAcceptanceOperations(): Record<"describe" | "verify", PluginRuntimeOperation>;
/** `provider.native` receiver: the host hands over the actual tool_execution_end event, never caller JSON. */
export declare const zoteroIdentifyNativeOperation: Readonly<{
    event: "tool_execution_end";
    effect: "read";
    inputSchema: {
        type: string;
    };
    resultSchema: {
        anyOf: {
            type: string;
        }[];
    };
    execute: (_input: unknown, actual: Record<string, any>) => Promise<{
        doi: string;
    } | null>;
}>;
export {};
