import { describe, expect, it } from "vitest";
import {
	createZoteroConnectorHost,
	createZoteroHost,
	registerZoteroConnectorHost,
	registerZoteroHost,
	zoteroHostLoader,
	type ZoteroHostPort,
} from "../src/zotero-host.js";

function port(calls: string[]): ZoteroHostPort {
	return {
		async read(path) {
			calls.push(path);
			if (path.startsWith("items?")) {
				return { data: [{ key: "ABCD1234", data: { DOI: "10.1234/example", collections: ["C1"] } }], total: 1 };
			}
			return { data: [{ key: "EFGH5678", data: { itemType: "attachment", parentItem: "ABCD1234", contentType: "application/pdf" } }], total: 1 };
		},
	};
}

describe("zotero host adapter", () => {
	it("loads the read-only identity operation through the versioned loader", async () => {
		const calls: string[] = [];
		const adapter = zoteroHostLoader.load(port(calls), { libraryType: "users", libraryId: "0", verifier: "host-fixture" });
		expect(adapter.contractVersion).toBe(1);
		expect(await adapter.operations.lookup({ doi: "https://doi.org/10.1234/EXAMPLE", collection: "C1" })).toMatchObject({
			state: "found",
			itemId: "ABCD1234",
			verifier: "host-fixture",
			attachmentContentsVerified: false,
		});
		expect(calls).toHaveLength(2);
	});

	it("registers one operation and fails closed before transport for an invalid DOI", async () => {
		const calls: string[] = [];
		const registered = new Map<string, unknown>();
		const adapter = registerZoteroHost({ register(name, operation) { registered.set(name, operation); } }, port(calls));
		expect(registered.get("lookup")).toBe(adapter.operations.lookup);
		expect(await adapter.operations.lookup({ doi: "title only" })).toEqual({ state: "blocked", reason: "exact-doi-required" });
		expect(calls).toEqual([]);
	});

	it("preserves an incomplete host response as unknown", async () => {
		const adapter = createZoteroHost({ read: async () => ({ data: [], total: 101 }) });
		expect(await adapter.operations.lookup({ doi: "10.1234/example" })).toEqual({ state: "unknown", reason: "lookup-incomplete" });
	});

	it("adapts the shared connector-shaped transport without owning credentials", async () => {
		const requests: unknown[] = [];
		const adapter = createZoteroConnectorHost({
			execute: async request => {
				requests.push(request);
				if (request.input.path.startsWith("items?"))
					return { data: [{ key: "ABCD1234", data: { DOI: "10.1234/example" } }], total: 1 };
				return { data: [{ key: "EFGH5678", data: { itemType: "attachment", parentItem: "ABCD1234" } }], total: 1 };
			},
		});
		await expect(adapter.operations.lookup({ doi: "10.1234/example" })).resolves.toMatchObject({ state: "found" });
		expect(requests).toEqual([
			expect.objectContaining({ connectorId: "zotero", operation: "read" }),
			expect.objectContaining({ connectorId: "zotero", operation: "read" }),
		]);
	});

	it("registers the connector-backed operation through the same registry", () => {
		const registered = new Map<string, unknown>();
		const adapter = registerZoteroConnectorHost(
			{ register(name, operation) { registered.set(name, operation); } },
			{ execute: async () => ({ data: [], total: 0 }) },
		);
		expect(registered.get("lookup")).toBe(adapter.operations.lookup);
	});
});
