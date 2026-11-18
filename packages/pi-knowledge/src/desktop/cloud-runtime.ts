import type { PluginNativeRuntimeFactory } from "@gyoungwe/plugin-api/native";
import type {
	PluginRuntimeContext,
	PluginRuntimeFactoryContext,
	PluginRuntimeOperation,
} from "@gyoungwe/plugin-api/runtime";
import { CloudError, CloudService } from "./cloud.js";
import { cloudAvailability, createCloudHttp, createCloudVault } from "./cloud-capabilities.js";
import * as contract from "./cloud-contract.js";
import { syncCloudNotes } from "./cloud-sync.js";

const definitions = [
	["cloudStatus", "read", contract.cloudStatusInputSchema, contract.cloudStatusResultSchema],
	["cloudProbe", "read", contract.cloudProbeInputSchema, contract.cloudProbeResultSchema],
	["cloudInitialize", "write", contract.cloudInitializeInputSchema, contract.cloudInitializeResultSchema],
	["cloudRead", "read", contract.cloudReadInputSchema, contract.cloudReadResultSchema],
	["cloudWrite", "write", contract.cloudWriteInputSchema, contract.cloudWriteResultSchema],
	["cloudSync", "write", contract.cloudSyncInputSchema, contract.cloudSyncResultSchema],
] as const;

export function withCloudOperations(factory: PluginNativeRuntimeFactory): PluginNativeRuntimeFactory {
	return async (context) => {
		const runtime = await factory(context);
		const operations: Record<string, PluginRuntimeOperation> = {};
		for (const [name, effect, inputSchema, resultSchema] of definitions) {
			if (name in runtime.operations) {
				await runtime.dispose();
				throw new Error(`Cloud operation collision: ${name}`);
			}
			operations[name] = {
				inputSchema,
				resultSchema,
				effect,
				async execute(input, call) {
					try {
						const status = await cloudAvailability(call.capabilities, call.signal);
						if (name === "cloudStatus") return status;
						if (status.reason !== null) return { status: "failed", reason: status.reason };
						if (status.endpoint?.state !== "ready") throw new Error("Cloud endpoint is not ready");
						const endpoint = status.endpoint.url;
						const cloud = new CloudService({
							endpoint,
							http: createCloudHttp(call.capabilities, call.signal, endpoint),
						});
						const result = await executeService(cloud, name, input, context, call);
						return { status: "ok", result };
					} catch (error) {
						if (name === "cloudStatus" || !(error instanceof CloudError)) throw error;
						return { status: "failed", reason: error.code };
					}
				},
			};
		}
		return { ...runtime, operations: { ...runtime.operations, ...operations } };
	};
}

function executeService(
	cloud: CloudService,
	name: string,
	input: unknown,
	context: PluginRuntimeFactoryContext,
	call: PluginRuntimeContext,
): Promise<unknown> {
	switch (name) {
		case "cloudProbe":
			return cloud.probe();
		case "cloudInitialize":
			return cloud.initialize();
		case "cloudRead":
			return cloud.read((input as contract.CloudReadInput).path);
		case "cloudWrite":
			return cloud.write(input as contract.CloudWriteInput);
		case "cloudSync": {
			const states = context.resources.filter((resource) => resource.kind === "state");
			if (states.length !== 1) throw new CloudError("forbidden");
			return syncCloudNotes(
				cloud,
				input as contract.CloudSyncInput,
				createCloudVault(call.capabilities, states[0].handle, context.resources, call.signal),
			);
		}
		default:
			throw new Error(`Unknown cloud operation: ${name}`);
	}
}
