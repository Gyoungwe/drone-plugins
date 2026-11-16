import type { CloudErrorCode, CloudNote, CloudWriteResult } from "./cloud.js";
import type { CloudSyncInput, CloudSyncResult } from "./cloud-sync.js";

export type CloudRuntimeErrorCode = CloudErrorCode | "host_unsupported";
export interface CloudFailure {
	status: "failed";
	reason: CloudRuntimeErrorCode;
}
export type CloudOperationResult<T> = { status: "ok"; result: T } | CloudFailure;
export type CloudStatusInput = null;
export interface CloudStatusResult {
	status: "available" | "unavailable" | "not_configured";
	reason: "host_unsupported" | "not_configured" | null;
	configured: boolean;
	credentialSource: "env" | "saved" | null;
	savedConfigured: boolean | null;
}
export type CloudProbeInput = null;
export type CloudProbeResult = CloudOperationResult<{ initialized: boolean }>;
export type CloudInitializeInput = null;
export type CloudInitializeResult = CloudProbeResult;
export interface CloudReadInput {
	path: string;
}
export type CloudReadResult = CloudOperationResult<CloudNote>;
export interface CloudWriteInput {
	path: string;
	text: string;
	expectedVersion?: string;
}
export type CloudWriteOperationResult = CloudOperationResult<CloudWriteResult>;
export type { CloudNote, CloudSyncInput, CloudSyncResult, CloudWriteResult };
export type CloudSyncOperationResult = CloudOperationResult<CloudSyncResult>;

const object = (properties: Record<string, object>, required = Object.keys(properties)) => ({
	type: "object",
	properties,
	required,
	additionalProperties: false,
});
const string = { type: "string" };
const boolean = { type: "boolean" };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const codes = ["not_configured", "offline", "unauthorized", "forbidden", "not_found", "conflict", "protocol"];
const failure = object({ status: { const: "failed" }, reason: { enum: [...codes, "host_unsupported"] } });
const result = (schema: object) => ({
	anyOf: [object({ status: { const: "ok" }, result: schema }), failure],
});
const path = { type: "string", minLength: 1, maxLength: 1024 };
const hash = { type: "string", pattern: "^[a-f0-9]{64}$" };
const version = { type: "string", maxLength: 1024 };
export const cloudStatusInputSchema = { type: "null" };
export const cloudStatusResultSchema = object({
	status: { enum: ["available", "unavailable", "not_configured"] },
	reason: nullable({ enum: ["host_unsupported", "not_configured"] }),
	configured: boolean,
	credentialSource: nullable({ enum: ["env", "saved"] }),
	savedConfigured: nullable(boolean),
});
export const cloudProbeInputSchema = { type: "null" };
export const cloudProbeResultSchema = result(object({ initialized: boolean }));
export const cloudInitializeInputSchema = { type: "null" };
export const cloudInitializeResultSchema = cloudProbeResultSchema;
export const cloudReadInputSchema = object({ path });
export const cloudReadResultSchema = result(
	object({
		path,
		text: string,
		hash,
		version: nullable(version),
		bytes: { type: "integer", minimum: 0, maximum: 1024 * 1024 },
		lastModified: nullable(string),
	}),
);
export const cloudWriteInputSchema = object(
	{ path, text: { type: "string", maxLength: 1024 * 1024 }, expectedVersion: version },
	["path", "text"],
);
export const cloudWriteResultSchema = result(
	object({
		path,
		status: { enum: ["created", "updated", "conflict", "forbidden", "offline", "unknown"] },
		version: nullable(version),
		hash,
		reason: nullable({ enum: [...codes, "missing_strong_etag", "write_unverified"] }),
	}),
);
export const cloudSyncInputSchema = object(
	{
		mode: { enum: ["pull", "push"] },
		bindingRevision: { type: "integer", minimum: 1 },
		paths: { type: "array", minItems: 1, maxItems: 64, items: path },
		previews: {
			type: "array",
			minItems: 1,
			maxItems: 64,
			items: object({
				path,
				localHash: nullable(hash),
				remoteHash: nullable(hash),
				remoteVersion: nullable(version),
			}),
		},
		resolution: { enum: ["local", "remote"] },
	},
	["mode", "bindingRevision", "paths", "previews"],
);
export const cloudSyncResultSchema = result(
	object({
		mode: { enum: ["pull", "push"] },
		completed: boolean,
		items: {
			type: "array",
			items: object({
				path,
				status: { enum: ["unchanged", "pulled", "pushed", "conflict", "skipped", "failed"] },
				localHash: nullable(hash),
				remoteVersion: nullable(version),
				reason: nullable({
					enum: [
						...codes,
						"divergent",
						"source_missing",
						"index_pending",
						"missing_strong_etag",
						"write_unverified",
					],
				}),
			}),
		},
		warnings: { type: "array", items: { const: "selected_notes_only" } },
	}),
);
