import {
	createResearchConnectorHostLoader,
	type ResearchConnectorHostLoader,
} from "./research-connectors.js";

export type {
	ResearchConnectorContext,
	ResearchConnectorDescriptor,
	ResearchConnectorFailure,
	ResearchConnectorHit,
	ResearchConnectorHostAdapter,
	ResearchConnectorHostLoader,
	ResearchConnectorHostOptions,
	ResearchConnectorKind,
	ResearchConnectorSourceReceipt,
	ResearchProjectStorageItem,
	ResearchProjectStoragePort,
	ResearchSearchRequest,
	ResearchSearchResponse,
} from "./research-connectors.js";

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

const UNAVAILABLE_WRITE_MESSAGE =
	"Research write adapters are unavailable; the host must inject an authorized write registry";

/**
 * Contract-only loader for hosts that do not provide connector transport yet.
 * It fails closed instead of pretending that an empty registry is a successful
 * search. Hosts can replace this loader with an authorized implementation.
 */
export const researchConnectorHostLoader: ResearchConnectorHostLoader = createResearchConnectorHostLoader({});

/**
 * Contract-only write loader. Preparation and execution are both explicit
 * failures until the host supplies authorization and a write-back port.
 */
export const researchWriteAdapterHostLoader: ResearchWriteAdapterHostLoader = {
	contractVersion: 1,
	load(): ResearchWriteAdapterHostAdapter {
		return {
			contractVersion: 1,
			status: "unavailable",
			descriptors: () => [],
			prepare: (..._args: readonly unknown[]) => {
				throw new Error(UNAVAILABLE_WRITE_MESSAGE);
			},
			execute: async (..._args: readonly unknown[]) => {
				throw new Error(UNAVAILABLE_WRITE_MESSAGE);
			},
		};
	},
};

export { createResearchConnectorHostLoader } from "./research-connectors.js";
