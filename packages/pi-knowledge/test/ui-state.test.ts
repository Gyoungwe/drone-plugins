import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { knowledgeAnswerRate } from "../src/core/ui-state.js";

const originalDir = process.env.DRONE_KNOWLEDGE_DIR;
const roots: string[] = [];

afterEach(async () => {
	if (originalDir === undefined) delete process.env.DRONE_KNOWLEDGE_DIR;
	else process.env.DRONE_KNOWLEDGE_DIR = originalDir;
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("knowledge answer metric persistence", () => {
	it("reads the persisted host metric after a restart boundary", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-knowledge-ui-state-"));
		roots.push(root);
		await mkdir(root, { recursive: true });
		await writeFile(join(root, "answer-metrics.json"), JSON.stringify({ answered: 3, total: 5, updatedAt: 123 }));
		process.env.DRONE_KNOWLEDGE_DIR = root;
		expect(knowledgeAnswerRate()).toMatchObject({ answered: 3, total: 5, rate: 0.6, updatedAt: 123 });
	});
});
