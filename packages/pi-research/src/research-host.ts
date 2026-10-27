/**
 * Keep this loader structurally aligned with @gyoungwe/plugin-api/research.
 * Local declarations let the package build against the currently published
 * plugin-api while hosts adopt the new research subpath.
 */
interface ResearchConnectorHostAdapter {
	readonly contractVersion: 1;
	readonly status: "ready" | "degraded" | "unavailable";
	readonly list: () => readonly unknown[];
	readonly recommend: (...args: readonly unknown[]) => Promise<unknown>;
	readonly search: (...args: readonly unknown[]) => Promise<unknown>;
}

interface ResearchConnectorHostLoader {
	readonly contractVersion: 1;
	readonly load: () => ResearchConnectorHostAdapter;
}

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

const UNAVAILABLE_CONNECTOR_MESSAGE =
	"Research connector transport is unavailable; the host must inject an authorized connector registry";
const UNAVAILABLE_WRITE_MESSAGE =
	"Research write adapters are unavailable; the host must inject an authorized write registry";

/**
 * Contract-only loader for hosts that do not provide connector transport yet.
 * It fails closed instead of pretending that an empty registry is a successful
 * search. Hosts can replace this loader with an authorized implementation.
 */
export const researchConnectorHostLoader: ResearchConnectorHostLoader = {
	contractVersion: 1,
	load(): ResearchConnectorHostAdapter {
		return {
			contractVersion: 1,
			status: "unavailable",
			list: () => [],
			recommend: async (..._args: readonly unknown[]) => {
				throw new Error(UNAVAILABLE_CONNECTOR_MESSAGE);
			},
			search: async (..._args: readonly unknown[]) => {
				throw new Error(UNAVAILABLE_CONNECTOR_MESSAGE);
			},
		};
	},
};

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
