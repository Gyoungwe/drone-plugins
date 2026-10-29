// @ts-nocheck
// src/native-runtime.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash as createHash2, randomBytes, randomUUID as randomUUID3 } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { dirname, isAbsolute as isAbsolute2, join, relative as relative2, sep } from "node:path";
import { homedir } from "node:os";
import {
  ContainerSandboxRunner,
  describeContainerExecution,
  ExecutionTransactions,
  NodeExecutionReceiptStorage,
  prepareSandboxRunDirectory
} from "@gyoungwe/plugin-api/node/execution";
import { PluginResourceReservations } from "@gyoungwe/plugin-api/node/reservations";

// src/runtime.ts
import { createHash } from "node:crypto";

// src/inquiry-provider.ts
function inquiryProvider(capabilities, discoveryProjectId) {
  const write = async (action, record) => {
    if (record.projectId !== discoveryProjectId)
      throw new Error("Discovery record belongs to another project");
    const inspection = await capabilities.call("provider.inspect", {
      alias: "inquiry"
    });
    if (inspection.state !== "available")
      throw new Error(`Inquiry provider is ${inspection.state}`);
    const status = await capabilities.call("provider.read", {
      alias: "inquiry",
      operation: "inquiry.read",
      input: { action: "status" }
    });
    if (status.state !== "bound" || typeof status.projectId !== "string" || !status.projectId)
      throw new Error(
        "Bind the original Inquiry ledger to this actual workspace first"
      );
    await capabilities.call("provider.write", {
      alias: "inquiry",
      operation: "inquiry.write",
      input: { action, record: { ...record, projectId: status.projectId } }
    });
  };
  return {
    recordQuestion: (record) => write("recordQuestion", record),
    recordAttempt: (record) => write("recordAttempt", record),
    recordFinding: (record) => write("recordFinding", record)
  };
}

// src/service.ts
import { isAbsolute, relative, resolve } from "node:path";

// src/domain/deadline.ts
async function withDeadline(operation, timeoutMs, reason) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(reason)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// src/domain/validation.ts
var MAX_ID_LENGTH = 128;
var MAX_TEXT_LENGTH = 64e3;
var MAX_CODE_LENGTH = 1e6;
function nonEmptyText(value, max = MAX_TEXT_LENGTH) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function safeId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}
function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function positiveFinite(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function boundedInteger(value, min, max) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function isoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function safeRunPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0"))
    return false;
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value))
    return false;
  const parts = value.replaceAll("\\", "/").split("/");
  return parts[0] === "runs" && parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}
function stableJson(value) {
  return JSON.stringify(value, (_key, nested) => {
    if (!nested || typeof nested !== "object" || Array.isArray(nested))
      return nested;
    return Object.fromEntries(
      Object.entries(nested).sort(([a], [b]) => a.localeCompare(b))
    );
  });
}
function assertValid(condition, message) {
  if (!condition) throw new Error(message);
}

// src/domain/critic.ts
var CRITIC_CHECKLIST = [
  "confounding",
  "batch-effect",
  "multiple-testing",
  "data-leakage",
  "circular-analysis",
  "overclaiming"
];
var CRITIC_ROLE = Object.freeze({
  id: "critic",
  readOnly: true,
  canWrite: false,
  canShell: false,
  canNetwork: false,
  canDelegate: false,
  checklist: CRITIC_CHECKLIST
});
function validateQuestion(question) {
  assertValid(
    CRITIC_CHECKLIST.includes(question.checklistItem),
    "invalid critic checklist item"
  );
  assertValid(
    nonEmptyText(question.question, 1e4),
    "critic question is invalid"
  );
  assertValid(
    ["high", "medium", "low"].includes(question.severity),
    "critic severity is invalid"
  );
  for (const id of question.evidenceArtifactIds)
    assertValid(safeId(id), "critic evidence artifact id is invalid");
}
async function runCriticReview(request, provider, options = {}) {
  assertValid(safeId(request.findingId), "finding id is invalid");
  assertValid(
    nonEmptyText(request.findingStatement, 2e4),
    "finding statement is invalid"
  );
  assertValid(
    safeId(request.primaryProviderId),
    "primary provider id is invalid"
  );
  for (const id of request.artifactIds)
    assertValid(safeId(id), "artifact id is invalid");
  const checklist = request.checklist ?? CRITIC_CHECKLIST;
  assertValid(
    checklist.length > 0 && checklist.every((item) => CRITIC_CHECKLIST.includes(item)),
    "invalid critic checklist"
  );
  const timeoutMs = options.timeoutMs ?? 3e4;
  const maxQuestions = options.maxQuestions ?? 64;
  assertValid(
    boundedInteger(timeoutMs, 1, 6e5),
    "critic timeout is invalid"
  );
  assertValid(
    boundedInteger(maxQuestions, 1, 256),
    "critic question limit is invalid"
  );
  if (!provider || provider.providerId === request.primaryProviderId)
    return {
      status: "needs-independent-provider",
      questions: [],
      reason: "critic provider must be independent of the primary provider"
    };
  try {
    const questions = await withDeadline(
      provider.review({ ...request, checklist, role: CRITIC_ROLE }),
      timeoutMs,
      "critic-timeout"
    );
    assertValid(
      Array.isArray(questions) && questions.length <= maxQuestions,
      "critic returned too many questions"
    );
    for (const question of questions) validateQuestion(question);
    return { status: "complete", providerId: provider.providerId, questions };
  } catch (error) {
    return {
      status: "blocked",
      questions: [],
      reason: error instanceof Error ? error.message : "critic-failure"
    };
  }
}
async function recordCriticQuestions(port, input) {
  assertValid(safeId(input.projectId), "projectId is invalid");
  assertValid(safeId(input.findingId), "finding id is invalid");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const records2 = input.questions.map((question, index) => {
    validateQuestion(question);
    return {
      id: `critic:${input.findingId}:${index + 1}`,
      schemaVersion: 1,
      projectId: input.projectId,
      kind: "question",
      statement: `[${question.checklistItem}] ${question.question}`,
      competingExplanations: [],
      testsDone: [],
      testsPlanned: [],
      status: "open",
      proposer: "agent",
      priority: question.severity === "high" ? 1 : question.severity === "medium" ? 0.7 : 0.4,
      createdAt: now,
      updatedAt: now
    };
  });
  for (const record of records2) await port.recordQuestion(record);
  return records2;
}
function createMultiPathPlan(input) {
  assertValid(safeId(input.id), "multi-path plan id is invalid");
  assertValid(safeId(input.findingId), "finding id is invalid");
  assertValid(
    input.paths.length >= 5 && input.paths.length <= 10,
    "multi-path plans require 5 to 10 paths"
  );
  assertValid(
    input.intent === "exploratory" || input.intent === "confirmatory",
    "analysis intent is invalid"
  );
  for (const path of input.paths) {
    assertValid(safeId(path.id), "analysis path id is invalid");
    assertValid(
      nonEmptyText(path.description, 1e4),
      "analysis path description is invalid"
    );
  }
  assertValid(
    new Set(input.paths.map((path) => path.id)).size === input.paths.length,
    "analysis path ids must be unique"
  );
  if (input.intent === "confirmatory")
    assertValid(
      input.priorRegistered,
      "confirmatory analysis requires a registered prior"
    );
  return { ...input, paths: [...input.paths] };
}
async function executeMultiPath(plan, executor, options = {}) {
  const timeoutMs = options.timeoutMs ?? 6e4;
  assertValid(
    boundedInteger(timeoutMs, 1, 864e5),
    "multi-path timeout is invalid"
  );
  const records2 = [];
  for (const path of plan.paths) {
    const started = Date.now();
    let result;
    try {
      result = await withDeadline(executor(path), timeoutMs, "path-timeout");
      assertValid(
        ["succeeded", "failed", "blocked", "unknown"].includes(result.outcome),
        "invalid path outcome"
      );
      assertValid(safeId(result.signature), "path signature is invalid");
      assertValid(
        nonEmptyText(result.summary, 2e4),
        "path summary is invalid"
      );
    } catch (error) {
      result = {
        outcome: "blocked",
        signature: "executor-failure",
        summary: error instanceof Error ? error.message : "path-failure",
        consistentWithReference: false
      };
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const attempt = {
      id: `multipath:${plan.id}:${path.id}`,
      schemaVersion: 1,
      projectId: options.projectId ?? "discovery",
      hypothesisIds: options.hypothesisId ? [options.hypothesisId] : [],
      parameters: path.parameters ?? {},
      artifactIds: result.artifactIds ?? [],
      resultSummary: result.summary,
      outcome: result.outcome,
      enteredReport: false,
      startedAt: now,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const record = {
      pathId: path.id,
      outcome: result.outcome,
      signature: result.signature,
      summary: result.summary,
      consistentWithReference: result.consistentWithReference,
      durationMs: Date.now() - started,
      attempt
    };
    records2.push(record);
    if (options.inquiry) {
      assertValid(
        options.projectId,
        "projectId is required when recording multipath attempts"
      );
      await options.inquiry.recordAttempt(attempt);
    }
  }
  const consistentCount = records2.filter(
    (record) => record.outcome === "succeeded" && record.consistentWithReference
  ).length;
  const consistency = records2.length ? consistentCount / records2.length : 0;
  const grade = records2.some(
    (record) => record.outcome === "blocked" || record.outcome === "unknown"
  ) && consistentCount === 0 ? "unknown" : consistency >= 0.8 ? "robust" : consistency >= 0.5 ? "sensitive" : "unstable";
  return {
    grade,
    attemptCount: records2.length,
    consistentCount,
    consistency,
    label: plan.intent,
    paths: records2
  };
}

// src/domain/evaluation.ts
import { randomUUID } from "node:crypto";
var DISCOVERY_EVALUATION_METRICS = [
  "bixbench-regression",
  "rediscovery-rate",
  "inconsistency-interception-rate",
  "confounder-detection-rate",
  "clue-hit-rate",
  "verification-time-ms",
  "repeated-failure-count"
];
function createBaseline(input) {
  const result = {
    ...input,
    recordedAt: input.recordedAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
  validateBaseline(result);
  return result;
}
function validateBaseline(item) {
  assertValid(
    DISCOVERY_EVALUATION_METRICS.includes(item.metric),
    "baseline metric is invalid"
  );
  assertValid(safeId(item.datasetId), "baseline dataset id is invalid");
  assertValid(
    nonEmptyText(item.datasetRevision, 256),
    "baseline revision is invalid"
  );
  assertValid(finiteNonNegative(item.value), "baseline value is invalid");
  const expectedUnit = item.metric.endsWith("rate") ? "ratio" : item.metric === "verification-time-ms" ? "milliseconds" : item.metric === "repeated-failure-count" ? "count" : "score";
  assertValid(
    item.unit === expectedUnit,
    "baseline unit does not match metric"
  );
  assertValid(safeId(item.runId), "baseline run id is invalid");
  assertValid(isoDate(item.recordedAt), "baseline timestamp is invalid");
  assertValid(
    item.source === "fixture" || item.source === "external",
    "baseline source is invalid"
  );
}
async function legacy(items, evaluator) {
  const metrics = [];
  const missingData = [];
  const blockedCases = [];
  for (const item of items) {
    if (item.datasetStatus === "missing") {
      missingData.push(item.id);
      continue;
    }
    try {
      const result = await evaluator(item);
      if (!finiteNonNegative(result.value))
        throw new Error("invalid evaluation value");
      metrics.push({
        id: item.id,
        metric: item.metric,
        value: result.value,
        passed: true
      });
    } catch {
      blockedCases.push(item.id);
    }
  }
  return {
    status: blockedCases.length ? "blocked" : missingData.length ? "needs-data" : "complete",
    metrics,
    missingData,
    blockedCases
  };
}
async function runEvaluation(items, evaluator, store, options = {}) {
  if (!items.length) throw new Error("evaluation requires at least one case");
  if ("expectedFindingIds" in items[0])
    return legacy(items, evaluator);
  assertValid(
    store && typeof store.get === "function",
    "baseline store is required"
  );
  const cases = items;
  assertValid(
    new Set(cases.map((item) => item.id)).size === cases.length,
    "evaluation case ids must be unique"
  );
  for (const item of cases) {
    assertValid(safeId(item.id), "evaluation case id is invalid");
    assertValid(
      DISCOVERY_EVALUATION_METRICS.includes(item.metric),
      "evaluation metric is invalid"
    );
    assertValid(safeId(item.datasetId), "evaluation dataset id is invalid");
    assertValid(
      nonEmptyText(item.datasetRevision, 256),
      "evaluation dataset revision is invalid"
    );
    assertValid(
      item.datasetStatus === "fixture" || item.datasetStatus === "external" || item.datasetStatus === "missing",
      "evaluation dataset status is invalid"
    );
    assertValid(
      nonEmptyText(item.description, 2e4),
      "evaluation description is invalid"
    );
  }
  const timeoutMs = options.timeoutMs ?? 6e4;
  assertValid(
    boundedInteger(timeoutMs, 1, 864e5),
    "evaluation timeout is invalid"
  );
  const runId = options.runId ?? `evaluation-${randomUUID()}`;
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const observations = {};
  const blockedCases = [];
  const missingData = cases.filter((item) => item.datasetStatus === "missing").map((item) => item.id);
  for (const item of cases) {
    if (item.datasetStatus === "missing") continue;
    try {
      const result = await withDeadline(
        evaluator(item),
        timeoutMs,
        "evaluation-timeout"
      );
      assertValid(
        finiteNonNegative(result.value),
        "evaluation value is invalid"
      );
      if (item.metric.endsWith("rate") || item.metric === "bixbench-regression")
        assertValid(
          result.value <= 1,
          "ratio/score must be between zero and one"
        );
      if (item.metric === "repeated-failure-count")
        assertValid(
          Number.isSafeInteger(result.value),
          "failure count must be an integer"
        );
      observations[item.id] = result;
    } catch {
      blockedCases.push(item.id);
    }
  }
  const metrics = [];
  for (const metric of DISCOVERY_EVALUATION_METRICS) {
    const selected = cases.filter(
      (item) => item.metric === metric && observations[item.id]
    );
    if (!selected.length) continue;
    const values = selected.map(
      (item) => observations[item.id]?.verificationTimeMs ?? observations[item.id]?.value ?? 0
    );
    const value = metric === "verification-time-ms" ? median(values) : metric === "repeated-failure-count" ? values.reduce((sum, item) => sum + item, 0) : values.reduce((sum, item) => sum + item, 0) / values.length;
    const first = selected[0];
    const baseline = await store.get(
      metric,
      first.datasetId,
      first.datasetRevision
    );
    const lower = metric === "verification-time-ms" || metric === "repeated-failure-count";
    metrics.push({
      metric,
      value,
      ...baseline ? { baseline: baseline.value, delta: value - baseline.value } : {},
      passed: baseline ? lower ? value <= baseline.value : value >= baseline.value : false,
      baselineAvailable: Boolean(baseline),
      caseIds: selected.map((item) => item.id)
    });
  }
  return {
    runId,
    status: blockedCases.length ? "blocked" : missingData.length || metrics.some((item) => !item.baselineAvailable) ? "needs-data" : "complete",
    startedAt,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    metrics,
    observations,
    missingData,
    blockedCases
  };
}
function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] ?? 0 : ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2;
}

// src/domain/exploration.ts
var ExplorationBudgetError = class extends Error {
  code = "exploration-budget-exceeded";
};
function validateBudget(budget) {
  assertValid(
    boundedInteger(budget.maxExecutions, 1, 1e6),
    "maxExecutions is invalid"
  );
  assertValid(
    boundedInteger(budget.maxWallTimeMs, 1, 365 * 24 * 60 * 6e4),
    "maxWallTimeMs is invalid"
  );
  assertValid(
    boundedInteger(budget.maxOutputBytes, 1, Number.MAX_SAFE_INTEGER),
    "maxOutputBytes is invalid"
  );
  assertValid(positiveFinite(budget.maxCostUnits), "maxCostUnits is invalid");
}
function validatePrior(prior) {
  assertValid(prior && isoDate(prior.recordedAt), "prior timestamp is invalid");
  assertValid(
    ["positive", "negative", "none", "unknown"].includes(prior.direction),
    "prior direction is invalid"
  );
  if (prior.magnitude !== void 0)
    assertValid(
      finiteNonNegative(prior.magnitude),
      "prior magnitude is invalid"
    );
  if (prior.confidence !== void 0)
    assertValid(
      prior.confidence >= 0 && prior.confidence <= 1,
      "prior confidence is invalid"
    );
}
var ExplorationBudgetLedger = class {
  constructor(budget) {
    this.budget = budget;
    validateBudget(budget);
  }
  current = {
    executions: 0,
    wallTimeMs: 0,
    outputBytes: 0,
    costUnits: 0
  };
  get usage() {
    return { ...this.current };
  }
  reserve(input) {
    assertValid(
      boundedInteger(input.executions, 0, this.budget.maxExecutions),
      "usage executions are invalid"
    );
    assertValid(
      finiteNonNegative(input.wallTimeMs),
      "usage wall time is invalid"
    );
    assertValid(
      finiteNonNegative(input.outputBytes),
      "usage output bytes is invalid"
    );
    assertValid(finiteNonNegative(input.costUnits), "usage cost is invalid");
    const next = {
      executions: this.current.executions + input.executions,
      wallTimeMs: this.current.wallTimeMs + input.wallTimeMs,
      outputBytes: this.current.outputBytes + input.outputBytes,
      costUnits: this.current.costUnits + input.costUnits
    };
    if (next.executions > this.budget.maxExecutions || next.wallTimeMs > this.budget.maxWallTimeMs || next.outputBytes > this.budget.maxOutputBytes || next.costUnits > this.budget.maxCostUnits)
      throw new ExplorationBudgetError("exploration budget exceeded");
    this.current = next;
    return this.usage;
  }
};
function computeSurprise(prior, posterior) {
  validatePrior(prior);
  assertValid(
    posterior && isoDate(posterior.recordedAt),
    "posterior timestamp is invalid"
  );
  assertValid(
    Date.parse(posterior.recordedAt) >= Date.parse(prior.recordedAt),
    "posterior predates prior"
  );
  if (posterior.magnitude !== void 0)
    assertValid(
      finiteNonNegative(posterior.magnitude),
      "posterior magnitude is invalid"
    );
  if (posterior.confidence !== void 0)
    assertValid(
      posterior.confidence >= 0 && posterior.confidence <= 1,
      "posterior confidence is invalid"
    );
  const directionChange = posterior.direction && posterior.direction !== "unknown" && posterior.direction !== prior.direction ? 0.5 : 0;
  const magnitudeChange = Math.min(
    1,
    Math.abs(
      (posterior.magnitude ?? prior.magnitude ?? 0) - (prior.magnitude ?? 0)
    ) / Math.max(1, Math.abs(prior.magnitude ?? 0))
  );
  const confidenceChange = Math.min(
    1,
    Math.abs(
      (posterior.confidence ?? prior.confidence ?? 0.5) - (prior.confidence ?? 0.5)
    )
  );
  return Math.min(
    1,
    directionChange + magnitudeChange * 0.35 + confidenceChange * 0.15
  );
}
function rankExplorationCandidates(candidates) {
  for (const candidate of candidates) {
    assertValid(safeId(candidate.id), "candidate id is invalid");
    assertValid(
      nonEmptyText(candidate.statement, 1e4),
      "candidate statement is invalid"
    );
    assertValid(
      finiteNonNegative(candidate.surprise) && candidate.surprise <= 1,
      "candidate surprise is invalid"
    );
    assertValid(
      positiveFinite(candidate.estimatedCost),
      "candidate cost is invalid"
    );
    assertValid(
      finiteNonNegative(candidate.expectedExplanationsExcluded),
      "candidate discrimination is invalid"
    );
    assertValid(
      finiteNonNegative(candidate.credibility) && candidate.credibility <= 1,
      "candidate credibility is invalid"
    );
  }
  return [...candidates].sort(
    (a, b) => b.expectedExplanationsExcluded / b.estimatedCost - a.expectedExplanationsExcluded / a.estimatedCost || b.surprise - a.surprise || a.id.localeCompare(b.id)
  );
}
function validateCompetitiveExplanations(explanations) {
  const errors = [];
  if (explanations.length < 3)
    errors.push("at least three competing explanations are required");
  if (!explanations.some((item) => item.kind === "technical"))
    errors.push("a technical explanation is required");
  const ids = /* @__PURE__ */ new Set();
  for (const explanation of explanations) {
    if (!safeId(explanation.id))
      errors.push(`invalid explanation id: ${explanation.id}`);
    if (ids.has(explanation.id))
      errors.push(`duplicate explanation id: ${explanation.id}`);
    ids.add(explanation.id);
    if (!nonEmptyText(explanation.statement, 1e4))
      errors.push(`invalid explanation statement: ${explanation.id}`);
    if (!finiteNonNegative(explanation.plausibility) || explanation.plausibility > 1)
      errors.push(`invalid plausibility: ${explanation.id}`);
  }
  return [...new Set(errors)];
}
async function recordDiscoveryToInquiry(port, input) {
  assertValid(safeId(input.projectId), "projectId is invalid");
  assertValid(safeId(input.questionId), "questionId is invalid");
  assertValid(safeId(input.attemptId), "attemptId is invalid");
  assertValid(nonEmptyText(input.statement, 1e4), "statement is invalid");
  validatePrior(input.prior);
  if (input.posterior) computeSurprise(input.prior, input.posterior);
  const errors = validateCompetitiveExplanations(input.explanations);
  assertValid(errors.length === 0, errors.join("; "));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const question = {
    id: input.questionId,
    schemaVersion: 1,
    projectId: input.projectId,
    kind: "anomaly",
    statement: input.statement,
    prior: input.prior,
    ...input.posterior ? {
      posterior: input.posterior,
      surprise: computeSurprise(input.prior, input.posterior)
    } : {},
    competingExplanations: input.explanations.map(
      (item) => `${item.kind}: ${item.statement}`
    ),
    testsDone: [],
    testsPlanned: input.testsPlanned,
    status: "open",
    proposer: "agent",
    priority: 0.5,
    createdAt: now,
    updatedAt: now
  };
  const attempt = {
    id: input.attemptId,
    schemaVersion: 1,
    projectId: input.projectId,
    hypothesisIds: input.hypothesisId ? [input.hypothesisId] : [],
    parameters: input.parameters ?? {
      discovery: stableJson({ questionId: input.questionId })
    },
    artifactIds: input.artifactIds ?? [],
    outcome: "running",
    enteredReport: false,
    startedAt: now
  };
  await port.recordQuestion(question);
  await port.recordAttempt(attempt);
}

// src/domain/kernel.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
var DEFAULT_IDLE_TIMEOUT_MS = 15 * 6e4;
var DEFAULT_EXECUTION_TIMEOUT_MS = 6e4;
var DEFAULT_MAX_EXECUTIONS = 32;
var DEFAULT_MAX_OUTPUT_BYTES = 1e6;
var encoder = new TextEncoder();
function validClassification(value) {
  return value === "public" || value === "internal" || value === "controlled" || value === "restricted";
}
function validKind(value) {
  return value === "summary" || value === "plot" || value === "table" || value === "raw";
}
function ensureOptions(options) {
  assertValid(safeId(options.sessionId), "sessionId is invalid");
  assertValid(
    safeRunPath(options.runDirectory),
    "runDirectory must be a project-relative runs path"
  );
  assertValid(
    options.language === "python" || options.language === "r",
    "unsupported kernel language"
  );
  assertValid(validClassification(options.dataClassification), "invalid data classification");
  assertValid(
    options.runner && typeof options.runner.run === "function",
    "controlled runner is required"
  );
  const capabilities = options.runner.capabilities;
  assertValid(
    capabilities.kind === "container" || capabilities.kind === "fixture" || capabilities.kind === "unavailable",
    "invalid runner kind"
  );
  assertValid(
    capabilities.languages.includes(options.language),
    "runner does not support this language"
  );
  if (capabilities.kind !== "unavailable") {
    assertValid(capabilities.networkDisabled, "kernel runner must disable network access");
    assertValid(
      capabilities.writesOnlyToRunDirectory,
      "kernel runner must constrain writes to runs"
    );
  }
  for (const [label, value] of [
    ["idleTimeoutMs", options.idleTimeoutMs],
    ["executionTimeoutMs", options.executionTimeoutMs],
    ["maxExecutions", options.maxExecutions],
    ["maxOutputBytes", options.maxOutputBytes]
  ]) {
    if (value !== void 0)
      assertValid(boundedInteger(value, 1, 24 * 60 * 6e4), `${label} is invalid`);
  }
}
function filterKernelOutput(outputs, policy, maxBytes = DEFAULT_MAX_OUTPUT_BYTES) {
  assertValid(validClassification(policy), "invalid output policy");
  assertValid(boundedInteger(maxBytes, 1, DEFAULT_MAX_OUTPUT_BYTES * 100), "maxBytes is invalid");
  const accepted = [];
  const kinds = [];
  let redactedBytes = 0;
  let blocked = false;
  const classificationRank = {
    public: 0,
    internal: 1,
    controlled: 2,
    restricted: 3
  };
  for (const item of outputs) {
    if (!validKind(item.contentKind) || !validClassification(item.classification) || !nonEmptyText(item.text, maxBytes)) {
      blocked = true;
      continue;
    }
    const withinClassification = classificationRank[item.classification] <= classificationRank[policy];
    const allowed = withinClassification && (policy === "public" || policy === "internal" ? item.contentKind !== "raw" || item.classification === "public" : policy === "controlled" ? item.contentKind === "summary" || item.contentKind === "plot" : item.contentKind === "summary" && item.classification === "public");
    if (!allowed) {
      redactedBytes += encoder.encode(item.text).byteLength;
      blocked = true;
      continue;
    }
    accepted.push(item.text);
    kinds.push(item.contentKind);
  }
  const text = accepted.join("\n");
  if (encoder.encode(text).byteLength > maxBytes) {
    const bytes = encoder.encode(text).slice(0, maxBytes);
    redactedBytes += encoder.encode(text).byteLength - bytes.byteLength;
    return {
      text: new TextDecoder().decode(bytes),
      redactedBytes,
      blocked: true,
      kinds
    };
  }
  return { text, redactedBytes, blocked, kinds };
}
function notebookFor(history, language) {
  return JSON.stringify(
    {
      cells: history.map((execution) => ({
        cell_type: "code",
        execution_count: null,
        metadata: {
          drone: { executionId: execution.id, status: execution.status }
        },
        outputs: execution.output ? [
          {
            name: "stdout",
            output_type: "stream",
            text: `${execution.output}
`
          }
        ] : [],
        source: execution.code.split("\n").map((line) => `${line}
`)
      })),
      metadata: {
        kernelspec: { language, name: language, display_name: language },
        drone: { schemaVersion: 1 }
      },
      nbformat: 4,
      nbformat_minor: 5
    },
    null,
    2
  );
}
var KernelSession = class {
  options;
  state;
  executionCount = 0;
  history = [];
  idleTimer;
  expiresAt;
  activeExecution;
  executionController;
  closing;
  cleanupFailure;
  constructor(options) {
    ensureOptions(options);
    this.options = {
      ...options,
      idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      executionTimeoutMs: options.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS,
      maxExecutions: options.maxExecutions ?? DEFAULT_MAX_EXECUTIONS,
      maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    };
    this.state = options.runner.capabilities.kind === "container" || options.runner.capabilities.kind === "fixture" ? "ready" : "needs-container";
    this.armIdleTimer();
  }
  get status() {
    const remaining = Math.max(0, this.options.maxExecutions - this.executionCount);
    return {
      sessionId: this.options.sessionId,
      status: this.state,
      executionCount: this.executionCount,
      remainingExecutions: remaining,
      ...this.expiresAt === void 0 ? {} : { expiresAt: new Date(this.expiresAt).toISOString() }
    };
  }
  get executions() {
    return this.history;
  }
  async execute(code, signal) {
    assertValid(this.state === "ready", `kernel session is ${this.state}`);
    assertValid(nonEmptyText(code, MAX_CODE_LENGTH), "kernel code is empty or too large");
    assertValid(
      this.executionCount < this.options.maxExecutions,
      "kernel execution budget exceeded"
    );
    const controller = new AbortController();
    this.executionController = controller;
    signal?.throwIfAborted();
    const execution = this.executeActive(code, controller, signal);
    this.activeExecution = execution;
    try {
      return await execution;
    } finally {
      this.activeExecution = void 0;
      this.executionController = void 0;
    }
  }
  async executeActive(code, controller, callerSignal) {
    this.state = "running";
    this.executionCount += 1;
    this.armIdleTimer();
    const id = randomUUID2();
    const startedAt = new Date(this.now()).toISOString();
    const timer = setTimeout(
      () => controller.abort(new Error("runner-timeout")),
      this.options.executionTimeoutMs
    );
    let execution;
    try {
      const result = await this.options.runner.run({
        signal: callerSignal ? AbortSignal.any([controller.signal, callerSignal]) : controller.signal,
        requestId: id,
        language: this.options.language,
        code,
        runDirectory: this.options.runDirectory,
        timeoutMs: this.options.executionTimeoutMs,
        maxOutputBytes: this.options.maxOutputBytes,
        dataClassification: this.options.dataClassification
      });
      controller.signal.throwIfAborted();
      assertValid(
        result && Number.isInteger(result.exitCode),
        "runner returned invalid exit status"
      );
      assertValid(
        Number.isFinite(result.producedBytes) && result.producedBytes >= 0,
        "runner returned invalid byte count"
      );
      const filtered = filterKernelOutput(
        result.outputs,
        this.options.dataClassification,
        this.options.maxOutputBytes
      );
      const status = result.exitCode === 0 && !filtered.blocked ? "succeeded" : result.exitCode === 0 ? "blocked" : "failed";
      execution = {
        id,
        code,
        startedAt,
        finishedAt: new Date(this.now()).toISOString(),
        status,
        ...result.exitCode === 0 ? { exitCode: result.exitCode } : {},
        output: filtered.text,
        outputClassification: this.options.dataClassification,
        contentKinds: filtered.kinds,
        producedBytes: result.producedBytes,
        redactedBytes: filtered.redactedBytes,
        ...filtered.blocked ? { blockedReason: "output-policy" } : {}
      };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "DISCOVERY_CLEANUP_FAILED") {
        this.cleanupFailure = error;
        this.state = "cleanup-failed";
        throw error;
      }
      execution = {
        id,
        code,
        startedAt,
        finishedAt: new Date(this.now()).toISOString(),
        status: "failed",
        output: "",
        outputClassification: this.options.dataClassification,
        contentKinds: [],
        producedBytes: 0,
        redactedBytes: 0,
        blockedReason: controller.signal.reason instanceof Error && controller.signal.reason.message === "runner-timeout" ? "timeout" : controller.signal.aborted ? "cancelled" : error instanceof Error && "code" in error && error.code === "EXECUTION_IMAGE_NOT_CACHED" ? "image-not-cached" : error instanceof Error && "code" in error && error.code === "EXECUTION_IMAGE_MISMATCH" ? "image-mismatch" : "runner-failure"
      };
    } finally {
      clearTimeout(timer);
      if (this.state === "running") this.state = "ready";
      this.armIdleTimer();
    }
    this.history.push(execution);
    return execution;
  }
  export(writer) {
    assertValid(this.state === "ready", `kernel session is ${this.state}`);
    const fileWriter = writer ?? this.options.writer;
    assertValid(
      fileWriter && typeof fileWriter.write === "function",
      "a run file writer is required for export"
    );
    const script = this.history.map((execution) => execution.code).join("\n\n");
    const notebook = notebookFor(this.history, this.options.language);
    const base = `${this.options.runDirectory}/exports/${this.options.sessionId}`;
    const scriptPath = `${base}.${this.options.language === "python" ? "py" : "R"}`;
    const notebookPath = `${base}.ipynb`;
    return Promise.all([
      fileWriter.write(
        scriptPath,
        script,
        this.options.language === "python" ? "text/x-python" : "text/x-r"
      ),
      fileWriter.write(notebookPath, notebook, "application/x-ipynb+json")
    ]).then(() => ({ scriptPath, notebookPath, script, notebook }));
  }
  close(reason = "closed") {
    if (this.closing) return this.closing;
    if (this.cleanupFailure) return Promise.reject(this.cleanupFailure);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.executionController?.abort(new Error("kernel-closed"));
    this.closing = (async () => {
      await this.activeExecution;
      if (this.idleTimer) clearTimeout(this.idleTimer);
      this.state = reason;
    })();
    return this.closing;
  }
  now() {
    return this.options.now?.() ?? Date.now();
  }
  armIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.state !== "ready") return;
    this.expiresAt = this.now() + this.options.idleTimeoutMs;
    this.idleTimer = setTimeout(() => this.close("idle-timeout"), this.options.idleTimeoutMs);
  }
};
var UnavailableKernelRunner = class {
  capabilities = {
    kind: "unavailable",
    languages: ["python", "r"],
    networkDisabled: false,
    writesOnlyToRunDirectory: false
  };
  run(_request) {
    return Promise.reject(new Error("needs-container"));
  }
};

// src/service.ts
function safeProjectId(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
    throw new Error("Invalid discovery project id");
  return value;
}
function safeSessionId(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
    throw new Error("Invalid discovery session id");
  return value;
}
function safeRunDirectory(projectRoot, value) {
  if (isAbsolute(value) || value.includes("\0"))
    throw new Error("Discovery run directory must be relative");
  const normalized = value.replaceAll("\\", "/");
  const candidate = resolve(projectRoot, normalized);
  const rel = relative(resolve(projectRoot), candidate).replaceAll("\\", "/");
  if (!rel.startsWith("runs/") || rel.includes("../") || rel === "runs")
    throw new Error("Discovery runs are restricted to project runs");
  return normalized;
}
function toCapabilities(value) {
  return {
    kind: value.kind,
    languages: [...value.languages],
    networkDisabled: value.networkDisabled,
    writesOnlyToRunDirectory: value.writesOnlyToRunDirectory
  };
}
var FileBaselineStore = class {
  constructor(store) {
    this.store = store;
  }
  async put(record) {
    const normalized = createBaseline(record);
    const records2 = await this.store.read();
    const index = records2.findIndex(
      (item) => item.metric === normalized.metric && item.datasetId === normalized.datasetId && item.datasetRevision === normalized.datasetRevision
    );
    if (index >= 0) records2[index] = normalized;
    else records2.push(normalized);
    await this.store.write(records2);
  }
  async get(metric, datasetId, revision) {
    return (await this.store.read()).find(
      (item) => item.metric === metric && item.datasetId === datasetId && item.datasetRevision === revision
    );
  }
  async list() {
    return await this.store.read();
  }
};
var DiscoveryService = class {
  projectId;
  projectRoot;
  options;
  sessionsStore;
  criticsStore;
  multipathStore;
  plansStore;
  evaluationsStore;
  baselineStore;
  sessions = /* @__PURE__ */ new Map();
  sessionMeta = /* @__PURE__ */ new Map();
  critics = [];
  multipaths = [];
  plans = [];
  evaluations = [];
  initialized;
  creations = Promise.resolve();
  sessionWrites = Promise.resolve();
  sessionsRevision = 0;
  savedSessionsRevision = 0;
  disposed = false;
  executions = /* @__PURE__ */ new Map();
  executionSignals = /* @__PURE__ */ new Map();
  disposal;
  constructor(options) {
    this.projectId = safeProjectId(options.projectId);
    if (!isAbsolute(options.projectRoot)) throw new Error("discovery projectRoot must be absolute");
    this.projectRoot = resolve(options.projectRoot);
    this.options = options;
    this.sessionsStore = options.services.journal("sessions");
    this.criticsStore = options.services.journal("critics");
    this.multipathStore = options.services.journal("multipath");
    this.plansStore = options.services.journal("plans");
    this.evaluationsStore = options.services.journal("evaluations");
    this.baselineStore = new FileBaselineStore(
      options.services.journal("baselines")
    );
  }
  async init() {
    if (this.disposed) throw new Error("discovery service is disposed");
    if (this.initialized) return this.initialized;
    this.initialized = (async () => {
      if (this.disposed) throw new Error("discovery service is disposed");
      const [sessions, critics, multipaths, plans, evaluations] = await Promise.all([
        this.sessionsStore.read(),
        this.criticsStore.read(),
        this.multipathStore.read(),
        this.plansStore.read(),
        this.evaluationsStore.read()
      ]);
      for (const session of sessions) {
        try {
          if (safeSessionId(session.sessionId) && session.runDirectory.startsWith("runs/"))
            this.sessionMeta.set(session.sessionId, session);
        } catch (error) {
          console.warn("Ignored invalid discovery session journal entry", error);
        }
      }
      this.critics.splice(0, this.critics.length, ...critics);
      this.multipaths.splice(0, this.multipaths.length, ...multipaths);
      this.plans.splice(0, this.plans.length, ...plans);
      this.evaluations.splice(0, this.evaluations.length, ...evaluations);
    })();
    return this.initialized;
  }
  async authorize(operation) {
    await this.options.services.authorize(operation);
  }
  runnerFor(language) {
    return this.options.services.runner(language);
  }
  async getCapabilities(language) {
    const runner = await this.runnerFor(language);
    return toCapabilities(runner.capabilities);
  }
  writeSessions(write) {
    const pending = this.sessionWrites.then(write);
    this.sessionWrites = pending.then(
      () => void 0,
      () => void 0
    );
    return pending;
  }
  persistSessions() {
    return this.writeSessions(async () => {
      const revision = this.sessionsRevision;
      await this.sessionsStore.write([...this.sessionMeta.values()]);
      this.savedSessionsRevision = revision;
    });
  }
  /** Called only by an explicit legitimate runtime reconcile operation, never by dispose. */
  async persistObservedKernelStates() {
    await this.init();
    for (const [id, session] of this.sessions) {
      const meta = this.sessionMeta.get(id);
      if (!meta) throw new Error("Active discovery session has no journal metadata");
      if (meta.status !== session.status.status || meta.executionCount !== session.status.executionCount) {
        this.sessionMeta.set(id, {
          ...meta,
          status: session.status.status,
          executionCount: session.status.executionCount
        });
        this.sessionsRevision++;
      }
    }
    if (this.savedSessionsRevision !== this.sessionsRevision) await this.persistSessions();
  }
  sessionProjection(id) {
    const session = this.sessions.get(id);
    const meta = this.sessionMeta.get(id);
    if (!meta) return null;
    if (!session)
      return {
        sessionId: meta.sessionId,
        language: meta.language,
        dataClassification: meta.dataClassification,
        runDirectory: meta.runDirectory,
        status: meta.status,
        executionCount: meta.executionCount,
        remainingExecutions: 0,
        capabilities: toCapabilities(meta.capabilities)
      };
    const status = session.status;
    return {
      sessionId: id,
      language: meta.language,
      dataClassification: meta.dataClassification,
      runDirectory: meta.runDirectory,
      status: status.status,
      executionCount: status.executionCount,
      remainingExecutions: status.remainingExecutions,
      ...status.expiresAt ? { expiresAt: status.expiresAt } : {},
      capabilities: toCapabilities(meta.capabilities)
    };
  }
  async listKernelSessions() {
    await this.init();
    return [...this.sessionMeta.keys()].map((id) => this.sessionProjection(id)).filter((value) => value !== null);
  }
  async getKernelSession(sessionId) {
    await this.init();
    return this.sessionProjection(safeSessionId(sessionId));
  }
  async recordDiscovery(input) {
    await this.init();
    if (!this.options.services.inquiry) throw new Error("inquiry ledger is not configured");
    if (input.projectId !== this.projectId)
      throw new Error("discovery project does not match inquiry project");
    await recordDiscoveryToInquiry(this.options.services.inquiry, input);
  }
  createKernelSession(input) {
    const pending = this.creations.then(() => this.createKernel(input));
    this.creations = pending.then(
      () => void 0,
      () => void 0
    );
    return pending;
  }
  async createKernel(input) {
    await this.init();
    const sessionId = safeSessionId(input.sessionId);
    if (this.sessionMeta.has(sessionId))
      throw new Error(`Discovery session already exists: ${sessionId}`);
    const runDirectory = safeRunDirectory(this.projectRoot, input.runDirectory);
    await this.authorize({
      kind: "create-kernel-session",
      projectId: this.projectId
    });
    const runner = await this.runnerFor(input.language);
    if (this.disposed) throw new Error("discovery service is disposed");
    const options = {
      sessionId,
      runDirectory,
      language: input.language,
      dataClassification: input.dataClassification,
      runner,
      writer: this.options.services.files,
      ...input.idleTimeoutMs === void 0 ? {} : { idleTimeoutMs: input.idleTimeoutMs },
      ...input.executionTimeoutMs === void 0 ? {} : { executionTimeoutMs: input.executionTimeoutMs },
      ...input.maxExecutions === void 0 ? {} : { maxExecutions: input.maxExecutions },
      ...input.maxOutputBytes === void 0 ? {} : { maxOutputBytes: input.maxOutputBytes }
    };
    const session = new KernelSession(options);
    const metadata = {
      sessionId,
      runDirectory,
      language: input.language,
      dataClassification: input.dataClassification,
      status: session.status.status,
      executionCount: session.status.executionCount,
      capabilities: runner.capabilities,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    try {
      await this.writeSessions(async () => {
        const revision = this.sessionsRevision;
        await this.sessionsStore.write([...this.sessionMeta.values(), metadata]);
        this.savedSessionsRevision = revision;
        if (this.disposed) throw new Error("Discovery service was disposed during kernel creation");
        this.sessions.set(sessionId, session);
        this.sessionMeta.set(sessionId, metadata);
      });
    } catch (error) {
      await session.close();
      throw error;
    }
    return this.sessionProjection(sessionId);
  }
  async executeKernel(sessionId, code, signal) {
    await this.init();
    const id = safeSessionId(sessionId);
    const session = this.sessions.get(id);
    if (!session) throw new Error("Discovery kernel session is not active; create a new session");
    await this.authorize({
      kind: "execute-kernel",
      projectId: this.projectId,
      sessionId: id
    });
    if (this.disposed) throw new Error("discovery service is disposed");
    if (this.executions.has(id)) throw new Error("discovery kernel execution is already running");
    signal?.throwIfAborted();
    const pending = this.executeSession(id, code, session, signal);
    this.executions.set(id, pending);
    if (signal) this.executionSignals.set(id, signal);
    try {
      return await pending;
    } finally {
      if (this.executions.get(id) === pending) {
        this.executions.delete(id);
        this.executionSignals.delete(id);
      }
    }
  }
  async executeSession(id, code, session, signal) {
    const execution = await session.execute(code, signal);
    signal?.throwIfAborted();
    const meta = this.sessionMeta.get(id);
    if (!meta) throw new Error("Active discovery session has no journal metadata");
    this.sessionMeta.set(id, {
      ...meta,
      status: session.status.status,
      executionCount: session.status.executionCount
    });
    this.sessionsRevision++;
    await this.persistSessions();
    await this.options.services.onExecution({
      sessionId: id,
      projectId: this.projectId,
      cwd: this.projectRoot,
      runDirectory: meta.runDirectory,
      language: meta.language,
      code,
      execution
    });
    return execution;
  }
  async exportKernel(sessionId) {
    await this.init();
    const id = safeSessionId(sessionId);
    const session = this.sessions.get(id);
    if (!session) throw new Error("Discovery kernel session is not active; create a new session");
    await this.authorize({
      kind: "export-kernel",
      projectId: this.projectId,
      sessionId: id
    });
    return session.export();
  }
  /** Resource-only shutdown: no capability, caller replacement or journal write is borrowed. */
  async disposeKernelSession(sessionId) {
    const id = safeSessionId(sessionId);
    const session = this.sessions.get(id);
    const execution = this.executions.get(id), signal = this.executionSignals.get(id);
    await session?.close();
    const [completed] = await Promise.allSettled([execution]);
    if (completed.status === "rejected" && !signal?.aborted) throw completed.reason;
    const meta = this.sessionMeta.get(id);
    if (meta && session)
      this.sessionMeta.set(id, {
        ...meta,
        status: session.status.status,
        executionCount: session.status.executionCount
      });
    this.sessionsRevision++;
  }
  async closeKernelSession(sessionId) {
    await this.init();
    const id = safeSessionId(sessionId);
    await this.authorize({
      kind: "close-kernel-session",
      projectId: this.projectId,
      sessionId: id
    });
    await this.disposeKernelSession(id);
    await this.persistSessions();
  }
  async createExplorationPlan(input) {
    await this.init();
    const ledger = new ExplorationBudgetLedger(input.budget);
    void ledger;
    const ranked = rankExplorationCandidates(input.candidates);
    const plan = {
      id: input.id,
      projectId: this.projectId,
      hypothesisId: input.hypothesisId,
      prior: input.prior,
      budget: input.budget,
      rankedCandidateIds: ranked.map((candidate) => candidate.id),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await this.plansStore.write([...this.plans, plan]);
    this.plans.push(plan);
    return plan;
  }
  async listExplorationPlans() {
    await this.init();
    return [...this.plans];
  }
  async runCritic(request) {
    await this.init();
    const result = await runCriticReview(request, this.options.services.criticProvider);
    const review = {
      findingId: request.findingId,
      ...result,
      questions: result.questions.map((question) => ({
        ...question,
        evidenceArtifactIds: [...question.evidenceArtifactIds]
      })),
      recordedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.critics.push(review);
    await this.criticsStore.write(this.critics);
    if (this.options.services.inquiry && result.questions.length)
      await recordCriticQuestions(this.options.services.inquiry, {
        projectId: this.projectId,
        findingId: request.findingId,
        questions: result.questions
      });
    return review;
  }
  async listCriticReviews() {
    await this.init();
    return this.critics.map(({ recordedAt: _recordedAt, ...review }) => review);
  }
  async runMultipath(plan, executor) {
    await this.init();
    await this.authorize({
      kind: "multipath-execution",
      projectId: this.projectId,
      planId: plan.id
    });
    const assessment = await executeMultiPath(createMultiPathPlan(plan), executor, {
      projectId: this.projectId,
      inquiry: this.options.services.inquiry
    });
    const record = {
      planId: plan.id,
      findingId: plan.findingId,
      grade: assessment.grade,
      intent: assessment.label,
      attemptCount: assessment.attemptCount,
      consistentCount: assessment.consistentCount,
      consistency: assessment.consistency,
      recordedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.multipaths.push(record);
    await this.multipathStore.write(this.multipaths);
    return record;
  }
  async listMultipathAssessments() {
    await this.init();
    return this.multipaths.map(({ recordedAt: _recordedAt, ...value }) => value);
  }
  async runEvaluation(cases, evaluator, options = {}) {
    await this.init();
    const runId = options.runId ?? `evaluation-${Date.now()}`;
    await this.authorize({
      kind: "evaluation-execution",
      projectId: this.projectId,
      runId
    });
    const result = await runEvaluation(cases, evaluator, this.baselineStore, {
      ...options,
      runId
    });
    const projection = {
      runId: result.runId,
      status: result.status,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      missingData: [...result.missingData],
      blockedCases: [...result.blockedCases],
      metrics: result.metrics.map((metric) => ({
        metric: metric.metric,
        value: metric.value,
        ...metric.baseline === void 0 ? {} : { baseline: metric.baseline },
        ...metric.delta === void 0 ? {} : { delta: metric.delta },
        passed: metric.passed,
        baselineAvailable: metric.baselineAvailable,
        caseIds: [...metric.caseIds]
      }))
    };
    this.evaluations.push(projection);
    await this.evaluationsStore.write(this.evaluations);
    return result;
  }
  async listEvaluations() {
    await this.init();
    return [...this.evaluations];
  }
  async listBaselines() {
    await this.init();
    return this.baselineStore.list();
  }
  async putBaseline(record) {
    await this.init();
    await this.baselineStore.put(record);
  }
  dispose() {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    this.disposal = this.disposeSessions();
    return this.disposal;
  }
  async disposeSessions() {
    const sessionClosures = [...this.sessions.values()].map((session) => session.close());
    const executions = [...this.executions].map(([id, pending]) => ({
      pending,
      signal: this.executionSignals.get(id)
    }));
    const settled = await Promise.allSettled([
      ...sessionClosures,
      ...executions.map((item) => item.pending)
    ]);
    const failures = settled.filter(
      (result, index) => result.status === "rejected" && (index < sessionClosures.length || !executions[index - sessionClosures.length]?.signal?.aborted)
    );
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Discovery execution cleanup failed"
      );
    for (const [id, session] of this.sessions) {
      const meta = this.sessionMeta.get(id);
      if (!meta) throw new Error("Active discovery session has no journal metadata");
      this.sessionMeta.set(id, {
        ...meta,
        status: session.status.status,
        executionCount: session.status.executionCount
      });
    }
    this.sessions.clear();
  }
};

// src/native-records.ts
var JOURNALS = [
  "sessions",
  "critics",
  "multipath",
  "plans",
  "evaluations",
  "baselines"
];

// src/runtime.ts
var readMetadata = {
  drone: { readOnly: true, capabilities: ["research", "analysis"] }
};
var writeMetadata = { drone: { capabilities: ["research", "analysis"] } };
var bindingPath = "workspace-binding.json";
var nullSchema = { type: "null" };
var objectSchema = { type: "object" };
var bindingSchema = {
  type: "object",
  properties: {
    root: { type: "string", minLength: 1 },
    acknowledgeExistingData: { type: "boolean" }
  },
  required: ["root", "acknowledgeExistingData"],
  additionalProperties: false
};
var planSchema = {
  type: "object",
  properties: {
    id: { type: "string", minLength: 1 },
    hypothesisId: { type: "string", minLength: 1 },
    prior: {
      type: "object",
      properties: {
        direction: { enum: ["positive", "negative", "none", "unknown"] },
        recordedAt: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        magnitude: { type: "number", minimum: 0 }
      },
      required: ["direction", "recordedAt"],
      additionalProperties: false
    },
    budget: {
      type: "object",
      properties: {
        maxExecutions: { type: "integer", minimum: 1 },
        maxWallTimeMs: { type: "integer", minimum: 1 },
        maxOutputBytes: { type: "integer", minimum: 1 },
        maxCostUnits: { type: "number", exclusiveMinimum: 0 }
      },
      required: ["maxExecutions", "maxWallTimeMs", "maxOutputBytes", "maxCostUnits"],
      additionalProperties: false
    },
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          statement: { type: "string", minLength: 1 },
          surprise: { type: "number", minimum: 0, maximum: 1 },
          estimatedCost: { type: "number", exclusiveMinimum: 0 },
          expectedExplanationsExcluded: { type: "number", minimum: 0 },
          credibility: { type: "number", minimum: 0, maximum: 1 }
        },
        required: [
          "id",
          "statement",
          "surprise",
          "estimatedCost",
          "expectedExplanationsExcluded",
          "credibility"
        ],
        additionalProperties: false
      }
    }
  },
  required: ["id", "hypothesisId", "prior", "budget", "candidates"],
  additionalProperties: false
};
function binding(value) {
  const item = value;
  if (!item || item.schemaVersion !== 1 || typeof item.workspaceId !== "string" || typeof item.workspaceDirectory !== "string" || typeof item.projectId !== "string")
    throw new Error("Discovery workspace binding is malformed");
  return item;
}
function records(value, journal) {
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== "object" || Array.isArray(item)))
    throw new Error(`Discovery journal ${journal} must contain an array of records`);
  return value;
}
var response = (details) => ({
  content: [{ type: "text", text: JSON.stringify(details) }],
  details
});
function ownerMetadata(value) {
  const item = value;
  if (!item || item.schemaVersion !== 1 || !Array.isArray(item.kernels) || !Array.isArray(item.intents))
    throw new Error("Discovery owner metadata is malformed");
  for (const record of item.kernels) {
    if (!record || typeof record.sessionId !== "string" || typeof record.creatorSessionId !== "string" || typeof record.runDirectory !== "string" || typeof record.image !== "string" || !["creating", "active", "closed", "cleanup-failed"].includes(record.status))
      throw new Error("Discovery kernel ownership metadata is malformed");
  }
  for (const record of item.intents) {
    if (!record || typeof record.requestId !== "string" || typeof record.applicationId !== "string" || typeof record.sessionId !== "string" || typeof record.creatorSessionId !== "string" || typeof record.codeSha256 !== "string" || ![
      "pending",
      "not-accepted",
      "needs-recovery",
      "accepted",
      "succeeded",
      "failed",
      "cancelled",
      "cleanup-failed"
    ].includes(record.status))
      throw new Error("Discovery execution intent metadata is malformed");
  }
  if (new Set(item.kernels.map((record) => record.sessionId)).size !== item.kernels.length || new Set(item.intents.map((record) => record.requestId)).size !== item.intents.length)
    throw new Error("Discovery owner metadata contains duplicate identities");
  return item;
}
var createDiscoveryRuntime = async ({
  applicationId,
  signal,
  capabilities,
  events
}) => {
  const owners = /* @__PURE__ */ new Map();
  const caller = () => capabilities.call("caller.scope", null);
  const read = (root, path) => capabilities.call("state.readJson", {
    root,
    path
  });
  const roots = async () => {
    const granted = await capabilities.call(
      "roots.describe",
      null
    );
    return Promise.all(
      granted.filter((item) => item.kind === "state").map(async (root) => {
        const stored = await read(root.handle, bindingPath);
        const entries = stored.kind === "missing" ? await capabilities.call("state.list", {
          root: root.handle,
          path: ""
        }) : [];
        return {
          root,
          binding: stored.kind === "missing" ? null : binding(stored.value),
          hasExistingData: stored.kind === "value" || entries.some((item) => JOURNALS.some((name) => item.name === `${name}.json`))
        };
      })
    );
  };
  const workspace = async () => {
    const scope = await caller();
    if (scope.kind === "application")
      throw new Error("Select a real workspace session before using discovery");
    return scope;
  };
  const journalRecords = async (root, journal) => {
    const stored = await read(root, `${journal}.json`);
    return stored.kind === "missing" ? [] : records(stored.value, journal);
  };
  const findRoot = async (scope) => {
    const selected = (await roots()).filter(
      (item) => item.binding?.workspaceId === scope.workspaceId
    );
    if (selected.length > 1)
      throw new Error("More than one approved discovery root is bound to this workspace");
    return selected[0];
  };
  const overview = async (preferredRoot) => {
    const scope = await caller();
    const available = await roots();
    const selected = scope.kind === "application" ? void 0 : available.find(
      (item) => item.binding?.workspaceId === scope.workspaceId || !item.binding && item.root.handle === preferredRoot
    );
    const journals = selected ? await Promise.all(
      JOURNALS.map(async (journal) => ({
        journal,
        count: (await journalRecords(selected.root.handle, journal)).length
      }))
    ) : [];
    return {
      scope,
      readOnly: true,
      status: journals.some((item) => item.count > 0) ? "configured" : "unconfigured",
      readiness: scope.kind === "application" ? "select-session" : selected?.binding ? owners.has(scope.workspaceId) ? "ready" : "needs-ownership" : "needs-binding",
      roots: available,
      journals,
      execution: "unavailable",
      inquiry: await capabilities.call("provider.inspect", { alias: "inquiry" })
    };
  };
  const owner = async (scope, root) => {
    let current = owners.get(scope.workspaceId);
    if (current) {
      if (current.root !== root.root.handle)
        throw new Error("Discovery workspace already owns another state root");
      await current.ready;
      return current;
    }
    const kernels = /* @__PURE__ */ new Map(), intents = /* @__PURE__ */ new Map();
    const activeKernels = /* @__PURE__ */ new Set(), verifiedReceipts = /* @__PURE__ */ new Set();
    let metadataVersion = null;
    let metadataWrites = Promise.resolve();
    const writeMetadata2 = (change) => {
      const pending = metadataWrites.then(async () => {
        const next = change({
          schemaVersion: 1,
          kernels: [...kernels.values()],
          intents: [...intents.values()]
        });
        const written = await capabilities.call("state.writeJson", {
          root: root.root.handle,
          path: "owner-state.json",
          value: next,
          expectedVersion: metadataVersion
        });
        metadataVersion = written.version;
        kernels.clear();
        intents.clear();
        for (const item of next.kernels) kernels.set(item.sessionId, item);
        for (const item of next.intents) intents.set(item.requestId, item);
        events.changed();
      });
      metadataWrites = pending.then(
        () => void 0,
        () => void 0
      );
      return pending;
    };
    const journals = /* @__PURE__ */ new Map();
    const services = {
      journal: (name) => ({
        read: async () => {
          const stored = await read(root.root.handle, `${name}.json`);
          journals.set(name, stored.version);
          return stored.kind === "missing" ? [] : records(stored.value, name);
        },
        write: async (value) => {
          if (!journals.has(name)) {
            const stored = await read(root.root.handle, `${name}.json`);
            journals.set(name, stored.version);
          }
          const written = await capabilities.call("state.writeJson", {
            root: root.root.handle,
            path: `${name}.json`,
            value,
            expectedVersion: journals.get(name)
          });
          journals.set(name, written.version);
          events.changed();
        }
      }),
      authorize: async (operation) => {
        const actual = await caller();
        if (actual.kind !== "session")
          throw new Error("Discovery mutation requires a real creator SDK session");
        if ("sessionId" in operation) {
          const ownership = kernels.get(operation.sessionId);
          if (!ownership || ownership.creatorSessionId !== actual.sessionId || !activeKernels.has(operation.sessionId))
            throw new Error("Kernel belongs to another creator or is historical");
        }
        await capabilities.call("state.reserve", {
          root: root.root.handle,
          path: ""
        });
      },
      runner: async () => {
        const environment = await capabilities.call(
          "execution.describe",
          null
        );
        if (environment.kind !== "container") return new UnavailableKernelRunner();
        return {
          capabilities: {
            kind: "container",
            languages: ["python", "r"],
            networkDisabled: true,
            writesOnlyToRunDirectory: true
          },
          async run(request) {
            request.signal?.throwIfAborted();
            const actual = await caller();
            const ownership = [...kernels.values()].find(
              (item) => item.runDirectory === request.runDirectory && activeKernels.has(item.sessionId)
            );
            if (actual.kind !== "session" || !ownership || ownership.creatorSessionId !== actual.sessionId)
              throw new Error("Execution has no live creator-owned logical kernel");
            const intent = {
              requestId: request.requestId,
              applicationId,
              sessionId: ownership.sessionId,
              creatorSessionId: actual.sessionId,
              codeSha256: createHash("sha256").update(request.code).digest("hex"),
              status: "pending"
            };
            await writeMetadata2((state) => ({ ...state, intents: [...state.intents, intent] }));
            request.signal?.throwIfAborted();
            const executed = await capabilities.call(
              "execution.run",
              {
                requestId: request.requestId,
                language: request.language,
                code: request.code,
                runDirectory: request.runDirectory,
                timeoutMs: request.timeoutMs,
                maxOutputBytes: request.maxOutputBytes,
                dataClassification: request.dataClassification,
                image: ownership.image
              },
              request.signal
            );
            request.signal?.throwIfAborted();
            await writeMetadata2((state) => ({
              ...state,
              intents: state.intents.map(
                (item) => item.requestId === request.requestId ? { ...item, status: executed.receipt.status, receipt: executed.receipt } : item
              )
            }));
            verifiedReceipts.add(request.requestId);
            return executed.result;
          }
        };
      },
      inquiry: inquiryProvider(capabilities, root.binding.projectId),
      files: {
        prepareDirectory: async () => {
          throw new Error("Controlled execution directory service is unavailable");
        },
        write: async () => {
          throw new Error("Discovery export service is unavailable");
        }
      },
      onExecution: async () => {
        events.changed();
      },
      legacyJournal: async () => void 0
    };
    const service = new DiscoveryService({
      projectId: root.binding.projectId,
      projectRoot: scope.workspaceDirectory,
      services
    });
    const ready = (async () => {
      await service.init();
      const stored = await read(root.root.handle, "owner-state.json");
      metadataVersion = stored.version;
      if (stored.kind === "value") {
        const metadata = ownerMetadata(stored.value);
        for (const record of metadata.kernels) kernels.set(record.sessionId, record);
        for (const record of metadata.intents) intents.set(record.requestId, record);
      }
    })().catch((error) => {
      owners.delete(scope.workspaceId);
      throw error;
    });
    current = {
      root: root.root.handle,
      service,
      kernels,
      intents,
      activeKernels,
      verifiedReceipts,
      ready,
      writeMetadata: writeMetadata2,
      closuresDirty: false
    };
    owners.set(scope.workspaceId, current);
    await ready;
    return current;
  };
  const bind = async (input) => {
    const scope = await workspace();
    const selected = (await roots()).find((item) => item.root.handle === input.root);
    if (!selected || selected.root.access !== "read-write")
      throw new Error("Select an approved writable discovery state root");
    if (selected.binding && selected.binding.workspaceId !== scope.workspaceId)
      throw new Error("Discovery state belongs to another workspace");
    if (!selected.binding && selected.hasExistingData && !input.acknowledgeExistingData)
      throw new Error(
        "Existing discovery journals require explicit acknowledgement before binding"
      );
    await capabilities.call("state.reserve", { root: input.root, path: "" });
    const stored = await read(input.root, bindingPath);
    if (stored.kind === "value") {
      if (binding(stored.value).workspaceId !== scope.workspaceId)
        throw new Error("Discovery state belongs to another workspace");
    } else {
      const plans = await journalRecords(input.root, "plans");
      const ids = plans.map((plan) => {
        if (typeof plan.projectId !== "string")
          throw new Error("Existing discovery plan has no project identity");
        return plan.projectId;
      });
      const unique = [...new Set(ids)];
      if (unique.length > 1)
        throw new Error("Existing discovery plans contain conflicting project identities");
      const projectId = unique[0] ?? `discovery-${createHash("sha256").update(scope.workspaceId).digest("hex").slice(0, 32)}`;
      await capabilities.call("state.writeJson", {
        root: input.root,
        path: bindingPath,
        value: {
          schemaVersion: 1,
          projectId,
          workspaceId: scope.workspaceId,
          workspaceDirectory: scope.workspaceDirectory
        },
        expectedVersion: null
      });
    }
    const verified = await read(input.root, bindingPath);
    if (verified.kind !== "value" || binding(verified.value).workspaceId !== scope.workspaceId)
      throw new Error("Discovery workspace binding did not read back");
    await owner(scope, { ...selected, binding: binding(verified.value) });
    events.changed();
    return overview();
  };
  const list = async (input) => {
    const scope = await workspace();
    const root = input.root ? (await roots()).find((item) => item.root.handle === input.root) : await findRoot(scope);
    if (root?.binding && root.binding.workspaceId !== scope.workspaceId)
      throw new Error("Discovery state belongs to another workspace");
    if (!JOURNALS.includes(input.journal)) throw new Error("Unknown discovery journal");
    if (!root)
      return {
        readOnly: true,
        status: "unconfigured",
        journal: input.journal,
        records: [],
        count: 0,
        truncated: false
      };
    const values = await journalRecords(root.root.handle, input.journal);
    const query = input.query?.trim().toLocaleLowerCase();
    const matches = query ? values.filter((value) => JSON.stringify(value).toLocaleLowerCase().includes(query)) : values;
    return {
      readOnly: true,
      status: "configured",
      journal: input.journal,
      records: matches.slice(0, 32),
      count: matches.length,
      truncated: matches.length > 32
    };
  };
  const createPlan = async (input) => {
    const scope = await workspace();
    const selected = await findRoot(scope);
    if (!selected) throw new Error("Bind a discovery state directory before creating a plan");
    await capabilities.call("state.reserve", {
      root: selected.root.handle,
      path: ""
    });
    return (await owner(scope, selected)).service.createExplorationPlan(input);
  };
  const journalSchema = { type: "string", enum: JOURNALS };
  const creatorOwner = async () => {
    const scope = await workspace();
    if (scope.kind !== "session") throw new Error("Select a real creator SDK session for kernels");
    const selected = await findRoot(scope);
    if (!selected)
      throw new Error("Bind a discovery state directory before creating a logical kernel");
    return { scope, owned: await owner(scope, selected) };
  };
  const ownedKernel = (owned, creatorSessionId, sessionId) => {
    const kernel = owned.kernels.get(sessionId);
    if (!kernel || kernel.creatorSessionId !== creatorSessionId || !owned.activeKernels.has(sessionId))
      throw new Error("Kernel belongs to another creator or is a historical record");
    return kernel;
  };
  const listKernels = async () => {
    const { scope, owned } = await creatorOwner();
    return {
      kernels: (await owned.service.listKernelSessions()).map((kernel) => ({
        ...kernel,
        creatorSessionId: owned.kernels.get(kernel.sessionId)?.creatorSessionId ?? null,
        ownership: !owned.activeKernels.has(kernel.sessionId) ? "historical" : owned.kernels.get(kernel.sessionId)?.creatorSessionId === scope.sessionId ? "own" : "another-creator",
        ownershipState: owned.kernels.get(kernel.sessionId)?.status ?? "unassigned",
        image: owned.kernels.get(kernel.sessionId)?.image ?? null,
        logicalOnly: true
      })),
      intents: [...owned.intents.values()].map((intent) => ({
        ...intent,
        verification: owned.verifiedReceipts.has(intent.requestId) ? "host-verified-this-activation" : "historical-unverified"
      }))
    };
  };
  const createKernel = async (input) => {
    const { scope, owned } = await creatorOwner();
    if (owned.kernels.has(input.sessionId) || await owned.service.getKernelSession(input.sessionId))
      throw new Error("Kernel identity already exists; use a new identity");
    if ([...owned.kernels.values()].some(
      (item) => owned.activeKernels.has(item.sessionId) && item.runDirectory === input.runDirectory
    ))
      throw new Error("An active logical kernel already owns this runs directory");
    const record = {
      sessionId: input.sessionId,
      creatorSessionId: scope.sessionId,
      runDirectory: input.runDirectory,
      image: input.image,
      status: "creating"
    };
    await owned.writeMetadata((state) => ({ ...state, kernels: [...state.kernels, record] }));
    const created = await owned.service.createKernelSession(input);
    owned.activeKernels.add(input.sessionId);
    await owned.writeMetadata((state) => ({
      ...state,
      kernels: state.kernels.map(
        (item) => item.sessionId === input.sessionId ? { ...item, status: "active" } : item
      )
    }));
    return {
      kernel: created,
      creatorSessionId: scope.sessionId,
      logicalOnly: true,
      environment: await capabilities.call("execution.describe", null)
    };
  };
  const reconcile = async (signal2) => {
    const { scope, owned } = await creatorOwner();
    for (const intent of [...owned.intents.values()].filter(
      (item) => item.creatorSessionId === scope.sessionId
    )) {
      signal2?.throwIfAborted();
      if (intent.applicationId !== applicationId) {
        await owned.writeMetadata((state) => ({
          ...state,
          intents: state.intents.map(
            (item) => item.requestId === intent.requestId ? { ...item, status: "needs-recovery" } : item
          )
        }));
        continue;
      }
      let receipt;
      try {
        receipt = await capabilities.call("execution.receipt", {
          requestId: intent.requestId
        });
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EXECUTION_RECEIPT_NEEDS_RECOVERY")
          throw error;
        signal2?.throwIfAborted();
        await owned.writeMetadata((state) => ({
          ...state,
          intents: state.intents.map(
            (item) => item.requestId === intent.requestId ? { ...item, status: "needs-recovery" } : item
          )
        }));
        continue;
      }
      signal2?.throwIfAborted();
      await owned.writeMetadata((state) => ({
        ...state,
        intents: state.intents.map(
          (item) => item.requestId === intent.requestId ? {
            ...item,
            status: receipt.kind === "missing" ? "not-accepted" : receipt.receipt.status,
            ...receipt.kind === "value" ? { receipt: receipt.receipt } : {}
          } : item
        )
      }));
      owned.verifiedReceipts.add(intent.requestId);
    }
    signal2?.throwIfAborted();
    await owned.service.persistObservedKernelStates();
    if (owned.closuresDirty) {
      signal2?.throwIfAborted();
      await owned.writeMetadata((state) => state);
      owned.closuresDirty = false;
    }
    return listKernels();
  };
  const executeKernel = async (input, signal2) => {
    const { scope, owned } = await creatorOwner();
    const kernel = ownedKernel(owned, scope.sessionId, input.sessionId);
    if (kernel.status !== "active")
      throw new Error("Kernel ownership is not active; reconcile it before execution");
    const execution = await owned.service.executeKernel(input.sessionId, input.code, signal2);
    signal2?.throwIfAborted();
    await reconcile(signal2);
    return { execution, ...await listKernels() };
  };
  const closeKernel = async (input, signal2) => {
    const { scope, owned } = await creatorOwner();
    ownedKernel(owned, scope.sessionId, input.sessionId);
    signal2?.throwIfAborted();
    await owned.service.closeKernelSession(input.sessionId);
    signal2?.throwIfAborted();
    await reconcile(signal2);
    await owned.writeMetadata((state) => ({
      ...state,
      kernels: state.kernels.map(
        (item) => item.sessionId === input.sessionId ? { ...item, status: "closed" } : item
      )
    }));
    owned.activeKernels.delete(input.sessionId);
    return listKernels();
  };
  const kernelSchema = {
    type: "object",
    properties: {
      sessionId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[a-zA-Z0-9._-]+$" },
      runDirectory: { type: "string", minLength: 6, pattern: "^runs/" },
      language: { enum: ["python", "r"] },
      image: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      dataClassification: { enum: ["public", "internal", "controlled", "restricted"] },
      idleTimeoutMs: { type: "integer", minimum: 1, maximum: 12e4 },
      executionTimeoutMs: { type: "integer", minimum: 1, maximum: 12e4 },
      maxExecutions: { type: "integer", minimum: 1, maximum: 32 },
      maxOutputBytes: { type: "integer", minimum: 1, maximum: 1e6 }
    },
    required: ["sessionId", "runDirectory", "language", "image", "dataClassification"],
    additionalProperties: false
  };
  const kernelIdSchema = {
    type: "object",
    properties: { sessionId: kernelSchema.properties.sessionId },
    required: ["sessionId"],
    additionalProperties: false
  };
  const kernelExecuteSchema = {
    type: "object",
    properties: {
      sessionId: kernelSchema.properties.sessionId,
      code: { type: "string", minLength: 1, maxLength: 1e6 }
    },
    required: ["sessionId", "code"],
    additionalProperties: false
  };
  const executionDescription = () => capabilities.call("execution.describe", null);
  const executionReceipt = (input) => capabilities.call("execution.receipt", input);
  const cancelExecution = (input) => capabilities.call("execution.cancel", input);
  const requestSchema = {
    type: "object",
    properties: {
      requestId: { type: "string", minLength: 1, maxLength: 128, pattern: "^[a-zA-Z0-9._-]+$" }
    },
    required: ["requestId"],
    additionalProperties: false
  };
  const recordInquiry = async (input) => {
    const scope = await workspace(), root = await findRoot(scope);
    if (!root) throw new Error("Bind the Discovery state root first");
    await (await owner(scope, root)).service.recordDiscovery(input);
    return { recorded: true, authority: "plugin-asserted-or-imported" };
  };
  const operations = {
    recordInquiry: {
      inputSchema: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          questionId: { type: "string" },
          statement: { type: "string" },
          hypothesisId: { type: "string" },
          prior: { type: "object" },
          posterior: { type: "object" },
          explanations: { type: "array", items: { type: "object" } },
          testsPlanned: { type: "array", items: { type: "string" } },
          attemptId: { type: "string" },
          parameters: { type: "object" },
          artifactIds: { type: "array", items: { type: "string" } }
        },
        required: [
          "projectId",
          "questionId",
          "statement",
          "prior",
          "explanations",
          "testsPlanned",
          "attemptId"
        ],
        additionalProperties: false
      },
      resultSchema: objectSchema,
      effect: "write",
      execute: (input) => recordInquiry(input)
    },
    overview: {
      inputSchema: nullSchema,
      resultSchema: objectSchema,
      effect: "read",
      execute: () => overview()
    },
    bindCurrentWorkspace: {
      inputSchema: bindingSchema,
      resultSchema: objectSchema,
      effect: "write",
      execute: (input) => bind(input)
    },
    listRecords: {
      inputSchema: {
        type: "object",
        properties: {
          root: { type: "string" },
          journal: journalSchema,
          query: { type: "string", minLength: 1, maxLength: 2e3 }
        },
        required: ["journal"],
        additionalProperties: false
      },
      resultSchema: objectSchema,
      effect: "read",
      execute: (input) => list(input)
    },
    listKernelSessions: {
      inputSchema: nullSchema,
      resultSchema: objectSchema,
      effect: "read",
      execute: () => listKernels()
    },
    createKernelSession: {
      inputSchema: kernelSchema,
      resultSchema: objectSchema,
      effect: "write",
      execute: (input) => createKernel(input)
    },
    executeKernel: {
      inputSchema: kernelExecuteSchema,
      resultSchema: objectSchema,
      effect: "write",
      execute: (input, context) => executeKernel(input, context.signal)
    },
    closeKernelSession: {
      inputSchema: kernelIdSchema,
      resultSchema: objectSchema,
      effect: "write",
      execute: (input, context) => closeKernel(input, context.signal)
    },
    reconcileExecutions: {
      inputSchema: nullSchema,
      resultSchema: objectSchema,
      effect: "write",
      execute: (_input, context) => reconcile(context.signal)
    },
    executionDescription: {
      inputSchema: nullSchema,
      resultSchema: objectSchema,
      effect: "read",
      execute: () => executionDescription()
    },
    executionReceipt: {
      inputSchema: requestSchema,
      resultSchema: objectSchema,
      effect: "read",
      execute: executionReceipt
    },
    cancelExecution: {
      inputSchema: requestSchema,
      resultSchema: objectSchema,
      effect: "write",
      execute: cancelExecution
    },
    createExplorationPlan: {
      inputSchema: planSchema,
      resultSchema: objectSchema,
      effect: "write",
      execute: (input) => createPlan(input)
    }
  };
  const createNativeSession = () => {
    let creatorSessionId;
    return {
      toolEffects: {
        discovery_status: "read",
        discovery_list_records: "read",
        discovery_search_records: "read",
        discovery_bind_workspace: "write",
        discovery_create_plan: "write",
        discovery_execution_environment: "read",
        discovery_execution_receipt: "read",
        discovery_cancel_execution: "write",
        discovery_list_kernels: "read",
        discovery_create_kernel: "write",
        discovery_execute_kernel: "write",
        discovery_close_kernel: "write",
        discovery_reconcile_executions: "write",
        discovery_record_inquiry: "write"
      },
      extension(pi) {
        const adapted = Object.create(pi);
        adapted.registerTool = (definition) => pi.registerTool({
          ...definition,
          async execute(id, input, signal2, update, context) {
            const scope = await caller();
            if (scope.kind !== "session" || creatorSessionId && creatorSessionId !== scope.sessionId)
              throw new Error("Native projection belongs to another SDK session");
            creatorSessionId = scope.sessionId;
            return definition.execute(id, input, signal2, update, context);
          }
        });
        const nativePi = adapted;
        const emptyParameters = {
          type: "object",
          properties: {},
          additionalProperties: false
        };
        const kernelTools = [
          ["discovery_list_kernels", emptyParameters, "read", () => listKernels()],
          [
            "discovery_create_kernel",
            kernelSchema,
            "write",
            (input) => createKernel(input)
          ],
          [
            "discovery_execute_kernel",
            kernelExecuteSchema,
            "write",
            (input, signal2) => executeKernel(input, signal2)
          ],
          [
            "discovery_close_kernel",
            kernelIdSchema,
            "write",
            (input, signal2) => closeKernel(input, signal2)
          ],
          [
            "discovery_reconcile_executions",
            emptyParameters,
            "write",
            (_input, signal2) => reconcile(signal2)
          ]
        ];
        for (const [name, parameters, effect, run] of kernelTools)
          nativePi.registerTool({
            name,
            label: "Discovery \xB7 logical kernel",
            description: name === "discovery_create_kernel" ? "Create only a creator-owned logical kernel and budget; no container is started. Configured cached images and actual approval are still required for execution." : "Operate only the calling creator SDK session's discovery logical kernels and verified host receipts; historical records cannot be adopted.",
            parameters,
            ...effect === "read" ? readMetadata : writeMetadata,
            async execute(_id, input, signal2) {
              return response(await run(input, signal2));
            }
          });
        for (const [name, operation, effect, description] of [
          [
            "discovery_execution_environment",
            "executionDescription",
            "read",
            "Read only the configured Python/R cached exact image identities; never pulls or enumerates images."
          ],
          [
            "discovery_execution_receipt",
            "executionReceipt",
            "read",
            "Read only this live creator session's own host execution receipt; missing is not closed."
          ],
          [
            "discovery_cancel_execution",
            "cancelExecution",
            "write",
            "Cancel this creator's accepted execution, wait for owned cleanup and return its terminal receipt; missing is never closed."
          ]
        ])
          nativePi.registerTool({
            name,
            label: "Discovery \xB7 execution",
            description,
            parameters: operations[operation].inputSchema.type === "null" ? { type: "object", properties: {}, additionalProperties: false } : requestSchema,
            ...effect === "read" ? readMetadata : writeMetadata,
            async execute(_id, input) {
              return response(
                await operations[operation].execute(
                  operation === "executionDescription" ? null : input
                )
              );
            }
          });
        nativePi.registerTool({
          name: "discovery_record_inquiry",
          label: "Discovery \xB7 Inquiry",
          description: "Record a discovery question and attempt through the optional versioned Inquiry provider bound to this actual workspace. Records remain asserted data. Each provider write needs its own current authorization.",
          parameters: operations.recordInquiry.inputSchema,
          ...writeMetadata,
          async execute(_id, input) {
            return response(await recordInquiry(input));
          }
        });
        nativePi.registerTool({
          name: "discovery_status",
          label: "Discovery \xB7 status",
          description: "Read approved discovery roots and current workspace journals; does not acquire writer ownership.",
          parameters: {
            type: "object",
            properties: { root: { type: "string" } },
            additionalProperties: false
          },
          ...readMetadata,
          async execute(_id, input) {
            return response(await overview(input.root));
          }
        });
        for (const name of ["discovery_list_records", "discovery_search_records"])
          nativePi.registerTool({
            name,
            label: "Discovery \xB7 records",
            description: "Read approved current-workspace discovery journal records; observations are not independent scientific validation.",
            parameters: operations.listRecords.inputSchema,
            ...readMetadata,
            async execute(_id, input) {
              return response(await list(input));
            }
          });
        nativePi.registerTool({
          name: "discovery_bind_workspace",
          label: "Discovery \xB7 bind",
          description: "Explicitly bind an approved state directory to this real workspace, acknowledge any existing journals, and acquire exclusive writer ownership.",
          parameters: bindingSchema,
          ...writeMetadata,
          async execute(_id, input) {
            return response(await bind(input));
          }
        });
        nativePi.registerTool({
          name: "discovery_create_plan",
          label: "Discovery \xB7 plan",
          description: "Persist a ranked exploration plan in the bound workspace. Does not execute code or certify scientific validity.",
          parameters: planSchema,
          ...writeMetadata,
          async execute(_id, input) {
            return response(await createPlan(input));
          }
        });
      },
      async dispose() {
        if (!creatorSessionId) return;
        const closing = [...owners.values()].flatMap(
          (owned) => [...owned.kernels.values()].filter(
            (kernel) => kernel.creatorSessionId === creatorSessionId && owned.activeKernels.has(kernel.sessionId)
          ).map(async (kernel) => {
            await owned.service.disposeKernelSession(kernel.sessionId);
            owned.activeKernels.delete(kernel.sessionId);
            owned.kernels.set(kernel.sessionId, { ...kernel, status: "closed" });
            owned.closuresDirty = true;
          })
        );
        const results = await Promise.allSettled(closing);
        const failures = results.filter((result) => result.status === "rejected");
        if (failures.length)
          throw new AggregateError(
            failures.map((result) => result.reason),
            "Creator kernel cleanup failed"
          );
        if (!signal.aborted) events.changed();
      }
    };
  };
  return {
    operations,
    createNativeSession,
    async dispose() {
      await Promise.all([...owners.values()].map((item) => item.service.dispose()));
      owners.clear();
    }
  };
};

// src/native-runtime.ts
var hash = (text) => createHash2("sha256").update(text).digest("hex");
async function nativeDiscoveryExtension(pi, options = {}) {
  const calls = new AsyncLocalStorage();
  const reservations = new PluginResourceReservations(options.leaseDirectory);
  const active = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Set();
  let cleanupFailure;
  const applicationId = randomUUID3();
  const executionKey = randomBytes(32);
  const sourceIdentity = hash(await readFile(new URL(import.meta.url), "utf8"));
  let execution;
  const executionOwner = () => {
    if (!execution)
      execution = (async () => {
        const agentRoot = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
        await mkdir(agentRoot, { recursive: true, mode: 448 });
        const storage = await NodeExecutionReceiptStorage.create(
          join(await realpath(agentRoot), "plugin-execution-receipts"),
          executionKey
        );
        return new ExecutionTransactions(storage);
      })().catch((error) => {
        execution = void 0;
        throw error;
      });
    return execution;
  };
  const executionIdentity = (caller) => ({
    pluginId: "@gyoungwe/pi-discovery",
    sourceIdentity,
    applicationId,
    sessionId: caller.scope.sessionId,
    workspaceId: caller.scope.workspaceId
  });
  const assertExecutionCaller = async (caller) => {
    caller.signal.throwIfAborted();
    const workspace = await realpath(caller.context.cwd);
    const id = process.platform === "darwin" || process.platform === "win32" ? workspace.replaceAll("\\", "/").toLowerCase() : workspace;
    if (id !== caller.scope.workspaceId || caller.context.sessionManager.getSessionId() !== caller.scope.sessionId)
      throw new Error("Native execution caller or canonical workspace changed");
    return workspace;
  };
  const executeCapability = async (name, input, caller) => {
    await assertExecutionCaller(caller);
    if (name === "execution.describe") {
      const available2 = await describeContainerExecution(options.container);
      await assertExecutionCaller(caller);
      return {
        kind: available2.runtime ? "container" : "unavailable",
        images: available2.images,
        networkDisabled: true,
        writesOnlyToRunDirectory: true
      };
    }
    if (name === "execution.receipt")
      return (await executionOwner()).receipt(
        executionIdentity(caller),
        input.requestId
      );
    if (name === "execution.cancel") {
      const owner = await executionOwner(), requestId = input.requestId;
      const receipt = await owner.receipt(executionIdentity(caller), requestId);
      if (receipt.kind === "missing" || receipt.receipt.status !== "accepted") return receipt;
      if (!caller.context.hasUI || !await caller.context.ui.confirm(
        "Cancel owned execution",
        `Workspace: ${caller.scope.workspaceDirectory}
Creator SDK session: ${caller.scope.sessionId}
Cancel accepted request ${requestId} and wait for its owned resources and terminal receipt?`,
        { signal: caller.signal }
      ))
        throw new Error("Native execution cancellation was not approved");
      await assertExecutionCaller(caller);
      return owner.cancel(executionIdentity(caller), requestId);
    }
    if (name !== "execution.run") throw new Error(`Unknown native execution capability: ${name}`);
    const request = input;
    if (!/^sha256:[a-f0-9]{64}$/.test(request.image))
      throw new Error("Native execution requires an exact cached image ID");
    if (!caller.context.hasUI)
      throw new Error(
        "Native execution requires interactive approval; headless calls cannot authorize code"
      );
    const approved = await caller.context.ui.confirm(
      "Bounded container execution",
      `Workspace: ${caller.scope.workspaceDirectory}
Creator SDK session: ${caller.scope.sessionId}
Language: ${request.language}
Directory: ${request.runDirectory}
Configured image ID: ${request.image}
Data: ${request.dataClassification}
Timeout: ${request.timeoutMs}ms; output: ${request.maxOutputBytes} bytes
Network disabled; only this runs directory writable; no image pull.
Code:
${request.code}`,
      { signal: caller.signal }
    );
    if (!approved) throw new Error("Native execution was not approved");
    const workspace = await assertExecutionCaller(caller);
    const available = await describeContainerExecution(options.container);
    if (!available.runtime || !available.images[request.language])
      throw Object.assign(
        new Error("Configured language image is not cached; no image was pulled"),
        { code: "EXECUTION_IMAGE_NOT_CACHED" }
      );
    if (available.images[request.language] !== request.image)
      throw Object.assign(
        new Error("Requested image does not match the configured cached language image"),
        { code: "EXECUTION_IMAGE_MISMATCH" }
      );
    await prepareSandboxRunDirectory(workspace, request.runDirectory, caller.signal);
    const runner = await ContainerSandboxRunner.create({
      ...options.container,
      runtime: available.runtime,
      projectRoot: workspace,
      pythonImage: request.image,
      rImage: request.image,
      reservationDirectory: options.leaseDirectory
    });
    if (!runner) throw new Error("Native container runtime became unavailable after approval");
    await assertExecutionCaller(caller);
    return (await executionOwner()).run(request, executionIdentity(caller), runner, caller.signal);
  };
  const current = () => {
    const caller = calls.getStore();
    if (!caller) throw new Error("Discovery capability has no live native caller");
    caller.signal.throwIfAborted();
    return caller;
  };
  const filePath = async (root, path) => {
    if (isAbsolute2(path) || path.includes("\\") || path.includes("\0") || path !== "" && path.split("/").some((part) => !part || part === "." || part === ".."))
      throw new Error("Expected a discovery state-relative path");
    if ((await lstat(root)).isSymbolicLink())
      throw new Error("Discovery state root contains a symlink");
    let selected = root;
    for (const part of path === "" ? [] : path.split("/")) {
      selected = join(selected, part);
      try {
        if ((await lstat(selected)).isSymbolicLink())
          throw new Error("Discovery state path contains a symlink");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return selected;
  };
  const read = async (root, path) => {
    const selected = await filePath(root, path);
    let bytes;
    try {
      const metadata = await lstat(selected);
      if (!metadata.isFile() || metadata.size > 1048576)
        throw new Error("Discovery JSON state must be a file of at most 1 MiB");
      bytes = await readFile(selected);
    } catch (error) {
      if (error.code === "ENOENT")
        return { kind: "missing", version: null };
      throw error;
    }
    if (bytes.length > 1048576) throw new Error("Discovery JSON state exceeds 1 MiB");
    return {
      kind: "value",
      value: JSON.parse(bytes.toString("utf8")),
      version: hash(bytes.toString("utf8"))
    };
  };
  const write = async (caller, input) => {
    if (!input.path.endsWith(".json")) throw new Error("Discovery state writes require JSON files");
    const selected = await filePath(caller.root, input.path);
    const bytes = `${JSON.stringify(input.value, null, 2)}
`;
    if (Buffer.byteLength(bytes) > 1048576) throw new Error("Discovery JSON state exceeds 1 MiB");
    const check = async () => {
      caller.signal.throwIfAborted();
      if ((await read(caller.root, input.path)).version !== input.expectedVersion)
        throw new Error("Discovery state version conflict");
    };
    await check();
    const temporary = join(dirname(selected), `.discovery-${randomUUID3()}.tmp`);
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 384 });
      await check();
      if (input.expectedVersion === null) await link(temporary, selected);
      else await rename(temporary, selected);
    } catch (error) {
      const [cleanup] = await Promise.allSettled([rm(temporary, { force: true })]);
      if (cleanup.status === "rejected") {
        cleanupFailure = cleanup.reason;
        throw new AggregateError([error, cleanup.reason], "Discovery write and cleanup failed");
      }
      throw error;
    }
    try {
      await rm(temporary, { force: true });
    } catch (error) {
      cleanupFailure = error;
      throw error;
    }
    const stored = await read(caller.root, input.path);
    if (stored.version !== hash(bytes))
      throw new Error("Discovery state did not read back after write");
    return stored;
  };
  const capabilities = {
    async call(name, input, signal) {
      const actual = current();
      const caller = signal ? { ...actual, signal: AbortSignal.any([actual.signal, signal]) } : actual;
      caller.signal.throwIfAborted();
      return calls.run(caller, async () => {
        if (name === "caller.scope") return { ...caller.scope };
        if (name === "provider.inspect") return { state: "unavailable", service: "inquiry.runtime", requestedVersion: 1, provider: null };
        if (name.startsWith("execution.")) return executeCapability(name, input, caller);
        if (name === "roots.describe") {
          try {
            if (!(await lstat(caller.root)).isDirectory())
              throw new Error("Discovery state root is not a directory");
          } catch (error) {
            if (error.code === "ENOENT") return [];
            throw error;
          }
          return [
            {
              handle: caller.handle,
              kind: "state",
              path: caller.root,
              access: "read-write"
            }
          ];
        }
        const request = input;
        if (request.root !== caller.handle)
          throw new Error("Discovery state root was not granted for this caller");
        if (name === "state.readJson") return read(caller.root, request.path);
        if (name === "state.list")
          return Promise.all(
            (await readdir(await filePath(caller.root, request.path))).map(async (name2) => ({
              name: name2,
              kind: (await lstat(join(caller.root, request.path, name2))).isDirectory() ? "directory" : "file"
            }))
          );
        if (name === "state.reserve") {
          const directory = await realpath(await filePath(caller.root, request.path));
          if (!(await lstat(directory)).isDirectory())
            throw new Error("State writer requires an existing directory");
          reservations.reserve("state-writers", [directory]);
          return { reserved: true };
        }
        if (name === "state.writeJson") return write(caller, input);
        throw new Error(`Discovery native capability is unavailable: ${name}`);
      });
    }
  };
  const abort = new AbortController();
  const runtime = await createDiscoveryRuntime({
    applicationId,
    signal: abort.signal,
    resources: [],
    capabilities,
    events: { changed() {
    } }
  });
  const native = await runtime.createNativeSession();
  const resolveCaller = async (context, signal) => {
    signal.throwIfAborted();
    const canonical = await realpath(context.cwd);
    if (!options.stateDirectory)
      for (const path of [join(canonical, "runs"), join(canonical, "runs", ".drone-discovery")]) {
        try {
          if ((await lstat(path)).isSymbolicLink())
            throw new Error("Discovery state path contains a symlink");
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          break;
        }
      }
    const workspaceId = process.platform === "darwin" || process.platform === "win32" ? canonical.replaceAll("\\", "/").toLowerCase() : canonical;
    let caller = active.get(workspaceId);
    if (!caller) {
      const root = options.stateDirectory ? await realpath(options.stateDirectory) : join(canonical, "runs", ".drone-discovery");
      if (options.stateDirectory) {
        const stored = await read(root, "workspace-binding.json");
        if (stored.kind === "value") {
          const binding2 = stored.value;
          if (binding2.workspaceId !== workspaceId)
            throw new Error("Explicit discovery root belongs to another workspace");
        }
      }
      caller = {
        scope: {
          kind: "session",
          workspaceId,
          workspaceDirectory: canonical,
          sessionId: context.sessionManager.getSessionId()
        },
        root,
        handle: randomUUID3(),
        signal,
        context
      };
      active.set(workspaceId, caller);
    }
    return {
      ...caller,
      context,
      signal,
      scope: {
        ...caller.scope,
        sessionId: context.sessionManager.getSessionId()
      }
    };
  };
  const prepare = async (caller) => {
    if (options.stateDirectory) return;
    const runs = dirname(caller.root);
    for (const directory of [runs, caller.root]) {
      caller.signal.throwIfAborted();
      await mkdir(directory, { recursive: true, mode: 448 });
      if ((await lstat(directory)).isSymbolicLink())
        throw new Error("Discovery native state path contains a symlink");
    }
    const canonical = await realpath(caller.root);
    const outside = relative2(await realpath(caller.scope.workspaceDirectory), canonical);
    if (isAbsolute2(outside) || outside === ".." || outside.startsWith(`..${sep}`))
      throw new Error("Discovery native state escaped the workspace");
  };
  const adapted = Object.create(pi);
  adapted.registerTool = ((definition) => {
    const execute = definition.execute;
    return pi.registerTool({
      ...definition,
      execute(id, input, signal, update, context) {
        const running = (async () => {
          const caller = await resolveCaller(
            context,
            signal ? AbortSignal.any([abort.signal, signal]) : abort.signal
          );
          if (definition.name === "discovery_status" || definition.name === "discovery_list_records" || definition.name === "discovery_search_records")
            input = {
              ...input,
              root: caller.handle
            };
          if (definition.name === "discovery_bind_workspace") {
            caller.signal.throwIfAborted();
            await prepare(caller);
            if (input.root === "native-state")
              input = {
                ...input,
                root: caller.handle
              };
          }
          const result = await calls.run(
            caller,
            () => execute(id, input, caller.signal, update, context)
          );
          caller.signal.throwIfAborted();
          return result;
        })();
        pending.add(running);
        void running.then(
          () => pending.delete(running),
          () => pending.delete(running)
        );
        return running;
      }
    });
  });
  await native.extension(adapted);
  pi.on("session_shutdown", async () => {
    abort.abort(new Error("Discovery native session closed"));
    await Promise.allSettled([...pending]);
    const settled = await Promise.allSettled([
      native.dispose(),
      runtime.dispose(),
      execution?.then((owner) => owner.drain())
    ]);
    const failures = settled.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Native discovery execution/domain cleanup failed; writer lease retained"
      );
    if (cleanupFailure)
      throw new Error("Discovery native state cleanup failed; writer lease retained", {
        cause: cleanupFailure
      });
    reservations.dispose();
    active.clear();
  });
}

// src/index.ts
function discoveryExtension(pi) {
  return nativeDiscoveryExtension(pi);
}
export {
  discoveryExtension as default,
  nativeDiscoveryExtension
};
