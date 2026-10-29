import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import {
	createTopicMemoryApi,
	readTopic,
	updateTopic,
} from "../src/core/topic-memory.js";

let root: string;
const scope = { binding: { vaultId: "a".repeat(24) }, project: "same-project" };

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), "topic-memory-owners-")));
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await rm(root, { recursive: true, force: true });
});

function owner(name: string) {
	const runtime = createKnowledgeRuntimeHost();
	const config = createKnowledgeConfigApi(undefined, join(root, name));
	const api = createTopicMemoryApi(runtime, config);
	return { runtime, api, memory: api.createTopicMemory(scope) };
}

describe("topic memory owners", () => {
	it("separates public update scope from metadata without weakening revision or field checks", async () => {
		const { api, memory } = owner("a");
		await api.updateTopic({
			...scope,
			expectedRevision: 0,
			id: "topic",
			title: "First",
		});
		await api.updateTopic({
			...scope,
			expectedRevision: 1,
			id: "topic",
			summary: "Updated",
		});
		expect(await api.readTopic({ ...scope, id: "topic" })).toMatchObject([
			{ id: "topic", title: "First", summary: "Updated" },
		]);
		await expect(
			api.updateTopic({
				...scope,
				expectedRevision: 1,
				id: "topic",
				title: "Stale",
			}),
		).rejects.toThrow("revision changed");
		await expect(
			api.updateTopic({
				...scope,
				expectedRevision: 2,
				id: "topic",
				status: "archived",
			}),
		).rejects.toThrow("Unsupported topic metadata field: status");
		expect((await memory.read()).revision).toBe(2);
	});

	it("keeps the public compatibility update API's explicit state directory out of metadata", async () => {
		const directory = join(root, "explicit-state");
		vi.stubEnv("DRONE_KNOWLEDGE_DIR", join(root, "unrelated-state"));
		await updateTopic({
			...scope,
			directory,
			expectedRevision: 0,
			id: "topic",
			title: "Public API",
		});
		expect(await readTopic({ ...scope, directory, id: "topic" })).toMatchObject(
			[{ title: "Public API" }],
		);
		const document = JSON.parse(
			await readFile(
				join(
					directory,
					scope.binding.vaultId,
					"topic-memory/same-project.json",
				),
				"utf8",
			),
		);
		expect(document.topics[0]).not.toHaveProperty("binding");
		expect(document.topics[0]).not.toHaveProperty("directory");
	});

	it("keeps the same topic identity in separate fixed directories and preserves the existing schema/path", async () => {
		const a = owner("a");
		const b = owner("b");
		vi.stubEnv("DRONE_KNOWLEDGE_DIR", join(root, "unrelated"));
		await a.memory.update(
			{ id: "topic", title: "Owner A", summary: "First summary" },
			0,
		);
		await b.memory.update(
			{ id: "topic", title: "Owner B", summary: "Second summary" },
			0,
		);
		expect(a.memory.path).toBe(
			join(root, "a", scope.binding.vaultId, "topic-memory/same-project.json"),
		);
		expect(await a.api.listTopics(scope)).toMatchObject([
			{ id: "topic", title: "Owner A" },
		]);
		expect(await b.api.readTopic({ ...scope, id: "topic" })).toMatchObject([
			{ title: "Owner B" },
		]);
		await a.api.archiveTopic({ ...scope, id: "topic", expectedRevision: 1 });
		expect(await a.api.listTopics(scope)).toEqual([]);
		expect(await b.api.listTopics(scope)).toHaveLength(1);
		expect(JSON.parse(await readFile(a.memory.path, "utf8"))).toMatchObject({
			version: 1,
			vaultId: scope.binding.vaultId,
			project: scope.project,
			revision: 2,
			topics: [{ id: "topic", status: "archived" }],
		});
	});

	it("uses its owner's write queue while an unrelated owner can continue", async () => {
		const a = owner("a");
		const b = owner("b");
		let release!: () => void;
		let started!: () => void;
		const entered = new Promise<void>((resolve) => {
			started = resolve;
		});
		const held = a.runtime.runRuntimeExclusive(
			"topic-memory",
			a.memory.path,
			async () => {
				started();
				await new Promise<void>((resolve) => {
					release = resolve;
				});
			},
		);
		await entered;
		let aFinished = false;
		const write = a.memory.update({ id: "topic", title: "A" }, 0).then(() => {
			aFinished = true;
		});
		try {
			await b.memory.update({ id: "topic", title: "B" }, 0);
			expect(aFinished).toBe(false);
		} finally {
			release();
			await held;
			await write;
		}
		expect(aFinished).toBe(true);
	});

	it("serializes revision checks and leaves only the atomically published state file", async () => {
		const { memory } = owner("a");
		const outcomes = await Promise.allSettled([
			memory.update({ id: "first", title: "First" }, 0),
			memory.update({ id: "second", title: "Second" }, 0),
		]);
		expect(outcomes.map((outcome) => outcome.status)).toEqual([
			"fulfilled",
			"rejected",
		]);
		if (outcomes[1].status === "rejected")
			expect(outcomes[1].reason.message).toContain("revision changed");
		expect(
			(await memory.read()).topics.map((topic: { id: string }) => topic.id),
		).toEqual(["first"]);
		expect(await readdir(dirname(memory.path))).toEqual(["same-project.json"]);
	});

	it("refuses corrupt state and a topic directory symlink escaping the owner's directory", async () => {
		const a = owner("a");
		await mkdir(dirname(a.memory.path), { recursive: true });
		await writeFile(a.memory.path, "{corrupt");
		await expect(a.memory.update({ id: "topic" }, 0)).rejects.toThrow(
			"Corrupt topic memory",
		);
		expect(await readFile(a.memory.path, "utf8")).toBe("{corrupt");
		const b = owner("b");
		await mkdir(join(root, "b"));
		await mkdir(join(root, "outside"));
		await symlink(
			join(root, "outside"),
			join(root, "b", scope.binding.vaultId),
			"dir",
		);
		await expect(b.memory.update({ id: "topic" }, 0)).rejects.toThrow(
			/symlink|escapes/,
		);
		expect(await readdir(join(root, "outside"))).toEqual([]);
	});
});
