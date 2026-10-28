import { validateArtifactLineage, validateFindingReferences } from "./lineage.js";
import {
	INQUIRY_SCHEMA_VERSION,
	LEGACY_INQUIRY_SCHEMA_VERSION,
	type ArtifactRecord,
	type ArtifactRerunRecord,
	type AttemptRecord,
	type DecisionRecord,
	type FindingRecord,
	type InquirySnapshot,
	type QuestionRecord,
} from "./models.js";
import type {
	ArtifactLedger,
	ArtifactRerunLedger,
	AttemptLedger,
	DecisionLedger,
	FindingLedger,
	InquiryStorage,
	LedgerCollection,
	PersistedLedgerRecord,
	QuestionLedger,
} from "./storage-contract.js";
import type { InquirySqliteConnection } from "./sqlite-connection.js";

/** Canonical SQL, schema migration and record validation; the internal connection owns no caller authority. */
const SQLITE_TABLES = [
	"artifacts",
	"findings",
	"questions",
	"attempts",
	"decisions",
	"reruns",
] as const;
type SqliteLedgerKey = (typeof SQLITE_TABLES)[number];
interface SqliteMetaRow {
	project_id: string;
	schema_version: number;
	revision: number;
	updated_at: string;
}

interface SqlitePayloadRow {
	payload: string;
}

function quotedTable(key: SqliteLedgerKey): string {
	// The key is selected from a fixed tuple above; never interpolate user input.
	return `"${key}"`;
}

export class CanonicalSqliteInquiryStorage implements InquiryStorage {
	readonly artifacts: ArtifactLedger;
	readonly findings: FindingLedger;
	readonly questions: QuestionLedger;
	readonly attempts: AttemptLedger;
	readonly decisions: DecisionLedger;
	readonly reruns: ArtifactRerunLedger;
	private readonly database: InquirySqliteConnection;
	private closed = false;

	constructor(
		readonly projectId: string,
		database: InquirySqliteConnection,
	) {
		this.database = database;
		this.database.exec("PRAGMA busy_timeout = 5000");
		this.database.exec("PRAGMA foreign_keys = ON");
		this.database.exec("PRAGMA journal_mode = WAL");
		this.database.exec("PRAGMA synchronous = FULL");
		this.database.exec(`
			CREATE TABLE IF NOT EXISTS inquiry_meta (
				project_id TEXT PRIMARY KEY NOT NULL,
				schema_version INTEGER NOT NULL CHECK (schema_version = ${INQUIRY_SCHEMA_VERSION}),
				revision INTEGER NOT NULL CHECK (revision >= 0),
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS artifacts (
				id TEXT PRIMARY KEY NOT NULL,
				project_id TEXT NOT NULL,
				payload TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS findings (
				id TEXT PRIMARY KEY NOT NULL,
				project_id TEXT NOT NULL,
				payload TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS questions (
				id TEXT PRIMARY KEY NOT NULL,
				project_id TEXT NOT NULL,
				payload TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS attempts (
				id TEXT PRIMARY KEY NOT NULL,
				project_id TEXT NOT NULL,
				payload TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS decisions (
				id TEXT PRIMARY KEY NOT NULL,
				project_id TEXT NOT NULL,
				payload TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE IF NOT EXISTS reruns (
				id TEXT PRIMARY KEY NOT NULL,
				project_id TEXT NOT NULL,
				payload TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
		`);
		let meta = this.database
			.prepare("SELECT project_id, schema_version, revision, updated_at FROM inquiry_meta LIMIT 1")
			.get() as SqliteMetaRow | undefined;
		if (meta && meta.project_id !== projectId) {
			this.database.close();
			throw new Error("Inquiry SQLite ledger belongs to another project");
		}
		if (meta && meta.schema_version === LEGACY_INQUIRY_SCHEMA_VERSION) {
			this.database.exec("BEGIN IMMEDIATE");
			try {
				this.database.exec("ALTER TABLE inquiry_meta RENAME TO inquiry_meta_v1");
				this.database.exec(`
					CREATE TABLE inquiry_meta (
						project_id TEXT PRIMARY KEY NOT NULL,
						schema_version INTEGER NOT NULL CHECK (schema_version = ${INQUIRY_SCHEMA_VERSION}),
						revision INTEGER NOT NULL CHECK (revision >= 0),
						updated_at TEXT NOT NULL
					);
				`);
				this.database
					.prepare(
						"INSERT INTO inquiry_meta (project_id, schema_version, revision, updated_at) SELECT project_id, ?, revision, updated_at FROM inquiry_meta_v1",
					)
					.run(INQUIRY_SCHEMA_VERSION);
				this.database.exec("DROP TABLE inquiry_meta_v1");
				this.database.exec("COMMIT");
				meta = this.database
					.prepare(
						"SELECT project_id, schema_version, revision, updated_at FROM inquiry_meta LIMIT 1",
					)
					.get() as SqliteMetaRow | undefined;
			} catch (error) {
				try {
					this.database.exec("ROLLBACK");
				} catch {
					// Preserve the original migration error.
				}
				throw error;
			}
		}
		if (!meta) {
			this.database
				.prepare(
					"INSERT INTO inquiry_meta (project_id, schema_version, revision, updated_at) VALUES (?, ?, 0, ?)",
				)
				.run(projectId, INQUIRY_SCHEMA_VERSION, new Date(0).toISOString());
		}
		this.artifacts = new SqliteLedgerCollection<ArtifactRecord>(this, "artifacts");
		this.findings = new SqliteLedgerCollection<FindingRecord>(this, "findings");
		this.questions = new SqliteLedgerCollection<QuestionRecord>(this, "questions");
		this.attempts = new SqliteLedgerCollection<AttemptRecord>(this, "attempts");
		this.decisions = new SqliteLedgerCollection<DecisionRecord>(this, "decisions");
		this.reruns = new SqliteLedgerCollection<ArtifactRerunRecord>(this, "reruns");
	}

	async snapshot(): Promise<InquirySnapshot> {
		return this.snapshotSync();
	}

	private snapshotSync(): InquirySnapshot {
		this.assertOpen();
		const meta = this.database
			.prepare("SELECT project_id, schema_version, revision, updated_at FROM inquiry_meta LIMIT 1")
			.get() as SqliteMetaRow | undefined;
		if (
			!meta ||
			meta.project_id !== this.projectId ||
			meta.schema_version !== INQUIRY_SCHEMA_VERSION
		)
			throw new Error("Invalid inquiry SQLite metadata");
		const read = <T extends PersistedLedgerRecord>(key: SqliteLedgerKey): readonly T[] =>
			(
				this.database
					.prepare(`SELECT payload FROM ${quotedTable(key)} WHERE project_id = ? ORDER BY id ASC`)
					.all(this.projectId) as unknown as SqlitePayloadRow[]
			).map((row) => JSON.parse(row.payload) as T);
		return {
			schemaVersion: INQUIRY_SCHEMA_VERSION,
			projectId: this.projectId,
			revision: meta.revision,
			updatedAt: meta.updated_at,
			artifacts: read<ArtifactRecord>("artifacts"),
			findings: read<FindingRecord>("findings"),
			questions: read<QuestionRecord>("questions"),
			attempts: read<AttemptRecord>("attempts"),
			decisions: read<DecisionRecord>("decisions"),
			reruns: read<ArtifactRerunRecord>("reruns"),
		};
	}

	async update(key: SqliteLedgerKey, record: PersistedLedgerRecord): Promise<void> {
		return this.database.serialize(async () => {
			this.assertOpen();
			this.database.exec("BEGIN IMMEDIATE");
			try {
				const current = this.snapshotSync();
				this.validateRecord(key, record, current);
				const updatedAt = new Date().toISOString();
				this.database
					.prepare(
						`INSERT INTO ${quotedTable(key)} (id, project_id, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, payload = excluded.payload, updated_at = excluded.updated_at`,
					)
					.run(record.id, this.projectId, JSON.stringify(record), updatedAt);
				this.database
					.prepare(
						"UPDATE inquiry_meta SET revision = revision + 1, updated_at = ? WHERE project_id = ?",
					)
					.run(updatedAt, this.projectId);
				this.database.exec("COMMIT");
			} catch (error) {
				try {
					this.database.exec("ROLLBACK");
				} catch {
					// Preserve the original validation/SQLite error.
				}
				throw error;
			}
		});
	}

	private validateRecord(
		key: SqliteLedgerKey,
		record: PersistedLedgerRecord,
		current: InquirySnapshot,
	): void {
		if (
			!record.id ||
			record.projectId !== this.projectId ||
			(record.schemaVersion !== INQUIRY_SCHEMA_VERSION &&
				record.schemaVersion !== LEGACY_INQUIRY_SCHEMA_VERSION)
		)
			throw new Error(`Invalid ${key.slice(0, -1)} record`);
		if (key === "artifacts") {
			const errors = validateArtifactLineage(record as ArtifactRecord, current.artifacts);
			if (errors.length) throw new Error(`Invalid artifact record: ${errors.join("; ")}`);
		}
		if (key === "findings") {
			const errors = validateFindingReferences(record as FindingRecord, current);
			if (errors.length) throw new Error(`Invalid finding record: ${errors.join("; ")}`);
		}
		if (key === "decisions") {
			const decision = record as DecisionRecord;
			if (
				!decision.summary.trim() ||
				!Array.isArray(decision.basis) ||
				!Array.isArray(decision.affectedArtifactIds)
			)
				throw new Error("Invalid decision record");
		}
		if (key === "reruns") {
			const rerun = record as ArtifactRerunRecord;
			if (!rerun.sourceArtifactId || !rerun.jobId || !rerun.status)
				throw new Error("Invalid artifact rerun record");
		}
	}

	private assertOpen(): void {
		if (this.closed) throw new Error("Inquiry SQLite storage is closed");
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.database.close();
	}
}

class SqliteLedgerCollection<T extends { readonly id: string }> implements LedgerCollection<T> {
	constructor(
		private readonly owner: CanonicalSqliteInquiryStorage,
		private readonly key: SqliteLedgerKey,
	) {}

	async get(id: string): Promise<T | undefined> {
		return (await this.list()).find((record) => record.id === id);
	}

	async list(): Promise<readonly T[]> {
		const snapshot = await this.owner.snapshot();
		return (snapshot[this.key] ?? []) as unknown as readonly T[];
	}

	async put(record: T): Promise<void> {
		await this.owner.update(this.key, record as unknown as PersistedLedgerRecord);
	}
}
