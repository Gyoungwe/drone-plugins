import type { KnowledgeBinding } from "./config.js";
import type {
	KnowledgeWorkerLifecycleStage,
	KnowledgeWorkerMetadata,
} from "./runtime-host.js";

/** Domain requests never receive a Worker or filesystem/process control methods. */
export interface KnowledgeServiceTransport {
	readonly closed: boolean;
	readonly closing: boolean;
	lifecycle: KnowledgeWorkerLifecycleStage;
	readonly metadata: KnowledgeWorkerMetadata;
	readonly version: string;
	readonly pendingRequestCount: number;
	waitUntilReady(): Promise<{ version: string }>;
	request(operation: string, input?: Record<string, unknown>): Promise<unknown>;
	/** Reject new requests, drain accepted ones and resolve only after resource exit. */
	close(): Promise<void>;
	prepareUnload(): { pendingRequests: number; version: string };
}

export interface KnowledgeServiceTransportFactory {
	metadata(): KnowledgeWorkerMetadata;
	create(input: {
		binding: KnowledgeBinding;
		directory: string;
		workerVersion?: string;
	}): KnowledgeServiceTransport;
}
