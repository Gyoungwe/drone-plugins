import type {
	PluginRuntimeCapabilities,
	PluginRuntimeResource,
	PluginStateReadResult,
} from "@gyoungwe/plugin-api/runtime";
import { parseKnowledgeBinding } from "../core/config.js";
import {
	CloudError,
	type CloudHttp,
	type CloudVault,
	DEFAULT_WEBDAV_ENDPOINT,
	DEFAULT_WEBDAV_USERNAME,
} from "./cloud.js";
import type { CloudStatusResult } from "./cloud-contract.js";
import { cloudNotePath } from "./cloud-paths.js";

interface CredentialSlot {
	configured: boolean;
	authentication?: string;
	source?: "env" | "saved" | null;
	savedConfigured?: boolean;
}

export async function cloudAvailability(
	capabilities: PluginRuntimeCapabilities,
	signal: AbortSignal,
): Promise<CloudStatusResult> {
	let status: { slots?: Record<string, CredentialSlot> };
	try {
		status = (await capabilities.call("credentials.status", null, signal)) as typeof status;
	} catch {
		// Hosts before W2 expose no credential metadata; status must never probe to discover support.
		return {
			status: "unavailable",
			reason: "host_unsupported",
			configured: false,
			credentialSource: null,
			savedConfigured: null,
		};
	}
	const slot = status.slots?.webdav;
	const metadata = {
		configured: slot?.configured ?? false,
		credentialSource: slot?.source ?? null,
		savedConfigured: slot?.savedConfigured ?? null,
	};
	if (slot?.authentication !== "http-basic-digest")
		return { ...metadata, status: "unavailable", reason: "host_unsupported" };
	if (!slot.configured) return { ...metadata, status: "not_configured", reason: "not_configured" };
	return { ...metadata, status: "available", reason: null };
}

function capabilityError(error: unknown): { code?: string; message?: string } {
	return error !== null && typeof error === "object" ? error : {};
}

function denied(error: unknown): boolean {
	const { code = "", message = "" } = capabilityError(error);
	return /denied|declined|not authorized|forbidden|EACCES|EPERM/i.test(`${code} ${message}`);
}

interface NetworkResult {
	status: number;
	headers: Record<string, string>;
	base64: string;
}

export function createCloudHttp(capabilities: PluginRuntimeCapabilities, signal: AbortSignal): CloudHttp {
	return {
		async request(input) {
			const read = input.method === "GET" || input.method === "PROPFIND";
			const headers = Object.fromEntries(
				Object.entries(input.headers ?? {}).filter(([name]) => name.toLowerCase() !== "authorization"),
			);
			let response: NetworkResult;
			try {
				response = (await capabilities.call(
					read ? "network.read" : "network.write",
					{
						method: input.method,
						url: `${DEFAULT_WEBDAV_ENDPOINT}/${input.path}`,
						headers,
						...(input.body === undefined ? {} : { bodyBase64: Buffer.from(input.body).toString("base64") }),
						credential: "webdav",
						httpAuth: { username: DEFAULT_WEBDAV_USERNAME },
						...(!read
							? {
									summary:
										input.method === "PUT"
											? `Upload knowledge note ${input.path} to WebDAV`
											: `Create WebDAV collection ${input.path}`,
								}
							: {}),
					},
					signal,
				)) as NetworkResult;
			} catch (error) {
				// Capability diagnostics can contain remote content; only safe domain codes cross this port.
				throw new CloudError(denied(error) ? "forbidden" : "offline");
			}
			return {
				status: response.status,
				headers: Object.fromEntries(
					Object.entries(response.headers).map(([name, value]) => [name.toLowerCase(), value]),
				),
				body: Buffer.from(response.base64, "base64"),
			};
		},
	};
}

async function fileCall(
	capabilities: PluginRuntimeCapabilities,
	signal: AbortSignal,
	name: string,
	input: unknown,
): Promise<unknown> {
	try {
		return await capabilities.call(name, input, signal);
	} catch (error) {
		if (denied(error)) throw new CloudError("forbidden");
		const { code, message } = capabilityError(error);
		if (code === "EEXIST" || message === "Plugin file version conflict; reread before writing")
			throw new CloudError("conflict");
		throw error;
	}
}

async function fileRoot(
	capabilities: PluginRuntimeCapabilities,
	signal: AbortSignal,
	vault: string,
): Promise<string> {
	try {
		return (
			(await capabilities.call("roots.resolve", { path: vault, kind: "files" }, signal)) as { handle: string }
		).handle;
	} catch {
		// No resolved approved root means the caller cannot access this Vault.
		throw new CloudError("forbidden");
	}
}

interface FileTarget {
	root: string;
	path: string;
}

async function writeCloudFile(
	capabilities: PluginRuntimeCapabilities,
	signal: AbortSignal,
	target: FileTarget,
	text: string,
	expectedHash: string | null,
): Promise<void> {
	const parent = target.path.slice(0, target.path.lastIndexOf("/"));
	if (target.path.includes("/"))
		await fileCall(capabilities, signal, "files.ensureDirectory", { root: target.root, path: parent });
	const result = (await fileCall(capabilities, signal, "files.writeText", {
		...target,
		text,
		expectedHash,
	})) as { text: string };
	if (result.text !== text) throw new CloudError("protocol");
}

function writableTargets(
	capabilities: PluginRuntimeCapabilities,
	resources: readonly PluginRuntimeResource[],
	signal: AbortSignal,
) {
	const targets: Record<string, FileTarget> = {};
	return {
		targets,
		async containedFile(vault: string, path: string) {
			const relative = cloudNotePath(path);
			const root = await fileRoot(capabilities, signal, vault);
			if (
				!resources.some(
					(resource) =>
						resource.kind === "files" && resource.handle === root && resource.access === "read-write",
				)
			)
				throw new CloudError("forbidden");
			const key = `${vault}/${relative}`;
			targets[key] = { root, path: relative };
			return key;
		},
	};
}

export function createCloudVault(
	capabilities: PluginRuntimeCapabilities,
	stateRoot: string,
	resources: readonly PluginRuntimeResource[],
	signal: AbortSignal,
): CloudVault {
	const { targets, containedFile } = writableTargets(capabilities, resources, signal);
	return {
		readBinding: () => readCloudBinding(capabilities, stateRoot, signal),
		async readNote(vault, path) {
			const relative = cloudNotePath(path);
			const root = await fileRoot(capabilities, signal, vault);
			const result = (await fileCall(capabilities, signal, "files.readText", { root, path: relative })) as {
				text: string;
				sha256: string;
			};
			return { text: result.text, hash: result.sha256 };
		},
		containedFile,
		async createFileOnly(path, content) {
			try {
				await writeCloudFile(capabilities, signal, targets[path], content, null);
				return true;
			} catch (error) {
				if (error instanceof CloudError && error.code === "conflict") return false;
				throw error;
			}
		},
		async replaceFile(path, content, options) {
			if (options.expectedHash === undefined) throw new CloudError("protocol");
			await writeCloudFile(capabilities, signal, targets[path], content, options.expectedHash);
		},
		isConflict: (error) => error instanceof CloudError && error.code === "conflict",
	};
}

async function readCloudBinding(
	capabilities: PluginRuntimeCapabilities,
	stateRoot: string,
	signal: AbortSignal,
): ReturnType<CloudVault["readBinding"]> {
	try {
		// There is no binding cache: fresh and ordinary reads both reach the host.
		const result = (await fileCall(capabilities, signal, "state.readJson", {
			root: stateRoot,
			path: "binding.json",
		})) as PluginStateReadResult;
		return result.kind === "missing" ? null : parseKnowledgeBinding(result.value);
	} catch (error) {
		if (error instanceof CloudError) throw error;
		// Persisted binding and host diagnostics must stay behind the code-only operation boundary.
		throw new CloudError("protocol");
	}
}
