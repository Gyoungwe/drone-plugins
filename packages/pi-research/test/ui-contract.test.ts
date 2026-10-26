import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("pi-research UI contribution contract", () => {
	it("registers a removable research entry, citation panel and connector section", () => {
		const manifest = JSON.parse(readFileSync(resolve(root, "ui/plugin.json"), "utf8"));
		expect(manifest.droneUi).toBe(1);
		expect(manifest.contributions).toEqual([
			expect.objectContaining({ id: "research-home", region: "home.section", export: "ResearchHome" }),
			expect.objectContaining({ id: "research-citations", region: "panel.tab", export: "ResearchCitations" }),
			expect.objectContaining({ id: "research-connectors", region: "skills.section", export: "ResearchConnectors" }),
		]);
	});

	it("keeps the browser bundle host-only and exports every contribution", () => {
		const bundle = readFileSync(resolve(root, "ui/bundle.js"), "utf8");
		expect(bundle).toContain("ResearchHome");
		expect(bundle).toContain("ResearchCitations");
		expect(bundle).toContain("ResearchConnectors");
		expect(bundle).not.toMatch(/window\.pi|from ["']electron["']/u);
	});
});
