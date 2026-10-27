import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeOwnerLifecycle } from "../src/core/owner-lifecycle.js";
import { createKnowledgeSemanticPreferences } from "../src/desktop/semantic-preferences.js";
import { createBrokerSemanticSettings } from "../src/desktop/semantic-settings.js";
import type { KnowledgeReadOwner } from "../src/desktop/read-model.js";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("routes semantic settings through the state HostPort with revisioned write/readback", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "knowledge-semantic-broker-")));
	roots.push(root);
	const vault = join(root, "Vault");
	await mkdir(vault);
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	const binding = await config.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	const calls: string[] = [];
	let document: { value: unknown; version: string } | null = null;
	const capabilities = {
		async call(name: string, input: unknown): Promise<unknown> {
			calls.push(name);
			const args = input as { root: string; path: string; expectedVersion?: string | null; value?: unknown };
			expect(args.root).toBe("state-root");
			if (name === "state.ensureDirectory") expect(args.path).toBe(binding.vaultId);
			else expect(args.path).toBe(`${binding.vaultId}/semantic.json`);
			if (name === "state.readJson") return document ? { kind: "value", ...document } : { kind: "missing", version: null };
			if (name === "state.ensureDirectory") return null;
			if (name === "state.writeJson") {
				expect(args.expectedVersion).toBe(document?.version ?? null);
				document = { value: args.value, version: "semantic-v1" };
				return null;
			}
			throw new Error(`Unexpected capability ${name}`);
		},
	};
	const owner: KnowledgeReadOwner = {
		config,
		...createKnowledgeOwnerLifecycle({ async dispose() {} }),
		services: { async getKnowledgeService() { throw new Error("semantic settings must not start the index"); } },
	};
	const preferences = createKnowledgeSemanticPreferences(owner, createBrokerSemanticSettings(capabilities, "state-root"), true);
	const initial = await preferences.read();
	expect(initial.settings).toMatchObject({ revision: 0, provider: "none", enabled: false });
	const saved = await preferences.write({
		bindingRevision: binding.revision,
		expectedSettingsRevision: 0,
		settings: { provider: "ollama", enabled: false },
	});
	expect(saved.settings).toMatchObject({ revision: 1, provider: "ollama", enabled: false });
	expect(calls).toEqual(["state.readJson", "state.readJson", "state.ensureDirectory", "state.writeJson", "state.readJson", "state.readJson"]);
	await expect(preferences.write({ bindingRevision: binding.revision, expectedSettingsRevision: 0, settings: { provider: "none" } })).rejects.toThrow("stale");
	await owner.dispose();
});
