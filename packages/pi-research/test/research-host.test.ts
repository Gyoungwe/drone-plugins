import { describe, expect, it } from "vitest";
import {
	researchConnectorHostLoader,
	researchWriteAdapterHostLoader,
} from "../src/research-host.js";

describe("research host contract seam", () => {
	it("fails closed when connector transport is not supplied by the host", async () => {
		const host = researchConnectorHostLoader.load();
		expect(host.contractVersion).toBe(1);
		expect(host.status).toBe("unavailable");
		expect(host.list()).toEqual([]);
		await expect(host.search({ query: "enzyme" })).rejects.toThrow(/transport is unavailable/);
		await expect(host.recommend("seed", "crossref")).rejects.toThrow(/transport is unavailable/);
	});

	it("fails closed for writes until the host supplies an authorized adapter", async () => {
		const host = researchWriteAdapterHostLoader.load();
		expect(host.contractVersion).toBe(1);
		expect(host.status).toBe("unavailable");
		expect(host.descriptors()).toEqual([]);
		expect(() =>
			host.prepare({
				adapterId: "zotero-write",
				targetRef: "library",
				payload: { title: "test" },
				action: "prepare",
			}),
		).toThrow(/write adapters are unavailable/);
	});
});
