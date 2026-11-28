import type { PluginRuntimeRootDescription, PluginRuntimeScope } from "@gyoungwe/plugin-api/runtime";
import type { InquiryHostEventBuffer } from "./runtime-host-events.js";
import type { createRuntimeOwners } from "./runtime-owners.js";
import { readPromotionPlan } from "./runtime-promotion.js";
import type { RerunExecutorPort } from "./runtime-rerun.js";
import type { ReadInput } from "./runtime-schema.js";

interface RuntimeReadDeps
	extends Pick<ReturnType<typeof createRuntimeOwners>, "lookup" | "inspect" | "owned"> {
	caller(): Promise<PluginRuntimeScope>;
	roots(): Promise<readonly PluginRuntimeRootDescription[]>;
	workspace(scope: PluginRuntimeScope): Exclude<PluginRuntimeScope, { kind: "application" }>;
	selected(
		available: readonly PluginRuntimeRootDescription[],
		handle: string,
		kind: PluginRuntimeRootDescription["kind"],
	): PluginRuntimeRootDescription;
	serialize<T>(workspaceId: string, execute: () => Promise<T>): Promise<T>;
	rerunExecutor: RerunExecutorPort | undefined;
	hostRerunCapability: boolean;
	hostRerunUnavailable(): boolean;
	hostEvents?: InquiryHostEventBuffer;
}

export function createRuntimeRead({
	caller,
	roots,
	workspace,
	selected,
	serialize,
	rerunExecutor,
	hostRerunCapability,
	hostRerunUnavailable,
	hostEvents,
	lookup,
	inspect,
	owned,
}: RuntimeReadDeps) {
	return async (input: ReadInput) => {
		const scope = await caller();
		const available = await roots();
		if (input.action === "status") {
			if (scope.kind === "application")
				return {
					state: "select-workspace",
					roots: available,
					authority: "plugin-asserted-or-imported",
					...(hostEvents ? { hostEvents: hostEvents.diagnostics(undefined) } : {}),
				};
			return serialize(scope.workspaceId, async () => {
				const binding = await lookup(scope, available);
				const promotionAvailable = available.some(
					(root) => root.kind === "files" && root.access === "read-write",
				);
				return {
					state: binding
						? binding.value.intent?.status === "pending"
							? "needs-recovery"
							: "bound"
						: "needs-binding",
					scope,
					roots: available,
					projectId: binding?.value.projectId ?? null,
					canRestoreOriginal: binding !== null && binding.value.originalVersion !== null,
					authority: "plugin-asserted-or-imported",
					unavailable: [
						...(rerunExecutor || (hostRerunCapability && !hostRerunUnavailable()) ? [] : ["rerun-executor"]),
						...(promotionAvailable ? [] : ["workspace-promotion-file-port"]),
					],
					...(hostEvents ? { hostEvents: hostEvents.diagnostics(binding?.value.projectId) } : {}),
				};
			});
		}
		const actual = workspace(scope);
		return serialize(actual.workspaceId, async () => {
			if (input.action === "inspect") {
				const { raw, metadata } = await inspect(selected(available, input.root, "binary-state"));
				return {
					kind: raw.kind,
					version: raw.version,
					metadata,
					authority: "imported-unverified",
				};
			}
			const owner = await owned(actual, available);
			if (input.action === "planPromotion") return readPromotionPlan(owner, available, input);
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
}
