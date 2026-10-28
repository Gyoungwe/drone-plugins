import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { beforeAll, expect, it, vi } from "vitest";
import { InquiryEventProjector } from "../src/event-projection.js";
import { InquiryService } from "../src/service.js";
import { MemoryInquiryStorage } from "../src/storage.js";
import { createInquiryWasmEngine } from "../src/wasm-storage.js";

const require = createRequire(import.meta.url),
	date = "2026-10-28T00:00:00.000Z",
	digest = "a".repeat(64),
	projectId = "original-project";
let engine: Awaited<ReturnType<typeof createInquiryWasmEngine>>;
beforeAll(async () => {
	engine = await createInquiryWasmEngine(
		await readFile(require.resolve("sql.js/dist/sql-wasm.wasm")),
	);
});
it("projects the same submitted compute receipt, terminal artifacts, attempts and decision associations into memory and canonical SQLite", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(date));
	const memory = new MemoryInquiryStorage(projectId),
		sqlite = engine.open(projectId);
	try {
		for (const storage of [memory, sqlite]) {
			const service = new InquiryService(storage),
				projector = new InquiryEventProjector(
					storage,
					service,
					(id) => id ?? "",
				);
			await projector.recordComputeEvent({
				id: "submitted-event",
				jobId: "job-1",
				type: "submitted",
				at: date,
				projectId,
			});
			await projector.recordComputeEvent({
				id: "collected-event",
				jobId: "job-1",
				runId: "run-1",
				type: "collected",
				at: date,
				status: "succeeded",
				projectId,
				codeFingerprint: "code-1",
				sessionId: "session-1",
				turn: 2,
				runProvenance: { workflow: "synthetic" },
				artifacts: [
					{ path: "runs/run-1/results.tsv", bytes: 8, sha256: digest },
				],
			});
		}
		expect(await sqlite.snapshot()).toEqual(await memory.snapshot());
		const result = await sqlite.snapshot();
		expect(result.attempts).toMatchObject([
			{
				id: "compute:run-1",
				outcome: "succeeded",
				parameters: { source: "compute", jobId: "job-1", runId: "run-1" },
				artifactIds: [`run:run-1:runs/run-1/results.tsv:${digest}`],
			},
		]);
		expect(result.decisions).toMatchObject([
			{
				id: "compute-submit:job-1",
				affectedArtifactIds: [`run:run-1:runs/run-1/results.tsv:${digest}`],
			},
		]);
	} finally {
		await sqlite.close();
		vi.useRealTimers();
	}
});
it("projects terminal task and local receipts with original field semantics and rejects foreign project events", async () => {
	const storage = engine.open(projectId),
		domain = new InquiryService(storage),
		projector = new InquiryEventProjector(storage, domain, (id) => id ?? "");
	try {
		await projector.recordTaskTerminal({
			id: "task-event",
			taskId: "task-1",
			runId: "task-run",
			status: "partial",
			at: date,
			projectId,
			artifacts: [
				{ path: "runs/task-run/output.txt", size: 4, sha256: digest },
			],
		});
		await projector.recordLocalExecution({
			id: "local-run",
			projectId,
			toolName: "controlled-python",
			codeFingerprint: "code-1",
			parameters: { language: "python" },
			runProvenance: { workflow: "synthetic" },
			startedAt: date,
			finishedAt: date,
			outcome: "succeeded",
			artifacts: [],
		});
		const result = await storage.snapshot();
		expect(
			result.attempts.map((record) => ({
				id: record.id,
				outcome: record.outcome,
			})),
		).toEqual([
			{ id: "local:local-run", outcome: "succeeded" },
			{ id: "task:task-run", outcome: "unknown" },
		]);
		expect(result.artifacts).toMatchObject([
			{ location: "local", purpose: "intermediate", runId: "task-run" },
		]);
		await expect(
			projector.recordTaskTerminal({
				id: "foreign-event",
				taskId: "foreign",
				status: "failed",
				at: date,
				projectId: "another-project",
			}),
		).rejects.toThrow("another project");
		expect(await storage.snapshot()).toEqual(result);
	} finally {
		await storage.close();
	}
});
