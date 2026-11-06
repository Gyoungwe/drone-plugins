import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import createDesktopRuntime from "../src/desktop/runtime.js";
import {
	describeZoteroAcceptance,
	identifyZoteroReceipt,
	verifyZoteroAcceptance,
	ZOTERO_ACCEPTANCE_OPERATIONS,
	ZOTERO_ACCEPTANCE_SERVICE,
} from "../src/desktop/zotero-acceptance.js";

const manifest = JSON.parse(readFileSync(new URL("../plugin.manifest.json", import.meta.url), "utf8"));
const DOI = "10.1000/gut.2021.001";
const ITEM = { key: "ABCD2345", data: { DOI, title: "Gut signatures", itemType: "journalArticle", collections: [] } };

/** The host's network.read in front of a Zotero desktop local API; anything else fails the test. */
function localApi(items: unknown[]) {
	const sent: string[] = [];
	const call = async (name: string, input: any) => {
		const url = new URL(input.url);
		if (name !== "network.read" || input.method !== "GET") throw new Error(`Unexpected ${name} ${input.method}`);
		if (!manifest.permissions.network.includes(url.host)) throw new Error("Network host is not declared");
		sent.push(url.pathname);
		const body = url.pathname.endsWith("/children") ? [] : items;
		return {
			status: 200,
			headers: { "content-type": "application/json", "total-results": String(body.length) },
			base64: Buffer.from(JSON.stringify(body)).toString("base64"),
			bytes: 0,
		};
	};
	return { call, sent };
}

it("declares one acceptance service whose operations exist in the runtime", async () => {
	expect(manifest.drone.provides).toEqual({
		[ZOTERO_ACCEPTANCE_SERVICE]: { version: 1, operations: [...ZOTERO_ACCEPTANCE_OPERATIONS] },
	});
	const runtime = await createDesktopRuntime({ capabilities: { call: async () => null } } as any);
	expect(Object.keys(runtime.operations)).toEqual(expect.arrayContaining(["describe", "verify"]));
	const session = await runtime.createNativeSession!({} as any);
	expect(session.nativeOperations?.identify).toMatchObject({ event: "tool_execution_end", effect: "read" });
});

it("describes a named DOI and a DOI-less slot; consent never grants more than the milestone names", () => {
	expect(describeZoteroAcceptance(null)).toEqual({
		fields: ["doi", "libraryId", "collection"],
		evidenceKind: "zotero-read-only-item-identity",
	});
	expect(describeZoteroAcceptance({ kind: "zotero_item", doi: DOI })).toMatchObject({
		label: `文献进入 Zotero（${DOI}）`,
		consent: { doi: DOI, libraryId: null, collection: null },
	});
	expect(describeZoteroAcceptance({ kind: "zotero_item" }).consent).toEqual({
		slot: true,
		libraryId: null,
		collection: null,
	});
});

it("verifies read-only through network.read and reports a found item with an open link", async () => {
	const host = localApi([ITEM]);
	const result = await verifyZoteroAcceptance(host.call, { kind: "zotero_item", doi: DOI });
	expect(result).toMatchObject({
		state: "found",
		itemId: "ABCD2345",
		summary: "Zotero 已找到条目 ABCD2345",
		links: [{ target: "zotero://select/library/items/ABCD2345" }],
	});
	expect(host.sent.every((path) => path.startsWith("/api/users/0/"))).toBe(true);
	expect((await verifyZoteroAcceptance(localApi([]).call, { kind: "zotero_item", doi: DOI })).state).toBe(
		"not-found",
	);
	expect(await verifyZoteroAcceptance(host.call, { kind: "zotero_item" })).toMatchObject({ state: "pending" });
});

it("identifies only a read-back save receipt from the actual tool event", () => {
	const event = (details: unknown, extra = {}) => ({
		type: "tool_execution_end",
		toolName: "research_zotero_save",
		result: { content: [], details },
		isError: false,
		...extra,
	});
	expect(identifyZoteroReceipt(event({ status: "saved", zoteroKey: "ABCD2345", doi: DOI }))).toEqual({ doi: DOI });
	expect(identifyZoteroReceipt(event({ status: "reused", zoteroKey: "ABCD2345", doi: DOI }))).toEqual({ doi: DOI });
	for (const wrong of [
		event({ status: "cancelled", zoteroKey: null, doi: DOI }),
		event({ status: "saved", zoteroKey: "short", doi: DOI }),
		event({ status: "saved", zoteroKey: "ABCD2345", doi: "not-a-doi" }),
		event({ status: "saved", zoteroKey: "ABCD2345", doi: DOI }, { isError: true }),
		event({ status: "saved", zoteroKey: "ABCD2345", doi: DOI }, { toolName: "write" }),
	])
		expect(identifyZoteroReceipt(wrong)).toBeNull();
});
