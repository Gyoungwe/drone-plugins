import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import type {
	ArtifactRecord,
	AttemptRecord,
	FindingRecord,
	QuestionRecord,
} from "../src/models.js";
import { InquiryService, decisionRecord } from "../src/service.js";
import { SqliteInquiryStorage } from "../src/storage.js";
import type { InquiryStorage } from "../src/storage-contract.js";
import {
	createInquiryWasmEngine,
	type WasmInquiryStorage,
} from "../src/wasm-storage.js";

const date = "2026-10-28T00:00:00.000Z",
	projectId = "project-1";
const require = createRequire(import.meta.url);
let engine: Awaited<ReturnType<typeof createInquiryWasmEngine>>;
const roots: string[] = [],
	stores: InquiryStorage[] = [];
beforeAll(async () => {
	engine = await createInquiryWasmEngine(
		await readFile(require.resolve("sql.js/dist/sql-wasm.wasm")),
	);
});
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(date));
});
afterEach(async () => {
	vi.useRealTimers();
	await Promise.all(stores.splice(0).map((store) => store.close?.()));
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});
async function temporary() {
	const root = await mkdtemp(join(tmpdir(), "inquiry-wasm-contract-"));
	roots.push(root);
	return root;
}
function artifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
	return {
		id: "source",
		schemaVersion: 2,
		projectId,
		location: "local",
		path: "runs/test/output.tsv",
		bytes: 10,
		sha256: "a".repeat(64),
		source: { kind: "run", id: "run-1" },
		purpose: "deliverable",
		status: "valid",
		parentIds: [],
		runId: "run-1",
		sessionId: "actual-fixture-session",
		turn: 1,
		runProvenance: { workflow: "synthetic" },
		createdAt: date,
		updatedAt: date,
		...overrides,
	};
}
function question(overrides: Partial<QuestionRecord> = {}): QuestionRecord {
	return {
		id: "question",
		schemaVersion: 2,
		projectId,
		kind: "hypothesis",
		statement: "Synthetic question",
		competingExplanations: [],
		testsDone: [],
		testsPlanned: [],
		status: "open",
		proposer: "user",
		priority: 1,
		createdAt: date,
		updatedAt: date,
		...overrides,
	};
}
async function open(kind: "node" | "wasm") {
	const store =
		kind === "node"
			? new SqliteInquiryStorage(
					projectId,
					join(await temporary(), "ledger.sqlite"),
				)
			: engine.open(projectId);
	stores.push(store);
	return store;
}
async function exercise(store: InquiryStorage) {
	const service = new InquiryService(store);
	await service.recordArtifact(artifact());
	await service.recordArtifact(
		artifact({
			id: "child",
			path: "runs/test/child.tsv",
			parentIds: ["source"],
		}),
	);
	await service.recordQuestion(question());
	const attempt: AttemptRecord = {
		id: "attempt",
		schemaVersion: 2,
		projectId,
		hypothesisIds: ["question"],
		codeFingerprint: "synthetic-code",
		parameters: { workflow: "synthetic" },
		artifactIds: ["source"],
		outcome: "succeeded",
		enteredReport: false,
		startedAt: date,
		finishedAt: date,
	};
	await service.recordAttempt(attempt);
	const finding: FindingRecord = {
		id: "finding",
		schemaVersion: 2,
		projectId,
		statement: "Synthetic observation",
		values: [{ metric: "count", value: 1 }],
		conditions: [],
		artifactIds: ["source"],
		label: "exploratory",
		robustness: { attemptCount: 1, consistentCount: 1, grade: "unknown" },
		hypothesisIds: ["question"],
		reviewStatus: "unreviewed",
		createdAt: date,
		updatedAt: date,
	};
	await service.recordFinding(finding);
	const decision = decisionRecord({
		id: "decision",
		projectId,
		kind: "task-authorization",
		summary: "Synthetic approved test",
		basis: ["synthetic-contract"],
		affectedArtifactIds: ["source"],
		createdAt: date,
	});
	await service.recordDecision(decision);
	await service.revokeDecision(
		decision.id,
		"Explicit fixture revocation",
		date,
	);
	expect((await store.artifacts.get("child"))?.status).toBe("pending-review");
	await service.confirmDecision(
		decision.id,
		"Explicit fixture human review",
		date,
	);
	await service.recordDecision(decision);
	expect((await service.listDecisions())[0]?.status).toBe("revoked");
	service.setRerunHandler(async () => ({ jobId: "synthetic-job" }));
	const submitted = await service.rerunArtifact("source");
	expect(submitted.status).toBe("submitted");
	const rerun = (await service.pendingReruns())[0]!;
	await service.markRerunRunning(rerun.id);
	expect(
		(await service.completeRerun(rerun.id, { artifact: artifact() }))?.status,
	).toBe("reproduced");
	return {
		snapshot: await service.snapshot(),
		projection: await service.readOnlyState(),
		provenance: await service.artifactProvenance("source"),
		cleanup: await service.cleanupDryRun(),
	};
}
for (const kind of ["node", "wasm"] as const) {
	describe(`${kind} canonical Inquiry contract`, () => {
		it("retains lineage, decisions, human review, provenance, rerun and all six ledgers", async () => {
			const result = await exercise(await open(kind));
			expect(result.snapshot).toMatchObject({
				schemaVersion: 2,
				projectId,
				questions: [{ id: "question" }],
				findings: [{ id: "finding" }],
				attempts: [{ id: "attempt" }],
				decisions: [{ status: "revoked" }],
				reruns: [{ status: "reproduced" }],
			});
			expect(result.provenance?.reproducibility).toBe("reproducible");
		});
		it("rolls back invalid domain writes while a later legitimate transaction still succeeds", async () => {
			const store = await open(kind),
				service = new InquiryService(store);
			await service.recordArtifact(artifact());
			const before = await store.snapshot();
			await expect(
				service.recordArtifact(artifact({ id: "invalid", path: "../outside" })),
			).rejects.toThrow("safe project-relative");
			expect(await store.snapshot()).toEqual(before);
			await service.recordQuestion(question());
			expect((await store.snapshot()).revision).toBe(before.revision + 1);
		});
	});
}
it("produces identical domain state from the Node and WASM adapters", async () => {
	expect(await exercise(await open("wasm"))).toEqual(
		await exercise(await open("node")),
	);
});
it("exports the original SQLite format, reopens after export and remains readable by canonical Node", async () => {
	const store = engine.open(projectId);
	stores.push(store);
	await exercise(store);
	const bytes = await store.exportBytes();
	expect(Buffer.from(bytes.subarray(0, 16)).toString()).toBe(
		"SQLite format 3\0",
	);
	await store.questions.put(question({ id: "after-export" }));
	const updated = await store.exportBytes();
	const reopened = engine.open(projectId, updated);
	stores.push(reopened);
	expect(await reopened.snapshot()).toEqual(await store.snapshot());
	const path = join(await temporary(), "ledger.sqlite");
	await writeFile(path, updated);
	const node = new SqliteInquiryStorage(projectId, path);
	stores.push(node);
	expect(await node.snapshot()).toEqual(await store.snapshot());
});
function seed(path: string, sql: string) {
	execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"--eval",
			"import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';const db=new DatabaseSync(process.argv[1]);db.exec(readFileSync(0,'utf8'));db.close();",
			path,
		],
		{ input: sql },
	);
}
it("migrates a real schema v1 snapshot in WASM without changing the original bytes and preserves its records", async () => {
	const path = join(await temporary(), "legacy.sqlite");
	seed(
		path,
		`CREATE TABLE inquiry_meta(project_id TEXT PRIMARY KEY NOT NULL,schema_version INTEGER NOT NULL CHECK(schema_version=1),revision INTEGER NOT NULL,updated_at TEXT NOT NULL);INSERT INTO inquiry_meta VALUES('project-1',1,0,'${date}');CREATE TABLE artifacts(id TEXT PRIMARY KEY NOT NULL,project_id TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL);INSERT INTO artifacts VALUES('source','project-1','${JSON.stringify(artifact({ schemaVersion: 1 })).replaceAll("'", "''")}','${date}');`,
	);
	const original = await readFile(path),
		originalHash = createHash("sha256").update(original).digest("hex");
	const wasm = engine.open(projectId, original);
	stores.push(wasm);
	expect(await wasm.snapshot()).toMatchObject({
		schemaVersion: 2,
		artifacts: [{ id: "source", schemaVersion: 1 }],
		decisions: [],
		reruns: [],
	});
	expect(
		createHash("sha256")
			.update(await readFile(path))
			.digest("hex"),
	).toBe(originalHash);
	const exported = await wasm.exportBytes(),
		nextPath = join(await temporary(), "migrated.sqlite");
	await writeFile(nextPath, exported);
	const node = new SqliteInquiryStorage(projectId, nextPath);
	stores.push(node);
	expect(await node.snapshot()).toEqual(await wasm.snapshot());
});
for (const invalid of ["mixed", "empty", "unknown-schema"] as const) {
	it(`rejects ${invalid} metadata in both engines without adopting the first row`, async () => {
		const path = join(await temporary(), "invalid.sqlite");
		seed(
			path,
			`CREATE TABLE inquiry_meta(project_id TEXT PRIMARY KEY,schema_version INTEGER,revision INTEGER,updated_at TEXT);${invalid === "empty" ? "" : `INSERT INTO inquiry_meta VALUES('project-1',${invalid === "unknown-schema" ? 99 : 2},0,'${date}');`}${invalid === "mixed" ? `INSERT INTO inquiry_meta VALUES('other-project',2,0,'${date}');` : ""}`,
		);
		const bytes = await readFile(path),
			hash = createHash("sha256").update(bytes).digest("hex");
		expect(() => engine.open(projectId, bytes)).toThrow(/metadata/);
		expect(() => new SqliteInquiryStorage(projectId, path)).toThrow(/metadata/);
		expect(
			createHash("sha256")
				.update(await readFile(path))
				.digest("hex"),
		).toBe(hash);
	});
}
it("keeps a multi-megabyte synthetic DB in the same format for the later bounded binary-port fixture", async () => {
	const store = engine.open(projectId);
	stores.push(store);
	await new InquiryService(store).recordQuestion(
		question({ statement: "synthetic " + "x".repeat(3 * 1024 * 1024) }),
	);
	const bytes = await store.exportBytes();
	expect(bytes.length).toBeGreaterThan(3 * 1024 * 1024);
	expect(bytes.length).toBeLessThan(4 * 1024 * 1024);
	const reopened = engine.open(projectId, bytes);
	stores.push(reopened);
	expect((await reopened.questions.get("question"))?.statement.length).toBe(
		3 * 1024 * 1024 + 10,
	);
});
