import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { expect, it, vi } from "vitest";
import { CloudError, CloudService } from "../src/desktop/cloud.js";
import { cloudAvailability, createCloudHttp } from "../src/desktop/cloud-capabilities.js";
import { CloudDav } from "../src/desktop/cloud-dav.js";

const endpoint = "https://dav.example.test:8443";
function fixture() {
	const state = { endpoint, initialized: false };
	const network = vi.fn(async (input: { method: string; url: string }) => {
		if (input.method === "MKCOL") state.initialized = true;
		const path = new URL(input.url).pathname;
		const collection = input.method === "PROPFIND";
		const body = collection
			? `<d:multistatus xmlns:d="DAV:"><d:response><d:href>${input.url}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`
			: "synthetic note";
		return {
			status: collection
				? path !== "/" && !state.initialized
					? 404
					: 207
				: input.method === "GET"
					? 200
					: 201,
			headers: { ETag: '"v1"' },
			base64: Buffer.from(body).toString("base64"),
		};
	});
	const call = vi.fn(async (name: string, input: unknown) => {
		if (name === "config.endpoint") return { state: "ready", endpoint: state.endpoint, source: "env" };
		if (name === "credentials.status")
			return { slots: { webdav: { configured: true, authentication: "http-basic-digest" } } };
		return network(input as Parameters<typeof network>[0]);
	});
	return { state, network, call };
}

async function service(capabilities: PluginRuntimeCapabilities) {
	const signal = new AbortController().signal;
	const status = await cloudAvailability(capabilities, signal);
	if (status.endpoint?.state !== "ready") throw new Error("Expected ready endpoint");
	return new CloudService({
		endpoint: status.endpoint.url,
		http: createCloudHttp(capabilities, signal, status.endpoint.url),
	});
}

it("uses the ready env endpoint for CloudService and every DAV verb", async () => {
	const f = fixture();
	const cloud = await service(f);
	expect(cloud.endpoint).toBe(endpoint);
	await cloud.initialize();
	await cloud.read("Home.md");
	await cloud.write({ path: "Home.md", text: "synthetic note" });
	expect(new Set(f.network.mock.calls.map(([input]) => input.method))).toEqual(
		new Set(["GET", "PROPFIND", "MKCOL", "PUT"]),
	);
	for (const [input] of f.network.mock.calls) expect(input.url.startsWith(`${endpoint}/`)).toBe(true);
	expect(f.call.mock.calls.filter(([name]) => name === "config.endpoint")).toHaveLength(1);
});

it("refreshes CloudService endpoint and request URLs between operations", async () => {
	const f = fixture();
	const first = await service(f);
	await first.read("Home.md");
	f.state.endpoint = "http://second.example.test:8081";
	const second = await service(f);
	await second.read("Home.md");
	expect([first.endpoint, second.endpoint]).toEqual([endpoint, f.state.endpoint]);
	expect(f.network.mock.calls.map(([input]) => input.url)).toEqual([
		`${endpoint}/Drone-Knowledge/Home.md`,
		`${f.state.endpoint}/Drone-Knowledge/Home.md`,
	]);
	expect(f.call.mock.calls.filter(([name]) => name === "config.endpoint")).toHaveLength(2);
});

it.each([
	{ code: "EPLUGINENDPOINTCHANGED", message: "synthetic diagnostic" },
	{ message: "EPLUGINENDPOINTCHANGED" },
])("maps exact host endpoint-change errors through the DAV port: %j", async (error) => {
	const capabilities = { call: vi.fn().mockRejectedValue(error) };
	const cloud = new CloudService({
		endpoint,
		http: createCloudHttp(capabilities, new AbortController().signal, endpoint),
	});
	await expect(cloud.read("Home.md")).rejects.toMatchObject({ code: "endpoint_changed" });
	expect(capabilities.call).toHaveBeenCalledOnce();
});

it.each(["endpoint_changed", "invalid_endpoint", "host_unsupported"] as const)(
	"preserves mapped %s errors unchanged through DAV",
	async (code) => {
		const error = new CloudError(code);
		const dav = new CloudDav({ request: vi.fn().mockRejectedValue(error) }, endpoint);
		await expect(dav.request({ method: "GET", path: "Home.md" })).rejects.toBe(error);
	},
);
