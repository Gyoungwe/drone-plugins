import type { PluginRuntimeContext, PluginRuntimeOperation } from "@gyoungwe/plugin-api/runtime";
import { Check } from "typebox/value";
import type { KnowledgeBinding } from "../core/config.js";
import {
	CORRUPT_FAILURE_CANDIDATE_DOCUMENT,
	failureCandidateInputSchema,
	failureCandidateQueryResultSchema,
	failureCandidateQuerySchema,
	failureCandidateRecordResultSchema,
	serializeFailureCandidateDocument,
	sha256,
} from "../core/failure-candidate-sanitize.js";
import { createFailureCandidateStore } from "../core/failure-candidate-store.js";
import { createBrokerKnowledgeState } from "./native-state.js";

export function createFailureCandidateOperations(options: {
	stateRoot: string;
	readBinding: () => Promise<Pick<KnowledgeBinding, "vaultId"> | null>;
	callerProject: (call: PluginRuntimeContext) => Promise<string | null>;
}): Record<"recordFailureCandidate" | "queryFailureCandidates", PluginRuntimeOperation> {
	const { stateRoot, readBinding, callerProject } = options;
	async function storeFor(call: PluginRuntimeContext) {
		const project = await callerProject(call);
		if (!project) throw new Error("Failure candidates require a workspace project");
		const binding = await readBinding();
		if (!binding) throw new Error("Failure candidates require a bound Vault");
		const broker = createBrokerKnowledgeState(call.capabilities, stateRoot);
		return createFailureCandidateStore({
			vaultId: binding.vaultId,
			project,
			storageKey: stateRoot,
			state: {
				async read(path) {
					const snapshot = await broker.read(path);
					if (snapshot && sha256(serializeFailureCandidateDocument(snapshot.value)) !== snapshot.version)
						throw new Error(CORRUPT_FAILURE_CANDIDATE_DOCUMENT);
					return snapshot;
				},
				write: broker.write,
			},
		});
	}
	return {
		recordFailureCandidate: {
			inputSchema: failureCandidateInputSchema,
			resultSchema: failureCandidateRecordResultSchema,
			effect: "write",
			async execute(input, call) {
				if (!Check(failureCandidateInputSchema, input)) throw new Error("Invalid failure-candidate input");
				return (await storeFor(call)).record(input);
			},
		},
		queryFailureCandidates: {
			inputSchema: failureCandidateQuerySchema,
			resultSchema: failureCandidateQueryResultSchema,
			effect: "read",
			async execute(input, call) {
				if (!Check(failureCandidateQuerySchema, input)) throw new Error("Invalid failure-candidate query");
				return (await storeFor(call)).query(input);
			},
		},
	};
}
