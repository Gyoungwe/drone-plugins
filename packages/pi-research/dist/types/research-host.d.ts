import { type ResearchConnectorHostLoader } from "./research-connectors.js";
export type { ResearchConnectorContext, ResearchConnectorDescriptor, ResearchConnectorFailure, ResearchConnectorHit, ResearchConnectorHostAdapter, ResearchConnectorHostLoader, ResearchConnectorHostOptions, ResearchConnectorKind, ResearchConnectorSourceReceipt, ResearchProjectStorageItem, ResearchProjectStoragePort, ResearchSearchRequest, ResearchSearchResponse, } from "./research-connectors.js";
interface ResearchWriteAdapterHostAdapter {
    readonly contractVersion: 1;
    readonly status: "ready" | "degraded" | "unavailable";
    readonly descriptors: () => readonly unknown[];
    readonly prepare: (...args: readonly unknown[]) => never;
    readonly execute: (...args: readonly unknown[]) => Promise<never>;
}
interface ResearchWriteAdapterHostLoader {
    readonly contractVersion: 1;
    readonly load: () => ResearchWriteAdapterHostAdapter;
}
/**
 * Contract-only loader for hosts that do not provide connector transport yet.
 * It fails closed instead of pretending that an empty registry is a successful
 * search. Hosts can replace this loader with an authorized implementation.
 */
export declare const researchConnectorHostLoader: ResearchConnectorHostLoader;
/**
 * Contract-only write loader. Preparation and execution are both explicit
 * failures until the host supplies authorization and a write-back port.
 */
export declare const researchWriteAdapterHostLoader: ResearchWriteAdapterHostLoader;
export { createResearchConnectorHostLoader } from "./research-connectors.js";
