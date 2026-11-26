import type {
	PluginProviderInspection,
	PluginRuntimeContext,
	PluginRuntimeOperation,
} from "@gyoungwe/plugin-api/runtime";
import type { FailureCandidateSink } from "../core/failure-candidates.js";

const alias = "knowledgeFailures";

async function available({ capabilities, signal }: PluginRuntimeContext) {
	try {
		const inspection = (await capabilities.call("provider.inspect", { alias }, signal)) as
			| PluginProviderInspection
			| undefined;
		return inspection?.state === "available";
	} catch {
		return false;
	}
}

export function createDesktopFailureCandidateSink(
	context: PluginRuntimeContext,
	hasActiveWriteAuthority?: () => boolean,
): FailureCandidateSink {
	return {
		async record(input) {
			const canWrite = () =>
				context.scope.kind === "session" && !context.signal.aborted && hasActiveWriteAuthority?.() === true;
			if (!canWrite() || !(await available(context)) || !canWrite()) return;
			await context.capabilities.call(
				"provider.write",
				{ alias, operation: "recordFailureCandidate", input },
				context.signal,
			);
		},
	};
}

export const queryFailureCandidates: PluginRuntimeOperation = {
	inputSchema: {
		type: "object",
		additionalProperties: false,
		properties: { limit: { type: "integer", minimum: 1, maximum: 16 } },
	},
	resultSchema: { anyOf: [{ type: "null" }, { type: "object" }] },
	effect: "read",
	async execute(input, context) {
		if (context.scope.kind === "application" || !(await available(context))) return null;
		try {
			return await context.capabilities.call(
				"provider.read",
				{ alias, operation: "queryFailureCandidates", input },
				context.signal,
			);
		} catch {
			return null;
		}
	},
};
