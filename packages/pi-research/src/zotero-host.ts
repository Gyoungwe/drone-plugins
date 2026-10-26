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

export const zoteroHostLoader: ZoteroHostLoader = {
	contractVersion: 1,
	load: createZoteroHost,
};
