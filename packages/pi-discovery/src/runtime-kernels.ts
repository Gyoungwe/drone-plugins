import type { PluginExecutionReceiptResult } from "@gyoungwe/plugin-api/runtime";
import type { KernelOwner, WorkspaceOwner } from "./runtime-state.js";
import type { WorkspaceContext } from "./runtime-workspace.js";
import type { DiscoveryService } from "./service.js";

type CreatorOwner = () => ReturnType<typeof creatorOwner>;
type KernelListing = () => ReturnType<typeof listKernels>;
type Reconcile = (signal?: AbortSignal) => ReturnType<typeof reconcile>;
type CreateKernelInput = Parameters<DiscoveryService["createKernelSession"]>[0] & { image: string };
export type KernelOperations = ReturnType<typeof createKernelOperations>;

export function createKernelOperations(context: WorkspaceContext) {
	const creator = () => creatorOwner(context);
	const list = () => listKernels(creator);
	const recover = (signal?: AbortSignal) =>
		reconcile({ ...context, creatorOwner: creator, listKernels: list }, signal);
	return {
		listKernels: list,
		createKernel: (input: CreateKernelInput) => createKernel({ ...context, creatorOwner: creator }, input),
		reconcile: recover,
		executeKernel: (input: { sessionId: string; code: string }, signal?: AbortSignal) =>
			executeKernel({ creatorOwner: creator, reconcile: recover, listKernels: list }, input, signal),
		closeKernel: (input: { sessionId: string }, signal?: AbortSignal) =>
			closeKernel({ creatorOwner: creator, reconcile: recover, listKernels: list }, input, signal),
	};
}

async function creatorOwner({ workspace, findRoot, owner }: WorkspaceContext) {
	const scope = await workspace();
	if (scope.kind !== "session") throw new Error("Select a real creator SDK session for kernels");
	const selected = await findRoot(scope);
	if (!selected) throw new Error("Bind a discovery state directory before creating a logical kernel");
	return { scope, owned: await owner(scope, selected) };
}

const ownedKernel = (owned: WorkspaceOwner, creatorSessionId: string, sessionId: string) => {
	const kernel = owned.kernels.get(sessionId);
	if (!kernel || kernel.creatorSessionId !== creatorSessionId || !owned.activeKernels.has(sessionId))
		throw new Error("Kernel belongs to another creator or is a historical record");
	return kernel;
};

async function listKernels(creatorOwner: CreatorOwner) {
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
}

async function createKernel(
	{ creatorOwner, capabilities }: Pick<WorkspaceContext, "capabilities"> & { creatorOwner: CreatorOwner },
	input: CreateKernelInput,
) {
	const { scope, owned } = await creatorOwner();
	if (owned.kernels.has(input.sessionId) || (await owned.service.getKernelSession(input.sessionId)))
		throw new Error("Kernel identity already exists; use a new identity");
	if (
		[...owned.kernels.values()].some(
			(item) => owned.activeKernels.has(item.sessionId) && item.runDirectory === input.runDirectory,
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
}

async function reconcile(
	{
		creatorOwner,
		applicationId,
		capabilities,
		listKernels,
	}: Pick<WorkspaceContext, "applicationId" | "capabilities"> & {
		creatorOwner: CreatorOwner;
		listKernels: KernelListing;
	},
	signal?: AbortSignal,
) {
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
}

async function executeKernel(
	{
		creatorOwner,
		reconcile,
		listKernels,
	}: { creatorOwner: CreatorOwner; reconcile: Reconcile; listKernels: KernelListing },
	input: { sessionId: string; code: string },
	signal?: AbortSignal,
) {
	const { scope, owned } = await creatorOwner();
	const kernel = ownedKernel(owned, scope.sessionId, input.sessionId);
	if (kernel.status !== "active")
		throw new Error("Kernel ownership is not active; reconcile it before execution");
	const execution = await owned.service.executeKernel(input.sessionId, input.code, signal);
	signal?.throwIfAborted();
	await reconcile(signal);
	return { execution, ...(await listKernels()) };
}

async function closeKernel(
	{
		creatorOwner,
		reconcile,
		listKernels,
	}: { creatorOwner: CreatorOwner; reconcile: Reconcile; listKernels: KernelListing },
	input: { sessionId: string },
	signal?: AbortSignal,
) {
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
}
