import { readFile } from "node:fs/promises";
import type { PluginNativeRuntimeFactory, PluginNativeRuntimeInstance } from "@gyoungwe/plugin-api/native";
import type {
	PluginRuntimeRootDescription,
	PluginRuntimeScope,
	PluginStateReadResult,
} from "@gyoungwe/plugin-api/runtime";
import { Type } from "typebox";
import {
	type InquiryComputeEvent,
	InquiryEventProjector,
	type InquiryLocalExecutionEvent,
	type InquiryTaskTerminalEvent,
} from "./event-projection.js";
import { InquiryFactOwner } from "./fact-owner.js";
import { createInquiryFactOwnerPorts } from "./fact-owner-ports.js";
import { type InquiryWasmEngine, inquiryBindingPath, parseInquiryBinding } from "./ledger-owner.js";
import type {
	ArtifactRecord,
	AttemptRecord,
	DecisionRecord,
	FindingRecord,
	QuestionRecord,
} from "./models.js";
import { createInquiryNativeSessionFactory } from "./runtime-native.js";
import { createRuntimeOwners, type RuntimeOwner } from "./runtime-owners.js";
import { createRuntimeRead } from "./runtime-read.js";
import * as runtimeRerun from "./runtime-rerun.js";
import { type ReadInput, readSchema, type WriteInput, writeSchema } from "./runtime-schema.js";
import { createInquiryWasmEngine } from "./wasm-storage.js";

export type { RerunExecutorPort } from "./runtime-rerun.js";

/** Actual optional provider implementation; all data/root/session authority remains in the host ports. */
export async function createInquiryRuntimeWithEngine(
	context: runtimeRerun.InquiryRuntimeContext,
	engine: InquiryWasmEngine,
): Promise<PluginNativeRuntimeInstance> {
	const { capabilities, rerunExecutor } = context,
		owners = new Map<string, RuntimeOwner>(),
		queues = new Map<string, Promise<void>>();
	let stopped = false;
	const roots = () =>
		capabilities.call("roots.describe", null) as Promise<readonly PluginRuntimeRootDescription[]>;
	const caller = () => capabilities.call("caller.scope", null) as Promise<PluginRuntimeScope>;
	const workspace = (scope: PluginRuntimeScope) => {
		if (scope.kind === "application") throw new Error("Select an actual workspace/session for Inquiry");
		return scope;
	};
	const selected = (
		available: readonly PluginRuntimeRootDescription[],
		handle: string,
		kind: PluginRuntimeRootDescription["kind"],
	) => {
		const root = available.find((root) => root.handle === handle && root.kind === kind);
		if (!root) throw new Error("Inquiry root was not granted for this activation");
		return root;
	};
	const serialize = <T>(workspaceId: string, execute: () => Promise<T>): Promise<T> => {
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
	const { lookup, inspect, owned, optionalOwner } = createRuntimeOwners({ capabilities, owners, engine });
	const factOwnerPorts = createInquiryFactOwnerPorts({
		caller,
		roots,
		owned: optionalOwner,
	});
	const read = createRuntimeRead({
		caller,
		roots,
		workspace,
		selected,
		serialize,
		rerunExecutor,
		lookup,
		inspect,
		owned,
	});
	const write = async (input: WriteInput, signal: AbortSignal) => {
		const executor = runtimeRerun.executorFor(input, rerunExecutor);
		const scope = await caller();
		if (scope.kind !== "session") throw new Error("Inquiry writes require the actual creator SDK session");
		const available = await roots();
		const active = runtimeRerun.activeRerun(input, owners.get(scope.workspaceId), available);
		if (active && !stopped && !context.signal.aborted && !signal.aborted)
			return { value: active, authority: "plugin-asserted-or-imported" };
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
					if (existing.value.binaryPath !== root.path || existing.root !== metadataRoot.handle)
						throw new Error("Inquiry is already bound to another directory");
					return { bound: true, projectId: existing.value.projectId };
				}
				await capabilities.call("state.reserve", { root: root.handle, path: "" }, signal);
				await capabilities.call("state.reserve", { root: metadataRoot.handle, path: "" }, signal);
				if (owners.has(scope.workspaceId))
					throw new Error("Active Inquiry binding disappeared; explicit recovery is required");
				const { raw, metadata } = await inspect(root);
				if (raw.kind === "value" && !input.acknowledgeExistingData)
					throw new Error("Existing SQLite data requires explicit acknowledgment");
				const path = inquiryBindingPath();
				const previous = (await capabilities.call("state.readJson", {
					root: metadataRoot.handle,
					path,
				})) as PluginStateReadResult;
				if (previous.kind !== "missing") throw new Error("Inquiry binding appeared during adoption");
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
			else if (input.action === "restoreOriginal") value = await owner.restoreOriginal(signal);
			else if (executor && runtimeRerun.isRerunAction(input))
				value = await runtimeRerun.writeRerun(owner, input, executor, signal);
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
								).recordLocalExecution(input.event as InquiryLocalExecutionEvent);
								return null;

							case "recordArtifact":
								await service.recordArtifact(input.record as unknown as ArtifactRecord);
								return null;
							case "recordFinding":
								await service.recordFinding(input.record as unknown as FindingRecord);
								return null;
							case "recordQuestion":
								await service.recordQuestion(input.record as unknown as QuestionRecord);
								return null;
							case "recordAttempt":
								await service.recordAttempt(input.record as unknown as AttemptRecord);
								return null;
							case "recordDecision":
								await service.recordDecision(input.record as unknown as DecisionRecord);
								return null;
							case "revokeDecision":
								return service.revokeDecision(input.id, input.reason);
							case "confirmDecision":
								return service.confirmDecision(input.id, input.reason);
							case "reviewDecisionArtifacts":
								return service.reviewDecisionArtifacts(input.id, input.reason);
							case "associateDecisionArtifacts":
								await service.associateDecisionArtifacts(input.id, input.artifactIds);
								return null;
							case "markRerunRunning":
								return (await service.markRerunRunning(input.id)) ?? null;
							case "completeRerun":
								return (
									(await service.completeRerun(
										input.id,
										input.outcome as { artifact: ArtifactRecord } | { error: string },
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
	const createNativeSession = createInquiryNativeSessionFactory(
		context,
		read,
		write,
		new InquiryFactOwner(factOwnerPorts),
	);

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
				execute: (input: unknown, call: { signal: AbortSignal }) => write(input as WriteInput, call.signal),
			},
		},
		async dispose() {
			stopped = true;
			await Promise.all(queues.values());
			const results = await Promise.allSettled([...owners.values()].map((value) => value.owner.dispose()));
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
export const createInquiryRuntime = (async (context: runtimeRerun.InquiryRuntimeContext) =>
	createInquiryRuntimeWithEngine(
		context,
		await createInquiryWasmEngine(await readFile(new URL("./sql-wasm.wasm", import.meta.url))),
	)) satisfies PluginNativeRuntimeFactory;
export default createInquiryRuntime;
