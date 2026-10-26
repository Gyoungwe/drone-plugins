import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import {
	advisoryCodes,
	createKnowledgeReviewPolicy,
	readReviewMode,
	saveReviewMode,
} from "../src/core/review-policy.js";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "drone-review-policy-"));
	vi.stubEnv("DRONE_KNOWLEDGE_DIR", join(root, "app"));
	vi.stubEnv("DRONE_REVIEW_MODE", undefined);
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await rm(root, { recursive: true, force: true });
});

describe("review policy", () => {
	it("defaults to automatic and persists a restrictive policy atomically", async () => {
		expect(await readReviewMode()).toBe("automatic");
		expect(await saveReviewMode("strict")).toEqual({ mode: "strict" });
		expect(await readReviewMode()).toBe("strict");
		const path = join(root, "app", "review-policy.json");
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
			version: 1,
			mode: "strict",
		});
		if (process.platform !== "win32")
			expect((await stat(path)).mode & 0o777).toBe(0o600);
	});

	it("lets the strict environment override persisted automatic mode", async () => {
		await saveReviewMode("automatic");
		vi.stubEnv("DRONE_REVIEW_MODE", "strict");
		expect(await readReviewMode()).toBe("strict");
		vi.stubEnv("DRONE_REVIEW_MODE", "automatic");
		expect(await readReviewMode()).toBe("automatic");
	});

	it("uses strict mode for malformed persisted data and rejects unsafe setup", async () => {
		await saveReviewMode("automatic");
		await import("node:fs/promises").then(({ writeFile }) =>
			writeFile(join(root, "app", "review-policy.json"), "{invalid"),
		);
		expect(await readReviewMode()).toBe("strict");
		await expect(saveReviewMode("invalid")).rejects.toThrow(
			"Invalid review mode",
		);
		vi.stubEnv("DRONE_KNOWLEDGE_DIR", "relative");
		await expect(readReviewMode()).rejects.toThrow("must be absolute");
	});

	it("rejects a stale version and preserves corrupt policy bytes", async () => {
		const policy = createKnowledgeReviewPolicy(
			createKnowledgeConfigApi(undefined, join(root, "app")),
		);
		const initial = await policy.readReviewPolicy();
		expect(initial).toMatchObject({
			mode: "automatic",
			version: null,
			persistedMode: null,
			diagnostic: null,
		});
		await policy.saveReviewMode("strict", initial.version);
		const strict = await policy.readReviewPolicy();
		expect(strict.version).toMatch(/^[a-f0-9]{64}$/);
		await expect(
			policy.saveReviewMode("automatic", initial.version),
		).rejects.toMatchObject({ code: "ESTATECONFLICT" });
		expect((await policy.readReviewPolicy()).mode).toBe("strict");
		const path = join(root, "app", "review-policy.json");
		const { writeFile } = await import("node:fs/promises");
		await writeFile(path, "{broken");
		expect(await policy.readReviewPolicy()).toMatchObject({
			mode: "strict",
			diagnostic: "invalid-json",
		});
		await expect(
			policy.saveReviewMode("automatic", strict.version),
		).rejects.toThrow("damaged");
		expect(await readFile(path, "utf8")).toBe("{broken");
	});

	it("publishes the stable advisory code set", () => {
		expect(advisoryCodes.has("citation-required")).toBe(true);
		expect(advisoryCodes.has("unknown-code")).toBe(false);
		expect(advisoryCodes.size).toBe(13);
	});
});
