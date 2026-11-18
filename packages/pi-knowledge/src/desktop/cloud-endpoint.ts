import {
	type PluginRuntimeCapabilities,
	readPluginEndpointConfiguration,
} from "@gyoungwe/plugin-api/runtime";
import { CloudError } from "./cloud.js";
import type { CloudEndpoint } from "./cloud-contract.js";

export function endpointCapabilityError(error: unknown): CloudError | null {
	if (error === null || typeof error !== "object") return null;
	if (
		("code" in error && error.code === "EPLUGINENDPOINTCHANGED") ||
		("message" in error && error.message === "EPLUGINENDPOINTCHANGED")
	)
		return new CloudError("endpoint_changed");
	if ("message" in error && error.message === "Plugin capability is not registered: config.endpoint")
		return new CloudError("host_unsupported");
	return null;
}

function endpointMetadata(result: unknown): CloudEndpoint {
	if (
		result !== null &&
		typeof result === "object" &&
		"state" in result &&
		"endpoint" in result &&
		"source" in result
	) {
		if (
			result.state === "invalid" &&
			result.endpoint === null &&
			result.source === "env" &&
			"reason" in result &&
			result.reason === "invalid_endpoint"
		)
			return { state: "invalid", reason: "invalid_endpoint" };
		if (
			result.state === "ready" &&
			typeof result.endpoint === "string" &&
			(result.source === "default" || result.source === "env")
		) {
			let url: URL;
			try {
				url = new URL(result.endpoint);
			} catch {
				throw new Error("Invalid WebDAV endpoint configuration");
			}
			if (["http:", "https:"].includes(url.protocol) && result.endpoint === url.origin)
				return { state: "ready", url: result.endpoint, source: result.source };
		}
	}
	throw new Error("Invalid WebDAV endpoint configuration");
}

export async function readCloudEndpoint(
	capabilities: PluginRuntimeCapabilities,
	signal: AbortSignal,
): Promise<CloudEndpoint | null> {
	let result: unknown;
	try {
		result = await readPluginEndpointConfiguration(capabilities, { slot: "webdav" }, signal);
	} catch (error) {
		const mapped = endpointCapabilityError(error);
		if (mapped?.code === "host_unsupported") return null;
		throw mapped ?? error;
	}
	return endpointMetadata(result);
}
