import { createHash } from "node:crypto";
import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { Check } from "typebox/value";
import { expect, vi } from "vitest";
import type { InquiryWasmEngine } from "../src/ledger-owner.js";
import type { ArtifactRecord } from "../src/models.js";
import { createInquiryRuntimeWithEngine } from "../src/runtime.js";
import type { ReadInput } from "../src/runtime-schema.js";
import { readSchema, writeSchema } from "../src/runtime-schema.js";
import type { WorkspaceEntry } from "../src/workspace.js";
import { it, projectId, workspaceId } from "./helpers/ledger-owner-fixture.js";
import { createPromotionFiles } from "./helpers/promotion-files.js";

const date = "2026-10-28T00:00:00.000Z";
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
type Files = Awaited<ReturnType<typeof createPromotionFiles>>;
type StartOptions = Parameters<typeof createPromotionFiles>[0];

async function startRuntime(
	engine: InquiryWasmEngine,
	base: PluginRuntimeCapabilities,
	workspaceDirectory: string,
	signal: AbortSignal,
	files: Files,
) {
	const capabilities = {
		call: vi.fn(async (name: string, input: unknown, callSignal?: AbortSignal) => {
			if (name === "roots.describe")
				return [
					...((await base.call(name, input, callSignal)) as unknown[]),
					...(files.root ? [files.root] : []),
				];
			if (name.startsWith("files.")) return files.capabilities.call(name, input, callSignal);
			return base.call(name, input, callSignal);
		}),
	};
	const changed = vi.fn();
	const context = {
		scope: { kind: "session" as const, workspaceId, workspaceDirectory, sessionId: "fixture-sdk" },
		capabilities,
		signal,
	};
	const runtime = await createInquiryRuntimeWithEngine(
		{ applicationId: "app", signal, resources: [], capabilities, events: { changed } },
		engine,
	);
	return {
		read: (input: ReadInput) => runtime.operations["inquiry.read"].execute(input, context),
		write: (input: unknown) => runtime.operations["inquiry.write"].execute(input, context),
		dispose: runtime.dispose,
		capabilities,
		changed,
		files,
	};
}

type Runtime = Awaited<ReturnType<typeof startRuntime>>;
const test = it.extend<{ start: (options?: StartOptions) => Promise<Runtime> }>({
	start: async ({ ledger }, use) => {
		const runtimes: Runtime[] = [];
		try {
			await use(async (options) => {
				const files = await createPromotionFiles(options);
				const runtime = await startRuntime(
					ledger.engine,
					ledger.ports,
					ledger.directory,
					ledger.controller.signal,
					files,
				);
				runtimes.push(runtime);
				return runtime;
			});
		} finally {
			for (const runtime of runtimes.reverse()) {
				await runtime.dispose();
				await runtime.files.close();
			}
		}
	},
});

async function addRun(
	runtime: Runtime,
	taskId: string,
	runId: string,
	contents: string,
	artifactId = `artifact-${runId}`,
) {
	const path = `runs/${taskId}/${runId}/output.tsv`;
	await runtime.files.seed(path, contents);
	await runtime.write({
		action: "recordTaskTerminal",
		event: {
			id: `event-${runId}`,
			taskId,
			runId,
			status: "succeeded",
			startedAt: date,
			at: date,
			artifacts: [{ id: artifactId, path, bytes: Buffer.byteLength(contents), sha256: digest(contents) }],
		},
	});
}

async function plan(runtime: Runtime, taskId: string, runId: string) {
	return (await runtime.read({ action: "planPromotion", taskId, runId })) as {
		plan: { moves: readonly { from: string; to: string }[]; indexEntries: readonly WorkspaceEntry[] };
		planSha256: string;
		root: string;
	};
}

async function promote(runtime: Runtime, taskId: string, runId: string, planSha256: string) {
	return runtime.write({ action: "promoteRun", taskId, runId, planSha256 });
}

test("promotion schemas constrain their inputs", () => {
	expect(Check(readSchema, { action: "planPromotion", taskId: "task" })).toBe(true);
	expect(Check(readSchema, { action: "planPromotion", taskId: "task", extra: true })).toBe(false);
	expect(Check(writeSchema, { action: "promoteRun", taskId: "task", planSha256: "a".repeat(64) })).toBe(true);
	expect(Check(writeSchema, { action: "promoteRun", taskId: "task", planSha256: "A".repeat(64) })).toBe(
		false,
	);
});

test("promotes terminal runs with relative plans and merges the results index", async ({ start }) => {
	const runtime = await start();
	await addRun(runtime, "task-a", "run-a", "first\n");
	const firstPlan = await plan(runtime, "task-a", "run-a");
	expect(firstPlan.plan.moves).toEqual([
		{
			from: "runs/task-a/run-a/output.tsv",
			to: "results/task-a/run-a/output.tsv",
			artifactId: "artifact-run-a",
		},
	]);
	expect(firstPlan.root).toBe(runtime.files.root?.handle);
	runtime.changed.mockClear();
	const first = (await promote(runtime, "task-a", "run-a", firstPlan.planSha256)) as {
		value: { indexSha256: string; planSha256: string; indexPath: string };
	};
	expect(first.value).toMatchObject({ planSha256: firstPlan.planSha256, indexPath: "results/index.json" });
	expect(runtime.changed).toHaveBeenCalledOnce();
	const firstSha = first.value.indexSha256;
	const firstIndex = await runtime.files.read("results/index.json");
	expect(firstSha).toBe(digest(firstIndex));
	const firstEntries = JSON.parse(firstIndex) as WorkspaceEntry[];
	expect(firstEntries).toEqual(firstPlan.plan.indexEntries);
	expect(await runtime.files.read("results/task-a/run-a/output.tsv")).toBe("first\n");

	await addRun(runtime, "task-b", "run-b", "second\n");
	const secondPlan = await plan(runtime, "task-b", "run-b");
	runtime.changed.mockClear();
	await promote(runtime, "task-b", "run-b", secondPlan.planSha256);
	const merged = JSON.parse(await runtime.files.read("results/index.json")) as WorkspaceEntry[];
	expect(merged.map((entry) => entry.artifactId)).toEqual(["artifact-run-a", "artifact-run-b"]);
	expect(runtime.files.expectedHashes).toEqual([null, firstSha]);
	expect(runtime.changed).toHaveBeenCalledOnce();
});

test("defaults an omitted run id to its task id", async ({ start }) => {
	const runtime = await start();
	await runtime.files.seed("runs/task/task/output.tsv", "data\n");
	await runtime.write({
		action: "recordTaskTerminal",
		event: {
			id: "event-task",
			taskId: "task",
			status: "succeeded",
			startedAt: date,
			at: date,
			artifacts: [
				{ id: "artifact-task", path: "runs/task/task/output.tsv", bytes: 5, sha256: digest("data\n") },
			],
		},
	});
	const reviewed = (await runtime.read({ action: "planPromotion", taskId: "task" })) as {
		plan: { runId: string };
		planSha256: string;
	};
	expect(reviewed.plan.runId).toBe("task");
	await expect(promote(runtime, "task", "task", reviewed.planSha256)).resolves.toMatchObject({
		value: { runId: "task" },
	});
});

test("rejects promotion when no files root is granted", async ({ start }) => {
	const runtime = await start({ includeRoot: false });
	await expect(promote(runtime, "t", "r", "a".repeat(64))).rejects.toThrow(
		"Inquiry promotion requires a granted read-write files root",
	);
	expect(runtime.files.writes).toEqual([]);
});

test("rejects a read-only files root without files writes", async ({ start }) => {
	const runtime = await start({ access: "read" });
	await expect(promote(runtime, "t", "r", "a".repeat(64))).rejects.toThrow(
		"Inquiry promotion requires a granted read-write files root",
	);
	expect(runtime.files.writes).toEqual([]);
});

test("rejects an ungranted files root handle without files writes", async ({ start }) => {
	const runtime = await start();
	await expect(
		runtime.write({
			action: "promoteRun",
			taskId: "t",
			runId: "r",
			root: "other",
			planSha256: "a".repeat(64),
		}),
	).rejects.toThrow("Inquiry promotion requires a granted read-write files root");
	expect(runtime.files.writes).toEqual([]);
});

test("rejects a run without terminal ledger state before files writes", async ({ start }) => {
	const runtime = await start();
	await expect(promote(runtime, "t", "r", "a".repeat(64))).rejects.toThrow(
		"Inquiry promotion requires a terminal task run",
	);
	expect(runtime.files.writes).toEqual([]);
});

test("rejects a terminal run recorded for another task before files writes", async ({ start }) => {
	const runtime = await start();
	await addRun(runtime, "actual", "r", "data\n");
	await expect(promote(runtime, "other", "r", "a".repeat(64))).rejects.toThrow(
		"Inquiry promotion requires a terminal task run",
	);
	expect(runtime.files.writes).toEqual([]);
});

test("rejects a changed plan before any files write", async ({ start }) => {
	const runtime = await start();
	await runtime.write({
		action: "recordTaskTerminal",
		event: { id: "event-r", taskId: "t", runId: "r", status: "succeeded", startedAt: date, at: date },
	});
	const reviewed = await plan(runtime, "t", "r");
	const record: ArtifactRecord = {
		id: "new-artifact",
		schemaVersion: 2,
		projectId,
		location: "local",
		path: "runs/t/r/new.tsv",
		bytes: 1,
		sha256: digest("x"),
		source: { kind: "task", id: "r" },
		purpose: "deliverable",
		status: "valid",
		parentIds: [],
		runId: "r",
		createdAt: date,
		updatedAt: date,
	};
	await runtime.files.seed(record.path, "x");
	await runtime.write({ action: "recordArtifact", record });
	await expect(promote(runtime, "t", "r", reviewed.planSha256)).rejects.toThrow(
		"Inquiry promotion plan changed; review it again",
	);
	expect(runtime.files.writes).toEqual([]);
});

test("promotes a terminal run with no valid artifacts by ensuring results/", async ({ start }) => {
	const runtime = await start();
	await runtime.write({
		action: "recordTaskTerminal",
		event: {
			id: "event-empty",
			taskId: "empty-task",
			runId: "empty-run",
			status: "succeeded",
			startedAt: date,
			at: date,
		},
	});
	const reviewed = await plan(runtime, "empty-task", "empty-run");
	expect(reviewed.plan.moves).toEqual([]);
	await expect(promote(runtime, "empty-task", "empty-run", reviewed.planSha256)).resolves.toMatchObject({
		value: { runId: "empty-run", indexPath: "results/index.json" },
	});
	expect(JSON.parse(await runtime.files.read("results/index.json"))).toEqual([]);
});

test("rejects an index that is not an array", async ({ start }) => {
	const runtime = await start();
	await addRun(runtime, "t", "r", "data\n");
	const reviewed = await plan(runtime, "t", "r");
	await runtime.files.seed("results/index.json", "{}\n");
	await expect(promote(runtime, "t", "r", reviewed.planSha256)).rejects.toThrow(
		"Inquiry results index is not a WorkspaceEntry array",
	);
	expect(runtime.files.writes).not.toContain("files.writeIndex");
});

test("rejects duplicate result paths when merging the index", async ({ start }) => {
	const runtime = await start();
	await addRun(runtime, "t", "r", "data\n");
	const reviewed = await plan(runtime, "t", "r");
	const existing: WorkspaceEntry = {
		...reviewed.plan.indexEntries[0],
		artifactId: "another-artifact",
	};
	await runtime.files.seed("results/index.json", `${JSON.stringify([existing])}\n`);
	await expect(promote(runtime, "t", "r", reviewed.planSha256)).rejects.toThrow(
		"Inquiry results index contains duplicate result paths",
	);
	expect(runtime.files.writes).not.toContain("files.writeIndex");
});

test("requires index readback to match the write result", async ({ start }) => {
	const runtime = await start({ afterWriteIndex: (seed) => seed("results/index.json", "[]\n") });
	await addRun(runtime, "t", "r", "data\n");
	const reviewed = await plan(runtime, "t", "r");
	await expect(promote(runtime, "t", "r", reviewed.planSha256)).rejects.toThrow(
		"Inquiry results index did not read back",
	);
});

test("status only reports the promotion port as unavailable without a writable files root", async ({
	start,
}) => {
	const writable = await start();
	const unavailable = await start({ includeRoot: false });
	await expect(writable.read({ action: "status" })).resolves.toMatchObject({
		unavailable: ["rerun-executor"],
	});
	await expect(unavailable.read({ action: "status" })).resolves.toMatchObject({
		unavailable: ["rerun-executor", "workspace-promotion-file-port"],
	});
});
