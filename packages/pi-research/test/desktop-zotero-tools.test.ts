import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import createDesktopRuntime from "../src/desktop/runtime.js";
import {
	saveToZotero,
	updateInZotero,
	ZOTERO_NETWORK_READS,
	zoteroStatus,
} from "../src/desktop/zotero-tools.js";

const manifest = JSON.parse(readFileSync(new URL("../plugin.manifest.json", import.meta.url), "utf8"));
const DOI = "10.1000/gut.2021.001";
const ITEM = {
	key: "ABCD2345",
	data: { DOI, title: "Gut signatures", itemType: "journalArticle", collections: [] },
};

/**
 * A Drone host as the managed runtime sees it (same rules as network-capabilities.ts: a POST is a
 * write unless the manifest declares it a read, and each write asks), in front of a Zotero desktop
 * that answers the connector and local API.
 */
function managedHost({ approve = true } = {}) {
	const dialogs: (string | undefined)[] = [];
	const sent: string[] = [];
	let saved = false;
	const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => ({
		status,
		headers: { "content-type": "application/json", ...headers },
		base64: Buffer.from(JSON.stringify(value)).toString("base64"),
		bytes: 0,
	});
	const call = async (name: string, input: any) => {
		const url = new URL(input.url);
		const endpoint = `${url.host}${url.pathname}`;
		if (!manifest.permissions.network.includes(url.host)) throw new Error("Network host is not declared");
		if (name === "network.read" && input.method === "POST" && !manifest.drone.networkReads.includes(endpoint))
			throw new Error(`POST is a network write unless drone.networkReads lists ${endpoint}`);
		if (name === "network.write") {
			dialogs.push(input.summary);
			if (!approve) throw new Error("Plugin capability denied: network.write");
		}
		sent.push(`${name === "network.write" ? "WRITE" : "read"} ${input.method} ${url.pathname}`);
		if (url.pathname === "/connector/ping") return json({});
		if (url.pathname === "/connector/getSelectedCollection")
			return json({ libraryID: 1, libraryName: "My Library", libraryEditable: true });
		if (url.pathname === "/connector/saveItems") {
			saved = true;
			return json({}, 201);
		}
		if (url.pathname === "/api/users/0/items") {
			const items = saved ? [ITEM] : [];
			return json(items, 200, { "total-results": String(items.length) });
		}
		if (url.pathname.endsWith("/children")) return json([], 200, { "total-results": "0" });
		throw new Error(`Unexpected Zotero request ${input.method} ${url.pathname}`);
	};
	return { call, dialogs, sent };
}

describe("managed Zotero tools", () => {
	it("declares the same read-only connector endpoints as the manifest", () => {
		expect(manifest.drone.networkReads).toEqual([...ZOTERO_NETWORK_READS]);
	});

	it("saves one paper with exactly one host dialog and reads it back", async () => {
		const host = managedHost();
		const receipt = await saveToZotero(host.call, {
			doi: DOI,
			title: "Gut signatures",
			channel: "connector",
		});
		expect(host.dialogs).toEqual([`写入 Zotero 文献库：《Gut signatures》（DOI ${DOI}）`]);
		expect(host.sent.filter((line) => line.startsWith("WRITE"))).toEqual(["WRITE POST /connector/saveItems"]);
		expect(receipt).toMatchObject({
			status: "saved",
			zoteroKey: "ABCD2345",
			consent: { via: "host-dialog" },
		});
	});

	it("reports a declined dialog as the user's choice, with nothing written", async () => {
		const host = managedHost({ approve: false });
		const receipt = await saveToZotero(host.call, {
			doi: DOI,
			title: "Gut signatures",
			channel: "connector",
		});
		expect(receipt).toMatchObject({ status: "cancelled", reason: "user-declined" });
		expect(receipt.write?.performed).not.toBe(true);
		expect(host.sent.some((line) => line.startsWith("WRITE"))).toBe(false);
	});

	it("blocks changing an existing item without credentials, before any write", async () => {
		const host = managedHost();
		const receipt = await updateInZotero(
			host.call,
			{ zotero_key: "ABCD2345", collection_key: "COLL2345" },
			"/project",
		);
		expect(receipt).toMatchObject({ status: "blocked" });
		expect(host.dialogs).toEqual([]);
	});

	it("reports connector reachability and the unavailable credentialed channels", async () => {
		expect(await zoteroStatus(managedHost().call)).toMatchObject({
			connector: { reachable: true },
			webApi: { configured: false },
			localWrite: { configured: false },
		});
	});

	it("registers the three tools as read in each managed native session", async () => {
		const host = managedHost();
		const runtime = await createDesktopRuntime({
			signal: new AbortController().signal,
			capabilities: { call: host.call },
		} as never);
		const session = await runtime.createNativeSession!();
		const tools: string[] = [];
		session.extension({ registerTool: (tool: { name: string }) => tools.push(tool.name) } as never);
		expect(tools.sort()).toEqual([
			"research_zotero_save",
			"research_zotero_status",
			"research_zotero_update",
		]);
		expect(Object.keys(session.toolEffects ?? {}).sort()).toEqual(tools);
		expect(Object.values(session.toolEffects ?? {})).toEqual(["read", "read", "read"]);
	});
});

it("a save inside a task authorization names the allowance it was given, on the one write only", async () => {
	const host = managedHost();
	const sentAllowances: unknown[] = [];
	const call = async (name: string, input: any) => {
		if (name === "task.grant.allowances")
			return {
				taskId: "t",
				allowances: [
					{
						id: "other",
						role: "acceptance",
						member: "zotero_item",
						consent: { doi: "10.1000/other" },
						used: false,
					},
					{ id: "slot", role: "acceptance", member: "zotero_item", consent: { slot: true }, used: false },
				],
			};
		if (name.startsWith("network.")) sentAllowances.push(`${name}:${input.allowance ?? "-"}`);
		return host.call(name, input);
	};
	const receipt = await saveToZotero(call, { doi: DOI, title: "Gut signatures" });
	expect(receipt).toMatchObject({ status: "saved", consent: { via: "task-grant", milestoneId: "slot" } });
	expect(sentAllowances.filter((entry) => String(entry).startsWith("network.write"))).toEqual([
		"network.write:slot",
	]);
	expect(
		sentAllowances
			.filter((entry) => String(entry).startsWith("network.read"))
			.every((entry) => String(entry).endsWith(":-")),
	).toBe(true);
});

/**
 * Drone with a Web API key saved in settings and Zotero desktop closed. Like the real host it keeps the
 * key: it refuses a request that sets the slot's header itself, and attaches the key only when the
 * request names the slot toward one of its hosts.
 */
function webHost({ saved = true } = {}) {
	const sent: string[] = [];
	const dialogs: (string | undefined)[] = [];
	let items: unknown[] = [];
	const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => ({
		status,
		headers: { "content-type": "application/json", ...headers },
		base64: Buffer.from(JSON.stringify(value)).toString("base64"),
	});
	const call = async (name: string, input: any) => {
		if (name === "credentials.status")
			return {
				slots: {
					"zotero-web": saved
						? { configured: true, fields: { libraryType: "users", libraryId: "42" } }
						: { configured: false, fields: {} },
				},
			};
		if (!name.startsWith("network.")) throw new Error(`Plugin capability is unavailable: ${name}`);
		const url = new URL(input.url);
		if (url.host === "127.0.0.1:23119") throw new Error("connect ECONNREFUSED 127.0.0.1:23119");
		if (Object.keys(input.headers).some((header) => header.toLowerCase() === "zotero-api-key"))
			throw new Error("Network header is reserved for the host: Zotero-API-Key");
		const slot = manifest.drone.credentials.find((entry: any) => entry.slot === input.credential);
		if (!slot?.hosts.includes(url.host)) throw new Error("Zotero rejects a request without a key");
		if (name === "network.write") dialogs.push(input.summary);
		sent.push(`${name === "network.write" ? "WRITE" : "read"} ${input.method} ${url.pathname}`);
		if (url.pathname === "/keys/current")
			return json({ userID: 42, username: "ada", access: { user: { library: true, write: true } } });
		if (url.pathname === "/users/42/items" && input.method === "GET")
			return json(items, 200, { "total-results": String(items.length) });
		if (url.pathname === "/users/42/items" && input.method === "POST") {
			items = [ITEM];
			return json({ successful: { "0": ITEM }, failed: {} });
		}
		if (url.pathname.endsWith("/children")) return json([], 200, { "total-results": "0" });
		if (url.pathname === `/users/42/items/${ITEM.key}`) return json(ITEM);
		throw new Error(`Unexpected Zotero request ${input.method} ${url.pathname}`);
	};
	return { call, sent, dialogs };
}

describe("managed Zotero tools with the Web API key Drone keeps", () => {
	it("saves through the Web API with one dialog while the key stays with the host", async () => {
		const host = webHost();
		const receipt = await saveToZotero(host.call, { doi: DOI, title: "Gut signatures" });
		expect(receipt).toMatchObject({
			status: "saved",
			zoteroKey: "ABCD2345",
			consent: { via: "host-dialog" },
		});
		expect(host.dialogs).toHaveLength(1);
		expect(host.sent.filter((line) => line.startsWith("WRITE"))).toEqual(["WRITE POST /users/42/items"]);
		expect(host.sent).toEqual([
			"read GET /keys/current",
			"read GET /users/42/items",
			"WRITE POST /users/42/items",
			"read GET /users/42/items",
			"read GET /users/42/items/ABCD2345/children",
		]);
	});

	it("reports the saved library and its write access, and stays blocked when nothing is saved", async () => {
		expect(await zoteroStatus(webHost().call)).toMatchObject({
			connector: { reachable: false },
			webApi: { configured: true, libraryType: "users", libraryId: "42", write: true },
		});
		const empty = webHost({ saved: false });
		expect(await zoteroStatus(empty.call)).toMatchObject({
			webApi: { configured: false, reason: "not-saved-in-drone-settings" },
		});
		await expect(saveToZotero(empty.call, { doi: DOI, title: "Gut signatures" })).rejects.toThrow(
			"No Zotero write channel",
		);
		expect(empty.sent).toEqual([]);
	});
});
