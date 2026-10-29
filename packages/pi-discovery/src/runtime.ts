import { createHash } from "node:crypto";
import type { PluginNativeRuntimeFactory, PluginNativeSession } from "@gyoungwe/plugin-api/native";
import type {
	PluginRuntimeRootDescription,
	PluginRuntimeScope,
	PluginStateReadResult,
	PluginExecutionDescription,
	PluginExecutionReceipt,
	PluginExecutionReceiptResult,
	PluginExecutionResult,
} from "@gyoungwe/plugin-api/runtime";
import { inquiryProvider } from "./inquiry-provider.js";
import type { DiscoveryLedgerInput } from "./domain/index.js";
import { DiscoveryService } from "./service.js";
import type { DiscoveryHostServices, DiscoveryJournalName } from "./ports.js";
import { JOURNALS, type JournalName } from "./native-records.js";
import { UnavailableKernelRunner } from "./domain/index.js";

const readMetadata = {
	drone: { readOnly: true, capabilities: ["research", "analysis"] },
};
const writeMetadata = { drone: { capabilities: ["research", "analysis"] } };
const bindingPath = "workspace-binding.json";
const nullSchema = { type: "null" } as const;
const objectSchema = { type: "object" } as const;
const bindingSchema = {
	type: "object",
	properties: {
		root: { type: "string", minLength: 1 },
		acknowledgeExistingData: { type: "boolean" },
	},
	required: ["root", "acknowledgeExistingData"],
	additionalProperties: false,
} as const;
export const planSchema = {
	type: "object",
	properties: {
		id: { type: "string", minLength: 1 },
		hypothesisId: { type: "string", minLength: 1 },
		prior: {
			type: "object",
			properties: {
				direction: { enum: ["positive", "negative", "none", "unknown"] },
				recordedAt: { type: "string" },
				confidence: { type: "number", minimum: 0, maximum: 1 },
				magnitude: { type: "number", minimum: 0 },
			},
			required: ["direction", "recordedAt"],
			additionalProperties: false,
		},
		budget: {
			type: "object",
			properties: {
				maxExecutions: { type: "integer", minimum: 1 },
				maxWallTimeMs: { type: "integer", minimum: 1 },
				maxOutputBytes: { type: "integer", minimum: 1 },
				maxCostUnits: { type: "number", exclusiveMinimum: 0 },
			},
			required: ["maxExecutions", "maxWallTimeMs", "maxOutputBytes", "maxCostUnits"],
			additionalProperties: false,
		},
		candidates: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string", minLength: 1 },
					statement: { type: "string", minLength: 1 },
					surprise: { type: "number", minimum: 0, maximum: 1 },
					estimatedCost: { type: "number", exclusiveMinimum: 0 },
					expectedExplanationsExcluded: { type: "number", minimum: 0 },
					credibility: { type: "number", minimum: 0, maximum: 1 },
				},
				required: [
					"id",
					"statement",
					"surprise",
					"estimatedCost",
					"expectedExplanationsExcluded",
					"credibility",
				],
				additionalProperties: false,
			},
		},
	},
	required: ["id", "hypothesisId", "prior", "budget", "candidates"],
	additionalProperties: false,
} as const;
export interface DiscoveryWorkspaceBinding {
	readonly schemaVersion: 1;
	readonly projectId: string;
	readonly workspaceId: string;
	readonly workspaceDirectory: string;
}
interface BoundRoot {
	readonly root: PluginRuntimeRootDescription;
	readonly binding: DiscoveryWorkspaceBinding | null;
	readonly hasExistingData: boolean;
}
function binding(value: unknown): DiscoveryWorkspaceBinding {
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
function records(value: unknown, journal: JournalName): Record<string, unknown>[] {
	if (
		!Array.isArray(value) ||
		value.some((item) => !item || typeof item !== "object" || Array.isArray(item))
	)
		throw new Error(`Discovery journal ${journal} must contain an array of records`);
	return value;
}
const response = (details: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(details) }],
	details,
});

interface KernelOwner {
	readonly sessionId: string;
	readonly creatorSessionId: string;
	readonly runDirectory: string;
	readonly image: string;
	readonly status: "creating" | "active" | "closed" | "cleanup-failed";
}
interface ExecutionIntent {
	readonly requestId: string;
	readonly applicationId: string;
	readonly sessionId: string;
	readonly creatorSessionId: string;
	readonly codeSha256: string;
	readonly status: "pending" | "not-accepted" | "needs-recovery" | PluginExecutionReceipt["status"];
	readonly receipt?: PluginExecutionReceipt;
}
interface OwnerMetadata {
	readonly schemaVersion: 1;
	readonly kernels: readonly KernelOwner[];
	readonly intents: readonly ExecutionIntent[];
}
interface WorkspaceOwner {
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
function ownerMetadata(value: unknown): OwnerMetadata {
	const item = value as Partial<OwnerMetadata> | null;
	if (
		!item ||
		item.schemaVersion !== 1 ||
		!Array.isArray(item.kernels) ||
		!Array.isArray(item.intents)
	)
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

/** One application owner; each live call resolves its canonical workspace through the host. */
export const createDiscoveryRuntime: PluginNativeRuntimeFactory = async ({
	applicationId,
	signal,
	capabilities,
	events,
}) => {
	const owners = new Map<string, WorkspaceOwner>();
	const caller = () => capabilities.call("caller.scope", null) as Promise<PluginRuntimeScope>;
	const read = (root: string, path: string) =>
		capabilities.call("state.readJson", {
			root,
			path,
		}) as Promise<PluginStateReadResult>;
	const roots = async (): Promise<BoundRoot[]> => {
		const granted = (await capabilities.call(
			"roots.describe",
			null,
		)) as readonly PluginRuntimeRootDescription[];
		return Promise.all(
			granted
				.filter((item) => item.kind === "state")
				.map(async (root) => {
					const stored = await read(root.handle, bindingPath);
					// A saved binding is already existing state; only unbound roots need a journal inventory for adoption.
					const entries =
						stored.kind === "missing"
							? ((await capabilities.call("state.list", {
									root: root.handle,
									path: "",
								})) as readonly { name: string }[])
							: [];
					return {
						root,
						binding: stored.kind === "missing" ? null : binding(stored.value),
						hasExistingData:
							stored.kind === "value" ||
							entries.some((item) => JOURNALS.some((name) => item.name === `${name}.json`)),
					};
				}),
		);
	};
	const workspace = async () => {
		const scope = await caller();
		if (scope.kind === "application")
			throw new Error("Select a real workspace session before using discovery");
		return scope;
	};
	const journalRecords = async (root: string, journal: JournalName) => {
		const stored = await read(root, `${journal}.json`);
		return stored.kind === "missing" ? [] : records(stored.value, journal);
	};
	const findRoot = async (scope: Exclude<PluginRuntimeScope, { kind: "application" }>) => {
		const selected = (await roots()).filter(
			(item): item is BoundRoot & { binding: DiscoveryWorkspaceBinding } =>
				item.binding?.workspaceId === scope.workspaceId,
		);
		if (selected.length > 1)
			throw new Error("More than one approved discovery root is bound to this workspace");
		return selected[0];
	};
	const overview = async (preferredRoot?: string) => {
		const scope = await caller();
		const available = await roots();
		const selected =
			scope.kind === "application"
				? undefined
				: available.find(
						(item) =>
							item.binding?.workspaceId === scope.workspaceId ||
							(!item.binding && item.root.handle === preferredRoot),
					);
		const journals = selected
			? await Promise.all(
					JOURNALS.map(async (journal) => ({
						journal,
						count: (await journalRecords(selected.root.handle, journal)).length,
					})),
				)
			: [];
		return {
			scope,
			readOnly: true,
			status: journals.some((item) => item.count > 0) ? "configured" : "unconfigured",
			readiness:
				scope.kind === "application"
					? "select-session"
					: selected?.binding
						? owners.has(scope.workspaceId)
							? "ready"
							: "needs-ownership"
						: "needs-binding",
			roots: available,
			journals,
			execution: "unavailable",
			inquiry: await capabilities.call("provider.inspect", { alias: "inquiry" }),
		};
	};
	const owner = async (
		scope: Exclude<PluginRuntimeScope, { kind: "application" }>,
		root: BoundRoot & { binding: DiscoveryWorkspaceBinding },
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
				const environment = (await capabilities.call(
					"execution.describe",
					null,
				)) as PluginExecutionDescription;
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
							(item) =>
								item.runDirectory === request.runDirectory && activeKernels.has(item.sessionId),
						);
						if (
							actual.kind !== "session" ||
							!ownership ||
							ownership.creatorSessionId !== actual.sessionId
						)
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
	const bind = async (input: { root: string; acknowledgeExistingData: boolean }) => {
		const scope = await workspace();
		const selected = (await roots()).find((item) => item.root.handle === input.root);
		if (!selected || selected.root.access !== "read-write")
			throw new Error("Select an approved writable discovery state root");
		if (selected.binding && selected.binding.workspaceId !== scope.workspaceId)
			throw new Error("Discovery state belongs to another workspace");
		if (!selected.binding && selected.hasExistingData && !input.acknowledgeExistingData)
			throw new Error(
				"Existing discovery journals require explicit acknowledgement before binding",
			);
		await capabilities.call("state.reserve", { root: input.root, path: "" });
		const stored = await read(input.root, bindingPath);
		if (stored.kind === "value") {
			if (binding(stored.value).workspaceId !== scope.workspaceId)
				throw new Error("Discovery state belongs to another workspace");
		} else {
			const plans = await journalRecords(input.root, "plans");
			const ids = plans.map((plan) => {
				if (typeof plan.projectId !== "string")
					throw new Error("Existing discovery plan has no project identity");
				return plan.projectId;
			});
			const unique = [...new Set(ids)];
			if (unique.length > 1)
				throw new Error("Existing discovery plans contain conflicting project identities");
			const projectId =
				unique[0] ??
				`discovery-${createHash("sha256").update(scope.workspaceId).digest("hex").slice(0, 32)}`;
			await capabilities.call("state.writeJson", {
				root: input.root,
				path: bindingPath,
				value: {
					schemaVersion: 1,
					projectId,
					workspaceId: scope.workspaceId,
					workspaceDirectory: scope.workspaceDirectory,
				},
				expectedVersion: null,
			});
		}
		const verified = await read(input.root, bindingPath);
		if (verified.kind !== "value" || binding(verified.value).workspaceId !== scope.workspaceId)
			throw new Error("Discovery workspace binding did not read back");
		await owner(scope, { ...selected, binding: binding(verified.value) });
		events.changed();
		return overview();
	};
	const list = async (input: { journal: JournalName; query?: string; root?: string }) => {
		const scope = await workspace();
		const root = input.root
			? (await roots()).find((item) => item.root.handle === input.root)
			: await findRoot(scope);
		if (root?.binding && root.binding.workspaceId !== scope.workspaceId)
			throw new Error("Discovery state belongs to another workspace");
		if (!JOURNALS.includes(input.journal)) throw new Error("Unknown discovery journal");
		if (!root)
			return {
				readOnly: true,
				status: "unconfigured",
				journal: input.journal,
				records: [],
				count: 0,
				truncated: false,
			};
		const values = await journalRecords(root.root.handle, input.journal);
		const query = input.query?.trim().toLocaleLowerCase();
		const matches = query
			? values.filter((value) => JSON.stringify(value).toLocaleLowerCase().includes(query))
			: values;
		return {
			readOnly: true,
			status: "configured",
			journal: input.journal,
			records: matches.slice(0, 32),
			count: matches.length,
			truncated: matches.length > 32,
		};
	};
	const createPlan = async (input: Parameters<DiscoveryService["createExplorationPlan"]>[0]) => {
		const scope = await workspace();
		const selected = await findRoot(scope);
		if (!selected) throw new Error("Bind a discovery state directory before creating a plan");
		await capabilities.call("state.reserve", {
			root: selected.root.handle,
			path: "",
		});
		return (await owner(scope, selected)).service.createExplorationPlan(input);
	};
	const journalSchema = { type: "string", enum: JOURNALS } as const;
	const creatorOwner = async () => {
		const scope = await workspace();
		if (scope.kind !== "session") throw new Error("Select a real creator SDK session for kernels");
		const selected = await findRoot(scope);
		if (!selected)
			throw new Error("Bind a discovery state directory before creating a logical kernel");
		return { scope, owned: await owner(scope, selected) };
	};
	const ownedKernel = (owned: WorkspaceOwner, creatorSessionId: string, sessionId: string) => {
		const kernel = owned.kernels.get(sessionId);
		if (
			!kernel ||
			kernel.creatorSessionId !== creatorSessionId ||
			!owned.activeKernels.has(sessionId)
		)
			throw new Error("Kernel belongs to another creator or is a historical record");
		return kernel;
	};
	const listKernels = async () => {
		const { scope, owned } = await creatorOwner();
		return {
			kernels: (await owned.service.listKernelSessions()).map((kernel) => ({
				...kernel,
				creatorSessionId: owned.kernels.get(kernel.sessionId)?.creatorSessionId ?? null,
				ownership: !owned.activeKernels.has(kernel.sessionId)
					? "historical"
					: owned.kernels.get(kernel.sessionId)?.creatorSessionId === scope.sessionId
						? "own"
						: "another-creator",
				ownershipState: owned.kernels.get(kernel.sessionId)?.status ?? "unassigned",
				image: owned.kernels.get(kernel.sessionId)?.image ?? null,
				logicalOnly: true,
			})),
			intents: [...owned.intents.values()].map((intent) => ({
				...intent,
				verification: owned.verifiedReceipts.has(intent.requestId)
					? "host-verified-this-activation"
					: "historical-unverified",
			})),
		};
	};
	const createKernel = async (
		input: Parameters<DiscoveryService["createKernelSession"]>[0] & { image: string },
	) => {
		const { scope, owned } = await creatorOwner();
		if (
			owned.kernels.has(input.sessionId) ||
			(await owned.service.getKernelSession(input.sessionId))
		)
			throw new Error("Kernel identity already exists; use a new identity");
		if (
			[...owned.kernels.values()].some(
				(item) =>
					owned.activeKernels.has(item.sessionId) && item.runDirectory === input.runDirectory,
			)
		)
			throw new Error("An active logical kernel already owns this runs directory");
		const record: KernelOwner = {
			sessionId: input.sessionId,
			creatorSessionId: scope.sessionId,
			runDirectory: input.runDirectory,
			image: input.image,
			status: "creating",
		};
		await owned.writeMetadata((state) => ({ ...state, kernels: [...state.kernels, record] }));
		const created = await owned.service.createKernelSession(input);
		owned.activeKernels.add(input.sessionId);
		await owned.writeMetadata((state) => ({
			...state,
			kernels: state.kernels.map((item) =>
				item.sessionId === input.sessionId ? { ...item, status: "active" } : item,
			),
		}));
		return {
			kernel: created,
			creatorSessionId: scope.sessionId,
			logicalOnly: true,
			environment: await capabilities.call("execution.describe", null),
		};
	};
	const reconcile = async (signal?: AbortSignal) => {
		const { scope, owned } = await creatorOwner();
		for (const intent of [...owned.intents.values()].filter(
			(item) => item.creatorSessionId === scope.sessionId,
		)) {
			signal?.throwIfAborted();
			if (intent.applicationId !== applicationId) {
				await owned.writeMetadata((state) => ({
					...state,
					intents: state.intents.map((item) =>
						item.requestId === intent.requestId ? { ...item, status: "needs-recovery" } : item,
					),
				}));
				continue;
			}
			let receipt: PluginExecutionReceiptResult;
			try {
				receipt = (await capabilities.call("execution.receipt", {
					requestId: intent.requestId,
				})) as PluginExecutionReceiptResult;
			} catch (error) {
				if (
					!(error instanceof Error) ||
					!("code" in error) ||
					error.code !== "EXECUTION_RECEIPT_NEEDS_RECOVERY"
				)
					throw error;
				signal?.throwIfAborted();
				await owned.writeMetadata((state) => ({
					...state,
					intents: state.intents.map((item) =>
						item.requestId === intent.requestId ? { ...item, status: "needs-recovery" } : item,
					),
				}));
				continue;
			}
			signal?.throwIfAborted();
			await owned.writeMetadata((state) => ({
				...state,
				intents: state.intents.map((item) =>
					item.requestId === intent.requestId
						? {
								...item,
								status: receipt.kind === "missing" ? "not-accepted" : receipt.receipt.status,
								...(receipt.kind === "value" ? { receipt: receipt.receipt } : {}),
							}
						: item,
				),
			}));
			owned.verifiedReceipts.add(intent.requestId);
		}
		signal?.throwIfAborted();
		await owned.service.persistObservedKernelStates();
		if (owned.closuresDirty) {
			signal?.throwIfAborted();
			await owned.writeMetadata((state) => state);
			owned.closuresDirty = false;
		}
		return listKernels();
	};
	const executeKernel = async (
		input: { sessionId: string; code: string },
		signal?: AbortSignal,
	) => {
		const { scope, owned } = await creatorOwner();
		const kernel = ownedKernel(owned, scope.sessionId, input.sessionId);
		if (kernel.status !== "active")
			throw new Error("Kernel ownership is not active; reconcile it before execution");
		const execution = await owned.service.executeKernel(input.sessionId, input.code, signal);
		signal?.throwIfAborted();
		await reconcile(signal);
		return { execution, ...(await listKernels()) };
	};
	const closeKernel = async (input: { sessionId: string }, signal?: AbortSignal) => {
		const { scope, owned } = await creatorOwner();
		ownedKernel(owned, scope.sessionId, input.sessionId);
		signal?.throwIfAborted();
		// Closing the actual creator's logical kernel aborts its own current run/approval and waits for cleanup.
		await owned.service.closeKernelSession(input.sessionId);
		signal?.throwIfAborted();
		await reconcile(signal);
		await owned.writeMetadata((state) => ({
			...state,
			kernels: state.kernels.map((item) =>
				item.sessionId === input.sessionId ? { ...item, status: "closed" } : item,
			),
		}));
		owned.activeKernels.delete(input.sessionId);
		return listKernels();
	};
	const kernelSchema = {
		type: "object",
		properties: {
			sessionId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[a-zA-Z0-9._-]+$" },
			runDirectory: { type: "string", minLength: 6, pattern: "^runs/" },
			language: { enum: ["python", "r"] },
			image: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
			dataClassification: { enum: ["public", "internal", "controlled", "restricted"] },
			idleTimeoutMs: { type: "integer", minimum: 1, maximum: 120000 },
			executionTimeoutMs: { type: "integer", minimum: 1, maximum: 120000 },
			maxExecutions: { type: "integer", minimum: 1, maximum: 32 },
			maxOutputBytes: { type: "integer", minimum: 1, maximum: 1000000 },
		},
		required: ["sessionId", "runDirectory", "language", "image", "dataClassification"],
		additionalProperties: false,
	} as const;
	const kernelIdSchema = {
		type: "object",
		properties: { sessionId: kernelSchema.properties.sessionId },
		required: ["sessionId"],
		additionalProperties: false,
	} as const;
	const kernelExecuteSchema = {
		type: "object",
		properties: {
			sessionId: kernelSchema.properties.sessionId,
			code: { type: "string", minLength: 1, maxLength: 1000000 },
		},
		required: ["sessionId", "code"],
		additionalProperties: false,
	} as const;
	const executionDescription = () => capabilities.call("execution.describe", null);
	const executionReceipt = (input: unknown) => capabilities.call("execution.receipt", input);
	const cancelExecution = (input: unknown) => capabilities.call("execution.cancel", input);
	const requestSchema = {
		type: "object",
		properties: {
			requestId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[a-zA-Z0-9._-]+$" },
		},
		required: ["requestId"],
		additionalProperties: false,
	} as const;
	const recordInquiry = async (input: DiscoveryLedgerInput) => {
		const scope = await workspace(),
			root = await findRoot(scope);
		if (!root) throw new Error("Bind the Discovery state root first");
		await (await owner(scope, root)).service.recordDiscovery(input);
		return { recorded: true, authority: "plugin-asserted-or-imported" };
	};
	const operations = {
		recordInquiry: {
			inputSchema: {
				type: "object",
				properties: {
					projectId: { type: "string" },
					questionId: { type: "string" },
					statement: { type: "string" },
					hypothesisId: { type: "string" },
					prior: { type: "object" },
					posterior: { type: "object" },
					explanations: { type: "array", items: { type: "object" } },
					testsPlanned: { type: "array", items: { type: "string" } },
					attemptId: { type: "string" },
					parameters: { type: "object" },
					artifactIds: { type: "array", items: { type: "string" } },
				},
				required: [
					"projectId",
					"questionId",
					"statement",
					"prior",
					"explanations",
					"testsPlanned",
					"attemptId",
				],
				additionalProperties: false,
			},
			resultSchema: objectSchema,
			effect: "write" as const,
			execute: (input: unknown) => recordInquiry(input as DiscoveryLedgerInput),
		},

		overview: {
			inputSchema: nullSchema,
			resultSchema: objectSchema,
			effect: "read" as const,
			execute: () => overview(),
		},
		bindCurrentWorkspace: {
			inputSchema: bindingSchema,
			resultSchema: objectSchema,
			effect: "write" as const,
			execute: (input: unknown) => bind(input as Parameters<typeof bind>[0]),
		},
		listRecords: {
			inputSchema: {
				type: "object",
				properties: {
					root: { type: "string" },
					journal: journalSchema,
					query: { type: "string", minLength: 1, maxLength: 2000 },
				},
				required: ["journal"],
				additionalProperties: false,
			},
			resultSchema: objectSchema,
			effect: "read" as const,
			execute: (input: unknown) => list(input as Parameters<typeof list>[0]),
		},
		listKernelSessions: {
			inputSchema: nullSchema,
			resultSchema: objectSchema,
			effect: "read" as const,
			execute: () => listKernels(),
		},
		createKernelSession: {
			inputSchema: kernelSchema,
			resultSchema: objectSchema,
			effect: "write" as const,
			execute: (input: unknown) => createKernel(input as Parameters<typeof createKernel>[0]),
		},
		executeKernel: {
			inputSchema: kernelExecuteSchema,
			resultSchema: objectSchema,
			effect: "write" as const,
			execute: (input: unknown, context: { signal: AbortSignal }) =>
				executeKernel(input as Parameters<typeof executeKernel>[0], context.signal),
		},
		closeKernelSession: {
			inputSchema: kernelIdSchema,
			resultSchema: objectSchema,
			effect: "write" as const,
			execute: (input: unknown, context: { signal: AbortSignal }) =>
				closeKernel(input as { sessionId: string }, context.signal),
		},
		reconcileExecutions: {
			inputSchema: nullSchema,
			resultSchema: objectSchema,
			effect: "write" as const,
			execute: (_input: unknown, context: { signal: AbortSignal }) => reconcile(context.signal),
		},
		executionDescription: {
			inputSchema: nullSchema,
			resultSchema: objectSchema,
			effect: "read" as const,
			execute: () => executionDescription(),
		},
		executionReceipt: {
			inputSchema: requestSchema,
			resultSchema: objectSchema,
			effect: "read" as const,
			execute: executionReceipt,
		},
		cancelExecution: {
			inputSchema: requestSchema,
			resultSchema: objectSchema,
			effect: "write" as const,
			execute: cancelExecution,
		},
		createExplorationPlan: {
			inputSchema: planSchema,
			resultSchema: objectSchema,
			effect: "write" as const,
			execute: (input: unknown) => createPlan(input as Parameters<typeof createPlan>[0]),
		},
	};
	const createNativeSession = (): PluginNativeSession => {
		let creatorSessionId: string | undefined;
		return {
			toolEffects: {
				discovery_status: "read",
				discovery_list_records: "read",
				discovery_search_records: "read",
				discovery_bind_workspace: "write",
				discovery_create_plan: "write",
				discovery_execution_environment: "read",
				discovery_execution_receipt: "read",
				discovery_cancel_execution: "write",
				discovery_list_kernels: "read",
				discovery_create_kernel: "write",
				discovery_execute_kernel: "write",
				discovery_close_kernel: "write",
				discovery_reconcile_executions: "write",
				discovery_record_inquiry: "write",
			},
			extension(pi) {
				const adapted = Object.create(pi) as typeof pi;
				adapted.registerTool = (definition) =>
					pi.registerTool({
						...definition,
						async execute(id, input, signal, update, context) {
							const scope = await caller();
							if (
								scope.kind !== "session" ||
								(creatorSessionId && creatorSessionId !== scope.sessionId)
							)
								throw new Error("Native projection belongs to another SDK session");
							creatorSessionId = scope.sessionId;
							return definition.execute(id, input, signal, update, context);
						},
					});
				const nativePi = adapted;
				const emptyParameters = {
					type: "object",
					properties: {},
					additionalProperties: false,
				} as const;
				const kernelTools: readonly [
					string,
					object,
					"read" | "write",
					(input: unknown, signal?: AbortSignal) => Promise<unknown>,
				][] = [
					["discovery_list_kernels", emptyParameters, "read", () => listKernels()],
					[
						"discovery_create_kernel",
						kernelSchema,
						"write",
						(input) => createKernel(input as Parameters<typeof createKernel>[0]),
					],
					[
						"discovery_execute_kernel",
						kernelExecuteSchema,
						"write",
						(input, signal) => executeKernel(input as Parameters<typeof executeKernel>[0], signal),
					],
					[
						"discovery_close_kernel",
						kernelIdSchema,
						"write",
						(input, signal) => closeKernel(input as { sessionId: string }, signal),
					],
					[
						"discovery_reconcile_executions",
						emptyParameters,
						"write",
						(_input, signal) => reconcile(signal),
					],
				];
				for (const [name, parameters, effect, run] of kernelTools)
					nativePi.registerTool({
						name,
						label: "Discovery · logical kernel",
						description:
							name === "discovery_create_kernel"
								? "Create only a creator-owned logical kernel and budget; no container is started. Configured cached images and actual approval are still required for execution."
								: "Operate only the calling creator SDK session's discovery logical kernels and verified host receipts; historical records cannot be adopted.",
						parameters,
						...(effect === "read" ? readMetadata : writeMetadata),
						async execute(_id, input, signal) {
							return response(await run(input, signal));
						},
					});
				for (const [name, operation, effect, description] of [
					[
						"discovery_execution_environment",
						"executionDescription",
						"read",
						"Read only the configured Python/R cached exact image identities; never pulls or enumerates images.",
					],
					[
						"discovery_execution_receipt",
						"executionReceipt",
						"read",
						"Read only this live creator session's own host execution receipt; missing is not closed.",
					],
					[
						"discovery_cancel_execution",
						"cancelExecution",
						"write",
						"Cancel this creator's accepted execution, wait for owned cleanup and return its terminal receipt; missing is never closed.",
					],
				] as const)
					nativePi.registerTool({
						name,
						label: "Discovery · execution",
						description,
						parameters:
							operations[operation].inputSchema.type === "null"
								? { type: "object", properties: {}, additionalProperties: false }
								: requestSchema,
						...(effect === "read" ? readMetadata : writeMetadata),
						async execute(_id, input) {
							return response(
								await operations[operation].execute(
									operation === "executionDescription" ? null : input,
								),
							);
						},
					});
				nativePi.registerTool({
					name: "discovery_record_inquiry",
					label: "Discovery · Inquiry",
					description:
						"Record a discovery question and attempt through the optional versioned Inquiry provider bound to this actual workspace. Records remain asserted data. Each provider write needs its own current authorization.",
					parameters: operations.recordInquiry.inputSchema,
					...writeMetadata,
					async execute(_id, input) {
						return response(await recordInquiry(input as DiscoveryLedgerInput));
					},
				});
				nativePi.registerTool({
					name: "discovery_status",
					label: "Discovery · status",
					description:
						"Read approved discovery roots and current workspace journals; does not acquire writer ownership.",
					parameters: {
						type: "object",
						properties: { root: { type: "string" } },
						additionalProperties: false,
					},
					...readMetadata,
					async execute(_id, input) {
						return response(await overview((input as { root?: string }).root));
					},
				});
				for (const name of ["discovery_list_records", "discovery_search_records"] as const)
					nativePi.registerTool({
						name,
						label: "Discovery · records",
						description:
							"Read approved current-workspace discovery journal records; observations are not independent scientific validation.",
						parameters: operations.listRecords.inputSchema,
						...readMetadata,
						async execute(_id, input) {
							return response(await list(input as Parameters<typeof list>[0]));
						},
					});
				nativePi.registerTool({
					name: "discovery_bind_workspace",
					label: "Discovery · bind",
					description:
						"Explicitly bind an approved state directory to this real workspace, acknowledge any existing journals, and acquire exclusive writer ownership.",
					parameters: bindingSchema,
					...writeMetadata,
					async execute(_id, input) {
						return response(await bind(input));
					},
				});
				nativePi.registerTool({
					name: "discovery_create_plan",
					label: "Discovery · plan",
					description:
						"Persist a ranked exploration plan in the bound workspace. Does not execute code or certify scientific validity.",
					parameters: planSchema,
					...writeMetadata,
					async execute(_id, input) {
						return response(await createPlan(input));
					},
				});
			},
			async dispose() {
				if (!creatorSessionId) return;
				const closing = [...owners.values()].flatMap((owned) =>
					[...owned.kernels.values()]
						.filter(
							(kernel) =>
								kernel.creatorSessionId === creatorSessionId &&
								owned.activeKernels.has(kernel.sessionId),
						)
						.map(async (kernel) => {
							await owned.service.disposeKernelSession(kernel.sessionId);
							owned.activeKernels.delete(kernel.sessionId);
							owned.kernels.set(kernel.sessionId, { ...kernel, status: "closed" });
							owned.closuresDirty = true;
						}),
				);
				const results = await Promise.allSettled(closing);
				const failures = results.filter((result) => result.status === "rejected");
				if (failures.length)
					throw new AggregateError(
						failures.map((result) => result.reason),
						"Creator kernel cleanup failed",
					);
				if (!signal.aborted) events.changed();
			},
		};
	};
	return {
		operations,
		createNativeSession,
		async dispose() {
			await Promise.all([...owners.values()].map((item) => item.service.dispose()));
			owners.clear();
		},
	};
};
export default createDiscoveryRuntime;
