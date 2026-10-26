import { mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createSemanticSettingsApi,
	createSemanticSettingsState,
	validateSemanticConfig,
} from "../src/core/semantic-settings.js";

let root: string;
let vaultId: string;

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), "drone-semantic-package-")));
	vaultId = "0123456789abcdef01234567";
	await mkdir(join(root, vaultId), { recursive: true });
	vi.stubEnv("DRONE_KNOWLEDGE_DIR", root);
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await rm(root, { recursive: true, force: true });
});

describe("semantic settings package", () => {
	it("validates provider safety and preserves disabled defaults", () => {
		expect(validateSemanticConfig({})).toMatchObject({ enabled: false, provider: "none" });
		expect(() =>
			validateSemanticConfig({ provider: "openai-compatible", baseUrl: "http://example.test", model: "m" }),
		).toThrow("HTTPS");
		expect(() => validateSemanticConfig({ provider: "ollama", enabled: "false" as never })).toThrow(
			"enabled",
		);
	});

	it("does not create a missing state directory while reading defaults", async () => {
        const absent = "abcdef0123456789abcdef01";
        const api = createSemanticSettingsApi(undefined, root);
        expect(await api.readSemanticSettings(absent)).toMatchObject({revision:0,enabled:false});
        await expect(stat(join(root,absent))).rejects.toMatchObject({code:"ENOENT"});
        await api.saveSemanticSettings(absent,{provider:"none"},0);
        expect((await api.readSemanticSettings(absent)).revision).toBe(1);
    });

    it("keeps revision compare-and-swap and default timestamps per state", async () => {
		const first = createSemanticSettingsApi(createSemanticSettingsState());
		const second = createSemanticSettingsApi(createSemanticSettingsState());
		const initial = await first.readSemanticSettings(vaultId);
		expect(initial.revision).toBe(0);
		const saved = await first.saveSemanticSettings(vaultId, { provider: "ollama", enabled: false }, 0);
		expect(saved.revision).toBe(1);
		await expect(
			first.saveSemanticSettings(vaultId, { provider: "ollama", enabled: false }, 0),
		).rejects.toThrow("stale");
		expect(await second.readSemanticSettings(vaultId)).toMatchObject({ revision: 1 });
		expect(JSON.parse(await readFile(join(root, vaultId, "semantic.json"), "utf8"))).toMatchObject({
			revision: 1,
		});
	});
});
