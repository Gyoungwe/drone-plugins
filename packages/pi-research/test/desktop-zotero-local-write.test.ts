import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { CapabilityCall } from "../src/desktop/capability-fetch.js";
import {
	saveToZotero,
	updateInZotero,
	ZOTERO_LOCAL_CREDENTIAL,
	zoteroStatus,
} from "../src/desktop/zotero-tools.js";

const manifest = JSON.parse(readFileSync(new URL("../plugin.manifest.json", import.meta.url), "utf8"));
const SERVER_ID = "TESTSERVER1";
const DOI = "10.1000/test.paper";
const ITEM_KEY = "ABCD2345";
const COLLECTION_KEY = "COLL2345";
const UPDATE = { zotero_key: ITEM_KEY, collection_key: COLLECTION_KEY };

interface NetworkRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	credential?: string;
	bodyBase64?: string;
	summary?: string;
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
	return {
		status,
		headers: { "content-type": "application/json", ...headers },
		base64: Buffer.from(JSON.stringify(value)).toString("base64"),
	};
}

function libraryResponse(request: NetworkRequest, library: { collections: string[] }) {
	const path = new URL(request.url).pathname;
	const item = { key: ITEM_KEY, version: 1, data: { DOI, title: "Test paper", ...library } };
	if (path.endsWith("/items")) return json([item], 200, { "total-results": "1" });
	if (path.endsWith("/collections"))
		return json([{ key: COLLECTION_KEY, data: { name: "Reading", parentCollection: false } }]);
	if (path.endsWith("/children")) return json([]);
	if (path.endsWith(`/items/${ITEM_KEY}`)) {
		if (request.method === "PATCH") {
			const body = JSON.parse(Buffer.from(request.bodyBase64 ?? "", "base64").toString("utf8"));
			library.collections = body.collections;
			return json(null, 204);
		}
		return json(item);
	}
	throw new Error(`Unexpected Zotero request ${request.method} ${path}`);
}

function managedHost({
	localConfigured = true,
	webLibraryType,
	currentServerId = SERVER_ID,
}: {
	localConfigured?: boolean;
	webLibraryType?: "users" | "groups";
	currentServerId?: string;
} = {}) {
	const requests: { name: string; input: NetworkRequest }[] = [];
	const library: { collections: string[] } = { collections: [] };
	const call: CapabilityCall = async (name, request) => {
		if (name === "credentials.status")
			return {
				slots: {
					"zotero-local": { configured: localConfigured, fields: { serverId: SERVER_ID } },
					"zotero-web": {
						configured: Boolean(webLibraryType),
						fields: { libraryType: webLibraryType, libraryId: "42" },
					},
				},
			};
		if (!name.startsWith("network.")) throw new Error(`Unexpected capability ${name}`);
		const input = request as NetworkRequest;
		requests.push({ name, input });
		if (new Headers(input.headers).has("Zotero-API-Key"))
			throw new Error("The plugin must not send the host-reserved key header");
		const url = new URL(input.url);
		if (input.credential) {
			const slot = manifest.drone.credentials.find(
				(entry: { slot: string }) => entry.slot === input.credential,
			);
			if (!slot?.hosts.includes(url.host)) throw new Error("Credential slot is not declared for this host");
			if (input.credential === "zotero-local" && !localConfigured)
				throw new Error("Local writes are not authorized");
		}
		if (url.pathname === "/connector/ping") return json({});
		if (url.pathname === "/connector/getSelectedCollection")
			return json({ libraryID: 1, libraryName: "My Library", libraryEditable: true });
		if (url.pathname === "/api/") return json({}, 200, { "zotero-server-id": currentServerId });
		if (url.pathname === "/keys/current")
			return json({
				userID: 42,
				access: { user: { library: true, write: true }, groups: { "42": { library: true, write: true } } },
			});
		return libraryResponse(input, library);
	};
	return { call, requests };
}

it("declares the agreed local credential without changing the Web API slot", () => {
	expect(manifest.drone.credentials).toEqual([
		{
			slot: "zotero-web",
			label: { zh: "Zotero 网页 API 密钥", en: "Zotero Web API key" },
			hosts: ["api.zotero.org"],
			header: "Zotero-API-Key",
			fields: ["libraryType", "libraryId"],
		},
		{
			slot: "zotero-local",
			label: { zh: "Zotero 本机写入", en: "Zotero local writes" },
			hosts: ["127.0.0.1:23119"],
			header: "Zotero-API-Key",
			fields: ["serverId"],
		},
	]);
	expect(ZOTERO_LOCAL_CREDENTIAL).toEqual({
		slot: "zotero-local",
		header: "Zotero-API-Key",
		hosts: ["127.0.0.1:23119"],
	});
});

it.each([undefined, "users"] as const)(
	"updates locally with personal Web library %s",
	async (webLibraryType) => {
		const host = managedHost({ webLibraryType });
		const receipt = await updateInZotero(host.call, UPDATE, "/project");
		expect(receipt).toMatchObject({
			status: "updated",
			channel: "local",
			library: { type: "users", id: "0", local: true },
			changes: { addCollection: { key: COLLECTION_KEY, verified: true } },
		});
		expect(host.requests.filter(({ name }) => name === "network.write")).toEqual([
			{
				name: "network.write",
				input: expect.objectContaining({
					method: "PATCH",
					url: `http://127.0.0.1:23119/api/users/0/items/${ITEM_KEY}`,
					credential: "zotero-local",
					headers: expect.objectContaining({ "zotero-server-id": SERVER_ID }),
				}),
			},
		]);
		expect(host.requests.every(({ input }) => !new Headers(input.headers).has("Zotero-API-Key"))).toBe(true);
	},
);

it.each([false, true])(
	"keeps connector ping and local API GET credential-free when configured=%s",
	async (localConfigured) => {
		const host = managedHost({ localConfigured });
		expect(await saveToZotero(host.call, { doi: DOI, title: "Test paper" })).toMatchObject({
			status: "reused",
		});
		expect(await zoteroStatus(host.call)).toMatchObject({
			connector: { reachable: true },
			localWrite: { configured: localConfigured, staleServer: false },
		});
		expect(
			host.requests.map(({ name, input }) => ({
				name,
				method: input.method,
				path: new URL(input.url).pathname,
			})),
		).toEqual(
			expect.arrayContaining([
				{ name: "network.read", method: "POST", path: "/connector/ping" },
				{ name: "network.read", method: "GET", path: "/api/users/0/items" },
			]),
		);
		for (const { input } of host.requests)
			expect(input, `${input.method} ${new URL(input.url).pathname}`).not.toHaveProperty("credential");
	},
);

it("updates through the Web API when local authorization is absent", async () => {
	const host = managedHost({ localConfigured: false, webLibraryType: "users" });
	expect(await updateInZotero(host.call, UPDATE, "/project")).toMatchObject({
		status: "updated",
		channel: "web",
	});
	expect(host.requests.filter(({ name }) => name === "network.write")).toEqual([
		{
			name: "network.write",
			input: expect.objectContaining({
				method: "PATCH",
				url: `https://api.zotero.org/users/42/items/${ITEM_KEY}`,
				credential: "zotero-web",
			}),
		},
	]);
	expect(host.requests.every(({ input }) => !new Headers(input.headers).has("Zotero-Server-ID"))).toBe(true);
});

it("blocks a stale local authorization and reports the changed server", async () => {
	const host = managedHost({ currentServerId: "OTHERTESTSERVER" });
	expect(await updateInZotero(host.call, UPDATE, "/project")).toMatchObject({
		status: "blocked",
		reason: expect.stringContaining("different Zotero database"),
		write: { performed: false },
	});
	expect(await zoteroStatus(host.call)).toMatchObject({
		localWrite: { configured: true, staleServer: true },
		note: expect.stringContaining("authorized in Drone Settings → Zotero"),
	});
	expect(host.requests.filter(({ name }) => name === "network.write")).toEqual([]);
});

it("falls back to the Web API when the local server changed", async () => {
	const host = managedHost({ webLibraryType: "users", currentServerId: "OTHERTESTSERVER" });
	expect(await updateInZotero(host.call, UPDATE, "/project")).toMatchObject({
		status: "updated",
		channel: "web",
	});
	expect(await zoteroStatus(host.call)).toMatchObject({
		localWrite: { configured: true, staleServer: true },
	});
	expect(
		host.requests.filter(({ name }) => name === "network.write").map(({ input }) => input.credential),
	).toEqual(["zotero-web"]);
});

it("keeps an explicitly configured group library on the Web API", async () => {
	const host = managedHost({ webLibraryType: "groups" });
	expect(await updateInZotero(host.call, UPDATE, "/project")).toMatchObject({
		status: "updated",
		channel: "web",
		library: { type: "groups", id: "42", local: false },
	});
	expect(host.requests.filter(({ name }) => name === "network.write")).toEqual([
		{
			name: "network.write",
			input: expect.objectContaining({
				method: "PATCH",
				url: `https://api.zotero.org/groups/42/items/${ITEM_KEY}`,
				credential: "zotero-web",
			}),
		},
	]);
	expect(host.requests.every(({ input }) => new URL(input.url).host === "api.zotero.org")).toBe(true);
});
