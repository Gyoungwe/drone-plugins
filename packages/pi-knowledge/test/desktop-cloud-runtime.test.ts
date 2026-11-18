import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PluginNativeRuntimeFactory } from "@gyoungwe/plugin-api/native";
import type { PluginRuntimeContext, PluginRuntimeFactoryContext } from "@gyoungwe/plugin-api/runtime";
import { expect, it, vi } from "vitest";
import { withCloudOperations } from "../src/desktop/cloud-runtime.js";
import createDesktopRuntime from "../src/desktop/runtime.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const selected = {
	mode: "pull",
	bindingRevision: 7,
	paths: ["Home.md"],
	previews: [{ path: "Home.md", localHash: null, remoteHash: hash("fake remote"), remoteVersion: '"v1"' }],
};
const inputs = {
	cloudStatus: null,
	cloudProbe: null,
	cloudInitialize: null,
	cloudRead: { path: "Home.md" },
	cloudWrite: { path: "Home.md", text: "fake remote" },
	cloudSync: selected,
};
const slot = {
	configured: true,
	authentication: "http-basic-digest",
	source: "saved",
	savedConfigured: true,
};
function response(status: number, body = "", headers: Record<string, string> = {}) {
	return { status, headers, base64: Buffer.from(body).toString("base64") };
}
function collection(url: string) {
	return response(
		207,
		`<d:multistatus xmlns:d="DAV:"><d:response><d:href>${new URL(url).pathname}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,
	);
}
async function fixture(status: unknown = { slots: { webdav: slot } }) {
	const state = { status };
	const network = vi.fn(async (_name: string, input: Record<string, unknown>) =>
		input.method === "PROPFIND"
			? collection(String(input.url))
			: response(200, "fake remote", { ETag: '"v1"' }),
	);
	const call = vi.fn(async (name: string, input: unknown, _signal?: AbortSignal) => {
		if (name === "config.endpoint")
			return { state: "ready", endpoint: "http://10.126.126.1:8080", source: "default" };
		if (name === "credentials.status") {
			if (state.status instanceof Error) throw state.status;
			return state.status;
		}
		if (name.startsWith("network.")) return network(name, input as Record<string, unknown>);
		throw new Error(`Unexpected capability ${name}`);
	});
	const context: PluginRuntimeFactoryContext = {
		applicationId: "fake-application",
		signal: new AbortController().signal,
		resources: [{ kind: "state", handle: "fake-state" }],
		capabilities: {
			call: vi.fn(async () => {
				throw new Error("Activation broker must not do cloud IO");
			}),
		},
		events: { changed: vi.fn() },
		resourcesLifecycle: { dispose: async () => undefined },
	};
	const caller: PluginRuntimeContext = {
		scope: { kind: "application" },
		signal: context.signal,
		capabilities: { call },
	};
	const base = { operations: {}, dispose: vi.fn(async () => undefined) };
	const factory: PluginNativeRuntimeFactory = vi.fn(async () => base);
	const runtime = await withCloudOperations(factory)(context);
	const invoke = (name: string, input: unknown = inputs[name as keyof typeof inputs]) =>
		runtime.operations[name].execute(input, caller);
	return { state, network, call, context, caller, base, factory, runtime, invoke };
}

const unavailable = [
	["old host", new Error("fake-private-host-error"), "host_unsupported"],
	["no slot", { slots: {} }, "host_unsupported"],
	["wrong mode", { slots: { webdav: { ...slot, authentication: "literal" } } }, "host_unsupported"],
	["missing mode", { slots: { webdav: { configured: true } } }, "host_unsupported"],
	["not configured", { slots: { webdav: { ...slot, configured: false, source: null } } }, "not_configured"],
] as const;

it.each(unavailable)("gates every operation on %s without network IO", async (_name, status, reason) => {
	const f = await fixture(status);
	for (const name of Object.keys(inputs)) {
		const result = await f.invoke(name);
		expect(result).toMatchObject({ reason });
		if (name === "cloudStatus")
			expect(result).toHaveProperty(
				"status",
				reason === "host_unsupported" ? "unavailable" : "not_configured",
			);
		else expect(result).toEqual({ status: "failed", reason });
	}
	expect(f.call.mock.calls.filter(([name]) => name === "credentials.status").map(([name]) => name)).toEqual(
		Array(6).fill("credentials.status"),
	);
	expect(f.call.mock.calls.filter(([name]) => name === "config.endpoint")).toHaveLength(6);
	expect(f.network).not.toHaveBeenCalled();
	expect(JSON.stringify(await f.invoke("cloudStatus"))).not.toContain("fake-private");
});

it("registers six effects and preserves the base runtime operations and lifecycle", async () => {
	const f = await fixture();
	const operation = {
		inputSchema: {},
		resultSchema: {},
		effect: "read" as const,
		execute: async () => "fake existing",
	};
	const base = { ...f.base, operations: { existing: operation } };
	const runtime = await withCloudOperations(async () => base)(f.context);
	expect(Object.keys(runtime.operations).sort()).toEqual(["existing", ...Object.keys(inputs)].sort());
	expect(runtime.operations.existing).toBe(operation);
	expect(runtime.dispose).toBe(base.dispose);
	expect(
		Object.fromEntries(Object.entries(runtime.operations).map(([name, op]) => [name, op.effect])),
	).toEqual({
		existing: "read",
		cloudStatus: "read",
		cloudProbe: "read",
		cloudInitialize: "write",
		cloudRead: "read",
		cloudWrite: "write",
		cloudSync: "write",
	});
	await expect(
		withCloudOperations(async () => ({ ...base, operations: { cloudRead: operation } }))(f.context),
	).rejects.toThrow("Cloud operation collision: cloudRead");
	expect(base.dispose).toHaveBeenCalledOnce();
});

it("keeps the existing desktop operation key set while adding the cloud operations", async () => {
	const f = await fixture();
	const runtime = await createDesktopRuntime(f.context);
	expect(
		Object.keys(runtime.operations)
			.filter((name) => !(name in inputs))
			.sort(),
	).toEqual(
		[
			"binding",
			"modelReviewInfo",
			"modelReview",
			"reviewHistory",
			"undoReview",
			"semanticSettings",
			"setSemanticSettings",
			"specialistSettings",
			"setSpecialistSettings",
			"reviews",
			"previewReview",
			"rejectReview",
			"applyReview",
			"preferences",
			"setReviewPolicy",
			"overview",
			"search",
			"readNote",
			"links",
			"graph",
			"jobs",
			"recentByCategory",
		].sort(),
	);
	expect(
		Object.keys(runtime.operations)
			.filter((name) => name in inputs)
			.sort(),
	).toEqual(Object.keys(inputs).sort());
	await runtime.dispose();
});

it("routes DAV verbs through the live caller with credential metadata, summaries and readbacks", async () => {
	const f = await fixture();
	expect(await f.invoke("cloudProbe")).toEqual({ status: "ok", result: { initialized: true } });
	expect(await f.invoke("cloudRead")).toMatchObject({
		status: "ok",
		result: { text: "fake remote", version: '"v1"' },
	});
	expect(await f.invoke("cloudWrite")).toMatchObject({
		status: "ok",
		result: { status: "created", version: '"v1"' },
	});
	const collectionState = { initialized: false };
	f.network.mockImplementation(async (_name, input) => {
		if (input.method === "MKCOL") {
			collectionState.initialized = true;
			return response(201);
		}
		return String(input.url).endsWith("Drone-Knowledge/") && !collectionState.initialized
			? response(404)
			: collection(String(input.url));
	});
	expect(await f.invoke("cloudInitialize")).toEqual({ status: "ok", result: { initialized: true } });
	const verbs = f.network.mock.calls.map(([name, input]) => [name, input.method]);
	expect(verbs).toEqual([
		["network.read", "PROPFIND"],
		["network.read", "GET"],
		["network.read", "PROPFIND"],
		["network.write", "PUT"],
		["network.read", "GET"],
		["network.read", "PROPFIND"],
		["network.read", "PROPFIND"],
		["network.read", "PROPFIND"],
		["network.write", "MKCOL"],
		["network.read", "PROPFIND"],
	]);
	for (const [name, input] of f.network.mock.calls) {
		expect(input).toMatchObject({ credential: "webdav", httpAuth: { username: "gaoyangwei" } });
		expect(String(input.url)).toMatch(/^http:\/\/10\.126\.126\.1:8080\//);
		expect(Object.keys(input.headers as object).map((name) => name.toLowerCase())).not.toContain(
			"authorization",
		);
		if (name === "network.write") expect(input.summary).toEqual(expect.any(String));
		if (input.method === "PROPFIND") expect(input.headers).toHaveProperty("Depth", "0");
		if (input.method === "PUT")
			expect(Buffer.from(String(input.bodyBase64), "base64").toString()).toBe("fake remote");
	}
	expect(f.context.capabilities.call).not.toHaveBeenCalled();
	expect(f.call.mock.calls.every(([, , signal]) => signal === f.caller.signal)).toBe(true);
});

it.each([
	["User declined fake-private-error", "forbidden"],
	["Not authorized fake-private-error", "forbidden"],
	["Network connection lost fake-private-error", "offline"],
])("sanitizes capability failure %s to %s", async (message, reason) => {
	const f = await fixture();
	f.network.mockRejectedValue(new Error(message));
	expect(await f.invoke("cloudRead")).toEqual({ status: "failed", reason });
	f.network.mockImplementation(async (_name, input) => {
		if (input.method === "PROPFIND") return collection(String(input.url));
		throw Object.assign(new Error(message), reason === "forbidden" ? { code: "EACCES" } : {});
	});
	const result = await f.invoke("cloudWrite");
	expect(result).toMatchObject({
		status: "ok",
		result: { status: reason === "forbidden" ? "forbidden" : "unknown" },
	});
	expect(JSON.stringify(result)).not.toContain("fake-private");
	expect(f.network.mock.calls.filter(([, input]) => input.method === "PUT")).toHaveLength(1);
});

it("does not expose error response headers or bodies", async () => {
	const f = await fixture();
	f.network.mockResolvedValue(
		response(401, "fake-private-body", { "x-fake-private": "fake-private-header" }),
	);
	expect(await f.invoke("cloudRead")).toEqual({ status: "failed", reason: "unauthorized" });
});

it("declares the exact WebDAV slot, destination and host custody disclosure", () => {
	const manifest = JSON.parse(readFileSync(new URL("../plugin.manifest.json", import.meta.url), "utf8"));
	expect(manifest.drone.credentials).toEqual([
		{
			slot: "webdav",
			label: { zh: "WebDAV 云端知识库密码", en: "WebDAV cloud knowledge password" },
			hosts: ["10.126.126.1:8080"],
			header: "Authorization",
			fields: [],
			authentication: "http-basic-digest",
		},
	]);
	expect(manifest.permissions.network).toEqual(["configured-services", "10.126.126.1:8080"]);
	expect(manifest.permissions.credentials).toEqual(["host-kept WebDAV password (drone.credentials)"]);
});

it.each(["env", "saved"])(
	"reports effective %s state without probing or inferring missing metadata",
	async (source) => {
		const f = await fixture({ slots: { webdav: { ...slot, source, savedConfigured: false } } });
		expect(await f.invoke("cloudStatus")).toEqual({
			status: "available",
			reason: null,
			configured: true,
			credentialSource: source,
			savedConfigured: false,
			endpoint: { state: "ready", url: "http://10.126.126.1:8080", source: "default" },
		});
		f.state.status = { slots: { webdav: { configured: true, authentication: "http-basic-digest" } } };
		expect(await f.invoke("cloudStatus")).toEqual({
			status: "available",
			reason: null,
			configured: true,
			credentialSource: null,
			savedConfigured: null,
			endpoint: { state: "ready", url: "http://10.126.126.1:8080", source: "default" },
		});
		f.state.status = { slots: { webdav: { ...slot, configured: false } } };
		expect(await f.invoke("cloudWrite")).toEqual({ status: "failed", reason: "not_configured" });
		expect(f.network).not.toHaveBeenCalled();
	},
);
