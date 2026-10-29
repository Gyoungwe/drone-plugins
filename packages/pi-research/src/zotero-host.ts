/**
 * Host-neutral Zotero read adapter.
 *
 * The adapter owns only the operation contract and exact identity projection;
 * the composition root owns credentials, transport, response limits and any
 * user authorization. No network client, filesystem API or runtime is used here.
 */
import {
	lookupZoteroByDoi,
	type ZoteroListResponse,
	type ZoteroReconcileContext,
	type ZoteroReconcileExpectation,
} from "./core/zotero-reconcile.js";

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
		readonly input: Readonly<{ path: string }>;
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
export function createZoteroHost(port: ZoteroHostPort, context: ZoteroReconcileContext = {}): ZoteroHostAdapter {
	return {
		contractVersion: 1,
		operations: {
			lookup: (input) => lookupZoteroByDoi(port.read, input, context),
		},
	};
}

/** Adapt a host connector executor to the same read-only Zotero host contract. */
export function createZoteroConnectorHost(
	port: ZoteroConnectorHostPort,
	context: ZoteroReconcileContext = {},
): ZoteroHostAdapter {
	return createZoteroHost(
		{
			read: (path) => port.execute({ connectorId: "zotero", operation: "read", input: { path } }),
		},
		context,
	);
}

/** Register the adapter operation without adding side effects or ambient state. */
export function registerZoteroHost(
	registry: ZoteroHostRegistry,
	port: ZoteroHostPort,
	context?: ZoteroReconcileContext,
): ZoteroHostAdapter {
	const adapter = createZoteroHost(port, context);
	registry.register("lookup", adapter.operations.lookup);
	return adapter;
}

/** Register the connector-backed adapter without exposing transport details. */
export function registerZoteroConnectorHost(
	registry: ZoteroHostRegistry,
	port: ZoteroConnectorHostPort,
	context?: ZoteroReconcileContext,
): ZoteroHostAdapter {
	const adapter = createZoteroConnectorHost(port, context);
	registry.register("lookup", adapter.operations.lookup);
	return adapter;
}

export const zoteroHostLoader: ZoteroHostLoader = {
	contractVersion: 1,
	load: createZoteroHost,
};
