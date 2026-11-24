import type { AttemptRecord, DecisionRecord, InquirySnapshot } from "./models.js";
import type { InquirySqliteConnection } from "./sqlite-connection.js";
import type { FactCursorRecord, FactProjectionStore, PersistedLedgerRecord } from "./storage-contract.js";

/**
 * Transactional projection store of the canonical SQLite owner.
 *
 * The consumed-fact cursor lives in this database, in the same transaction as
 * the projected rows. A second host-side cursor ledger would let the
 * projection and the acknowledgement disagree after a crash.
 */

export interface SqliteFactProjectionPort {
	readonly projectId: string;
	readonly database: InquirySqliteConnection;
	/** Read the current rows inside the open transaction. */
	snapshotSync(): InquirySnapshot;
	/** Validate one row against the current rows. */
	validate(key: "attempts" | "decisions", record: PersistedLedgerRecord, current: InquirySnapshot): void;
}

interface CursorRow {
	key: string;
	fact_id: string;
	sequence: number;
	sha256: string;
	updated_at: string;
}

/**
 * Schema of the durable cursor marker.
 *
 * The marker table belongs to the projection, not to the ledger schema: a
 * ledger that never consumed a host fact has no marker, and the projection
 * creates the table in the same transaction that writes the first marker.
 */
const CURSOR_TABLE = "inquiry_fact_cursor";
const CURSOR_SCHEMA = `
	CREATE TABLE IF NOT EXISTS ${CURSOR_TABLE} (
		key TEXT PRIMARY KEY NOT NULL,
		project_id TEXT NOT NULL,
		fact_id TEXT NOT NULL,
		sequence INTEGER NOT NULL CHECK (sequence >= 1),
		sha256 TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);`;

export class SqliteFactProjection implements FactProjectionStore {
	constructor(private readonly port: SqliteFactProjectionPort) {}

	async cursor(key: string): Promise<FactCursorRecord | undefined> {
		if (!this.hasCursorTable()) return undefined;
		const row = this.port.database
			.prepare(`SELECT key, fact_id, sequence, sha256, updated_at FROM ${CURSOR_TABLE} WHERE key = ?`)
			.get(key) as CursorRow | undefined;
		if (!row) return undefined;
		return {
			key: row.key,
			factId: row.fact_id,
			sequence: row.sequence,
			sha256: row.sha256,
			updatedAt: row.updated_at,
		};
	}

	async commit(input: {
		readonly cursor?: FactCursorRecord;
		readonly attempts?: readonly AttemptRecord[];
		readonly decisions?: readonly DecisionRecord[];
	}): Promise<void> {
		return this.port.database.serialize(async () => {
			this.port.database.exec("BEGIN IMMEDIATE");
			try {
				this.port.database.exec(CURSOR_SCHEMA);
				const current = this.port.snapshotSync();
				const updatedAt = new Date().toISOString();
				for (const attempt of input.attempts ?? []) {
					this.port.validate("attempts", attempt, current);
					this.writeRow("attempts", attempt.id, attempt, updatedAt);
				}
				for (const decision of input.decisions ?? []) {
					this.port.validate("decisions", decision, current);
					this.writeRow("decisions", decision.id, decision, updatedAt);
				}
				if (input.cursor) {
					this.writeCursor(input.cursor, updatedAt);
					this.port.database
						.prepare("UPDATE inquiry_meta SET revision = revision + 1, updated_at = ? WHERE project_id = ?")
						.run(updatedAt, this.port.projectId);
				}
				this.port.database.exec("COMMIT");
			} catch (error) {
				try {
					this.port.database.exec("ROLLBACK");
				} catch (rollbackError) {
					throw new AggregateError([error, rollbackError], "Inquiry projection write and rollback failed");
				}
				throw error;
			}
		});
	}

	/** True once the projection wrote a marker in this database. */
	private hasCursorTable(): boolean {
		const rows = this.port.database
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
			.all(CURSOR_TABLE) as readonly { name: string }[];
		return rows.length > 0;
	}

	private writeRow(key: "attempts" | "decisions", id: string, record: unknown, updatedAt: string): void {
		this.port.database
			.prepare(
				`INSERT INTO ${key} (id, project_id, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, payload = excluded.payload, updated_at = excluded.updated_at`,
			)
			.run(id, this.port.projectId, JSON.stringify(record), updatedAt);
	}

	private writeCursor(cursor: FactCursorRecord, updatedAt: string): void {
		this.port.database
			.prepare(
				`INSERT INTO ${CURSOR_TABLE} (key, project_id, fact_id, sequence, sha256, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET project_id = excluded.project_id, fact_id = excluded.fact_id, sequence = excluded.sequence, sha256 = excluded.sha256, updated_at = excluded.updated_at`,
			)
			.run(cursor.key, this.port.projectId, cursor.factId, cursor.sequence, cursor.sha256, updatedAt);
	}
}
