import type { PluginRuntimeRootDescription, PluginRuntimeScope } from "@gyoungwe/plugin-api/runtime";
import type { InquiryFactOwnerPorts } from "./fact-owner.js";
import type { InquiryLedgerOwner } from "./ledger-owner.js";

/**
 * Assembly of the fact owner's scope and ledger ports.
 *
 * A fact owner only exists for an actual workspace/session that already bound
 * Inquiry; an unbound scope has nothing to project into, so the ledger port
 * resolves to nothing instead of adopting a root.
 */
export function createInquiryFactOwnerPorts(options: {
	caller(): Promise<PluginRuntimeScope>;
	roots(): Promise<readonly PluginRuntimeRootDescription[]>;
	owned(
		scope: Exclude<PluginRuntimeScope, { kind: "application" }>,
		available: readonly PluginRuntimeRootDescription[],
	): Promise<InquiryLedgerOwner | undefined>;
}): InquiryFactOwnerPorts {
	return {
		async scope() {
			const scope = await options.caller();
			if (scope.kind !== "session") throw new Error("Host facts require an actual session scope");
			return { workspaceId: scope.workspaceId, sessionId: scope.sessionId };
		},
		async ledger(scope) {
			const current = await options.caller();
			if (current.kind !== "session") return undefined;
			if (current.workspaceId !== scope.workspaceId || current.sessionId !== scope.sessionId)
				return undefined;
			return options.owned(current, await options.roots());
		},
	};
}
