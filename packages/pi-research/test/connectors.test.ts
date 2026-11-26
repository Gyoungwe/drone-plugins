import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
	ConnectorRegistry,
	createConnectorReceipt,
	createConnectorReceiptChain,
	planConnectorOperation,
} from "../src/host.js";
import piResearch, { type PiToolRegistrar, registerPiConnectors } from "../src/index.js";

const manifest = JSON.parse(readFileSync(new URL("../plugin.manifest.json", import.meta.url), "utf8"));

it("registers all eight declared native tools without collisions", () => {
	const names: string[] = [];
	piResearch({
		registerTool(tool: { name: string }) {
			names.push(tool.name);
		},
	});
	expect(names).toHaveLength(8);
	expect(new Set(names).size).toBe(names.length);
	expect(names).toEqual(manifest.tools);
});

it("lists the eight read-only declarations and inspects a connector by ID", async () => {
	const tools: Parameters<PiToolRegistrar["registerTool"]>[0][] = [];
	const registration = registerPiConnectors({ registerTool: (tool) => tools.push(tool) });
	expect(registration.tools).toEqual(manifest.tools.slice(-2));
	expect(tools.map((tool) => tool.name)).toEqual(["connector_list", "connector_get"]);
	const [list, get] = tools;
	const listed = await list.execute("fixture", {});
	expect(listed.details).toMatchObject({
		contractVersion: 1,
		connectors: [
			{
				id: "arxiv",
				enabledByDefault: true,
				permissions: { readOnly: true, network: { allowedHosts: ["export.arxiv.org", "arxiv.org"] } },
			},
			{ id: "browser", permissions: { readOnly: true } },
			{ id: "generic-mcp", permissions: { readOnly: true } },
			{ id: "institutional", permissions: { readOnly: true } },
			{ id: "search", permissions: { readOnly: true } },
			{
				id: "semantic-scholar",
				enabledByDefault: true,
				permissions: { readOnly: true, network: { allowedHosts: ["api.semanticscholar.org"] } },
			},
			{ id: "webdav", permissions: { readOnly: true } },
			{ id: "zotero", permissions: { readOnly: true } },
		],
	});
	expect((await get.execute("fixture", { id: "zotero" })).details).toMatchObject({
		contractVersion: 1,
		connector: { id: "zotero", permissions: { readOnly: true } },
	});
	await expect(get.execute("fixture", { id: "unknown" })).rejects.toThrow("Unknown connector: unknown");
});

it("plans reads and requires authorization for browser handoff", () => {
	const registry = new ConnectorRegistry();
	const zotero = registry.require("zotero");
	expect(planConnectorOperation(zotero, "read").status).toBe("allowed");
	expect(planConnectorOperation(zotero, "write").status).toBe("unsupported");
	const browser = registry.require("browser");
	expect(planConnectorOperation(browser, "browser-handoff").status).toBe("requires-authorization");
	expect(planConnectorOperation(browser, "browser-handoff", "auth:fixture").status).toBe("allowed");
});

it("preserves write and readback phases in a provenance receipt chain", () => {
	const attempt = createConnectorReceipt({
		receiptId: "receipt:fixture-attempt",
		connectorId: "webdav",
		host: "drone-desktop",
		operation: "write",
		phase: "attempt",
		status: "succeeded",
		observedAt: "2026-10-18T00:00:00.000Z",
		readOnly: false,
		externalSideEffects: ["remote-write"],
		authorizationRef: "auth:fixture",
	});
	const readback = createConnectorReceipt({
		receiptId: "receipt:fixture-readback",
		connectorId: "webdav",
		host: "drone-desktop",
		operation: "read",
		phase: "readback",
		status: "succeeded",
		observedAt: "2026-10-18T00:00:01.000Z",
		readOnly: true,
		externalSideEffects: [],
		parentReceiptId: attempt.receiptId,
		contentHash: "a".repeat(64),
	});
	const chain = createConnectorReceiptChain({
		chainId: "chain:fixture-write",
		connectorId: "webdav",
		operation: "write",
		startedAt: attempt.observedAt,
		finishedAt: readback.observedAt,
		status: "succeeded",
		receipts: [attempt, readback],
	});
	expect(chain.contract).toBe("drone-connector-receipt/v1");
	expect(chain.receipts).toEqual([attempt, readback]);
	expect(readback.parentReceiptId).toBe(attempt.receiptId);
	expect(attempt.externalSideEffects).toContain("remote-write");
});
