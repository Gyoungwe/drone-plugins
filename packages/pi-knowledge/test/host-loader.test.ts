import { describe, expect, it } from "vitest";
import { knowledgeHostLoader } from "../src/core/host.js";

describe("knowledge host loader", () => {
	it("exposes the versioned read port without importing Drone", () => {
		expect(knowledgeHostLoader.contractVersion).toBe(1);
		const port = knowledgeHostLoader.load();
		expect(port.contractVersion).toBe(1);
		expect(Object.keys(port).sort()).toEqual([
			"contractVersion",
			"decide",
			"graph",
			"jobs",
			"maintenance",
			"noteLinks",
			"openTarget",
			"overview",
			"preview",
			"read",
			"reviews",
			"search",
			"setupPreview",
			"specialistSettings",
		]);
		for (const method of [
			"overview",
			"search",
			"read",
			"noteLinks",
			"graph",
			"reviews",
			"preview",
			"decide",
			"setupPreview",
			"specialistSettings",
			"openTarget",
			"jobs",
			"maintenance",
		] as const)
			expect(typeof port[method]).toBe("function");
	});
});
