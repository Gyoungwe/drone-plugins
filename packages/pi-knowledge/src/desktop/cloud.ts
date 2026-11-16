import { createHash } from "node:crypto";
import { CloudDav, strongEtag } from "./cloud-dav.js";
import { cloudNotePath, KNOWLEDGE_MAX_NOTE_BYTES } from "./cloud-paths.js";

export type CloudErrorCode =
	| "not_configured"
	| "offline"
	| "unauthorized"
	| "forbidden"
	| "not_found"
	| "conflict"
	| "protocol";

export class CloudError extends Error {
	constructor(
		readonly code: CloudErrorCode,
		readonly status: number | null = null,
	) {
		super(code);
		this.name = "CloudError";
	}
}

export function httpError(status: number): CloudError {
	if (status === 401) return new CloudError("unauthorized", status);
	if (status === 403) return new CloudError("forbidden", status);
	if (status === 404) return new CloudError("not_found", status);
	if ([409, 412, 423, 428].includes(status)) return new CloudError("conflict", status);
	return new CloudError("protocol", status);
}

export interface CloudHttp {
	request(input: {
		method: "GET" | "PUT" | "PROPFIND" | "MKCOL";
		path: string;
		headers?: Record<string, string>;
		body?: string;
	}): Promise<{ status: number; headers: Record<string, string | undefined>; body: Uint8Array }>;
}

export interface CloudVault {
	readBinding(options?: {
		fresh?: boolean;
	}): Promise<{ vaultId: string; revision: number; vault: string } | null>;
	readNote(vault: string, path: string): Promise<{ hash: string; text: string }>;
	containedFile(vault: string, path: string): Promise<string>;
	createFileOnly(path: string, content: string): Promise<boolean>;
	replaceFile(path: string, content: string, options: { expectedHash?: string }): Promise<void>;
	isConflict(error: unknown): boolean;
}

export const DEFAULT_WEBDAV_ENDPOINT = "http://10.126.126.1:8080";
export const DEFAULT_WEBDAV_USERNAME = "gaoyangwei";
export const DEFAULT_WEBDAV_FOLDER = "Drone-Knowledge";

export interface CloudNote {
	path: string;
	text: string;
	hash: string;
	version: string | null;
	bytes: number;
	lastModified: string | null;
}

export interface CloudWriteResult {
	path: string;
	status: "created" | "updated" | "conflict" | "forbidden" | "offline" | "unknown";
	version: string | null;
	hash: string;
	reason: CloudErrorCode | "missing_strong_etag" | "write_unverified" | null;
}

function endpointOrigin(endpoint: string): string {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		throw new CloudError("protocol");
	}
	if (!["http:", "https:"].includes(url.protocol) || url.href !== `${url.origin}/`)
		throw new CloudError("protocol");
	return url.origin;
}

function decodeNote(bytes: Uint8Array): string {
	if (bytes.byteLength > KNOWLEDGE_MAX_NOTE_BYTES) throw new CloudError("protocol");
	try {
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
	} catch {
		throw new CloudError("protocol");
	}
}

function writeFailure(error: unknown, putStarted: boolean): Pick<CloudWriteResult, "status" | "reason"> {
	if (!(error instanceof CloudError)) throw error;
	if (error.code === "conflict") return { status: "conflict", reason: error.code };
	if (error.code === "forbidden" || error.code === "unauthorized")
		return { status: "forbidden", reason: error.code };
	if (error.code === "offline")
		return putStarted
			? { status: "unknown", reason: "write_unverified" }
			: { status: "offline", reason: error.code };
	if (putStarted) return { status: "unknown", reason: "write_unverified" };
	throw error;
}

export class CloudService {
	readonly endpoint: string;
	readonly username = DEFAULT_WEBDAV_USERNAME;
	readonly folder = DEFAULT_WEBDAV_FOLDER;
	private readonly dav: CloudDav;

	constructor(options: { http: CloudHttp; endpoint?: string }) {
		this.endpoint = endpointOrigin(options.endpoint ?? DEFAULT_WEBDAV_ENDPOINT);
		this.dav = new CloudDav(options.http, this.endpoint);
	}

	private async check(initialize: boolean): Promise<{ initialized: boolean }> {
		let initialized = await this.dav.collection(`${this.folder}/`);
		if (!initialized) {
			if (!(await this.dav.collection(""))) throw new CloudError("protocol");
			if (initialize) {
				await this.dav.ensureCollection(`${this.folder}/`);
				initialized = true;
			}
		}
		return { initialized };
	}

	probe(): Promise<{ initialized: boolean }> {
		return this.check(false);
	}

	initialize(): Promise<{ initialized: boolean }> {
		return this.check(true);
	}

	private notePath(path: string): string {
		return `${this.folder}/${cloudNotePath(path).split("/").map(encodeURIComponent).join("/")}`;
	}

	async read(path: string): Promise<CloudNote> {
		const response = await this.dav.request({
			method: "GET",
			path: this.notePath(path),
			headers: { Accept: "text/markdown, text/plain" },
		});
		if (response.status !== 200) throw httpError(response.status);
		return {
			path,
			text: decodeNote(response.body),
			hash: createHash("sha256").update(response.body).digest("hex"),
			version: strongEtag(response.headers.etag),
			bytes: response.body.byteLength,
			lastModified: response.headers["last-modified"] ?? null,
		};
	}

	private async verifyWrite(path: string, hash: string): Promise<boolean> {
		let note: CloudNote;
		try {
			note = await this.read(path);
		} catch (error) {
			if (!(error instanceof CloudError)) throw error;
			return false;
		}
		return note.hash === hash;
	}

	async write(input: { path: string; text: string; expectedVersion?: string }): Promise<CloudWriteResult> {
		const path = this.notePath(input.path);
		if (
			new TextEncoder().encode(input.text).byteLength > KNOWLEDGE_MAX_NOTE_BYTES ||
			(input.expectedVersion !== undefined && !strongEtag(input.expectedVersion))
		)
			throw new CloudError("protocol");
		const result: CloudWriteResult = {
			path: input.path,
			status: "unknown",
			version: null,
			hash: createHash("sha256").update(input.text).digest("hex"),
			reason: null,
		};
		let putStarted = false;
		try {
			if (!(await this.dav.collection(`${this.folder}/`))) throw new CloudError("not_found");
			const parents = path.split("/").slice(0, -1);
			for (let i = 2; i <= parents.length; i++)
				await this.dav.ensureCollection(`${parents.slice(0, i).join("/")}/`);
			putStarted = true;
			const response = await this.dav.request({
				method: "PUT",
				path,
				body: input.text,
				headers: {
					"Content-Type": "text/markdown; charset=utf-8",
					...(input.expectedVersion ? { "If-Match": input.expectedVersion } : { "If-None-Match": "*" }),
				},
			});
			if (![200, 201, 204].includes(response.status)) throw httpError(response.status);
			// Acknowledgement alone cannot verify that the requested bytes are now stored.
			if (!(await this.verifyWrite(input.path, result.hash)))
				return { ...result, reason: "write_unverified" };
			result.status = input.expectedVersion ? "updated" : "created";
			result.version = strongEtag(response.headers.etag);
			result.reason = result.version ? null : "missing_strong_etag";
		} catch (error) {
			Object.assign(result, writeFailure(error, putStarted));
		}
		return result;
	}
}
