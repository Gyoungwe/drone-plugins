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
import register, { nativeDiscoveryExtension } from "../dist/index.mjs";

async function tools(options) {
	const registered = new Map();
	const listeners = new Map();
	const pi = {
		registerTool: (tool) => registered.set(tool.name, tool),
		on: (name, listener) => listeners.set(name, listener),
	};
	if (options) await nativeDiscoveryExtension(pi, options);
	else await register(pi);
	registered.dispose = () => listeners.get("session_shutdown")?.();
	return registered;
}
const call = (registered, name, cwd, input = {}) =>
	registered.get(name).execute("test", input, undefined, undefined, {
		cwd,
		sessionManager: { getSessionId: () => "unit-session" },
	});
const journal = (cwd) => join(cwd, "runs/.drone-discovery");

test("native entry registers exactly its declared tools with explicit write metadata", async () => {
	const manifest = JSON.parse(
		await readFile(new URL("../plugin.manifest.json", import.meta.url), "utf8"),
	);
	const registered = await tools();
	assert.deepEqual([...registered.keys()].sort(), [...manifest.tools].sort());
	assert(
		[...registered.values()]
			.filter(
				(tool) =>
					!["discovery_bind_workspace", "discovery_create_plan"].includes(
						tool.name,
					),
			)
			.every((tool) => tool.drone.readOnly === true),
	);
});

test("first-run status is unconfigured and creates no journal", async () => {
	const root = await mkdtemp(join(tmpdir(), "discovery-native-first-"));
	try {
		const status = (await call(await tools(), "discovery_status", root))
			.details;
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
		const registered = await tools();
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
				call(await tools(), "discovery_list_records", root, {
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
			call(await tools(), "discovery_list_records", root, {
				journal: "critics",
			}),
			/symlink/,
		);
		await assert.rejects(
			call(await tools(), "discovery_list_records", root, {
				journal: "../../outside",
			}),
			/Unknown discovery journal/,
		);
		await writeFile(
			join(journal(root), "plans.json"),
			JSON.stringify(Array.from({ length: 40 }, (_, id) => ({ id }))),
		);
		const listed = (
			await call(await tools(), "discovery_list_records", root, {
				journal: "plans",
			})
		).details;
		assert.equal(listed.records.length, 32);
		assert.equal(listed.count, 40);
		assert.equal(listed.truncated, true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("native plan writing binds the actual workspace and excludes a second native owner until disposal", async () => {
	const root = await mkdtemp(join(tmpdir(), "discovery-native-writer-"));
	const first = await tools({ leaseDirectory: join(root, "leases") });
	const second = await tools({ leaseDirectory: join(root, "leases") });
	try {
		const bound = (
			await call(first, "discovery_bind_workspace", root, {
				root: "native-state",
				acknowledgeExistingData: false,
			})
		).details;
		assert.equal(bound.readiness, "ready");
		const input = {
			id: "plan-native",
			hypothesisId: "hypothesis-native",
			prior: { direction: "unknown", recordedAt: new Date().toISOString() },
			budget: {
				maxExecutions: 2,
				maxWallTimeMs: 30000,
				maxOutputBytes: 65536,
				maxCostUnits: 2,
			},
			candidates: [
				{
					id: "candidate-native",
					statement: "Read-only scientific test",
					surprise: 0.5,
					estimatedCost: 1,
					expectedExplanationsExcluded: 1,
					credibility: 0.5,
				},
			],
		};
		assert.equal(
			(await call(first, "discovery_create_plan", root, input)).details.id,
			"plan-native",
		);
		assert.equal(
			(await call(first, "discovery_list_records", root, { journal: "plans" }))
				.details.records[0].id,
			"plan-native",
		);
		await assert.rejects(
			call(second, "discovery_bind_workspace", root, {
				root: "native-state",
				acknowledgeExistingData: true,
			}),
			/already reserved/,
		);
		await first.dispose();
		const recovered = (
			await call(second, "discovery_bind_workspace", root, {
				root: "native-state",
				acknowledgeExistingData: true,
			})
		).details;
		assert.equal(recovered.readiness, "ready");
		assert.equal(
			(await call(second, "discovery_list_records", root, { journal: "plans" }))
				.details.records[0].id,
			"plan-native",
		);
	} finally {
		await first.dispose();
		await second.dispose();
		await rm(root, { recursive: true, force: true });
	}
});

test("refuses to bind mixed legacy project identities without replacing journal bytes", async () => {
	const root = await mkdtemp(join(tmpdir(), "discovery-native-mixed-"));
	const registered = await tools({ leaseDirectory: join(root, "leases") });
	try {
		await mkdir(journal(root), { recursive: true });
		const path = join(journal(root), "plans.json");
		const original = JSON.stringify([
			{ id: "old-a", projectId: "project-a" },
			{ id: "old-b", projectId: "project-b" },
		]);
		await writeFile(path, original);
		await assert.rejects(
			call(registered, "discovery_bind_workspace", root, {
				root: "native-state",
				acknowledgeExistingData: true,
			}),
			/conflicting project identities/,
		);
		assert.equal(await readFile(path, "utf8"), original);
		await assert.rejects(
			access(join(journal(root), "workspace-binding.json")),
			{ code: "ENOENT" },
		);
	} finally {
		await registered.dispose();
		await rm(root, { recursive: true, force: true });
	}
});

test("an explicit retry after repairing a corrupt journal creates a fresh owner", async () => {
	const root = await mkdtemp(join(tmpdir(), "discovery-native-repair-"));
	const registered = await tools({ leaseDirectory: join(root, "leases") });
	try {
		await mkdir(journal(root), { recursive: true });
		await writeFile(join(journal(root), "critics.json"), "{bad");
		await assert.rejects(
			call(registered, "discovery_bind_workspace", root, {
				root: "native-state",
				acknowledgeExistingData: true,
			}),
		);
		await writeFile(join(journal(root), "critics.json"), "[]");
		assert.equal(
			(
				await call(registered, "discovery_bind_workspace", root, {
					root: "native-state",
					acknowledgeExistingData: true,
				})
			).details.readiness,
			"ready",
		);
	} finally {
		await registered.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
