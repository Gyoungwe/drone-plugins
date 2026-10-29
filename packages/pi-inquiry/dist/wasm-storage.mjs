// src/wasm-storage.ts
import initSqlJs from "./sql-wasm.cjs";

// src/lineage.ts
var SHA256 = /^[a-f0-9]{64}$/i;
function isSafeArtifactPath(path) {
  if (!path || path.includes("\0") || path.startsWith("~")) return false;
  if (path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(path)) return false;
  const parts = path.replaceAll("\\", "/").split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}
function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function validateArtifactRecord(record) {
  const errors = [];
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2)
    errors.push("unsupported schema version");
  if (!nonEmpty(record.id)) errors.push("id is required");
  if (!nonEmpty(record.projectId)) errors.push("projectId is required");
  if (!isSafeArtifactPath(record.path)) errors.push("path must be a safe project-relative path");
  if (record.location !== "local" && record.location !== "remote") errors.push("invalid location");
  if (!Number.isSafeInteger(record.bytes) || record.bytes < 0)
    errors.push("bytes must be a non-negative integer");
  if (!SHA256.test(record.sha256)) errors.push("sha256 must be a 64-character hexadecimal digest");
  if (!record.source || !nonEmpty(record.source.id)) errors.push("source id is required");
  if (!["task", "run", "input", "tool", "workflow", "manual"].includes(record.source?.kind))
    errors.push("invalid source kind");
  if (!["input", "draft", "intermediate", "deliverable", "evidence"].includes(record.purpose))
    errors.push("invalid purpose");
  if (!["valid", "superseded", "cleanup-candidate", "archived", "pending-review"].includes(
    record.status
  ))
    errors.push("invalid status");
  if (new Set(record.parentIds).size !== record.parentIds.length)
    errors.push("parentIds must be unique");
  if (record.parentIds.some((id) => !nonEmpty(id))) errors.push("parentIds must be non-empty");
  if (record.pendingReviewDecisionIds?.some((id) => !nonEmpty(id)) || record.pendingReviewDecisionIds && new Set(record.pendingReviewDecisionIds).size !== record.pendingReviewDecisionIds.length)
    errors.push("pendingReviewDecisionIds must be unique and non-empty");
  if (record.reviews?.some(
    (review) => !nonEmpty(review.decisionId) || review.confirmedBy !== "user" || !nonEmpty(review.reason) || !validDate(review.confirmedAt)
  ))
    errors.push("artifact reviews must be user confirmations with valid timestamps");
  if (record.runId !== void 0 && !nonEmpty(record.runId)) errors.push("runId must be non-empty");
  if (!validDate(record.createdAt) || !validDate(record.updatedAt))
    errors.push("timestamps must be ISO dates");
  return errors;
}
function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function validateArtifactLineage(record, artifacts) {
  const errors = [...validateArtifactRecord(record)];
  const byId = new Map(artifacts.map((item) => [item.id, item]));
  for (const parentId of record.parentIds) {
    const parent = byId.get(parentId);
    if (!parent) {
      errors.push(`missing parent artifact: ${parentId}`);
      continue;
    }
    if (parent.projectId !== record.projectId)
      errors.push(`parent belongs to another project: ${parentId}`);
    if (parent.id === record.id) errors.push("artifact cannot parent itself");
    if (hasAncestor(parent.id, record.id, byId))
      errors.push(`lineage cycle through parent: ${parentId}`);
  }
  return [...new Set(errors)];
}
function hasAncestor(start, target, byId) {
  const seen = /* @__PURE__ */ new Set();
  let current = byId.get(start);
  while (current) {
    if (current.id === target) return true;
    if (seen.has(current.id)) return true;
    seen.add(current.id);
    current = current.parentIds.map((id) => byId.get(id)).find(Boolean);
  }
  return false;
}
function validateFindingReferences(finding, snapshot) {
  const errors = [];
  const artifacts = new Map(snapshot.artifacts.map((artifact) => [artifact.id, artifact]));
  for (const artifactId of finding.artifactIds) {
    const artifact = artifacts.get(artifactId);
    if (!artifact) errors.push(`missing artifact reference: ${artifactId}`);
    else if (artifact.status === "archived")
      errors.push(`archived artifact cannot support finding: ${artifactId}`);
  }
  for (const hypothesisId of finding.hypothesisIds) {
    if (!snapshot.questions.some((question) => question.id === hypothesisId))
      errors.push(`missing hypothesis reference: ${hypothesisId}`);
  }
  return [...new Set(errors)];
}

// src/models.ts
var INQUIRY_SCHEMA_VERSION = 2;
var LEGACY_INQUIRY_SCHEMA_VERSION = 1;

// src/sqlite-storage.ts
function quotedTable(key) {
  return `"${key}"`;
}
function configureInquirySqlite(database) {
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = FULL");
}
function readInquirySqliteMetadata(database) {
  const rows = database.prepare(
    "SELECT project_id, schema_version, revision, updated_at FROM inquiry_meta"
  ).all();
  if (rows.length !== 1)
    throw new Error("Inquiry SQLite metadata must contain exactly one project");
  const meta = rows[0];
  if (meta.schema_version !== INQUIRY_SCHEMA_VERSION && meta.schema_version !== LEGACY_INQUIRY_SCHEMA_VERSION || !Number.isSafeInteger(meta.revision) || meta.revision < 0 || typeof meta.updated_at !== "string")
    throw new Error("Invalid inquiry SQLite metadata");
  return meta;
}
var CanonicalSqliteInquiryStorage = class {
  constructor(projectId, database) {
    this.projectId = projectId;
    this.database = database;
    try {
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
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
      let meta = tables.length ? readInquirySqliteMetadata(database) : void 0;
      if (meta && meta.project_id !== projectId) {
        throw new Error("Inquiry SQLite ledger belongs to another project");
      }
      if (meta && meta.schema_version === LEGACY_INQUIRY_SCHEMA_VERSION) {
        this.database.exec("BEGIN IMMEDIATE");
        try {
          this.database.exec(
            "ALTER TABLE inquiry_meta RENAME TO inquiry_meta_v1"
          );
          this.database.exec(`
					CREATE TABLE inquiry_meta (
						project_id TEXT PRIMARY KEY NOT NULL,
						schema_version INTEGER NOT NULL CHECK (schema_version = ${INQUIRY_SCHEMA_VERSION}),
						revision INTEGER NOT NULL CHECK (revision >= 0),
						updated_at TEXT NOT NULL
					);
				`);
          this.database.prepare(
            "INSERT INTO inquiry_meta (project_id, schema_version, revision, updated_at) SELECT project_id, ?, revision, updated_at FROM inquiry_meta_v1"
          ).run(INQUIRY_SCHEMA_VERSION);
          this.database.exec("DROP TABLE inquiry_meta_v1");
          this.database.exec("COMMIT");
          meta = readInquirySqliteMetadata(database);
        } catch (error) {
          try {
            this.database.exec("ROLLBACK");
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              "Inquiry migration and rollback failed"
            );
          }
          throw error;
        }
      }
      if (!meta) {
        this.database.prepare(
          "INSERT INTO inquiry_meta (project_id, schema_version, revision, updated_at) VALUES (?, ?, 0, ?)"
        ).run(projectId, INQUIRY_SCHEMA_VERSION, (/* @__PURE__ */ new Date(0)).toISOString());
      }
      this.artifacts = new SqliteLedgerCollection(
        this,
        "artifacts"
      );
      this.findings = new SqliteLedgerCollection(
        this,
        "findings"
      );
      this.questions = new SqliteLedgerCollection(
        this,
        "questions"
      );
      this.attempts = new SqliteLedgerCollection(
        this,
        "attempts"
      );
      this.decisions = new SqliteLedgerCollection(
        this,
        "decisions"
      );
      this.reruns = new SqliteLedgerCollection(
        this,
        "reruns"
      );
    } catch (error) {
      try {
        database.close();
      } catch (closeError) {
        throw new AggregateError(
          [error, closeError],
          "Inquiry initialization and close failed"
        );
      }
      throw error;
    }
  }
  artifacts;
  findings;
  questions;
  attempts;
  decisions;
  reruns;
  database;
  closed = false;
  async snapshot() {
    return this.snapshotSync();
  }
  snapshotSync() {
    this.assertOpen();
    const meta = readInquirySqliteMetadata(this.database);
    if (!meta || meta.project_id !== this.projectId || meta.schema_version !== INQUIRY_SCHEMA_VERSION)
      throw new Error("Invalid inquiry SQLite metadata");
    const read = (key) => this.database.prepare(
      `SELECT payload FROM ${quotedTable(key)} WHERE project_id = ? ORDER BY id ASC`
    ).all(this.projectId).map((row) => JSON.parse(row.payload));
    return {
      schemaVersion: INQUIRY_SCHEMA_VERSION,
      projectId: this.projectId,
      revision: meta.revision,
      updatedAt: meta.updated_at,
      artifacts: read("artifacts"),
      findings: read("findings"),
      questions: read("questions"),
      attempts: read("attempts"),
      decisions: read("decisions"),
      reruns: read("reruns")
    };
  }
  async update(key, record) {
    return this.database.serialize(async () => {
      this.assertOpen();
      this.database.exec("BEGIN IMMEDIATE");
      try {
        const current = this.snapshotSync();
        this.validateRecord(key, record, current);
        const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.database.prepare(
          `INSERT INTO ${quotedTable(key)} (id, project_id, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, payload = excluded.payload, updated_at = excluded.updated_at`
        ).run(record.id, this.projectId, JSON.stringify(record), updatedAt);
        this.database.prepare(
          "UPDATE inquiry_meta SET revision = revision + 1, updated_at = ? WHERE project_id = ?"
        ).run(updatedAt, this.projectId);
        this.database.exec("COMMIT");
      } catch (error) {
        try {
          this.database.exec("ROLLBACK");
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Inquiry write and rollback failed"
          );
        }
        throw error;
      }
    });
  }
  validateRecord(key, record, current) {
    if (!record.id || record.projectId !== this.projectId || record.schemaVersion !== INQUIRY_SCHEMA_VERSION && record.schemaVersion !== LEGACY_INQUIRY_SCHEMA_VERSION)
      throw new Error(`Invalid ${key.slice(0, -1)} record`);
    if (key === "artifacts") {
      const errors = validateArtifactLineage(
        record,
        current.artifacts
      );
      if (errors.length)
        throw new Error(`Invalid artifact record: ${errors.join("; ")}`);
    }
    if (key === "findings") {
      const errors = validateFindingReferences(
        record,
        current
      );
      if (errors.length)
        throw new Error(`Invalid finding record: ${errors.join("; ")}`);
    }
    if (key === "decisions") {
      const decision = record;
      if (!decision.summary.trim() || !Array.isArray(decision.basis) || !Array.isArray(decision.affectedArtifactIds))
        throw new Error("Invalid decision record");
    }
    if (key === "reruns") {
      const rerun = record;
      if (!rerun.sourceArtifactId || !rerun.jobId || !rerun.status)
        throw new Error("Invalid artifact rerun record");
    }
  }
  assertOpen() {
    if (this.closed) throw new Error("Inquiry SQLite storage is closed");
  }
  async close() {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
};
var SqliteLedgerCollection = class {
  constructor(owner, key) {
    this.owner = owner;
    this.key = key;
  }
  async get(id) {
    return (await this.list()).find((record) => record.id === id);
  }
  async list() {
    const snapshot = await this.owner.snapshot();
    return snapshot[this.key] ?? [];
  }
  async put(record) {
    await this.owner.update(
      this.key,
      record
    );
  }
};

// src/wasm-storage.ts
var WasmConnection = class {
  constructor(database) {
    this.database = database;
  }
  pending = Promise.resolve();
  exec(sql) {
    this.database.run(sql);
  }
  prepare(sql) {
    return {
      get: (...parameters) => {
        const statement = this.database.prepare(sql);
        try {
          statement.bind(parameters);
          return statement.step() ? statement.getAsObject() : void 0;
        } finally {
          statement.free();
        }
      },
      all: (...parameters) => {
        const statement = this.database.prepare(sql);
        try {
          statement.bind(parameters);
          const rows = [];
          while (statement.step()) rows.push(statement.getAsObject());
          return rows;
        } finally {
          statement.free();
        }
      },
      run: (...parameters) => {
        this.database.run(sql, parameters);
      }
    };
  }
  serialize(operation) {
    const pending = this.pending.then(operation);
    this.pending = pending.then(
      () => void 0,
      () => void 0
    );
    return pending;
  }
  close() {
    this.database.close();
  }
};
var WasmInquiryStorage = class extends CanonicalSqliteInquiryStorage {
  constructor(projectId, connection) {
    super(projectId, connection);
    this.connection = connection;
  }
  async exportBytes() {
    let bytes;
    await this.connection.serialize(async () => {
      bytes = this.connection.database.export();
      configureInquirySqlite(this.connection);
    });
    return bytes;
  }
  async close() {
    await this.connection.serialize(() => super.close());
  }
};
async function createInquiryWasmEngine(wasmBinary) {
  const SQL = await initSqlJs({
    wasmBinary: new Uint8Array(wasmBinary).buffer
  });
  return {
    inspect(bytes) {
      const connection = new WasmConnection(new SQL.Database(bytes));
      try {
        const meta = readInquirySqliteMetadata(connection);
        return {
          projectId: meta.project_id,
          schemaVersion: meta.schema_version,
          revision: meta.revision
        };
      } finally {
        connection.close();
      }
    },
    open(projectId, bytes) {
      if (!projectId.trim())
        throw new Error("Inquiry projectId cannot be empty");
      return new WasmInquiryStorage(
        projectId,
        new WasmConnection(new SQL.Database(bytes))
      );
    }
  };
}
export {
  WasmInquiryStorage,
  createInquiryWasmEngine
};
