import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knowledgeHostLoader } from "../src/core/host.js";

describe("knowledge host loader", () => {
	it("exposes the versioned read port without importing Drone", () => {
		expect(knowledgeHostLoader.contractVersion).toBe(1);
		const port = knowledgeHostLoader.load();
		expect(port.contractVersion).toBe(1);
		expect(Object.keys(port).sort()).toEqual([
			"contractVersion",
			"dailyDiscovery",
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
			"semantic",
			"setupPreview",
			"specialistSettings",
			"vault",
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
		expect(port.dailyDiscovery?.systemPrompt).toContain("research colleague");
		expect(typeof port.dailyDiscovery?.buildMessage).toBe("function");
		expect(typeof port.dailyDiscovery?.parseIdeas).toBe("function");
		expect(Object.keys(port.vault ?? {}).sort()).toEqual([
			"containedFile",
			"createFileOnly",
			"isConflict",
			"readBinding",
			"readNote",
			"replaceFile",
		]);
		expect(Object.keys(port.semantic ?? {}).sort()).toEqual([
			"cancelIndex",
			"index",
			"saveSettings",
			"status",
			"testProvider",
		]);
	});

	it("routes Vault create/read/replace through the host port with CAS", async () => {
		const vault = await mkdtemp(join(tmpdir(), "pi-knowledge-host-vault-"));
		try {
			const port = knowledgeHostLoader.load();
			if (!port.vault) throw new Error("Vault host port is missing");
			const canonicalVault = await realpath(vault);
			await mkdir(join(canonicalVault, "notes"));
			const path = await port.vault.containedFile(canonicalVault, "notes/test.md");
			expect(await port.vault.createFileOnly(path, "before\n")).toBe(true);
			const first = (await port.vault.readNote(canonicalVault, "notes/test.md")) as { hash: string; text: string };
			expect(first.text).toBe("before\n");
			await port.vault.replaceFile(path, "after\n", { expectedHash: first.hash });
			const second = (await port.vault.readNote(canonicalVault, "notes/test.md")) as { text: string };
			expect(second.text).toBe("after\n");
		} finally {
			await rm(vault, { recursive: true, force: true });
		}
	});
});
