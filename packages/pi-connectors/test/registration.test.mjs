import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, "plugin.manifest.json"), "utf8"));

const { ConnectorRegistry, createConnectorReceipt, planConnectorOperation, registerPiConnectors } =
	await import("../dist/index.mjs");

test("registerPiConnectors exposes read-only declaration tools", async () => {
	const tools = [];
	const pi = {
		registerTool(tool) {
			tools.push(tool);
		},
	};
	const registration = registerPiConnectors(pi);
	assert.deepEqual(registration.tools, manifest.tools);
	assert.deepEqual(
		tools.map((tool) => tool.name),
		["connector_list", "connector_get"],
	);
	const listed = await tools[0].execute();
	assert.deepEqual(
		listed.details.connectors.map((descriptor) => descriptor.id),
		["arxiv", "browser", "generic-mcp", "institutional", "search", "semantic-scholar", "webdav", "zotero"],
	);
	assert.equal(
		listed.details.connectors.every((descriptor) => descriptor.permissions.readOnly),
		true,
	);
	const arxiv = listed.details.connectors.find((descriptor) => descriptor.id === "arxiv");
	const semanticScholar = listed.details.connectors.find((descriptor) => descriptor.id === "semantic-scholar");
	assert.deepEqual(arxiv.permissions.network.allowedHosts, ["export.arxiv.org", "arxiv.org"]);
	assert.deepEqual(semanticScholar.permissions.network.allowedHosts, ["api.semanticscholar.org"]);
	assert.equal(arxiv.enabledByDefault, true);
	assert.equal(semanticScholar.enabledByDefault, true);
});

test("registry plans reads and blocks undeclared writes", () => {
	const registry = new ConnectorRegistry();
	const zotero = registry.require("zotero");
	assert.equal(planConnectorOperation(zotero, "read").status, "allowed");
	assert.equal(planConnectorOperation(zotero, "write").status, "unsupported");
	const browser = registry.require("browser");
	assert.equal(planConnectorOperation(browser, "browser-handoff").status, "requires-authorization");
	assert.equal(planConnectorOperation(browser, "browser-handoff", "auth:fixture").status, "allowed");
});

test("receipts preserve readback phases without performing I/O", () => {
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
	assert.equal(readback.parentReceiptId, attempt.receiptId);
	assert.equal(attempt.externalSideEffects.includes("remote-write"), true);
});
