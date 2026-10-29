import {
	validateArtifactLineage,
	validateFindingReferences,
} from "./lineage.js";
import {
	type ArtifactRecord,
	type ArtifactRerunRecord,
	type AttemptRecord,
	type DecisionRecord,
	type FindingRecord,
	INQUIRY_SCHEMA_VERSION,
	type InquirySnapshot,
	LEGACY_INQUIRY_SCHEMA_VERSION,
	type QuestionRecord,
} from "./models.js";
import type { InquirySqliteConnection } from "./sqlite-connection.js";
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

/** Engine settings are shared by Node and WASM, including after a WASM export reopens its database. */
export function configureInquirySqlite(
	database: InquirySqliteConnection,
): void {
	database.exec("PRAGMA busy_timeout = 5000");
	database.exec("PRAGMA foreign_keys = ON");
	database.exec("PRAGMA journal_mode = WAL");
	database.exec("PRAGMA synchronous = FULL");
}
export function readInquirySqliteMetadata(
	database: InquirySqliteConnection,
): SqliteMetaRow {
	const rows = database
		.prepare(
			"SELECT project_id, schema_version, revision, updated_at FROM inquiry_meta",
		)
		.all() as readonly SqliteMetaRow[];
	if (rows.length !== 1)
		throw new Error("Inquiry SQLite metadata must contain exactly one project");
	// biome-ignore lint/style/noNonNullAssertion: The preceding trust-boundary check requires exactly one metadata row.
	const meta = rows[0]!;
	if (
		(meta.schema_version !== INQUIRY_SCHEMA_VERSION &&
			meta.schema_version !== LEGACY_INQUIRY_SCHEMA_VERSION) ||
		!Number.isSafeInteger(meta.revision) ||
		meta.revision < 0 ||
		typeof meta.updated_at !== "string"
	)
		throw new Error("Invalid inquiry SQLite metadata");
	return meta;
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
		try {
			const tables = database
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
				.all() as readonly { name: string }[];
			if (tables.some((table) => table.name === "inquiry_meta")) {
				if (readInquirySqliteMetadata(database).project_id !== projectId)
					throw new Error("Inquiry SQLite ledger belongs to another project");
			} else if (tables.length)
				throw new Error("Unrecognized Inquiry SQLite schema");
			configureInquirySqlite(database);
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
			let meta = tables.length
				? readInquirySqliteMetadata(database)
				: undefined;
			if (meta && meta.project_id !== projectId) {
				throw new Error("Inquiry SQLite ledger belongs to another project");
			}
			if (meta && meta.schema_version === LEGACY_INQUIRY_SCHEMA_VERSION) {
				this.database.exec("BEGIN IMMEDIATE");
				try {
					this.database.exec(
						"ALTER TABLE inquiry_meta RENAME TO inquiry_meta_v1",
					);
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
					meta = readInquirySqliteMetadata(database);
				} catch (error) {
					try {
						this.database.exec("ROLLBACK");
					} catch (rollbackError) {
						throw new AggregateError(
							[error, rollbackError],
							"Inquiry migration and rollback failed",
						);
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
			this.artifacts = new SqliteLedgerCollection<ArtifactRecord>(
				this,
				"artifacts",
			);
			this.findings = new SqliteLedgerCollection<FindingRecord>(
				this,
				"findings",
			);
			this.questions = new SqliteLedgerCollection<QuestionRecord>(
				this,
				"questions",
			);
			this.attempts = new SqliteLedgerCollection<AttemptRecord>(
				this,
				"attempts",
			);
			this.decisions = new SqliteLedgerCollection<DecisionRecord>(
				this,
				"decisions",
			);
			this.reruns = new SqliteLedgerCollection<ArtifactRerunRecord>(
				this,
				"reruns",
			);
		} catch (error) {
			try {
				database.close();
			} catch (closeError) {
				throw new AggregateError(
					[error, closeError],
					"Inquiry initialization and close failed",
				);
			}
			throw error;
		}
	}

	async snapshot(): Promise<InquirySnapshot> {
		return this.snapshotSync();
	}

	private snapshotSync(): InquirySnapshot {
		this.assertOpen();
		const meta = readInquirySqliteMetadata(this.database);
		if (
			!meta ||
			meta.project_id !== this.projectId ||
			meta.schema_version !== INQUIRY_SCHEMA_VERSION
		)
			throw new Error("Invalid inquiry SQLite metadata");
		const read = <T extends PersistedLedgerRecord>(
			key: SqliteLedgerKey,
		): readonly T[] =>
			(
				this.database
					.prepare(
						`SELECT payload FROM ${quotedTable(key)} WHERE project_id = ? ORDER BY id ASC`,
					)
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

	async update(
		key: SqliteLedgerKey,
		record: PersistedLedgerRecord,
	): Promise<void> {
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
				} catch (rollbackError) {
					throw new AggregateError(
						[error, rollbackError],
						"Inquiry write and rollback failed",
					);
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
			const errors = validateArtifactLineage(
				record as ArtifactRecord,
				current.artifacts,
			);
			if (errors.length)
				throw new Error(`Invalid artifact record: ${errors.join("; ")}`);
		}
		if (key === "findings") {
			const errors = validateFindingReferences(
				record as FindingRecord,
				current,
			);
			if (errors.length)
				throw new Error(`Invalid finding record: ${errors.join("; ")}`);
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
		this.database.close();
		this.closed = true;
	}
}

class SqliteLedgerCollection<T extends { readonly id: string }>
	implements LedgerCollection<T>
{
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
		await this.owner.update(
			this.key,
			record as unknown as PersistedLedgerRecord,
		);
	}
}
