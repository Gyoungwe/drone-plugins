// src/event-projection.ts
var TERMINAL_COMPUTE_STATUSES = /* @__PURE__ */ new Set([
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
  "partial"
]);
var TERMINAL_TASK_STATUSES = /* @__PURE__ */ new Set([
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
  "partial",
  "unknown"
]);
var SHA256 = /^[a-f0-9]{64}$/i;
function asIso(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return new Date(value).toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value)))
    return new Date(value).toISOString();
  return (/* @__PURE__ */ new Date()).toISOString();
}
function outcomeFor(status, eventType) {
  if (eventType === "error" || status === "failed") return "failed";
  if (eventType === "collected" || status === "succeeded") return "succeeded";
  if (eventType === "cancelled") return "blocked";
  if (status === "cancelled" || status === "blocked") return "blocked";
  return "unknown";
}
function nonEmpty(value) {
  const normalized = value?.trim();
  return normalized || void 0;
}
function summary(value) {
  return nonEmpty(value);
}
var InquiryEventProjector = class {
  constructor(storage, domain, canonicalProjectId) {
    this.storage = storage;
    this.domain = domain;
    this.canonicalProjectId = canonicalProjectId;
  }
  /** Record a terminal/collection compute event. Non-terminal progress is ignored. */
  async recordComputeEvent(event) {
    if (event.type === "submitted") {
      await this.recordDecision({
        id: `compute-submit:${event.jobId}`,
        kind: "compute-submit",
        summary: `Submitted compute job ${event.jobId}`,
        basis: [`job:${event.jobId}`, event.id],
        at: event.at,
        projectId: event.projectId
      });
    }
    if (event.type !== "collected" && event.type !== "cancelled" && event.type !== "error" && !TERMINAL_COMPUTE_STATUSES.has(event.status ?? ""))
      return;
    this.assertProject(event.projectId);
    const executionId = nonEmpty(event.runId) ?? event.jobId;
    const eventAt = asIso(event.at);
    const artifactIds = await this.recordArtifacts(
      "run",
      executionId,
      event.artifacts ?? event.manifest?.entries,
      eventAt,
      event.status === "succeeded" || event.type === "collected" ? "deliverable" : "intermediate",
      "remote",
      event.runId ?? event.jobId,
      event.sessionId,
      event.turn,
      event.runProvenance
    );
    const attempt = {
      id: `compute:${executionId}`,
      schemaVersion: 2,
      projectId: this.storage.projectId,
      hypothesisIds: [],
      parameters: {
        source: "compute",
        jobId: event.jobId,
        ...event.runId ? { runId: event.runId } : {},
        eventType: event.type,
        status: event.status ?? null,
        ...event.hostId ? { hostId: event.hostId } : {},
        ...event.parameters ?? {}
      },
      artifactIds,
      ...summary(event.detail) ? { resultSummary: summary(event.detail) } : {},
      outcome: outcomeFor(event.status, event.type),
      enteredReport: false,
      startedAt: asIso(event.startedAt ?? event.at),
      finishedAt: eventAt,
      ...event.codeFingerprint ? { codeFingerprint: event.codeFingerprint } : {},
      ...event.sessionId ? { sessionId: event.sessionId } : {},
      ...event.turn !== void 0 ? { turn: event.turn } : {},
      ...event.runProvenance ? { runProvenance: event.runProvenance } : {}
    };
    await this.domain.recordAttempt(attempt);
    await this.associateReceipts(
      [`job:${event.jobId}`, `run:${executionId}`],
      artifactIds
    );
  }
  /** Record a terminal task/workflow event and its verified artifact metadata. */
  async recordTaskTerminal(event) {
    if (!TERMINAL_TASK_STATUSES.has(event.status)) return;
    this.assertProject(event.projectId);
    const executionId = nonEmpty(event.runId) ?? event.taskId;
    const eventAt = asIso(event.at);
    const artifactIds = await this.recordArtifacts(
      "task",
      executionId,
      event.artifacts ?? event.manifest?.entries,
      eventAt,
      event.status === "succeeded" ? "deliverable" : "intermediate",
      "local",
      event.runId ?? event.taskId,
      event.sessionId,
      event.turn,
      event.runProvenance
    );
    const attempt = {
      id: `task:${executionId}`,
      schemaVersion: 2,
      projectId: this.storage.projectId,
      hypothesisIds: [],
      parameters: {
        source: "task",
        taskId: event.taskId,
        ...event.runId ? { runId: event.runId } : {},
        status: event.status,
        ...event.parameters ?? {}
      },
      artifactIds,
      ...summary(event.detail) ? { resultSummary: summary(event.detail) } : {},
      outcome: outcomeFor(event.status),
      enteredReport: false,
      startedAt: asIso(event.startedAt ?? event.at),
      finishedAt: eventAt,
      ...event.codeFingerprint ? { codeFingerprint: event.codeFingerprint } : {},
      ...event.sessionId ? { sessionId: event.sessionId } : {},
      ...event.turn !== void 0 ? { turn: event.turn } : {},
      ...event.runProvenance ? { runProvenance: event.runProvenance } : {}
    };
    await this.domain.recordAttempt(attempt);
    await this.associateReceipts(
      [`task:${event.taskId}`, `run:${executionId}`],
      artifactIds
    );
  }
  /** Record provenance for host-local bash/kernel work without retaining source or output contents. */
  async recordLocalExecution(event) {
    this.assertProject(event.projectId);
    const finishedAt = asIso(event.finishedAt ?? event.startedAt);
    const artifactIds = await this.recordArtifacts(
      "run",
      event.id,
      event.artifacts,
      finishedAt,
      "deliverable",
      "local",
      event.id,
      event.sessionId,
      event.turn,
      event.runProvenance
    );
    await this.domain.recordAttempt({
      id: `local:${event.id}`,
      schemaVersion: 2,
      projectId: this.storage.projectId,
      hypothesisIds: [],
      codeFingerprint: event.codeFingerprint,
      parameters: {
        source: "local",
        tool: event.toolName,
        ...event.parameters
      },
      artifactIds,
      outcome: event.outcome,
      enteredReport: false,
      startedAt: asIso(event.startedAt ?? event.finishedAt),
      finishedAt,
      ...event.sessionId ? { sessionId: event.sessionId } : {},
      ...event.turn !== void 0 ? { turn: event.turn } : {},
      runProvenance: event.runProvenance
    });
    await this.associateReceipts(
      [`tool:${event.id}`, `run:${event.id}`],
      artifactIds
    );
  }
  async recordDecision(event) {
    const eventProjectId = event.projectId ? this.canonicalProjectId(event.projectId) : void 0;
    if (eventProjectId && eventProjectId !== this.storage.projectId)
      throw new Error(
        `Inquiry decision belongs to another project: ${event.projectId}`
      );
    const record = "schemaVersion" in event ? { ...event, projectId: this.storage.projectId } : {
      id: event.id,
      schemaVersion: 2,
      projectId: this.storage.projectId,
      kind: event.kind,
      summary: event.summary,
      basis: [...new Set(event.basis ?? [])],
      affectedArtifactIds: [...new Set(event.affectedArtifactIds ?? [])],
      status: "active",
      createdAt: asIso(event.at)
    };
    const snapshot = await this.storage.snapshot();
    const related = snapshot.artifacts.filter(
      (item) => record.basis.some(
        (basis) => basis === `${item.source.kind}:${item.source.id}` || basis === `run:${item.runId}`
      )
    );
    await this.domain.recordDecision({
      ...record,
      affectedArtifactIds: [
        .../* @__PURE__ */ new Set([
          ...record.affectedArtifactIds,
          ...related.map((item) => item.id)
        ])
      ]
    });
  }
  async associateReceipts(basis, artifactIds) {
    if (!artifactIds.length) return;
    for (const decision of await this.domain.listDecisions()) {
      if (decision.basis.some((item) => basis.includes(item)))
        await this.domain.associateDecisionArtifacts(decision.id, artifactIds);
    }
  }
  assertProject(projectId) {
    if (projectId && this.canonicalProjectId(projectId) !== this.storage.projectId)
      throw new Error(`Inquiry event belongs to another project: ${projectId}`);
  }
  async recordArtifacts(kind, executionId, entries, eventAt, defaultPurpose, defaultLocation, defaultRunId, sessionId, turn, runProvenance) {
    if (!entries?.length) return [];
    const artifactIds = [];
    for (const entry of entries) {
      const record = this.artifactRecord(
        kind,
        executionId,
        entry,
        eventAt,
        defaultPurpose,
        defaultLocation,
        defaultRunId,
        sessionId,
        turn,
        runProvenance
      );
      if (!record) continue;
      await this.domain.recordArtifact(record);
      artifactIds.push(record.id);
    }
    return artifactIds;
  }
  artifactRecord(kind, executionId, entry, eventAt, defaultPurpose, defaultLocation, defaultRunId, sessionId, turn, runProvenance) {
    const bytes = entry.bytes ?? entry.size;
    const sha256 = entry.sha256?.trim();
    if (typeof entry.path !== "string" || !entry.path.trim() || !Number.isSafeInteger(bytes) || bytes < 0 || !sha256 || !SHA256.test(sha256))
      return void 0;
    const id = nonEmpty(entry.id) ?? `${kind}:${executionId}:${entry.path.replaceAll("\\", "/")}:${sha256.toLowerCase()}`;
    return {
      id,
      schemaVersion: 2,
      projectId: this.storage.projectId,
      location: entry.location ?? defaultLocation,
      path: entry.path,
      bytes,
      sha256,
      source: {
        kind: entry.sourceKind ?? kind,
        id: nonEmpty(entry.sourceId) ?? executionId
      },
      purpose: entry.purpose ?? defaultPurpose,
      status: entry.status ?? "valid",
      parentIds: [...new Set(entry.parentIds ?? [])],
      runId: nonEmpty(entry.runId) ?? defaultRunId,
      ...sessionId ? { sessionId } : {},
      ...turn !== void 0 ? { turn } : {},
      ...runProvenance ? { runProvenance } : {},
      createdAt: eventAt,
      updatedAt: eventAt
    };
  }
};

// src/lineage.ts
var SHA2562 = /^[a-f0-9]{64}$/i;
function isSafeArtifactPath(path) {
  if (!path || path.includes("\0") || path.startsWith("~")) return false;
  if (path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(path)) return false;
  const parts = path.replaceAll("\\", "/").split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}
function nonEmpty2(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function validateArtifactRecord(record) {
  const errors = [];
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2)
    errors.push("unsupported schema version");
  if (!nonEmpty2(record.id)) errors.push("id is required");
  if (!nonEmpty2(record.projectId)) errors.push("projectId is required");
  if (!isSafeArtifactPath(record.path)) errors.push("path must be a safe project-relative path");
  if (record.location !== "local" && record.location !== "remote") errors.push("invalid location");
  if (!Number.isSafeInteger(record.bytes) || record.bytes < 0)
    errors.push("bytes must be a non-negative integer");
  if (!SHA2562.test(record.sha256)) errors.push("sha256 must be a 64-character hexadecimal digest");
  if (!record.source || !nonEmpty2(record.source.id)) errors.push("source id is required");
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
  if (record.parentIds.some((id) => !nonEmpty2(id))) errors.push("parentIds must be non-empty");
  if (record.pendingReviewDecisionIds?.some((id) => !nonEmpty2(id)) || record.pendingReviewDecisionIds && new Set(record.pendingReviewDecisionIds).size !== record.pendingReviewDecisionIds.length)
    errors.push("pendingReviewDecisionIds must be unique and non-empty");
  if (record.reviews?.some(
    (review) => !nonEmpty2(review.decisionId) || review.confirmedBy !== "user" || !nonEmpty2(review.reason) || !validDate(review.confirmedAt)
  ))
    errors.push("artifact reviews must be user confirmations with valid timestamps");
  if (record.runId !== void 0 && !nonEmpty2(record.runId)) errors.push("runId must be non-empty");
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
function cleanupCandidates(snapshot, options = {}) {
  const references = /* @__PURE__ */ new Map();
  const addReference = (artifactId, owner) => {
    const list = references.get(artifactId) ?? [];
    list.push(owner);
    references.set(artifactId, list);
  };
  for (const finding of snapshot.findings)
    for (const artifactId of finding.artifactIds) addReference(artifactId, `finding:${finding.id}`);
  for (const attempt of snapshot.attempts)
    for (const artifactId of attempt.artifactIds) addReference(artifactId, `attempt:${attempt.id}`);
  for (const artifact of snapshot.artifacts)
    for (const parentId of artifact.parentIds) addReference(parentId, `artifact:${artifact.id}`);
  const staleBefore = options.staleBefore ? Date.parse(options.staleBefore) : Number.NaN;
  return snapshot.artifacts.filter((artifact) => {
    if (artifact.status === "archived") return false;
    if ((references.get(artifact.id)?.length ?? 0) > 0) return false;
    if (artifact.status === "cleanup-candidate") return true;
    if (artifact.status === "superseded") return true;
    return artifact.purpose === "draft" && Number.isFinite(staleBefore) && Date.parse(artifact.updatedAt) < staleBefore;
  }).map((artifact) => ({
    artifact,
    reason: artifact.status === "superseded" ? "superseded" : artifact.status === "cleanup-candidate" ? "unreferenced" : "stale-draft",
    referencedBy: [...references.get(artifact.id) ?? []].sort()
  })).sort((a, b) => a.artifact.id.localeCompare(b.artifact.id));
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
function statusAllowsPublication(status) {
  return status === "valid" || status === "superseded";
}

// src/models.ts
var INQUIRY_SCHEMA_VERSION = 2;
var LEGACY_INQUIRY_SCHEMA_VERSION = 1;

// src/reproducibility.ts
function reproducibilityStatus(codeFingerprint, runProvenance) {
  const hasCode = typeof codeFingerprint === "string" && codeFingerprint.trim().length > 0;
  const hasRun = runProvenance !== null && typeof runProvenance === "object" && Object.keys(runProvenance).length > 0;
  if (hasCode && hasRun) return "reproducible";
  if (hasCode || hasRun) return "partial";
  return "not-reproducible";
}

// src/provenance.ts
var MAX_PARENT_CHAIN = 20;
function runProvenanceFor(artifact, attempts) {
  if (artifact.runProvenance && Object.keys(artifact.runProvenance).length > 0)
    return artifact.runProvenance;
  const candidate = attempts.find(
    (attempt) => attempt.runProvenance && Object.keys(attempt.runProvenance).length > 0
  );
  return candidate?.runProvenance;
}
function artifactProvenance(snapshot, artifactId) {
  const artifact = snapshot.artifacts.find((item) => item.id === artifactId);
  if (!artifact) return void 0;
  const byId = new Map(snapshot.artifacts.map((item) => [item.id, item]));
  const attempts = snapshot.attempts.filter((attempt) => attempt.artifactIds.includes(artifact.id));
  const parentChain = [];
  const queue = [...artifact.parentIds];
  const visited = /* @__PURE__ */ new Set([artifact.id]);
  let parentChainTruncated = false;
  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId || visited.has(parentId)) continue;
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) continue;
    if (parentChain.length >= MAX_PARENT_CHAIN) {
      parentChainTruncated = true;
      break;
    }
    parentChain.push(parent);
    queue.push(...parent.parentIds);
  }
  if (queue.length > 0) parentChainTruncated = true;
  const runProvenance = runProvenanceFor(artifact, attempts);
  const sourceAttemptSession = attempts.find((attempt) => attempt.sessionId);
  const sourceAttemptTurn = attempts.find((attempt) => attempt.turn !== void 0);
  const codeFingerprint = attempts.find((attempt) => attempt.codeFingerprint)?.codeFingerprint;
  const rerun = [...snapshot.reruns ?? []].filter((item) => item.sourceArtifactId === artifact.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    artifact,
    parentChain,
    parentChainTruncated,
    attempts,
    ...runProvenance ? { runProvenance } : {},
    ...artifact.sessionId || sourceAttemptSession?.sessionId ? { sourceSessionId: artifact.sessionId ?? sourceAttemptSession?.sessionId } : {},
    ...artifact.turn !== void 0 || sourceAttemptTurn?.turn !== void 0 ? { sourceTurn: artifact.turn ?? sourceAttemptTurn?.turn } : {},
    reproducibility: reproducibilityStatus(codeFingerprint, runProvenance),
    ...rerun ? { rerun } : {}
  };
}

// src/workspace.ts
import { relative, resolve, sep } from "node:path";
function workspaceLayout(projectRoot) {
  const root = resolve(projectRoot);
  return {
    projectRoot: root,
    inputsRoot: resolve(root, "inputs"),
    runsRoot: resolve(root, "runs"),
    resultsRoot: resolve(root, "results"),
    reportsRoot: resolve(root, "reports"),
    ledgerRoot: resolve(root, ".drone"),
    indexPath: resolve(root, "results", "index.json")
  };
}
function validateWorkspaceRelativePath(path) {
  return isSafeArtifactPath(path) && !path.split(/[\\/]/).includes(".drone");
}
function assertWithin(root, path) {
  const resolved = resolve(root, path);
  const rel = relative(root, resolved);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`))
    throw new Error("Workspace path escapes project root");
}
function planWorkspacePromotion(input) {
  if (input.run.state !== "frozen") throw new Error("Only frozen runs can be promoted");
  const selected = input.artifacts.filter((artifact) => artifact.runId === input.run.id && artifact.status === "valid").sort((a, b) => a.id.localeCompare(b.id));
  const relativeResultPath = (artifact) => {
    const relativePath = artifact.path.replaceAll("\\", "/").replace(/^runs\/(?:[^/]+)\/(?:[^/]+)\/?/, "");
    return `results/${input.run.taskId}/${input.run.id}/${relativePath || artifact.id}`;
  };
  const moves = selected.map((artifact) => {
    if (!validateWorkspaceRelativePath(artifact.path))
      throw new Error(`Unsafe workspace artifact path: ${artifact.path}`);
    const sourcePath = resolve(input.layout.projectRoot, artifact.path);
    const resultPath = relativeResultPath(artifact);
    assertWithin(input.layout.projectRoot, sourcePath);
    assertWithin(input.layout.projectRoot, resultPath);
    return {
      from: sourcePath,
      to: resolve(input.layout.projectRoot, resultPath),
      artifactId: artifact.id
    };
  });
  const indexEntries = selected.map((artifact) => ({
    artifactId: artifact.id,
    sourcePath: artifact.path,
    resultPath: relativeResultPath(artifact),
    sha256: artifact.sha256,
    bytes: artifact.bytes,
    purpose: artifact.purpose
  }));
  return { runId: input.run.id, moves, indexEntries };
}
async function promoteWorkspaceRun(input) {
  for (const move of input.plan.moves) await input.files.move(move.from, move.to);
  await input.files.writeIndex(input.layout.indexPath, input.plan.indexEntries);
  return { ...input.plan, promotedAt: (/* @__PURE__ */ new Date()).toISOString(), indexPath: input.layout.indexPath };
}
async function cleanupDryRun(storage, options = {}) {
  const snapshot = await storage.snapshot();
  return {
    candidates: cleanupCandidates(snapshot, options),
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    destructive: false
  };
}
function workspaceIndexForSnapshot(snapshot) {
  const referenced = new Set(
    snapshot.artifacts.filter((artifact) => artifact.status === "valid").map((artifact) => artifact.id)
  );
  return snapshot.artifacts.filter((artifact) => referenced.has(artifact.id) && artifact.purpose === "deliverable").sort((a, b) => a.id.localeCompare(b.id)).map((artifact) => ({
    artifactId: artifact.id,
    sourcePath: artifact.path,
    resultPath: artifact.path.startsWith("results/") ? artifact.path : `results/${artifact.path}`,
    sha256: artifact.sha256,
    bytes: artifact.bytes,
    purpose: artifact.purpose
  }));
}

// src/service.ts
var InquiryService = class {
  constructor(storage, options = {}) {
    this.storage = storage;
    this.rerunHandler = options.rerunHandler;
  }
  rerunHandler;
  setRerunHandler(handler) {
    this.rerunHandler = handler;
  }
  async recordArtifact(record) {
    const snapshot = await this.storage.snapshot();
    const errors = validateArtifactLineage(record, snapshot.artifacts);
    if (errors.length) throw new Error(`Invalid artifact record: ${errors.join("; ")}`);
    const existing = snapshot.artifacts.find((item) => item.id === record.id);
    const parents = snapshot.artifacts.filter((item) => record.parentIds.includes(item.id));
    const pending = [
      .../* @__PURE__ */ new Set([
        ...existing?.pendingReviewDecisionIds ?? [],
        ...parents.flatMap((item) => item.pendingReviewDecisionIds ?? []),
        ...snapshot.decisions.filter(
          (item) => item.status === "revoked" && item.affectedArtifactIds.includes(record.id) && !existing?.reviews?.some((review) => review.decisionId === item.id)
        ).map((item) => item.id)
      ])
    ];
    await this.storage.artifacts.put({
      ...record,
      ...existing?.reviews ? { reviews: existing.reviews } : {},
      ...pending.length ? { status: "pending-review", pendingReviewDecisionIds: pending } : {},
      ...!pending.length && (existing?.status === "pending-review" || parents.some((item) => item.status === "pending-review")) ? { status: "pending-review" } : {}
    });
  }
  async recordFinding(record) {
    const snapshot = await this.storage.snapshot();
    const errors = validateFindingReferences(record, snapshot);
    if (errors.length) throw new Error(`Invalid finding record: ${errors.join("; ")}`);
    await this.storage.findings.put(record);
  }
  async recordQuestion(record) {
    if (record.schemaVersion !== INQUIRY_SCHEMA_VERSION && record.schemaVersion !== LEGACY_INQUIRY_SCHEMA_VERSION || record.projectId !== this.storage.projectId || !record.statement.trim())
      throw new Error("Invalid question record");
    await this.storage.questions.put(record);
  }
  async recordAttempt(record) {
    if (record.schemaVersion !== INQUIRY_SCHEMA_VERSION && record.schemaVersion !== LEGACY_INQUIRY_SCHEMA_VERSION || record.projectId !== this.storage.projectId)
      throw new Error("Invalid attempt record");
    await this.storage.attempts.put(record);
  }
  async recordDecision(record) {
    if (record.schemaVersion !== INQUIRY_SCHEMA_VERSION || record.projectId !== this.storage.projectId || !record.id.trim() || !record.summary.trim() || !Array.isArray(record.basis) || !Array.isArray(record.affectedArtifactIds))
      throw new Error("Invalid decision record");
    const existing = await this.storage.decisions.get(record.id);
    const next = existing ? {
      ...record,
      ...existing,
      affectedArtifactIds: [
        .../* @__PURE__ */ new Set([...existing.affectedArtifactIds, ...record.affectedArtifactIds])
      ]
    } : record;
    await this.storage.decisions.put(next);
    if (next.status === "revoked") await this.markPendingReview(next);
  }
  async listDecisions(projectId = this.storage.projectId) {
    if (projectId !== this.storage.projectId)
      throw new Error("Decision project does not match inquiry project");
    return [...await this.storage.decisions.list()].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    );
  }
  /**
   * Revocation is deliberately a ledger-only operation. It never calls a
   * compute, Zotero, task, or other external adapter. Affected artifacts and
   * every descendant in the immutable parentIds graph become pending review.
   */
  async revokeDecision(id, reason, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const decision = await this.storage.decisions.get(id);
    if (!decision) throw new Error(`Decision not found: ${id}`);
    if (decision.status === "revoked") return decision;
    const revoked = {
      ...decision,
      status: "revoked",
      revokedAt: now,
      revokeReason: reason.trim() || "Revoked by user"
    };
    await this.markPendingReview(revoked);
    await this.storage.decisions.put(revoked);
    return revoked;
  }
  /** Associate a successful execution's later artifacts with its original receipt. */
  async associateDecisionArtifacts(id, artifactIds) {
    const record = await this.storage.decisions.get(id);
    if (!record) throw new Error(`Decision not found: ${id}`);
    await this.recordDecision({
      ...record,
      affectedArtifactIds: [...record.affectedArtifactIds, ...artifactIds]
    });
  }
  async markPendingReview(decision) {
    const snapshot = await this.storage.snapshot();
    const affected = new Set(decision.affectedArtifactIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const artifact of snapshot.artifacts) {
        if (!affected.has(artifact.id) && artifact.parentIds.some((parentId) => affected.has(parentId))) {
          affected.add(artifact.id);
          changed = true;
        }
      }
    }
    for (const artifact of snapshot.artifacts) {
      if (!affected.has(artifact.id) || artifact.reviews?.some((review) => review.decisionId === decision.id))
        continue;
      await this.storage.artifacts.put({
        ...artifact,
        status: "pending-review",
        pendingReviewDecisionIds: [
          .../* @__PURE__ */ new Set([...artifact.pendingReviewDecisionIds ?? [], decision.id])
        ],
        updatedAt: decision.revokedAt ?? (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  /** Explicit human acknowledgement; each independent revocation must be reviewed. */
  async confirmDecision(id, reason, now = (/* @__PURE__ */ new Date()).toISOString()) {
    const decision = await this.storage.decisions.get(id);
    if (decision?.status !== "revoked") throw new Error("Only revoked decisions can be reviewed");
    if (!reason.trim()) throw new Error("A human review reason is required");
    const snapshot = await this.storage.snapshot();
    for (const artifact of snapshot.artifacts) {
      if (!artifact.pendingReviewDecisionIds?.includes(id)) continue;
      const pending = artifact.pendingReviewDecisionIds.filter((item) => item !== id);
      await this.storage.artifacts.put({
        ...artifact,
        status: pending.length ? "pending-review" : "valid",
        pendingReviewDecisionIds: pending,
        reviews: [
          ...artifact.reviews ?? [],
          { decisionId: id, confirmedBy: "user", confirmedAt: now, reason }
        ],
        updatedAt: now
      });
    }
    return decision;
  }
  /** Compatibility alias for host adapters that used the earlier review name. */
  async reviewDecisionArtifacts(id, reason, now = (/* @__PURE__ */ new Date()).toISOString()) {
    return this.confirmDecision(id, reason, now);
  }
  async cleanupDryRun(options = {}) {
    return cleanupDryRun(this.storage, options);
  }
  async planPromotion(input) {
    const snapshot = await this.storage.snapshot();
    return planWorkspacePromotion({
      layout: input.layout,
      run: input.run,
      artifacts: snapshot.artifacts
    });
  }
  async promote(input) {
    return promoteWorkspaceRun(input);
  }
  async snapshot() {
    return this.storage.snapshot();
  }
  async artifactProvenance(artifactId) {
    if (typeof artifactId !== "string" || !artifactId.trim() || artifactId.length > 512 || [...artifactId].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    ))
      return void 0;
    return artifactProvenance(await this.storage.snapshot(), artifactId);
  }
  async rerunArtifact(artifactId) {
    const provenance = await this.artifactProvenance(artifactId);
    if (!provenance) throw new Error(`Artifact not found: ${artifactId}`);
    if (provenance.reproducibility !== "reproducible")
      throw new Error("Artifact is not reproducible");
    if (!this.rerunHandler) throw new Error("Artifact rerun is unavailable");
    const existing = [...await this.storage.reruns.list()].filter((item) => item.sourceArtifactId === provenance.artifact.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (existing && (existing.status === "submitted" || existing.status === "running"))
      return this.rerunResult(existing);
    const submitted = await this.rerunHandler(provenance);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if ("id" in submitted && !("jobId" in submitted)) {
      const rerun2 = {
        id: `rerun:${provenance.artifact.id}:${submitted.id}`,
        schemaVersion: 2,
        projectId: this.storage.projectId,
        sourceArtifactId: provenance.artifact.id,
        artifact: provenance.artifact,
        jobId: submitted.id,
        status: "running",
        previousSha256: provenance.artifact.sha256,
        submittedAt: now,
        updatedAt: now
      };
      await this.storage.reruns.put(rerun2);
      return await this.completeRerun(rerun2.id, { artifact: submitted });
    }
    if (!submitted || typeof submitted.jobId !== "string" || !submitted.jobId.trim())
      throw new Error("Rerun submission did not return a job id");
    const rerun = {
      id: `rerun:${provenance.artifact.id}:${submitted.jobId}`,
      schemaVersion: 2,
      projectId: this.storage.projectId,
      sourceArtifactId: provenance.artifact.id,
      artifact: provenance.artifact,
      jobId: submitted.jobId,
      status: "submitted",
      previousSha256: provenance.artifact.sha256,
      submittedAt: now,
      updatedAt: now
    };
    await this.storage.reruns.put(rerun);
    return this.rerunResult(rerun);
  }
  async pendingReruns() {
    return (await this.storage.reruns.list()).filter(
      (item) => item.status === "submitted" || item.status === "running"
    );
  }
  async markRerunRunning(rerunId) {
    const rerun = await this.storage.reruns.get(rerunId);
    if (rerun?.status !== "submitted") return rerun;
    const next = { ...rerun, status: "running", updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await this.storage.reruns.put(next);
    return next;
  }
  async completeRerun(rerunId, outcome) {
    const rerun = await this.storage.reruns.get(rerunId);
    if (!rerun) return void 0;
    if (!["submitted", "running"].includes(rerun.status)) return this.rerunResult(rerun);
    if ("error" in outcome) {
      const failed = {
        ...rerun,
        status: "failed",
        error: outcome.error.slice(0, 4096),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await this.storage.reruns.put(failed);
      return this.rerunResult(failed);
    }
    const next = outcome.artifact;
    if (next.projectId !== this.storage.projectId)
      throw new Error("Rerun artifact belongs to another project");
    if (next.sha256 === rerun.previousSha256) {
      const reproduced = {
        ...rerun,
        status: "reproduced",
        resultArtifactId: next.id,
        sha256: next.sha256,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await this.storage.reruns.put(reproduced);
      return this.rerunResult(reproduced);
    }
    const superseded = {
      ...rerun.artifact,
      status: "superseded",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await this.storage.artifacts.put(superseded);
    await this.recordArtifact(next);
    const completed = {
      ...rerun,
      status: "superseded",
      resultArtifactId: next.id,
      sha256: next.sha256,
      difference: "sha256 differs from the original artifact",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await this.storage.reruns.put(completed);
    return this.rerunResult(completed);
  }
  rerunResult(rerun) {
    return {
      status: rerun.status,
      jobId: rerun.jobId,
      previousArtifactId: rerun.sourceArtifactId,
      previousSha256: rerun.previousSha256,
      ...rerun.resultArtifactId ? { artifactId: rerun.resultArtifactId } : {},
      ...rerun.sha256 ? { sha256: rerun.sha256 } : {},
      ...rerun.difference ? { difference: rerun.difference } : {},
      ...rerun.error ? { error: rerun.error } : {}
    };
  }
  /** Read-only projection used by the desktop panel. */
  async readOnlyState() {
    const snapshot = await this.storage.snapshot();
    return {
      projectId: snapshot.projectId,
      revision: snapshot.revision,
      artifacts: snapshot.artifacts,
      findings: snapshot.findings,
      questions: snapshot.questions,
      decisions: [...snapshot.decisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      reruns: snapshot.reruns ?? [],
      cleanupCandidates: cleanupCandidates(snapshot)
    };
  }
};
function decisionRecord(input) {
  return {
    id: input.id,
    schemaVersion: INQUIRY_SCHEMA_VERSION,
    projectId: input.projectId,
    kind: input.kind,
    summary: input.summary,
    basis: [...new Set(input.basis ?? [])],
    affectedArtifactIds: [...new Set(input.affectedArtifactIds ?? [])],
    status: "active",
    createdAt: input.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/storage-contract.ts
var INQUIRY_STORAGE_IDS = Object.freeze({
  root: "inquiry-root",
  ledger: "inquiry-ledger"
});
function registerInquiryStorage(registry, rootPath) {
  if (!rootPath.trim()) throw new Error("Inquiry storage root cannot be empty");
  const entries = [
    {
      id: INQUIRY_STORAGE_IDS.root,
      path: rootPath,
      owner: "inquiry",
      schema: 1,
      sensitivity: "private"
    },
    {
      id: INQUIRY_STORAGE_IDS.ledger,
      path: `${rootPath.replace(/[\\/]$/, "")}/ledger.sqlite`,
      owner: "inquiry/ledger",
      schema: 1,
      sensitivity: "private"
    }
  ];
  for (const entry of entries) registry.register(entry);
  return entries;
}
export {
  INQUIRY_SCHEMA_VERSION,
  INQUIRY_STORAGE_IDS,
  InquiryEventProjector,
  InquiryService,
  LEGACY_INQUIRY_SCHEMA_VERSION,
  artifactProvenance,
  cleanupCandidates,
  cleanupDryRun,
  decisionRecord,
  isSafeArtifactPath,
  planWorkspacePromotion,
  promoteWorkspaceRun,
  registerInquiryStorage,
  reproducibilityStatus,
  statusAllowsPublication,
  validateArtifactLineage,
  validateArtifactRecord,
  validateFindingReferences,
  validateWorkspaceRelativePath,
  workspaceIndexForSnapshot,
  workspaceLayout
};
