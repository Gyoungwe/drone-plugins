import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createSpecialistDelivery } from "../src/core/specialist-delivery.js";

let root: string;
const html = "<html><body><h1>Evidence explanation</h1></body></html>";
const answer = {
	status: "completed",
	data: {
		html,
		title: "Explanation",
		summary: "Bounded summary",
		source_paths: ["Library/Papers/source.md"],
	},
};

beforeEach(async () => {
	root = await realpath(
		await mkdtemp(join(tmpdir(), "specialist-delivery-owners-")),
	);
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await rm(root, { recursive: true, force: true });
});

async function owner(name: string) {
	const vault = join(root, name, "vault");
	const resultsRoot = join(root, name, "results");
	const runDir = join(resultsRoot, "project", "run-fixture");
	await mkdir(vault, { recursive: true });
	await mkdir(runDir, { recursive: true });
	await writeFile(join(runDir, "metadata.json"), "{}");
	const config = createKnowledgeConfigApi(undefined, join(root, name, "state"));
	const binding = await config.saveKnowledgeBinding({
		vault,
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "none",
	});
	const runtime = createKnowledgeRuntimeHost();
	const publish = vi.fn(async (input: Record<string, unknown>) => {
		expect(await config.readKnowledgeBinding()).toEqual(binding);
		expect(await readFile(String(input.artifactPath), "utf8")).toBe(html);
		return { owner: name, archived: true };
	});
	runtime.configureKnowledgeHost({
		loadWorkspaceConfig: async () => ({ resultsRoot }),
		publishExplainer: publish,
	});
	const evidenceReceipts = vi.fn(async () => ({
		sources: [{ path: "Library/Papers/source.md", hash: "a".repeat(64) }],
	}));
	const context = {
		binding,
		project: "project",
		ticket: { owner: name },
		service: { evidenceReceipts },
	};
	return {
		config,
		binding,
		runDir,
		publish,
		evidenceReceipts,
		context,
		delivery: createSpecialistDelivery(runtime, config),
	};
}

describe("specialist delivery owners", () => {
	it("uses each owner's workspace, binding and publisher with current evidence receipts", async () => {
		const a = await owner("a");
		const b = await owner("b");
		vi.stubEnv("DRONE_KNOWLEDGE_DIR", join(root, "unrelated"));
		for (const item of [a, b]) {
			const receipt = await item.delivery.saveSpecialistExplainer(
				item.context,
				{ cwd: root },
				{ runDir: item.runDir, topicId: "topic", answer },
			);
			expect(receipt).toMatchObject({
				archived: true,
				producer: "knowledge-explainer",
				skill: "show-me",
			});
			expect(receipt.result_file.startsWith(`${item.runDir}/show-me-`)).toBe(
				true,
			);
			expect(await readFile(receipt.result_file, "utf8")).toBe(html);
			expect(item.evidenceReceipts).toHaveBeenCalledWith(
				item.context.ticket,
				root,
				answer.data.source_paths,
			);
			expect(item.publish).toHaveBeenCalledOnce();
			expect(item.publish).toHaveBeenCalledWith(
				expect.objectContaining({
					sources: [{ path: "Library/Papers/source.md", hash: "a".repeat(64) }],
				}),
			);
		}
		await expect(a.publish.mock.results[0].value).resolves.toMatchObject({
			owner: "a",
		});
		await expect(b.publish.mock.results[0].value).resolves.toMatchObject({
			owner: "b",
		});
	});

	it("refuses another owner's binding or a revoked evidence ticket before writing an artifact", async () => {
		const a = await owner("a");
		const b = await owner("b");
		await expect(
			b.delivery.saveSpecialistExplainer(
				a.context,
				{ cwd: root },
				{ runDir: b.runDir, topicId: "topic", answer },
			),
		).rejects.toThrow("Knowledge binding changed");
		a.evidenceReceipts.mockRejectedValueOnce(
			new Error("Evidence ticket revoked"),
		);
		await expect(
			a.delivery.saveSpecialistExplainer(
				a.context,
				{ cwd: root },
				{ runDir: a.runDir, topicId: "topic", answer },
			),
		).rejects.toThrow("Evidence ticket revoked");
		for (const item of [a, b]) {
			expect(item.publish).not.toHaveBeenCalled();
			expect(await readdir(item.runDir)).toEqual(["metadata.json"]);
		}
	});

	it("keeps destination containment and static-document rejection before publication", async () => {
		const a = await owner("a");
		const b = await owner("b");
		await expect(
			a.delivery.saveSpecialistExplainer(
				a.context,
				{ cwd: root },
				{ runDir: b.runDir, topicId: "topic", answer },
			),
		).rejects.toThrow("existing research run");
		await expect(
			a.delivery.saveSpecialistExplainer(
				a.context,
				{ cwd: root },
				{
					runDir: a.runDir,
					topicId: "topic",
					answer: {
						...answer,
						data: {
							...answer.data,
							html: "<html><body><script>run()</script></body></html>",
						},
					},
				},
			),
		).rejects.toThrow("static and self-contained");
		expect(a.evidenceReceipts).not.toHaveBeenCalled();
		expect(a.publish).not.toHaveBeenCalled();
		expect(await readdir(a.runDir)).toEqual(["metadata.json"]);
	});
});
