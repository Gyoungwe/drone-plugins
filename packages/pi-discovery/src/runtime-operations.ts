import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import type { DiscoveryLedgerInput } from "./domain/index.js";
import type { KernelOperations } from "./runtime-kernels.js";
import {
	bindingSchema,
	journalSchema,
	kernelExecuteSchema,
	kernelIdSchema,
	kernelSchema,
	nullSchema,
	objectSchema,
	planSchema,
	requestSchema,
} from "./runtime-schemas.js";
import type { WorkspaceOperations } from "./runtime-workspace.js";

export type DiscoveryOperations = ReturnType<typeof createOperations>;

export function createOperations(
	capabilities: PluginRuntimeCapabilities,
	workspace: WorkspaceOperations,
	kernels: KernelOperations,
) {
	return {
		...inquiryOperations(workspace),
		...workspaceOperations(workspace),
		...kernelOperations(kernels),
		...executionOperations(capabilities),
		...planOperations(workspace),
	};
}

function inquiryOperations({ recordInquiry }: WorkspaceOperations) {
	return {
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
	};
}

function workspaceOperations({ overview, bind, list }: WorkspaceOperations) {
	return {
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
	};
}

function kernelOperations({
	listKernels,
	createKernel,
	executeKernel,
	closeKernel,
	reconcile,
}: KernelOperations) {
	return {
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
	};
}

function executionOperations(capabilities: PluginRuntimeCapabilities) {
	const executionDescription = () => capabilities.call("execution.describe", null);
	const executionReceipt = (input: unknown) => capabilities.call("execution.receipt", input);
	const cancelExecution = (input: unknown) => capabilities.call("execution.cancel", input);
	return {
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
	};
}

function planOperations({ createPlan }: WorkspaceOperations) {
	return {
		createExplorationPlan: {
			inputSchema: planSchema,
			resultSchema: objectSchema,
			effect: "write" as const,
			execute: (input: unknown) => createPlan(input as Parameters<typeof createPlan>[0]),
		},
	};
}
