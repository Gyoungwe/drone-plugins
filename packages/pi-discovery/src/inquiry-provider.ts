import type {
	PluginProviderInspection,
	PluginRuntimeCapabilities,
} from "@gyoungwe/plugin-api/runtime";
import type { DiscoveryInquiryPort } from "./ports.js";
/** Versioned optional service. Its JSON remains asserted data, never execution or filesystem authority. */
export function inquiryProvider(
	capabilities: PluginRuntimeCapabilities,
	discoveryProjectId: string,
): DiscoveryInquiryPort {
	const write = async (
		action: string,
		record: {readonly projectId:string},
	) => {
		if (record.projectId !== discoveryProjectId)
			throw new Error("Discovery record belongs to another project");
		const inspection = (await capabilities.call("provider.inspect", {
			alias: "inquiry",
		})) as PluginProviderInspection;
		if (inspection.state !== "available")
			throw new Error(`Inquiry provider is ${inspection.state}`);
		const status = (await capabilities.call("provider.read", {
			alias: "inquiry",
			operation: "inquiry.read",
			input: { action: "status" },
		})) as { state: string; projectId?: unknown };
		if (
			status.state !== "bound" ||
			typeof status.projectId !== "string" ||
			!status.projectId
		)
			throw new Error(
				"Bind the original Inquiry ledger to this actual workspace first",
			);
		await capabilities.call("provider.write", {
			alias: "inquiry",
			operation: "inquiry.write",
			input: { action, record: { ...record, projectId: status.projectId } },
		});
	};
	return {
		recordQuestion: (record) => write("recordQuestion", record),
		recordAttempt: (record) => write("recordAttempt", record),
		recordFinding: (record) => write("recordFinding", record),
	};
}
