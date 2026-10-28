import { readFile } from "node:fs/promises";
import type {
	PluginNativeRuntimeFactory,
	PluginNativeRuntimeInstance,
	PluginNativeSession,
} from "@gyoungwe/plugin-api/native";
import type {
	PluginBinaryStateReadResult,
	PluginRuntimeFactoryContext,
	PluginRuntimeRootDescription,
	PluginRuntimeScope,
	PluginStateReadResult,
} from "@gyoungwe/plugin-api/runtime";
import { type Static, Type } from "typebox";
import {
	type InquiryComputeEvent,
	InquiryEventProjector,
	type InquiryLocalExecutionEvent,
	type InquiryTaskTerminalEvent,
} from "./event-projection.js";
import { assertedEventWriteSchema } from "./event-schema.js";
import {
	type InquiryBindingState,
	InquiryLedgerOwner,
	type InquiryWasmEngine,
	inquiryBindingPath,
	parseInquiryBinding,
} from "./ledger-owner.js";
import type {
	ArtifactRecord,
	AttemptRecord,
	DecisionRecord,
	FindingRecord,
	QuestionRecord,
} from "./models.js";
import { createInquiryWasmEngine } from "./wasm-storage.js";

const name = Type.String({ minLength: 1, maxLength: 128 });
const readMetadata = {
	drone: { capabilities: ["research", "provenance"], readOnly: true },
};
const writeMetadata = { drone: { capabilities: ["research", "provenance"] } };
const object = Type.Record(Type.String(), Type.Unknown());
const readSchema = Type.Union([
	Type.Object(
		{ action: Type.Literal("status") },
		{ additionalProperties: false },
	),
	Type.Object(
		{ action: Type.Literal("inspect"), root: name },
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Union([
				Type.Literal("snapshot"),
				Type.Literal("listDecisions"),
				Type.Literal("cleanupDryRun"),
				Type.Literal("pendingReruns"),
			]),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("artifactProvenance"),
			id: Type.String({ minLength: 1 }),
		},
		{ additionalProperties: false },
	),
]);
const writeSchema = Type.Union([
	assertedEventWriteSchema,
	Type.Object(
		{
			action: Type.Literal("bind"),
			root: name,
			metadataRoot: name,
			acknowledgeExistingData: Type.Boolean(),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Union([
				Type.Literal("recordArtifact"),
				Type.Literal("recordFinding"),
				Type.Literal("recordQuestion"),
				Type.Literal("recordAttempt"),
				Type.Literal("recordDecision"),
			]),
			record: object,
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Union([
				Type.Literal("revokeDecision"),
				Type.Literal("confirmDecision"),
				Type.Literal("reviewDecisionArtifacts"),
			]),
			id: Type.String({ minLength: 1 }),
			reason: Type.String({ minLength: 1 }),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("associateDecisionArtifacts"),
			id: Type.String({ minLength: 1 }),
			artifactIds: Type.Array(Type.String({ minLength: 1 })),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("markRerunRunning"),
			id: Type.String({ minLength: 1 }),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Literal("completeRerun"),
			id: Type.String({ minLength: 1 }),
			outcome: Type.Union([
				Type.Object({ error: Type.String() }, { additionalProperties: false }),
				Type.Object({ artifact: object }, { additionalProperties: false }),
			]),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			action: Type.Union([
				Type.Literal("reconcile"),
				Type.Literal("restoreOriginal"),
			]),
		},
		{ additionalProperties: false },
	),
]);
type ReadInput = Static<typeof readSchema>;
type WriteInput = Static<typeof writeSchema>;
/** Actual optional provider implementation; all data/root/session authority remains in the host ports. */
export async function createInquiryRuntimeWithEngine(
	context: PluginRuntimeFactoryContext,
	engine: InquiryWasmEngine,
): Promise<PluginNativeRuntimeInstance> {
	const capabilities = context.capabilities,
		owners = new Map<
			string,
			{ owner: InquiryLedgerOwner; root: string; metadataRoot: string }
		>(),
		queues = new Map<string, Promise<void>>();
	let stopped = false;
	const roots = () =>
		capabilities.call("roots.describe", null) as Promise<
			readonly PluginRuntimeRootDescription[]
		>;
	const caller = () =>
		capabilities.call("caller.scope", null) as Promise<PluginRuntimeScope>;
	const workspace = (scope: PluginRuntimeScope) => {
		if (scope.kind === "application")
			throw new Error("Select an actual workspace/session for Inquiry");
		return scope;
	};
	const selected = (
		available: readonly PluginRuntimeRootDescription[],
		handle: string,
		kind: PluginRuntimeRootDescription["kind"],
	) => {
		const root = available.find(
			(root) => root.handle === handle && root.kind === kind,
		);
		if (!root)
			throw new Error("Inquiry root was not granted for this activation");
		return root;
	};
	const serialize = <T>(
		workspaceId: string,
		execute: () => Promise<T>,
	): Promise<T> => {
		const pending = (queues.get(workspaceId) ?? Promise.resolve()).then(() => {
			context.signal.throwIfAborted();
			if (stopped) throw new Error("Inquiry runtime is stopping");
			return execute();
		});
		queues.set(
			workspaceId,
			pending.then(
				() => undefined,
				() => undefined,
			),
		);
		return pending;
	};
	const lookup = async (
		scope: Exclude<PluginRuntimeScope, { kind: "application" }>,
		available: readonly PluginRuntimeRootDescription[],
	): Promise<InquiryBindingState | null> => {
		const found: InquiryBindingState[] = [];
		const path = inquiryBindingPath();
		for (const root of available.filter((root) => root.kind === "state")) {
			const result = (await capabilities.call("state.readJson", {
				root: root.handle,
				path,
			})) as PluginStateReadResult;
			const value = parseInquiryBinding(result, scope.workspaceId);
			if (value && result.kind === "value")
				found.push({ root: root.handle, path, value, version: result.version });
		}
		if (found.length > 1)
			throw new Error(
				"Multiple approved Inquiry bindings match this workspace; no first-root adoption",
			);
		return found[0] ?? null;
	};
	const inspect = async (root: PluginRuntimeRootDescription) => {
		for (const path of [
			"ledger.sqlite-wal",
			"ledger.sqlite-shm",
			"ledger.sqlite-journal",
		])
			if (
				(
					(await capabilities.call("state.readBinary", {
						root: root.handle,
						path,
					})) as PluginBinaryStateReadResult
				).kind !== "missing"
			)
				throw new Error(
					`Inquiry SQLite sidecar must be closed before import: ${path}`,
				);
		const raw = (await capabilities.call("state.readBinary", {
			root: root.handle,
			path: "ledger.sqlite",
		})) as PluginBinaryStateReadResult;
		return {
			raw,
			metadata:
				raw.kind === "value"
					? engine.inspect(new Uint8Array(Buffer.from(raw.base64, "base64")))
					: null,
		};
	};
	const owned = async (
		scope: Exclude<PluginRuntimeScope, { kind: "application" }>,
		available: readonly PluginRuntimeRootDescription[],
		reconcileMetadata = false,
	) => {
		const binding = await lookup(scope, available);
		if (!binding)
			throw new Error("Inquiry workspace needs an explicit root binding");
		const root = available.find(
			(root) =>
				root.kind === "binary-state" && root.path === binding.value.binaryPath,
		);
		if (!root)
			throw new Error(
				"Reselect the original bound Inquiry directory; saved paths grant no access",
			);
		let current = owners.get(scope.workspaceId);
		if (
			current &&
			(current.root !== root.handle || current.metadataRoot !== binding.root)
		)
			throw new Error(
				"Inquiry workspace already has another active root owner",
			);
		if (current && current.owner.bindingVersion !== binding.version) {
			if (!reconcileMetadata)
				throw new Error(
					"Inquiry metadata changed; explicit reconciliation is required",
				);
			await current.owner.dispose();
			owners.delete(scope.workspaceId);
			current = undefined;
		}
		if (!current) {
			current = {
				owner: new InquiryLedgerOwner(engine, capabilities, binding, root),
				root: root.handle,
				metadataRoot: binding.root,
			};
			owners.set(scope.workspaceId, current);
		}
		return current.owner;
	};
	const read = async (input: ReadInput) => {
		const scope = await caller();
		const available = await roots();
		if (input.action === "status") {
			if (scope.kind === "application")
				return {
					state: "select-workspace",
					roots: available,
					authority: "plugin-asserted-or-imported",
				};
			return serialize(scope.workspaceId, async () => {
				const binding = await lookup(scope, available);
				return {
					state: binding
						? binding.value.intent?.status === "pending"
							? "needs-recovery"
							: "bound"
						: "needs-binding",
					scope,
					roots: available,
					projectId: binding?.value.projectId ?? null,
					canRestoreOriginal:
						binding !== null && binding.value.originalVersion !== null,
					authority: "plugin-asserted-or-imported",
					unavailable: ["rerun-executor", "workspace-promotion-file-port"],
				};
			});
		}
		const actual = workspace(scope);
		return serialize(actual.workspaceId, async () => {
			if (input.action === "inspect") {
				const { raw, metadata } = await inspect(
					selected(available, input.root, "binary-state"),
				);
				return {
					kind: raw.kind,
					version: raw.version,
					metadata,
					authority: "imported-unverified",
				};
			}
			const owner = await owned(actual, available);
			const value = await owner.read(async (service) => {
				switch (input.action) {
					case "snapshot":
						return {
							...(await service.readOnlyState()),
							attempts: (await service.snapshot()).attempts,
						};
					case "listDecisions":
						return service.listDecisions();
					case "cleanupDryRun":
						return service.cleanupDryRun();
					case "pendingReruns":
						return service.pendingReruns();
					case "artifactProvenance":
						return (await service.artifactProvenance(input.id)) ?? null;
				}
			});
			return { value, authority: "plugin-asserted-or-imported" };
		});
	};
	const write = async (input: WriteInput, signal: AbortSignal) => {
		const scope = await caller();
		if (scope.kind !== "session")
			throw new Error("Inquiry writes require the actual creator SDK session");
		const available = await roots();
		return serialize(scope.workspaceId, async () => {
			signal.throwIfAborted();
			if (input.action === "bind") {
				const root = selected(available, input.root, "binary-state"),
					metadataRoot = selected(available, input.metadataRoot, "state");
				if (root.path !== metadataRoot.path)
					throw new Error(
						"Inquiry JSON metadata and binary grants must independently select the same original ledger directory",
					);
				const existing = await lookup(scope, available);
				if (existing) {
					if (
						existing.value.binaryPath !== root.path ||
						existing.root !== metadataRoot.handle
					)
						throw new Error("Inquiry is already bound to another directory");
					return { bound: true, projectId: existing.value.projectId };
				}
				await capabilities.call(
					"state.reserve",
					{ root: root.handle, path: "" },
					signal,
				);
				await capabilities.call(
					"state.reserve",
					{ root: metadataRoot.handle, path: "" },
					signal,
				);
				if (owners.has(scope.workspaceId))
					throw new Error(
						"Active Inquiry binding disappeared; explicit recovery is required",
					);
				const { raw, metadata } = await inspect(root);
				if (raw.kind === "value" && !input.acknowledgeExistingData)
					throw new Error(
						"Existing SQLite data requires explicit acknowledgment",
					);
				const path = inquiryBindingPath();
				const previous = (await capabilities.call("state.readJson", {
					root: metadataRoot.handle,
					path,
				})) as PluginStateReadResult;
				if (previous.kind !== "missing")
					throw new Error("Inquiry binding appeared during adoption");
				const value = {
					schemaVersion: 1 as const,
					workspaceId: scope.workspaceId,
					projectId: metadata?.projectId ?? scope.workspaceId,
					binaryPath: root.path,
					originalVersion: raw.version,
					headVersion: raw.version,
					backupVersion: null,
					intent: null,
				};
				const stored = (await capabilities.call(
					"state.writeJson",
					{ root: metadataRoot.handle, path, value, expectedVersion: null },
					signal,
				)) as PluginStateReadResult;
				if (!parseInquiryBinding(stored, scope.workspaceId))
					throw new Error("Inquiry binding did not read back");
				context.events.changed();
				return {
					bound: true,
					projectId: value.projectId,
					existingData: raw.kind === "value",
				};
			}
			const owner = await owned(scope, available, input.action === "reconcile");
			let value: unknown;
			if (input.action === "reconcile") value = await owner.reconcile(signal);
			else if (input.action === "restoreOriginal")
				value = await owner.restoreOriginal(signal);
			else
				value = await owner.write(
					input.action,
					async (service) => {
						switch (input.action) {
							case "recordComputeEvent":
								await new InquiryEventProjector(
									service.storage,
									service,
									(value) => value ?? "",
								).recordComputeEvent(input.event as InquiryComputeEvent);
								return null;
							case "recordTaskTerminal":
								await new InquiryEventProjector(
									service.storage,
									service,
									(value) => value ?? "",
								).recordTaskTerminal(input.event as InquiryTaskTerminalEvent);
								return null;
							case "recordLocalExecution":
								await new InquiryEventProjector(
									service.storage,
									service,
									(value) => value ?? "",
								).recordLocalExecution(
									input.event as InquiryLocalExecutionEvent,
								);
								return null;

							case "recordArtifact":
								await service.recordArtifact(
									input.record as unknown as ArtifactRecord,
								);
								return null;
							case "recordFinding":
								await service.recordFinding(
									input.record as unknown as FindingRecord,
								);
								return null;
							case "recordQuestion":
								await service.recordQuestion(
									input.record as unknown as QuestionRecord,
								);
								return null;
							case "recordAttempt":
								await service.recordAttempt(
									input.record as unknown as AttemptRecord,
								);
								return null;
							case "recordDecision":
								await service.recordDecision(
									input.record as unknown as DecisionRecord,
								);
								return null;
							case "revokeDecision":
								return service.revokeDecision(input.id, input.reason);
							case "confirmDecision":
								return service.confirmDecision(input.id, input.reason);
							case "reviewDecisionArtifacts":
								return service.reviewDecisionArtifacts(input.id, input.reason);
							case "associateDecisionArtifacts":
								await service.associateDecisionArtifacts(
									input.id,
									input.artifactIds,
								);
								return null;
							case "markRerunRunning":
								return (await service.markRerunRunning(input.id)) ?? null;
							case "completeRerun":
								return (
									(await service.completeRerun(
										input.id,
										input.outcome as
											| { artifact: ArtifactRecord }
											| { error: string },
									)) ?? null
								);
						}
					},
					signal,
				);
			context.events.changed();
			return { value, authority: "plugin-asserted-or-imported" };
		});
	};
	const createNativeSession = (): PluginNativeSession => {
		let disposed = false;
		return {
			toolEffects: { inquiry_read: "read", inquiry_write: "write" },
			extension(pi) {
				pi.registerTool({
					name: "inquiry_read",
					label: "Inquiry · read",
					description:
						"Read only this actual workspace’s explicitly bound Inquiry ledger. Imported/asserted records are not host provenance proofs.",
					parameters: Type.Object(
						{ request: readSchema },
						{ additionalProperties: false },
					),
					annotations: { readOnlyHint: true },
					...readMetadata,
					async execute(_id, input) {
						if (disposed)
							throw new Error("Inquiry native projection is disposed");
						const value = await read(input.request);
						return {
							content: [{ type: "text", text: JSON.stringify(value) }],
							details: value,
						};
					},
				});
				pi.registerTool({
					name: "inquiry_write",
					label: "Inquiry · write",
					description:
						"Explicitly bind, update, reconcile or restore this workspace’s original Inquiry SQLite ledger. Every host write still requires its own approved root, version and caller checks.",
					parameters: Type.Object(
						{ request: writeSchema },
						{ additionalProperties: false },
					),
					...writeMetadata,
					async execute(_id, input, signal) {
						if (disposed)
							throw new Error("Inquiry native projection is disposed");
						const value = await write(input.request, signal ?? context.signal);
						return {
							content: [{ type: "text", text: JSON.stringify(value) }],
							details: value,
						};
					},
				});
			},
			async dispose() {
				disposed = true;
			},
		};
	};

	return {
		createNativeSession,
		operations: {
			"inquiry.read": {
				inputSchema: readSchema,
				resultSchema: Type.Unknown(),
				effect: "read" as const,
				execute: (input: unknown) => read(input as ReadInput),
			},
			"inquiry.write": {
				inputSchema: writeSchema,
				resultSchema: Type.Unknown(),
				effect: "write" as const,
				execute: (input: unknown, call: { signal: AbortSignal }) =>
					write(input as WriteInput, call.signal),
			},
		},
		async dispose() {
			stopped = true;
			await Promise.all(queues.values());
			const results = await Promise.allSettled(
				[...owners.values()].map((value) => value.owner.dispose()),
			);
			const failures = results.filter((result) => result.status === "rejected");
			if (failures.length)
				throw new AggregateError(
					failures.map((result) => result.reason),
					"Inquiry owners could not close; retain writer leases",
				);
			owners.clear();
		},
	};
}
export const createInquiryRuntime: PluginNativeRuntimeFactory = async (
	context,
) =>
	createInquiryRuntimeWithEngine(
		context,
		await createInquiryWasmEngine(
			await readFile(new URL("./sql-wasm.wasm", import.meta.url)),
		),
	);
export default createInquiryRuntime;
