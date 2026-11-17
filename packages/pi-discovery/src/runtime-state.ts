import type {
	PluginExecutionReceipt,
	PluginRuntimeFactoryContext,
	PluginRuntimeRootDescription,
	PluginRuntimeScope,
} from "@gyoungwe/plugin-api/runtime";
import type { JournalName } from "./native-records.js";
import type { DiscoveryService } from "./service.js";

export interface DiscoveryWorkspaceBinding {
	readonly schemaVersion: 1;
	readonly projectId: string;
	readonly workspaceId: string;
	readonly workspaceDirectory: string;
}
export interface BoundRoot {
	readonly root: PluginRuntimeRootDescription;
	readonly binding: DiscoveryWorkspaceBinding | null;
	readonly hasExistingData: boolean;
}
export function binding(value: unknown): DiscoveryWorkspaceBinding {
	const item = value as Partial<DiscoveryWorkspaceBinding> | null;
	if (
		!item ||
		item.schemaVersion !== 1 ||
		typeof item.workspaceId !== "string" ||
		typeof item.workspaceDirectory !== "string" ||
		typeof item.projectId !== "string"
	)
		throw new Error("Discovery workspace binding is malformed");
	return item as DiscoveryWorkspaceBinding;
}
export function records(value: unknown, journal: JournalName): Record<string, unknown>[] {
	if (!Array.isArray(value) || value.some((item) => !item || typeof item !== "object" || Array.isArray(item)))
		throw new Error(`Discovery journal ${journal} must contain an array of records`);
	return value;
}

export interface KernelOwner {
	readonly sessionId: string;
	readonly creatorSessionId: string;
	readonly runDirectory: string;
	readonly image: string;
	readonly status: "creating" | "active" | "closed" | "cleanup-failed";
}
export interface ExecutionIntent {
	readonly requestId: string;
	readonly applicationId: string;
	readonly sessionId: string;
	readonly creatorSessionId: string;
	readonly codeSha256: string;
	readonly status: "pending" | "not-accepted" | "needs-recovery" | PluginExecutionReceipt["status"];
	readonly receipt?: PluginExecutionReceipt;
}
export interface OwnerMetadata {
	readonly schemaVersion: 1;
	readonly kernels: readonly KernelOwner[];
	readonly intents: readonly ExecutionIntent[];
}
export interface WorkspaceOwner {
	readonly root: string;
	readonly service: DiscoveryService;
	readonly kernels: Map<string, KernelOwner>;
	readonly intents: Map<string, ExecutionIntent>;
	readonly activeKernels: Set<string>;
	readonly verifiedReceipts: Set<string>;
	readonly ready: Promise<void>;
	closuresDirty: boolean;
	writeMetadata(change: (state: OwnerMetadata) => OwnerMetadata): Promise<void>;
}
export function ownerMetadata(value: unknown): OwnerMetadata {
	const item = value as Partial<OwnerMetadata> | null;
	if (!item || item.schemaVersion !== 1 || !Array.isArray(item.kernels) || !Array.isArray(item.intents))
		throw new Error("Discovery owner metadata is malformed");
	for (const record of item.kernels) {
		if (
			!record ||
			typeof record.sessionId !== "string" ||
			typeof record.creatorSessionId !== "string" ||
			typeof record.runDirectory !== "string" ||
			typeof record.image !== "string" ||
			!["creating", "active", "closed", "cleanup-failed"].includes(record.status)
		)
			throw new Error("Discovery kernel ownership metadata is malformed");
	}
	for (const record of item.intents) {
		if (
			!record ||
			typeof record.requestId !== "string" ||
			typeof record.applicationId !== "string" ||
			typeof record.sessionId !== "string" ||
			typeof record.creatorSessionId !== "string" ||
			typeof record.codeSha256 !== "string" ||
			![
				"pending",
				"not-accepted",
				"needs-recovery",
				"accepted",
				"succeeded",
				"failed",
				"cancelled",
				"cleanup-failed",
			].includes(record.status)
		)
			throw new Error("Discovery execution intent metadata is malformed");
	}
	if (
		new Set(item.kernels.map((record) => record.sessionId)).size !== item.kernels.length ||
		new Set(item.intents.map((record) => record.requestId)).size !== item.intents.length
	)
		throw new Error("Discovery owner metadata contains duplicate identities");
	return item as OwnerMetadata;
}

export type WorkspaceScope = Exclude<PluginRuntimeScope, { kind: "application" }>;
export type BoundWorkspaceRoot = BoundRoot & { binding: DiscoveryWorkspaceBinding };
export type WorkspaceOwnerLookup = (
	scope: WorkspaceScope,
	root: BoundWorkspaceRoot,
) => Promise<WorkspaceOwner>;
export type RuntimeState = Pick<
	PluginRuntimeFactoryContext,
	"applicationId" | "signal" | "capabilities" | "events"
> & { readonly owners: Map<string, WorkspaceOwner> };
