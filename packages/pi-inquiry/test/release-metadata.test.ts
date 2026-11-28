import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
	name?: string;
	version?: string;
	private?: boolean;
	publishConfig?: unknown;
	license?: string;
	description?: string;
	keywords?: unknown;
	repository?: {
		type?: string;
		url?: string;
		directory?: string;
	};
};

type PluginManifest = {
	id?: string;
	version?: string;
	drone?: {
		hostEvents?: string[];
		inquiryRerun?: string;
	};
	permissions?: {
		filesystem?: string[];
	};
};

type UiManifest = {
	version?: string;
};

function readJson<T>(relativePath: string): T {
	return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")) as T;
}

describe("pi-inquiry release metadata", () => {
	const pkg = readJson<PackageJson>("../package.json");
	const manifest = readJson<PluginManifest>("../plugin.manifest.json");
	const ui = readJson<UiManifest>("../ui/plugin.json");
	const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

	it("declares public GitHub Release package metadata without npm publishConfig", () => {
		expect(pkg.name).toBe("@gyoungwe/pi-inquiry");
		expect(pkg.version).toBe("0.1.0");
		expect("private" in pkg).toBe(false);
		expect("publishConfig" in pkg).toBe(false);
		expect(pkg.license).toBe("MIT");
		expect(pkg.repository?.directory).toBe("packages/pi-inquiry");
		expect(Array.isArray(pkg.keywords) && pkg.keywords.includes("pi-package")).toBe(true);
		expect(pkg.description ?? "").not.toMatch(/unpublished|migration candidate/iu);
	});

	it("matches plugin.manifest.json and ui/plugin.json release declarations", () => {
		expect(manifest.id).toBe("drone-pi-inquiry");
		expect(manifest.version).toBe(pkg.version);
		expect(manifest.drone?.hostEvents).toEqual(
			expect.arrayContaining([
				"inquiry.compute",
				"inquiry.decision",
				"inquiry.local-execution",
				"inquiry.task-terminal",
			]),
		);
		expect(manifest.drone?.inquiryRerun).toBe("request");
		expect(manifest.permissions?.filesystem).toContain("workspace-write");
		expect(ui.version).toBe(pkg.version);
	});

	it("keeps package README free of stale unpublished/unavailable claims", () => {
		expect(readme).not.toMatch(
			/private migration candidate|must not be published|unpublished combined package|Rerun execution remains unavailable/iu,
		);
	});
});
