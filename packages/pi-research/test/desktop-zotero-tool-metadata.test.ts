import { afterEach, expect, it, vi } from "vitest";
import { literatureCard } from "../../pi-knowledge/src/core/flow-cards.js";
import type { CapabilityCall } from "../src/desktop/capability-fetch.js";
import { zoteroLiteratureCard } from "../src/desktop/zotero-literature-card.js";
import { registerManagedZoteroTools, saveToZotero, updateInZotero } from "../src/desktop/zotero-tools.js";

const EXPECTED_METADATA = {
	research_zotero_status: {
		readOnly: true,
		capabilities: ["research", "external"],
		activity: { text: "正在检查 Zotero 接入状态…", phase: "verification" },
		families: [
			{
				match: "research-zotero",
				label: "Zotero",
				readOnly: true,
				capabilities: ["research", "external"],
				activity: {
					text: "正在检索 Zotero 文献库…",
					phase: "literature-search",
					verb: "正在检索 Zotero",
					queryKeys: ["query", "q", "search", "search_text", "text"],
				},
			},
		],
	},
	research_zotero_save: {
		capabilities: ["research", "external"],
		subagent: "exclude",
		activity: { text: "正在写入 Zotero 文献库…", phase: "literature-write" },
		flow: "literature",
	},
	research_zotero_update: {
		capabilities: ["research", "external"],
		subagent: "exclude",
		activity: { text: "正在修改 Zotero 条目…", phase: "literature-write" },
		flow: "literature",
	},
};

interface ManagedTool {
	name: string;
	drone: unknown;
	execute(
		id: string,
		params: Record<string, unknown>,
		signal?: AbortSignal,
		update?: unknown,
		ctx?: { cwd: string },
	): Promise<{ content: { type: string; text: string }[]; details: Record<string, unknown> }>;
}

function registeredTools(call: CapabilityCall) {
	const tools: ManagedTool[] = [];
	registerManagedZoteroTools({ registerTool: (tool) => tools.push(tool as ManagedTool) }, call);
	return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

it.each(Object.entries(EXPECTED_METADATA))(
	"declares serializable Drone metadata for %s",
	(name, expected) => {
		const tools = registeredTools(async () => {
			throw new Error("Registration must not call the host");
		});
		const metadata = tools[name].drone;
		expect(metadata).toEqual(expected);
		expect(structuredClone(metadata)).toEqual(expected);
		expect(JSON.parse(JSON.stringify(metadata))).toEqual(expected);
	},
);

const DOI = "10.1000/gut.2021.001";
const AT = 1_800_000_000_000;
const RECEIPTS = [
	{
		name: "saved via connector",
		details: {
			doi: DOI,
			title: "Gut signatures",
			status: "saved",
			channel: "connector",
			zoteroKey: "ABCD1234",
			library: { name: "My Library" },
			fulltextStatus: "attachment-indexed-not-read",
		},
	},
	{
		name: "reused via web",
		details: {
			doi: DOI,
			status: "reused",
			channel: "web",
			zoteroKey: "WEB12345",
			library: { name: "Reading" },
			fulltextStatus: "metadata-only",
		},
	},
	{
		name: "blocked without key",
		details: { doi: DOI, status: "blocked" },
	},
	{
		name: "no DOI",
		details: { status: "blocked", zoteroKey: "ABCD1234" },
	},
	{
		name: "updated locally",
		details: {
			doi: DOI,
			title: "Gut signatures",
			status: "updated",
			channel: "local",
			zoteroKey: "ABCD1234",
		},
	},
];

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it.each(RECEIPTS)("matches the pi-knowledge write card for $name", ({ details }) => {
	vi.spyOn(Date, "now").mockReturnValue(AT);
	expect(zoteroLiteratureCard(details, null, AT)).toEqual(
		literatureCard({ result: { details } }, { write: true }),
	);
});

function managedHost({ localConfigured = false } = {}) {
	let saved = false;
	const dialogs: string[] = [];
	const item = { key: "ABCD1234", data: { DOI, title: "Gut signatures", collections: [] as string[] } };
	const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => ({
		status,
		headers: { "content-type": "application/json", ...headers },
		base64: Buffer.from(JSON.stringify(value)).toString("base64"),
	});
	const call: CapabilityCall = async (name, request) => {
		if (name === "credentials.status")
			return {
				slots: { "zotero-local": { configured: localConfigured, fields: { serverId: "TESTSERVER1" } } },
			};
		if (name === "task.grant.allowances") return { allowances: [] };
		const input = request as { url: string; method: string; summary: string; bodyBase64: string };
		const path = new URL(input.url).pathname;
		if (name === "network.write") dialogs.push(input.summary);
		if (path === "/connector/ping") return json({});
		if (path === "/api/") return json({}, 200, { "zotero-server-id": "TESTSERVER1" });
		if (path === "/connector/getSelectedCollection")
			return json({ libraryID: 1, libraryName: "My Library", libraryEditable: true });
		if (path === "/connector/saveItems") {
			saved = true;
			return json({}, 201);
		}
		if (path === "/api/users/0/items") {
			const items = saved ? [item] : [];
			return json(items, 200, { "total-results": String(items.length) });
		}
		if (path === "/api/users/0/collections")
			return json([{ key: "COLL1234", data: { name: "Reading", parentCollection: false } }]);
		if (path === "/api/users/0/items/ABCD1234") {
			if (input.method === "PATCH") {
				item.data.collections = JSON.parse(
					Buffer.from(input.bodyBase64, "base64").toString("utf8"),
				).collections;
				return json(null, 204);
			}
			return json(item);
		}
		if (path.endsWith("/children")) return json([], 200, { "total-results": "0" });
		throw new Error(`Unexpected Zotero request ${input.method} ${path}`);
	};
	return { call, dialogs };
}

it("adds the save card to details while keeping the original receipt text", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(AT);
	const params = { doi: DOI, title: "Gut signatures" };
	const receipt = await saveToZotero(managedHost().call, params);
	const host = managedHost();
	const result = await registeredTools(host.call).research_zotero_save.execute("save", params);
	const expectedCard = literatureCard(
		{ toolName: "research_zotero_save", result: { details: receipt } },
		{ write: true },
	);
	expect(receipt.status).toBe("saved");
	expect(result.details).toEqual({ ...receipt, cards: [expectedCard] });
	expect(result.content).toEqual([{ type: "text", text: JSON.stringify(receipt, null, 2) }]);
	expect(JSON.parse(result.content[0].text)).not.toHaveProperty("cards");
	expect(host.dialogs).toEqual([`写入 Zotero 文献库：《Gut signatures》（DOI ${DOI}）`]);
});

it("omits cards for an update receipt without a DOI and keeps its original text", async () => {
	const host = managedHost();
	const params = { zotero_key: "ABCD1234", collection_key: "COLL1234" };
	const receipt = await updateInZotero(host.call, params, "/project");
	const result = await registeredTools(host.call).research_zotero_update.execute(
		"update",
		params,
		undefined,
		undefined,
		{ cwd: "/project" },
	);
	expect(result.details).toEqual(receipt);
	expect(result.details).not.toHaveProperty("cards");
	expect(result.content).toEqual([{ type: "text", text: JSON.stringify(receipt, null, 2) }]);
	expect(host.dialogs).toEqual([]);
});

it("adds the update card to details while keeping the original receipt text", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(AT);
	const params = { zotero_key: "ABCD1234", collection_key: "COLL1234" };
	const receipt = await updateInZotero(managedHost({ localConfigured: true }).call, params, "/project");
	const host = managedHost({ localConfigured: true });
	const result = await registeredTools(host.call).research_zotero_update.execute(
		"update",
		params,
		undefined,
		undefined,
		{ cwd: "/project" },
	);
	const expectedCard = literatureCard(
		{ toolName: "research_zotero_update", result: { details: receipt } },
		{ write: true },
	);
	expect(receipt.status).toBe("updated");
	expect(result.details).toEqual({ ...receipt, cards: [expectedCard] });
	expect(result.content).toEqual([{ type: "text", text: JSON.stringify(receipt, null, 2) }]);
	expect(JSON.parse(result.content[0].text)).not.toHaveProperty("cards");
	expect(host.dialogs).toEqual(["修改 Zotero 条目 ABCD1234"]);
});
