import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import register from "../dist/index.mjs";

function tools() {
	const registered = new Map();
	register({ registerTool: (tool) => registered.set(tool.name, tool) });
	return registered;
}
const call = (registered, name, cwd, input = {}) =>
	registered.get(name).execute("test", input, undefined, undefined, { cwd });
const journal = (cwd) => join(cwd, "runs/.drone-discovery");

test("native entry registers exactly its declared read-only tools", async () => {
	const manifest = JSON.parse(
		await readFile(new URL("../plugin.manifest.json", import.meta.url), "utf8"),
	);
	const registered = tools();
	assert.deepEqual([...registered.keys()].sort(), [...manifest.tools].sort());
	assert(
		[...registered.values()].every((tool) => tool.drone.readOnly === true),
	);
});

test("first-run status is unconfigured and creates no journal", async () => {
	const root = await mkdtemp(join(tmpdir(), "discovery-native-first-"));
	try {
		const status = (await call(tools(), "discovery_status", root)).details;
		assert.equal(status.status, "unconfigured");
		assert.equal(status.execution, "unavailable");
		assert.equal(status.inquiry, "unavailable");
		await assert.rejects(access(join(root, "runs")), { code: "ENOENT" });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("the same extension uses each calling workspace and leaves original journal bytes untouched", async () => {
	const root = await mkdtemp(join(tmpdir(), "discovery-native-workspaces-"));
	try {
		const a = join(root, "a"),
			b = join(root, "b");
		for (const cwd of [a, b]) await mkdir(journal(cwd), { recursive: true });
		const source =
			'[ {"findingId":"finding-a", "questions":[{"question":"Batch explanation?"}]} ]\n';
		const file = join(journal(a), "critics.json");
		await writeFile(file, source);
		await writeFile(
			join(journal(b), "critics.json"),
			'[{"findingId":"finding-b"}]',
		);
		const registered = tools();
		const hash = (value) => createHash("sha256").update(value).digest("hex");
		const before = hash(await readFile(file));
		assert.equal(
			(
				await call(registered, "discovery_list_records", a, {
					journal: "critics",
				})
			).details.records[0].findingId,
			"finding-a",
		);
		assert.equal(
			(
				await call(registered, "discovery_search_records", a, {
					journal: "critics",
					query: "batch",
				})
			).details.count,
			1,
		);
		assert.equal(
			(
				await call(registered, "discovery_search_records", b, {
					journal: "critics",
					query: "batch",
				})
			).details.count,
			0,
		);
		assert.equal(
			(
				await call(registered, "discovery_list_records", b, {
					journal: "critics",
				})
			).details.records[0].findingId,
			"finding-b",
		);
		assert.equal(hash(await readFile(file)), before);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("corrupt and oversized journals fail visibly without rewriting data", async () => {
	const root = await mkdtemp(join(tmpdir(), "discovery-native-corrupt-"));
	try {
		await mkdir(journal(root), { recursive: true });
		const path = join(journal(root), "evaluations.json");
		for (const content of ["{bad", "{}", "[null]", " ".repeat(1_048_577)]) {
			await writeFile(path, content);
			await assert.rejects(
				call(tools(), "discovery_list_records", root, {
					journal: "evaluations",
				}),
			);
			assert.equal(await readFile(path, "utf8"), content);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("journal symlinks cannot expose another workspace and record listing is bounded", async () => {
	const root = await mkdtemp(join(tmpdir(), "discovery-native-path-"));
	try {
		await mkdir(journal(root), { recursive: true });
		const outside = join(root, "outside.json");
		await writeFile(outside, '[{"id":"outside"}]');
		await symlink(outside, join(journal(root), "critics.json"));
		await assert.rejects(
			call(tools(), "discovery_list_records", root, { journal: "critics" }),
			/symlink/,
		);
		await assert.rejects(
			call(tools(), "discovery_list_records", root, {
				journal: "../../outside",
			}),
			/Unknown discovery journal/,
		);
		await writeFile(
			join(journal(root), "plans.json"),
			JSON.stringify(Array.from({ length: 40 }, (_, id) => ({ id }))),
		);
		const listed = (
			await call(tools(), "discovery_list_records", root, { journal: "plans" })
		).details;
		assert.equal(listed.records.length, 32);
		assert.equal(listed.count, 40);
		assert.equal(listed.truncated, true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
