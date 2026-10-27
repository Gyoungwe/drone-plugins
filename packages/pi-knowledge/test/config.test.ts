import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createKnowledgeConfigApi,
	knowledgeDirectory,
	projectIdentity,
	readKnowledgeBinding,
	saveKnowledgeBinding,
	withKnowledgeBinding,
} from "../src/core/config.js";

let root: string;
let vault: string;

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), "drone-knowledge-config-")));
	vault = join(root, "Vault");
	await mkdir(vault);
	vi.stubEnv("DRONE_KNOWLEDGE_DIR", join(root, "app"));
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await rm(root, { recursive: true, force: true });
});

describe("knowledge binding", () => {
	it("reports a failed queued write to its caller and still runs the next write", async () => {
		const api = createKnowledgeConfigApi();
		const input = { vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" } as const;
		await api.saveKnowledgeBinding(input);
		const rejected = api.saveKnowledgeBinding(input, 0);
		const next = api.saveKnowledgeBinding(input, 1);
		await expect(rejected).rejects.toThrow("Knowledge binding changed while confirming");
		await expect(next).resolves.toMatchObject({ revision: 2 });
		expect((await api.readKnowledgeBinding())?.revision).toBe(2);
	});

	it("keeps factory directories and binding contexts independent of later environment changes", async () => {
		const first = createKnowledgeConfigApi();
		const second = createKnowledgeConfigApi(undefined, join(root, "second-state"));
		const otherVault = join(root, "OtherVault");
		await mkdir(otherVault);
		vi.stubEnv("DRONE_KNOWLEDGE_DIR", join(root, "unrelated-state"));
		const [firstBinding, secondBinding] = await Promise.all([
			first.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" }),
			second.saveKnowledgeBinding({ vault: otherVault, profile: "project", depositMode: "run-only", subagentPolicy: "none" }),
		]);
		expect(first.knowledgeDirectory()).toBe(join(root, "app"));
		expect(second.knowledgeDirectory()).toBe(join(root, "second-state"));
		await first.withKnowledgeBinding(firstBinding, async () => {
			expect(await first.readKnowledgeBinding()).toEqual(firstBinding);
			expect(await second.readKnowledgeBinding()).toEqual(secondBinding);
		});
		expect(await readKnowledgeBinding()).toBeNull();
		expect(JSON.parse(await readFile(join(root, "app/binding.json"), "utf8"))).toEqual(firstBinding);
		expect(JSON.parse(await readFile(join(root, "second-state/binding.json"), "utf8"))).toEqual(secondBinding);
	});

	it("derives stable identities and rejects an unconfigured relative directory", () => {
		expect(projectIdentity(join(root, "My project"))).toMatch(/^my-project-[a-f0-9]{10}$/);
		expect(projectIdentity(join(root, "My project"))).toBe(projectIdentity(join(root, "My project")));
		expect(projectIdentity(join(root, "ignored"), "project-a")).toBe("project-a");
		vi.stubEnv("DRONE_KNOWLEDGE_DIR", undefined);
		expect(knowledgeDirectory()).toBeNull();
		vi.stubEnv("DRONE_KNOWLEDGE_DIR", "relative");
		expect(() => knowledgeDirectory()).toThrow("must be absolute");
	});

	it("persists a binding atomically and scopes reads to its revision", async () => {
		expect(await readKnowledgeBinding()).toBeNull();
		const binding = await saveKnowledgeBinding({
			vault,
			profile: "hybrid",
			depositMode: "verified",
			subagentPolicy: "read-local",
		});
		expect(binding).toMatchObject({ version: 1, revision: 1, vault: await realpath(vault) });
		if (process.platform !== "win32") {
			expect((await stat(join(root, "app"))).mode & 0o777).toBe(0o700);
			expect((await stat(join(root, "app", "binding.json"))).mode & 0o777).toBe(0o600);
		}
		expect(JSON.parse(await readFile(join(root, "app", "binding.json"), "utf8"))).toMatchObject(binding);
		expect(await readKnowledgeBinding()).toEqual(binding);
		await expect(saveKnowledgeBinding({ ...binding, vault }, 0)).rejects.toThrow("changed");
		await expect(withKnowledgeBinding({ ...binding, revision: 2 }, () => "unreachable")).rejects.toThrow(
			"changed",
		);
		expect(await withKnowledgeBinding(binding, () => readKnowledgeBinding())).toEqual(binding);
	});

	it("rejects malformed bindings rather than falling back to project state", async () => {
		const path = join(root, "app", "binding.json");
		await mkdir(join(root, "app"), { recursive: true });
		await writeFile(path, JSON.stringify({ version: 1, vault: vault }));
		await expect(readKnowledgeBinding()).rejects.toThrow("Invalid application knowledge binding");
	});
});
