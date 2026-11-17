import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileInquiryStorage, InquiryService, SqliteInquiryStorage } from "../src/index.js";
import { artifact } from "./helpers/inquiry-fixtures.js";

// node:sqlite on Windows keeps the file lock until the creating process exits,
// even after DatabaseSync.close(). Seed legacy files in a child so the parent
// can reopen them without waiting out busy_timeout.
function seedSqlite(path: string, sql: string): void {
	const result = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const db = new DatabaseSync(process.argv[1]);
db.exec(readFileSync(0, "utf8"));
db.close();`,
			path,
		],
		{ input: sql, encoding: "utf8" },
	);
	if (result.status !== 0) throw new Error(result.stderr || result.stdout || "sqlite seed failed");
}

describe("inquiry ledger records", () => {
	it("persists a stable, atomically replaced document", async () => {
		const root = await mkdtemp(join(tmpdir(), "drone-inquiry-"));
		try {
			const path = join(root, "ledger.json");
			const storage = new FileInquiryStorage("project-1", path);
			await storage.artifacts.put(artifact({ id: "z" }));
			await storage.artifacts.put(artifact({ id: "a" }));
			const reopened = new FileInquiryStorage("project-1", path);
			expect((await reopened.snapshot()).artifacts.map((item) => item.id)).toEqual(["a", "z"]);
			expect(await readFile(path, "utf8")).toContain('"schemaVersion": 1');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("inquiry ledger records", () => {
	it("reads pre-rerun file and SQLite ledgers with missing optional provenance fields", async () => {
		const root = await mkdtemp(join(tmpdir(), "drone-inquiry-legacy-"));
		const legacyArtifact = artifact({
			id: "legacy",
			runProvenance: undefined,
			sessionId: undefined,
			turn: undefined,
		});
		const legacyAttempt = {
			id: "legacy-attempt",
			schemaVersion: 1,
			projectId: "project-1",
			hypothesisIds: [],
			parameters: {},
			artifactIds: ["legacy"],
			outcome: "succeeded",
			enteredReport: false,
			startedAt: "2026-01-01T00:00:00.000Z",
		};
		try {
			const filePath = join(root, "legacy.json");
			await writeFile(
				filePath,
				JSON.stringify({
					schemaVersion: 1,
					projectId: "project-1",
					revision: 1,
					updatedAt: "2026-01-01T00:00:00.000Z",
					artifacts: [legacyArtifact],
					findings: [],
					questions: [],
					attempts: [legacyAttempt],
				}),
			);
			const file = new FileInquiryStorage("project-1", filePath);
			expect((await new InquiryService(file).artifactProvenance("legacy"))?.reproducibility).toBe(
				"not-reproducible",
			);

			const sqlitePath = join(root, "legacy.sqlite");
			seedSqlite(
				sqlitePath,
				`CREATE TABLE inquiry_meta (project_id TEXT PRIMARY KEY, schema_version INTEGER, revision INTEGER, updated_at TEXT);
CREATE TABLE artifacts (id TEXT PRIMARY KEY, project_id TEXT, payload TEXT, updated_at TEXT);
CREATE TABLE findings (id TEXT PRIMARY KEY, project_id TEXT, payload TEXT, updated_at TEXT);
CREATE TABLE questions (id TEXT PRIMARY KEY, project_id TEXT, payload TEXT, updated_at TEXT);
CREATE TABLE attempts (id TEXT PRIMARY KEY, project_id TEXT, payload TEXT, updated_at TEXT);
INSERT INTO inquiry_meta VALUES ('project-1', 1, 1, '${legacyAttempt.startedAt}');
INSERT INTO artifacts VALUES ('legacy', 'project-1', '${JSON.stringify(legacyArtifact).replaceAll("'", "''")}', '${legacyAttempt.startedAt}');
INSERT INTO attempts VALUES ('legacy-attempt', 'project-1', '${JSON.stringify(legacyAttempt).replaceAll("'", "''")}', '${legacyAttempt.startedAt}');`,
			);
			const sqlite = new SqliteInquiryStorage("project-1", sqlitePath);
			expect(
				(await new InquiryService(sqlite).artifactProvenance("legacy"))?.sourceSessionId,
			).toBeUndefined();
			await sqlite.close();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("inquiry ledger records", () => {
	it("recovers a submitted rerun after reopening the file ledger", async () => {
		const root = await mkdtemp(join(tmpdir(), "drone-inquiry-rerun-restart-"));
		try {
			const path = join(root, "ledger.json");
			const first = new InquiryService(new FileInquiryStorage("project-1", path));
			await first.recordArtifact(artifact({ id: "restart", runProvenance: { workflow: "wf" } }));
			await first.recordAttempt({
				id: "restart-attempt",
				schemaVersion: 1,
				projectId: "project-1",
				hypothesisIds: [],
				codeFingerprint: "code",
				parameters: {},
				artifactIds: ["restart"],
				outcome: "succeeded",
				enteredReport: false,
				startedAt: "2026-01-01T00:00:00.000Z",
			});
			first.setRerunHandler(async () => ({ jobId: "restart-job" }));
			await first.rerunArtifact("restart");
			const reopened = new InquiryService(new FileInquiryStorage("project-1", path));
			expect(await reopened.pendingReruns()).toHaveLength(1);
			await reopened.completeRerun("rerun:restart:restart-job", {
				artifact: artifact({ id: "restart-result", parentIds: ["restart"] }),
			});
			expect((await reopened.artifactProvenance("restart"))?.rerun?.status).toBe("reproduced");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("inquiry ledger records", () => {
	it("persists all inquiry ledgers in a SQLite database and reopens safely", async () => {
		const root = await mkdtemp(join(tmpdir(), "drone-inquiry-sqlite-"));
		try {
			const path = join(root, "ledger.sqlite");
			const storage = new SqliteInquiryStorage("project-1", path);
			await Promise.all([
				storage.artifacts.put(artifact({ id: "z" })),
				storage.artifacts.put(artifact({ id: "a" })),
			]);
			expect((await storage.snapshot()).artifacts.map((item) => item.id)).toEqual(["a", "z"]);
			await storage.close();
			const reopened = new SqliteInquiryStorage("project-1", path);
			expect((await reopened.artifacts.list()).map((item) => item.id)).toEqual(["a", "z"]);
			await expect(reopened.artifacts.put(artifact({ id: "bad", sha256: "invalid" }))).rejects.toThrow(
				"sha256",
			);
			await reopened.close();
			expect(() => new SqliteInquiryStorage("another-project", path)).toThrow("another project");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("inquiry ledger records", () => {
	it("reads a legacy file schema and adds the decision ledger", async () => {
		const root = await mkdtemp(join(tmpdir(), "drone-inquiry-legacy-file-"));
		try {
			const path = join(root, "ledger.json");
			await writeFile(
				path,
				JSON.stringify({
					schemaVersion: 1,
					projectId: "project-1",
					revision: 2,
					updatedAt: "2026-01-01T00:00:00.000Z",
					artifacts: [artifact()],
					findings: [],
					questions: [],
					attempts: [],
				}),
			);
			const storage = new FileInquiryStorage("project-1", path);
			const snapshot = await storage.snapshot();
			expect(snapshot.schemaVersion).toBe(2);
			expect(snapshot.artifacts[0]?.schemaVersion).toBe(1);
			expect(snapshot.decisions).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("inquiry ledger records", () => {
	it("legacy SQLite metadata migrates and preserves old records", async () => {
		const root = await mkdtemp(join(tmpdir(), "drone-inquiry-legacy-sqlite-"));
		try {
			const path = join(root, "ledger.sqlite");
			seedSqlite(
				path,
				`CREATE TABLE inquiry_meta (project_id TEXT PRIMARY KEY NOT NULL, schema_version INTEGER NOT NULL CHECK (schema_version = 1), revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO inquiry_meta VALUES ('project-1', 1, 0, '2026-01-01T00:00:00.000Z');
CREATE TABLE artifacts (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE findings (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE questions (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE attempts (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO artifacts VALUES ('artifact-1', 'project-1', '${JSON.stringify(artifact()).replaceAll("'", "''")}', '2026-01-01T00:00:00.000Z');`,
			);
			const storage = new SqliteInquiryStorage("project-1", path);
			expect((await storage.snapshot()).schemaVersion).toBe(2);
			expect((await storage.artifacts.get("artifact-1"))?.schemaVersion).toBe(1);
			expect(await storage.decisions.list()).toEqual([]);
			await storage.close();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
