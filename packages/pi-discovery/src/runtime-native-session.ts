import type { PluginNativeSession } from "@gyoungwe/plugin-api/native";
import type { DiscoveryLedgerInput } from "./domain/index.js";
import type { KernelOperations } from "./runtime-kernels.js";
import type { DiscoveryOperations } from "./runtime-operations.js";
import {
	bindingSchema,
	kernelExecuteSchema,
	kernelIdSchema,
	kernelSchema,
	planSchema,
	readMetadata,
	requestSchema,
	writeMetadata,
} from "./runtime-schemas.js";
import type { RuntimeState } from "./runtime-state.js";
import type { WorkspaceAccess, WorkspaceOperations } from "./runtime-workspace.js";

const response = (details: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(details) }],
	details,
});

export const createNativeSession = ({
	caller,
	listKernels,
	createKernel,
	executeKernel,
	closeKernel,
	reconcile,
	operations,
	recordInquiry,
	overview,
	list,
	bind,
	createPlan,
	owners,
	signal,
	events,
}: Pick<RuntimeState, "owners" | "signal" | "events"> &
	Pick<WorkspaceAccess, "caller"> &
	WorkspaceOperations &
	KernelOperations & { operations: DiscoveryOperations }): PluginNativeSession => {
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
						if (scope.kind !== "session" || (creatorSessionId && creatorSessionId !== scope.sessionId))
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
				["discovery_reconcile_executions", emptyParameters, "write", (_input, signal) => reconcile(signal)],
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
							await operations[operation].execute(operation === "executionDescription" ? null : input),
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
							kernel.creatorSessionId === creatorSessionId && owned.activeKernels.has(kernel.sessionId),
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
