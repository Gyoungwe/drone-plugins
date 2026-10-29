import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createLocalReviewPolicyStorage } from "../src/core/review-policy-storage.js";
import type { ReviewMode } from "../src/core/review-policy.js";
import { createKnowledgeOwnerLifecycle } from "../src/core/owner-lifecycle.js";
import { createKnowledgePreferences } from "../src/desktop/preferences.js";
import type { KnowledgeReadOwner } from "../src/desktop/read-model.js";

const roots: string[] = [];
afterEach(async () => {
	vi.unstubAllEnvs();
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});
async function fixture(canWriteState = true) {
	const root = await realpath(
		await mkdtemp(join(tmpdir(), "knowledge-preferences-")),
	);
	roots.push(root);
	const vault = join(root, "Vault"),
		state = join(root, "state");
	await mkdir(vault);
	const config = createKnowledgeConfigApi(undefined, state);
	const binding = await config.saveKnowledgeBinding({
		vault,
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "none",
	});
	const storage = createLocalReviewPolicyStorage(config);
	const calls: string[] = [];
	let revoked = false;
	// Real local JSON persistence stands in for the public capability transport;
	// host authorization/atomicity itself is tested in host integration, not here.
	const capabilities = {
		async call(name: string, input: unknown): Promise<unknown> {
			if (revoked)
				throw Object.assign(new Error("State permission revoked"), {
					code: "EPERM",
				});
			calls.push(name);
			const raw = input as {
				root: string;
				path: string;
				value: { version: 1; mode: ReviewMode };
				expectedVersion: string | null;
			};
			expect(raw.root).toBe("approved-state");
			expect(raw.path).toBe("review-policy.json");
			if (name === "state.readJson") {
				const value = await storage.read();
				if (value.kind === "corrupt")
					throw Object.assign(new Error("Invalid JSON"), {
						code: "ESTATECORRUPTED",
					});
				return value;
			}
			if (name === "state.writeJson")
				return storage.write(raw.value, raw.expectedVersion);
			throw new Error(`Unexpected capability ${name}`);
		},
	};
	const owner: KnowledgeReadOwner = {
		config,
		...createKnowledgeOwnerLifecycle({ async dispose() {} }),
		services: {
			async getKnowledgeService() {
				throw new Error("Preferences must not start the index");
			},
		},
	};
	return {
		root,
		state,
		config,
		binding,
		calls,
		owner,
		preferences: createKnowledgePreferences(
			owner,
			capabilities,
			"approved-state",
			canWriteState,
		),
		revoke: () => {
			revoked = true;
		},
	};
}

it("reads and changes the approved state policy with versioned write/readback and no index", async () => {
	const f = await fixture();
	vi.stubEnv("DRONE_REVIEW_MODE", "strict"); // Desktop does not inherit CLI environment policy.
	const initial = await f.preferences.read();
	expect(initial.binding).toMatchObject({
		vaultId: f.binding.vaultId,
		profile: "hybrid",
		revision: 1,
	});
	expect(initial.reviewPolicy).toEqual({
		mode: "automatic",
		persistedMode: null,
		version: null,
		override: null,
		diagnostic: null,
	});
	const changed = await f.preferences.write({
		bindingRevision: 1,
		expectedVersion: null,
		mode: "strict",
	});
	expect(changed.reviewPolicy).toMatchObject({
		mode: "strict",
		persistedMode: "strict",
		diagnostic: null,
	});
	expect(changed.reviewPolicy.version).toMatch(/^[a-f0-9]{64}$/);
	expect(
		JSON.parse(await readFile(join(f.state, "review-policy.json"), "utf8")),
	).toEqual({ version: 1, mode: "strict" });
	await expect(
		f.preferences.write({
			bindingRevision: 1,
			expectedVersion: null,
			mode: "automatic",
		}),
	).rejects.toMatchObject({ code: "ESTATECONFLICT" });
	expect((await f.preferences.read()).reviewPolicy.mode).toBe("strict");
	expect(f.calls).toContain("state.writeJson");
	await f.owner.dispose();
	expect(() => f.preferences.read()).toThrow("disposed");
});

it("preserves damaged JSON and rejects revoked or missing write authority", async () => {
	const f = await fixture(false);
	expect((await f.preferences.read()).canWriteState).toBe(false);
	await expect(
		f.preferences.write({
			bindingRevision: 1,
			expectedVersion: null,
			mode: "automatic",
		}),
	).rejects.toThrow("write permission");
	expect(f.calls).not.toContain("state.writeJson");
	const writable = await fixture();
	await writeFile(join(writable.state, "review-policy.json"), "{broken");
	expect((await writable.preferences.read()).reviewPolicy).toMatchObject({
		mode: "strict",
		diagnostic: "invalid-json",
	});
	await expect(
		writable.preferences.write({
			bindingRevision: 1,
			expectedVersion: null,
			mode: "automatic",
		}),
	).rejects.toThrow("damaged");
	expect(
		await readFile(join(writable.state, "review-policy.json"), "utf8"),
	).toBe("{broken");
	writable.revoke();
	await expect(writable.preferences.read()).rejects.toMatchObject({
		code: "EPERM",
	});
});

it("rejects an old binding revision before policy mutation", async () => {
	const f = await fixture();
	await f.config.saveKnowledgeBinding(
		{
			vault: f.binding.vault,
			profile: "project",
			depositMode: "run-only",
			subagentPolicy: "none",
		},
		1,
	);
	await expect(
		f.preferences.write({
			bindingRevision: 1,
			expectedVersion: null,
			mode: "strict",
		}),
	).rejects.toThrow("binding changed");
	expect(f.calls).not.toContain("state.writeJson");
});
