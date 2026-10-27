import { describe, expect, it } from "vitest";
import { copyFile, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { knowledgeHostLoader } from "../src/core/host.js";
import { createKnowledgeWorker, knowledgeWorkerMetadata } from "../src/core/runtime-host.js";

describe("knowledge host loader", () => {
	it("accepts a host-owned worker seam without resolving a resource eagerly", () => {
		let calls = 0;
		knowledgeHostLoader.configureWorker?.({
			createWorker: () => {
				calls += 1;
				throw new Error("worker must be lazy");
			},
			workerMetadata: () => ({ version: "test" }),
		});
		expect(calls).toBe(0);
	});

	it("selects and verifies the package-local worker when the service requests one", () => {
		let selected: URL | undefined;
		knowledgeHostLoader.configureWorker?.({
			createWorker: (url) => {
				selected = url;
				return { url };
			},
		});
		createKnowledgeWorker(new URL("file:///ignored-by-package-loader.mjs"), {});
		expect(selected?.pathname).toMatch(/\/lib\/knowledge\/runtime\/worker\.mjs$/u);
		expect(knowledgeWorkerMetadata().integrity).toMatch(/^[a-f0-9]{64}$/u);
	});

	it("resolves the installed worker when a bundled host entry runs outside its package directory", async () => {
		const originalCwd = process.cwd();
		const bundleRoot = await mkdtemp(join(tmpdir(), "pi-knowledge-bundled-host-"));
		const cwdRoot = await mkdtemp(join(originalCwd, ".pi-knowledge-host-cwd-"));
		try {
			const bundledHost = join(bundleRoot, "host.mjs");
			await copyFile(new URL("../dist/host.mjs", import.meta.url), bundledHost);
			process.chdir(cwdRoot);
			const bundled = (await import(`${pathToFileURL(bundledHost).href}?test=${Date.now()}`)) as {
				resolveKnowledgePackageWorkerUrl(): URL;
			};
			expect(bundled.resolveKnowledgePackageWorkerUrl().pathname).toMatch(
				/\/node_modules\/@gyoungwe\/pi-knowledge\/lib\/knowledge\/runtime\/worker\.mjs$/u,
			);
		} finally {
			process.chdir(originalCwd);
			await Promise.all([
				rm(bundleRoot, { recursive: true, force: true }),
				rm(cwdRoot, { recursive: true, force: true }),
			]);
		}
	});

	it("exposes the versioned read port without importing Drone", () => {
		expect(knowledgeHostLoader.contractVersion).toBe(1);
		const port = knowledgeHostLoader.load();
		expect(port.contractVersion).toBe(1);
		expect(Object.keys(port).sort()).toEqual([
			"backgroundReviewer",
			"contractVersion",
			"dailyDiscovery",
			"decide",
			"graph",
			"jobs",
			"maintenance",
			"memory",
			"noteLinks",
			"openTarget",
			"overview",
			"preview",
			"read",
			"recordTerminalJobExperience",
			"registerAnswerPublication",
			"researchResource",
			"reviewWikiWithModel",
			"reviews",
			"search",
			"semantic",
			"setupPreview",
			"specialistSettings",
			"topics",
			"uiState",
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
		expect(typeof port.backgroundReviewer).toBe("function");
		expect(typeof port.memory?.dailyContext).toBe("function");
		expect(typeof port.memory?.saveIdea).toBe("function");
		expect(typeof port.memory?.relatedForMemory).toBe("function");
		expect(typeof port.memory?.saveMemory).toBe("function");
		expect(typeof port.researchResource?.resolveContext).toBe("function");
		expect(typeof port.researchResource?.ingestSnapshot).toBe("function");
		expect(typeof port.recordTerminalJobExperience).toBe("function");
		expect(typeof port.registerAnswerPublication).toBe("function");
		expect(typeof port.reviewWikiWithModel).toBe("function");
		expect(typeof port.uiState?.subscribe).toBe("function");
		expect(typeof port.uiState?.notify).toBe("function");
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
		expect(typeof port.topics?.list).toBe("function");
		expect(typeof port.topics?.archive).toBe("function");
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
