import { createHash } from "node:crypto";
import type {
	PluginExecutionDescription,
	PluginExecutionResult,
	PluginStateReadResult,
} from "@gyoungwe/plugin-api/runtime";
import { UnavailableKernelRunner } from "./domain/index.js";
import { inquiryProvider } from "./inquiry-provider.js";
import type { DiscoveryHostServices, DiscoveryJournalName } from "./ports.js";
import {
	type BoundWorkspaceRoot,
	type ExecutionIntent,
	type KernelOwner,
	type OwnerMetadata,
	ownerMetadata,
	type RuntimeState,
	records,
	type WorkspaceScope,
} from "./runtime-state.js";
import type { WorkspaceAccess } from "./runtime-workspace.js";
import { DiscoveryService } from "./service.js";

export const owner = async (
	{
		owners,
		capabilities,
		events,
		caller,
		read,
		applicationId,
	}: RuntimeState & Pick<WorkspaceAccess, "caller" | "read">,
	scope: WorkspaceScope,
	root: BoundWorkspaceRoot,
) => {
	let current = owners.get(scope.workspaceId);
	if (current) {
		if (current.root !== root.root.handle)
			throw new Error("Discovery workspace already owns another state root");
		await current.ready;
		return current;
	}
	const kernels = new Map<string, KernelOwner>(),
		intents = new Map<string, ExecutionIntent>();
	const activeKernels = new Set<string>(),
		verifiedReceipts = new Set<string>();
	let metadataVersion: string | null = null;
	let metadataWrites = Promise.resolve();
	const writeMetadata = (change: (state: OwnerMetadata) => OwnerMetadata): Promise<void> => {
		const pending = metadataWrites.then(async () => {
			const next = change({
				schemaVersion: 1,
				kernels: [...kernels.values()],
				intents: [...intents.values()],
			});
			const written = (await capabilities.call("state.writeJson", {
				root: root.root.handle,
				path: "owner-state.json",
				value: next,
				expectedVersion: metadataVersion,
			})) as PluginStateReadResult;
			metadataVersion = written.version;
			kernels.clear();
			intents.clear();
			for (const item of next.kernels) kernels.set(item.sessionId, item);
			for (const item of next.intents) intents.set(item.requestId, item);
			events.changed();
		});
		metadataWrites = pending.then(
			() => undefined,
			() => undefined,
		);
		return pending;
	};
	const journals = new Map<DiscoveryJournalName, string | null>();
	const services: DiscoveryHostServices = {
		journal: <T>(name: DiscoveryJournalName) => ({
			read: async () => {
				const stored = await read(root.root.handle, `${name}.json`);
				journals.set(name, stored.version);
				return (stored.kind === "missing" ? [] : records(stored.value, name)) as T[];
			},
			write: async (value: T[]) => {
				if (!journals.has(name)) {
					const stored = await read(root.root.handle, `${name}.json`);
					journals.set(name, stored.version);
				}
				const written = (await capabilities.call("state.writeJson", {
					root: root.root.handle,
					path: `${name}.json`,
					value,
					expectedVersion: journals.get(name),
				})) as PluginStateReadResult;
				journals.set(name, written.version);
				events.changed();
			},
		}),
		authorize: async (operation) => {
			const actual = await caller();
			if (actual.kind !== "session")
				throw new Error("Discovery mutation requires a real creator SDK session");
			if ("sessionId" in operation) {
				const ownership = kernels.get(operation.sessionId);
				if (
					!ownership ||
					ownership.creatorSessionId !== actual.sessionId ||
					!activeKernels.has(operation.sessionId)
				)
					throw new Error("Kernel belongs to another creator or is historical");
			}
			await capabilities.call("state.reserve", {
				root: root.root.handle,
				path: "",
			});
		},
		runner: async () => {
			const environment = (await capabilities.call("execution.describe", null)) as PluginExecutionDescription;
			if (environment.kind !== "container") return new UnavailableKernelRunner();
			return {
				capabilities: {
					kind: "container",
					languages: ["python", "r"],
					networkDisabled: true,
					writesOnlyToRunDirectory: true,
				},
				async run(request) {
					request.signal?.throwIfAborted();
					const actual = await caller();
					const ownership = [...kernels.values()].find(
						(item) => item.runDirectory === request.runDirectory && activeKernels.has(item.sessionId),
					);
					if (actual.kind !== "session" || !ownership || ownership.creatorSessionId !== actual.sessionId)
						throw new Error("Execution has no live creator-owned logical kernel");
					const intent: ExecutionIntent = {
						requestId: request.requestId,
						applicationId,
						sessionId: ownership.sessionId,
						creatorSessionId: actual.sessionId,
						codeSha256: createHash("sha256").update(request.code).digest("hex"),
						status: "pending",
					};
					await writeMetadata((state) => ({ ...state, intents: [...state.intents, intent] }));
					request.signal?.throwIfAborted();
					const executed = (await capabilities.call(
						"execution.run",
						{
							requestId: request.requestId,
							language: request.language,
							code: request.code,
							runDirectory: request.runDirectory,
							timeoutMs: request.timeoutMs,
							maxOutputBytes: request.maxOutputBytes,
							dataClassification: request.dataClassification,
							image: ownership.image,
						},
						request.signal,
					)) as PluginExecutionResult;
					request.signal?.throwIfAborted();
					await writeMetadata((state) => ({
						...state,
						intents: state.intents.map((item) =>
							item.requestId === request.requestId
								? { ...item, status: executed.receipt.status, receipt: executed.receipt }
								: item,
						),
					}));
					verifiedReceipts.add(request.requestId);
					return executed.result;
				},
			};
		},
		inquiry: inquiryProvider(capabilities, root.binding.projectId),
		files: {
			prepareDirectory: async () => {
				throw new Error("Controlled execution directory service is unavailable");
			},
			write: async () => {
				throw new Error("Discovery export service is unavailable");
			},
		},
		onExecution: async () => {
			events.changed();
		},
		legacyJournal: async () => undefined,
	};
	const service = new DiscoveryService({
		projectId: root.binding.projectId,
		projectRoot: scope.workspaceDirectory,
		services,
	});

	const ready = (async () => {
		await service.init();
		const stored = await read(root.root.handle, "owner-state.json");
		metadataVersion = stored.version;
		if (stored.kind === "value") {
			const metadata = ownerMetadata(stored.value);
			for (const record of metadata.kernels) kernels.set(record.sessionId, record);
			for (const record of metadata.intents) intents.set(record.requestId, record);
		}
	})().catch((error) => {
		owners.delete(scope.workspaceId);
		throw error;
	});
	current = {
		root: root.root.handle,
		service,
		kernels,
		intents,
		activeKernels,
		verifiedReceipts,
		ready,
		writeMetadata,
		closuresDirty: false,
	};
	owners.set(scope.workspaceId, current);
	await ready;
	return current;
};
