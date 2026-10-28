// @ts-nocheck
// src/runtime.ts
import { createHash } from "node:crypto";

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
  assertValid(
    validClassification(options.dataClassification),
    "invalid data classification"
  );
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
    assertValid(
      capabilities.networkDisabled,
      "kernel runner must disable network access"
    );
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
      assertValid(
        boundedInteger(value, 1, 24 * 60 * 6e4),
        `${label} is invalid`
      );
  }
}
function filterKernelOutput(outputs, policy, maxBytes = DEFAULT_MAX_OUTPUT_BYTES) {
  assertValid(validClassification(policy), "invalid output policy");
  assertValid(
    boundedInteger(maxBytes, 1, DEFAULT_MAX_OUTPUT_BYTES * 100),
    "maxBytes is invalid"
  );
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
    const remaining = Math.max(
      0,
      this.options.maxExecutions - this.executionCount
    );
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
  async execute(code) {
    assertValid(this.state === "ready", `kernel session is ${this.state}`);
    assertValid(
      nonEmptyText(code, MAX_CODE_LENGTH),
      "kernel code is empty or too large"
    );
    assertValid(
      this.executionCount < this.options.maxExecutions,
      "kernel execution budget exceeded"
    );
    const controller = new AbortController();
    this.executionController = controller;
    const execution = this.executeActive(code, controller);
    this.activeExecution = execution;
    try {
      return await execution;
    } finally {
      this.activeExecution = void 0;
      this.executionController = void 0;
    }
  }
  async executeActive(code, controller) {
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
        signal: controller.signal,
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
        this.state = "closed";
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
        blockedReason: controller.signal.reason instanceof Error && controller.signal.reason.message === "runner-timeout" ? "timeout" : controller.signal.aborted ? "cancelled" : "runner-failure"
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
    this.state = reason;
    this.executionController?.abort(new Error("kernel-closed"));
    this.closing = this.activeExecution ? this.activeExecution.then(() => void 0) : Promise.resolve();
    return this.closing;
  }
  now() {
    return this.options.now?.() ?? Date.now();
  }
  armIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.state !== "ready") return;
    this.expiresAt = this.now() + this.options.idleTimeoutMs;
    this.idleTimer = setTimeout(
      () => this.close("idle-timeout"),
      this.options.idleTimeoutMs
    );
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
  disposed = false;
  executions = /* @__PURE__ */ new Map();
  disposal;
  constructor(options) {
    this.projectId = safeProjectId(options.projectId);
    if (!isAbsolute(options.projectRoot))
      throw new Error("discovery projectRoot must be absolute");
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
          console.warn(
            "Ignored invalid discovery session journal entry",
            error
          );
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
  async persistSessions() {
    await this.sessionsStore.write([...this.sessionMeta.values()]);
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
    if (!this.options.services.inquiry)
      throw new Error("inquiry ledger is not configured");
    if (input.projectId !== this.projectId)
      throw new Error("discovery project does not match inquiry project");
    await recordDiscoveryToInquiry(this.options.services.inquiry, input);
  }
  async createKernelSession(input) {
    await this.init();
    const sessionId = safeSessionId(input.sessionId);
    if (this.sessionMeta.has(sessionId))
      throw new Error(`Discovery session already exists: ${sessionId}`);
    const runDirectory = safeRunDirectory(this.projectRoot, input.runDirectory);
    await this.authorize({
      kind: "create-kernel-session",
      projectId: this.projectId
    });
    await this.options.services.files.prepareDirectory(runDirectory);
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
    this.sessions.set(sessionId, session);
    this.sessionMeta.set(sessionId, {
      sessionId,
      runDirectory,
      language: input.language,
      dataClassification: input.dataClassification,
      status: session.status.status,
      executionCount: session.status.executionCount,
      capabilities: runner.capabilities,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    await this.persistSessions();
    return this.sessionProjection(sessionId);
  }
  async executeKernel(sessionId, code) {
    await this.init();
    const id = safeSessionId(sessionId);
    const session = this.sessions.get(id);
    if (!session)
      throw new Error(
        "Discovery kernel session is not active; create a new session"
      );
    await this.authorize({
      kind: "execute-kernel",
      projectId: this.projectId,
      sessionId: id
    });
    if (this.disposed) throw new Error("discovery service is disposed");
    if (this.executions.has(id))
      throw new Error("discovery kernel execution is already running");
    const pending = this.executeSession(id, code, session);
    this.executions.set(id, pending);
    try {
      return await pending;
    } finally {
      if (this.executions.get(id) === pending) this.executions.delete(id);
    }
  }
  async executeSession(id, code, session) {
    const execution = await session.execute(code);
    const meta = this.sessionMeta.get(id);
    if (meta)
      this.sessionMeta.set(id, {
        ...meta,
        status: session.status.status,
        executionCount: session.status.executionCount
      });
    await this.persistSessions();
    await this.options.services.onExecution({
      sessionId: id,
      projectId: this.projectId,
      cwd: this.projectRoot,
      runDirectory: this.sessionMeta.get(id)?.runDirectory ?? "runs",
      language: this.sessionMeta.get(id)?.language ?? "unknown",
      code,
      execution
    });
    return execution;
  }
  async exportKernel(sessionId) {
    await this.init();
    const id = safeSessionId(sessionId);
    const session = this.sessions.get(id);
    if (!session)
      throw new Error(
        "Discovery kernel session is not active; create a new session"
      );
    await this.authorize({
      kind: "export-kernel",
      projectId: this.projectId,
      sessionId: id
    });
    return session.export();
  }
  async closeKernelSession(sessionId) {
    await this.init();
    const id = safeSessionId(sessionId);
    await this.authorize({
      kind: "close-kernel-session",
      projectId: this.projectId,
      sessionId: id
    });
    const session = this.sessions.get(id);
    await session?.close();
    await this.executions.get(id);
    const meta = this.sessionMeta.get(id);
    if (meta)
      this.sessionMeta.set(id, {
        ...meta,
        status: session?.status.status ?? "closed",
        executionCount: session?.status.executionCount ?? meta.executionCount
      });
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
    const result = await runCriticReview(
      request,
      this.options.services.criticProvider
    );
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
    const assessment = await executeMultiPath(
      createMultiPathPlan(plan),
      executor,
      {
        projectId: this.projectId,
        inquiry: this.options.services.inquiry
      }
    );
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
    return this.multipaths.map(
      ({ recordedAt: _recordedAt, ...value }) => value
    );
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
    const settled = await Promise.allSettled([
      ...Array.from(this.sessions.values(), (session) => session.close()),
      ...this.executions.values()
    ]);
    const failures = settled.filter(
      (result) => result.status === "rejected"
    );
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "Discovery execution cleanup failed"
      );
    for (const [id, session] of this.sessions) {
      const meta = this.sessionMeta.get(id);
      if (!meta)
        throw new Error("Active discovery session has no journal metadata");
      this.sessionMeta.set(id, {
        ...meta,
        status: session.status.status,
        executionCount: session.status.executionCount
      });
    }
    if (this.sessions.size) await this.persistSessions();
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
      required: [
        "maxExecutions",
        "maxWallTimeMs",
        "maxOutputBytes",
        "maxCostUnits"
      ],
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
  if (!Array.isArray(value) || value.some(
    (item) => !item || typeof item !== "object" || Array.isArray(item)
  ))
    throw new Error(
      `Discovery journal ${journal} must contain an array of records`
    );
  return value;
}
var response = (details) => ({
  content: [{ type: "text", text: JSON.stringify(details) }],
  details
});
var createDiscoveryRuntime = async ({
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
        const entries = await capabilities.call("state.list", {
          root: root.handle,
          path: ""
        });
        return {
          root,
          binding: stored.kind === "missing" ? null : binding(stored.value),
          hasExistingData: entries.some(
            (item) => JOURNALS.some((name) => item.name === `${name}.json`)
          )
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
      throw new Error(
        "More than one approved discovery root is bound to this workspace"
      );
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
      inquiry: "unavailable"
    };
  };
  const owner = async (scope, root) => {
    let current = owners.get(scope.workspaceId);
    if (current) {
      if (current.root !== root.root.handle)
        throw new Error("Discovery workspace already owns another state root");
      await current.service.init();
      return current.service;
    }
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
      authorize: async () => {
        await capabilities.call("state.reserve", {
          root: root.root.handle,
          path: ""
        });
      },
      runner: async () => new UnavailableKernelRunner(),
      files: {
        prepareDirectory: async () => {
          throw new Error(
            "Controlled execution directory service is unavailable"
          );
        },
        write: async () => {
          throw new Error("Discovery export service is unavailable");
        }
      },
      onExecution: async () => {
        throw new Error("Discovery execution receipts are unavailable");
      },
      legacyJournal: async () => void 0
    };
    const service = new DiscoveryService({
      projectId: root.binding.projectId,
      projectRoot: scope.workspaceDirectory,
      services
    });
    current = { root: root.root.handle, service };
    owners.set(scope.workspaceId, current);
    await service.init().catch((error) => {
      owners.delete(scope.workspaceId);
      throw error;
    });
    return service;
  };
  const bind = async (input) => {
    const scope = await workspace();
    const selected = (await roots()).find(
      (item) => item.root.handle === input.root
    );
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
        throw new Error(
          "Existing discovery plans contain conflicting project identities"
        );
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
    if (!JOURNALS.includes(input.journal))
      throw new Error("Unknown discovery journal");
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
    const matches = query ? values.filter(
      (value) => JSON.stringify(value).toLocaleLowerCase().includes(query)
    ) : values;
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
    if (!selected)
      throw new Error(
        "Bind a discovery state directory before creating a plan"
      );
    await capabilities.call("state.reserve", {
      root: selected.root.handle,
      path: ""
    });
    return (await owner(scope, selected)).createExplorationPlan(input);
  };
  const journalSchema = { type: "string", enum: JOURNALS };
  const operations = {
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
    createExplorationPlan: {
      inputSchema: planSchema,
      resultSchema: objectSchema,
      effect: "write",
      execute: (input) => createPlan(input)
    }
  };
  const createNativeSession = () => ({
    toolEffects: {
      discovery_status: "read",
      discovery_list_records: "read",
      discovery_search_records: "read",
      discovery_bind_workspace: "write",
      discovery_create_plan: "write"
    },
    extension(pi) {
      pi.registerTool({
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
      for (const name of [
        "discovery_list_records",
        "discovery_search_records"
      ])
        pi.registerTool({
          name,
          label: "Discovery \xB7 records",
          description: "Read approved current-workspace discovery journal records; observations are not independent scientific validation.",
          parameters: operations.listRecords.inputSchema,
          ...readMetadata,
          async execute(_id, input) {
            return response(await list(input));
          }
        });
      pi.registerTool({
        name: "discovery_bind_workspace",
        label: "Discovery \xB7 bind",
        description: "Explicitly bind an approved state directory to this real workspace, acknowledge any existing journals, and acquire exclusive writer ownership.",
        parameters: bindingSchema,
        ...writeMetadata,
        async execute(_id, input) {
          return response(await bind(input));
        }
      });
      pi.registerTool({
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
    dispose: async () => {
    }
  });
  return {
    operations,
    createNativeSession,
    async dispose() {
      await Promise.all(
        [...owners.values()].map((item) => item.service.dispose())
      );
      owners.clear();
    }
  };
};
var runtime_default = createDiscoveryRuntime;
export {
  createDiscoveryRuntime,
  runtime_default as default,
  planSchema
};
