import { createHash } from "node:crypto";
import type { PluginRuntimeContext, PluginRuntimeFactoryContext } from "@gyoungwe/plugin-api/runtime";
import { Compile } from "typebox/compile";
import { expect, it, vi } from "vitest";
import { cloudStatusResultSchema } from "../src/desktop/cloud-contract.js";
import { withCloudOperations } from "../src/desktop/cloud-runtime.js";

const endpoint = "https://dav.example.test:8443";
const ready = { state: "ready", endpoint, source: "env" };
const invalid = { state: "invalid", endpoint: null, source: "env", reason: "invalid_endpoint" };
const unsupported = "Plugin capability is not registered: config.endpoint";
const hash = createHash("sha256").update("synthetic note").digest("hex");
const sync = {
	mode: "pull",
	bindingRevision: 7,
	paths: ["Home.md"],
	previews: [{ path: "Home.md", localHash: hash, remoteHash: hash, remoteVersion: '"v1"' }],
};
const inputs = {
	cloudStatus: null,
	cloudProbe: null,
	cloudInitialize: null,
	cloudRead: { path: "Home.md" },
	cloudWrite: { path: "Home.md", text: "synthetic note" },
	cloudSync: sync,
};

async function networkResponse(input: { method: string; url: string }) {
	return {
		status: input.method === "PROPFIND" ? 207 : 200,
		headers: { ETag: '"v1"' },
		base64: Buffer.from(
			input.method === "PROPFIND"
				? `<d:multistatus xmlns:d="DAV:"><d:response><d:href>${input.url}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`
				: "synthetic note",
		).toString("base64"),
	};
}

async function fixture(configuration: unknown = ready, configured = true) {
	const state = { configuration, endpointError: null as unknown };
	const network = vi.fn(networkResponse);
	const call = vi.fn(async (name: string, input: unknown, _signal?: AbortSignal) => {
		if (name === "config.endpoint") {
			if (state.endpointError !== null) throw state.endpointError;
			return state.configuration;
		}
		if (name === "credentials.status")
			return {
				slots: {
					webdav: { configured, authentication: "http-basic-digest", source: "saved", savedConfigured: true },
				},
			};
		if (name.startsWith("network.")) return network(input as Parameters<typeof network>[0]);
		if (name === "state.readJson")
			return {
				kind: "value",
				value: {
					version: 1,
					vaultId: "a".repeat(24),
					revision: 7,
					vault: "/synthetic/vault",
					profile: "hybrid",
					depositMode: "verified",
					subagentPolicy: "none",
					updatedAt: "synthetic-date",
				},
			};
		if (name === "roots.resolve") return { handle: "synthetic-files" };
		if (name === "files.readText") return { text: "synthetic note", sha256: hash };
		throw new Error(`Unexpected capability ${name}`);
	});
	const context: PluginRuntimeFactoryContext = {
		applicationId: "synthetic-app",
		signal: new AbortController().signal,
		resources: [
			{ kind: "state", handle: "synthetic-state" },
			{ kind: "files", handle: "synthetic-files" },
		],
		capabilities: { call: vi.fn().mockRejectedValue(new Error("Activation IO forbidden")) },
		events: { changed: vi.fn() },
	};
	const caller: PluginRuntimeContext = {
		capabilities: { call },
		signal: context.signal,
		scope: { kind: "application" },
	};
	const runtime = await withCloudOperations(async () => ({ operations: {}, dispose: async () => undefined }))(
		context,
	);
	const invoke = (name: keyof typeof inputs) => runtime.operations[name].execute(inputs[name], caller);
	return { state, call, network, invoke, caller };
}

it("resolves the caller endpoint once before every cloud operation including sync preview and transfer", async () => {
	const f = await fixture();
	for (const name of Object.keys(inputs) as (keyof typeof inputs)[]) {
		f.call.mockClear();
		f.network.mockClear();
		const result = await f.invoke(name);
		expect(result).toMatchObject({ status: name === "cloudStatus" ? "available" : "ok" });
		expect(f.call.mock.calls[0]).toEqual(["config.endpoint", { slot: "webdav" }, f.caller.signal]);
		expect(f.call.mock.calls.filter(([capability]) => capability === "config.endpoint")).toHaveLength(1);
		if (name === "cloudStatus") expect(f.network).not.toHaveBeenCalled();
		else expect(f.network.mock.calls.length).toBeGreaterThan(0);
		for (const [input] of f.network.mock.calls) expect(input.url.startsWith(`${endpoint}/`)).toBe(true);
	}
});

it("uses a changed host endpoint on the next runtime operation", async () => {
	const f = await fixture();
	await f.invoke("cloudRead");
	const next = "http://next.example.test:8082";
	f.state.configuration = { ...ready, endpoint: next };
	await f.invoke("cloudRead");
	expect(f.network.mock.calls.map(([input]) => input.url)).toEqual([
		`${endpoint}/Drone-Knowledge/Home.md`,
		`${next}/Drone-Knowledge/Home.md`,
	]);
	expect(f.call.mock.calls.filter(([name]) => name === "config.endpoint")).toHaveLength(2);
});

it("disables every operation for an invalid endpoint without network requests", async () => {
	const f = await fixture(invalid);
	for (const name of Object.keys(inputs) as (keyof typeof inputs)[])
		expect(await f.invoke(name)).toMatchObject({
			reason: "invalid_endpoint",
			status: name === "cloudStatus" ? "unavailable" : "failed",
		});
	expect(f.network).not.toHaveBeenCalled();
});

it.each([new Error(unsupported), { message: unsupported }])(
	"maps only the exact unsupported capability message without network requests: %j",
	async (error) => {
		const f = await fixture();
		f.state.endpointError = error;
		for (const name of Object.keys(inputs) as (keyof typeof inputs)[])
			expect(await f.invoke(name)).toMatchObject({ reason: "host_unsupported" });
		expect(f.network).not.toHaveBeenCalled();
	},
);

it.each([new Error("User denied"), new Error(`${unsupported}.`), new Error("EPLUGINENDPOINTCHANGED extra")])(
	"rejects other endpoint capability failures without fallback: %j",
	async (error) => {
		const f = await fixture();
		f.state.endpointError = error;
		await expect(f.invoke("cloudRead")).rejects.toBe(error);
		await expect(f.invoke("cloudStatus")).rejects.toBe(error);
		expect(f.network).not.toHaveBeenCalled();
	},
);

it("keeps endpoint capability cancellation as an abort without network requests", async () => {
	const f = await fixture();
	const abort = new DOMException("Operation aborted", "AbortError");
	f.state.endpointError = abort;
	await expect(f.invoke("cloudRead")).rejects.toBe(abort);
	expect(f.network).not.toHaveBeenCalled();
});

it.each([
	null,
	{},
	{ ...ready, endpoint: 42 },
	{ ...ready, source: "other" },
	{ ...invalid, endpoint: "synthetic-invalid-value" },
])("rejects malformed endpoint capability results without network requests: %j", async (configuration) => {
	const f = await fixture(configuration);
	await expect(f.invoke("cloudRead")).rejects.toThrow();
	await expect(f.invoke("cloudStatus")).rejects.toThrow();
	expect(f.network).not.toHaveBeenCalled();
});

it("reports endpoint_changed for a host request failure", async () => {
	const f = await fixture();
	f.network.mockRejectedValue({ code: "EPLUGINENDPOINTCHANGED" });
	expect(await f.invoke("cloudRead")).toEqual({ status: "failed", reason: "endpoint_changed" });
});

it.each([{ code: "EPLUGINENDPOINTCHANGED" }, { message: "EPLUGINENDPOINTCHANGED" }])(
	"reports endpoint_changed when endpoint resolution fails with the exact marker: %j",
	async (error) => {
		const f = await fixture();
		f.state.endpointError = error;
		for (const name of Object.keys(inputs).filter((name) => name !== "cloudStatus") as Exclude<
			keyof typeof inputs,
			"cloudStatus"
		>[])
			expect(await f.invoke(name)).toEqual({ status: "failed", reason: "endpoint_changed" });
		expect(f.network).not.toHaveBeenCalled();
	},
);

it.each(["PUT", "GET"])("reports endpoint_changed during write %s without retrying", async (method) => {
	const f = await fixture();
	const respond = f.network.getMockImplementation();
	if (!respond) throw new Error("Expected network responder");
	f.network.mockImplementation(async (input) => {
		if (input.method === method) throw { message: "EPLUGINENDPOINTCHANGED" };
		return respond(input);
	});
	expect(await f.invoke("cloudWrite")).toEqual({ status: "failed", reason: "endpoint_changed" });
	expect(f.network.mock.calls.filter(([input]) => input.method === "PUT")).toHaveLength(1);
});

it.each([
	[
		"default",
		{ ...ready, endpoint: "http://10.126.126.1:8080", source: "default" },
		true,
		{ state: "ready", url: "http://10.126.126.1:8080", source: "default" },
		"available",
		null,
	],
	["env", ready, true, { state: "ready", url: endpoint, source: "env" }, "available", null],
	[
		"invalid",
		{ ...invalid, raw: "synthetic-invalid-value" },
		true,
		{ state: "invalid", reason: "invalid_endpoint" },
		"unavailable",
		"invalid_endpoint",
	],
	[
		"no-password",
		ready,
		false,
		{ state: "ready", url: endpoint, source: "env" },
		"not_configured",
		"not_configured",
	],
	["unsupported", ready, true, null, "unavailable", "host_unsupported"],
] as const)(
	"reports safe schema-valid %s status without HTTP",
	async (kind, configuration, configured, metadata, status, reason) => {
		const f = await fixture(configuration, configured);
		if (kind === "unsupported") f.state.endpointError = { message: unsupported };
		const result = await f.invoke("cloudStatus");
		expect(result).toMatchObject({ endpoint: metadata, status, reason });
		expect(Compile(cloudStatusResultSchema).Check(result)).toBe(true);
		expect(f.network).not.toHaveBeenCalled();
		expect(JSON.stringify(result)).not.toContain("synthetic-invalid-value");
	},
);
