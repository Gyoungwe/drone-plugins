import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

type Manifest = {
	permissions: {
		filesystem: string[];
		network: unknown[];
		subprocess: unknown[];
		externalWrites: boolean;
	};
};

it("requests workspace write without broadening other permissions", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../plugin.manifest.json", import.meta.url), "utf8"),
	) as Manifest;
	const { permissions } = manifest;

	expect(permissions.filesystem).toEqual([
		"application-state",
		"application-state-write",
		"binary-state-read",
		"binary-state-write",
		"workspace-write",
	]);
	expect(permissions.filesystem).toContain("workspace-write");
	for (const permission of [
		"workspace",
		"workspace-read",
		"configured-vault",
		"configured-vault-write",
		"vault-read",
	]) {
		expect(permissions.filesystem).not.toContain(permission);
	}
	expect(permissions.network).toEqual([]);
	expect(permissions.subprocess).toEqual([]);
	expect(permissions.externalWrites).toBe(false);
	expect("readWrite" in permissions).toBe(false);
});
