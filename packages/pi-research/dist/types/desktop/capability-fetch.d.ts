/**
 * `fetch` for the Drone Desktop managed runtime, whose process has no network: every request goes
 * through the host's `network.read` / `network.write` capabilities, which admit only the hosts this
 * package declares in `permissions.network`. Shaped like `fetch` so the Zotero runtime's existing
 * `fetchImpl` seams take it unchanged.
 */
export type CapabilityCall = (name: string, input: unknown, signal?: AbortSignal) => Promise<unknown>;
export interface CapabilityFetchOptions {
    /** "host/path" POST endpoints that only read; must equal the manifest's `drone.networkReads`. */
    readonly reads?: readonly string[];
    /** Shown in the host's write dialog as this plugin's description of the write. */
    readonly summary?: string;
    /** A task grant allowance this write uses instead of the host's dialog (each is admitted once). */
    readonly allowance?: string;
    /**
     * A manifest `drone.credentials` slot. Toward its hosts the runtime's own copy of the header is dropped
     * and the slot is named instead, so the host attaches the secret the user saved in Drone settings.
     */
    readonly credential?: {
        readonly slot: string;
        readonly header: string;
        readonly hosts: readonly string[];
    };
}
export declare function capabilityFetch(call: CapabilityCall, { reads, summary, allowance, credential }?: CapabilityFetchOptions): typeof fetch;
