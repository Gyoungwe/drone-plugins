// src/task-runtime/managed-application.mjs
import { AsyncLocalStorage as AsyncLocalStorage2 } from "node:async_hooks";
import { createHash as createHash4 } from "node:crypto";

// src/task-runtime/application-state.mjs
function createTaskApplicationState() {
  const failures = /* @__PURE__ */ new Map();
  return {
    readFailure: (scope) => failures.get(scope),
    recordFailure: (scope, failure) => {
      failures.set(scope, failure);
    }
  };
}

// src/task-runtime/task-controller.mjs
function createTaskController(session, readSignal) {
  const journal = {
    scope: () => session.status().scope,
    view: () => session.status().view,
    snapshot: () => session.status().snapshot,
    render: () => session.status().render,
    readRoots: () => session.status().readRoots,
    authorization: (forWrite) => session.status()[forWrite ? "writeAuthorization" : "authorization"],
    begin: (query, capabilities = [], binding = null) => session.input({ query, capabilities, binding }, readSignal()),
    plan: (input) => session.action({ kind: "plan", input }, readSignal()),
    wait: (input) => session.action({ kind: "wait", input }, readSignal()),
    command: (input) => session.action({ kind: "command", input }, readSignal()),
    acceptFile: (input, cwd) => session.action({ kind: "file", input, cwd }, readSignal()),
    reconcile: (cwd) => session.action({ kind: "reconcile", cwd }, readSignal()),
    guard: (value) => session.observe({ kind: "call", value }, readSignal()),
    observe: (value, cwd) => session.observe({ kind: "result", value, cwd }, readSignal()),
    pause: (reason) => session.turn({ kind: "pause", reason }, readSignal()),
    settle: () => session.turn({ kind: "settle" }, readSignal()),
    reserveContinuation: (reason) => session.turn({ kind: "reserve-continuation", reason }, readSignal()),
    reserveHandoff: () => session.turn({ kind: "reserve-handoff" }, readSignal()),
    advanceStage: () => session.turn({ kind: "advance-stage" }, readSignal()),
    requestReport: () => session.turn({ kind: "request-report" }, readSignal()),
    takeReport: () => session.turn({ kind: "take-report" }, readSignal())
  };
  const evidence = {
    capture: (value, cwd, binding) => session.observe({ kind: "capture", value, cwd, binding }, readSignal()),
    evict: (ids) => session.observe({ kind: "evicted", ids }, readSignal()),
    restore: (input, cwd, binding) => session.action({ kind: "evidence-restore", input, cwd, binding }, readSignal())
  };
  return { journal, evidence };
}

// src/task-runtime/host-language.mjs
function hostLanguage() {
  return String(process.env.DRONE_REPLY_LANGUAGE || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}
function bilingual(zh, en) {
  return hostLanguage() === "zh" ? `${zh}
${en}` : en;
}

// src/task-runtime/evidence.mjs
import { resolve as resolve2 } from "node:path";

// src/milestone-plan.ts
var clean = (value, max = 180) => String(value ?? "").replace(
  /(?:bearer\s+|(?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi,
  "[redacted]"
).split("").map(
  (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || "<>".includes(c) ? " " : c
).join("").slice(0, max);
var error = (code, message) => Object.assign(new Error(message), { code });
var MCP_CONFIG_FILE = /(?:^|[\\/])(?:\.?mcp|mcp-adapter)\.json$/i;
function normalizeTaskMilestones(input, catalog) {
  if (!Array.isArray(input) || !input.length || input.length > 24)
    throw error("plan-limit", "Plan needs 1\u201324 milestones.");
  const badId = input.find((m) => !/^[a-zA-Z0-9_-]{1,40}$/.test(String(m.id)));
  if (badId)
    throw error(
      "plan-id-format",
      `Milestone ID ${JSON.stringify(String(badId.id).slice(0, 60))} is invalid: use 1\u201340 letters, digits, "-" or "_".`
    );
  const ids = new Set(input.map((m) => m.id));
  if (ids.size !== input.length)
    throw error("plan-id", "Milestone IDs must be unique.");
  const seen = /* @__PURE__ */ new Set();
  return input.map((m) => {
    if ((m.dependsOn || []).some((id) => !seen.has(id)))
      throw error(
        "plan-dependency",
        "Dependencies must refer to earlier milestones, not cycles or missing IDs."
      );
    if (!catalog.kinds.includes(m.acceptance?.kind))
      throw error(
        "acceptance-required",
        `Acceptance must be one of ${catalog.kinds.join(" | ")} (observed by the host or confirmed by the user); model labels cannot complete it.`
      );
    if (m.acceptance.kind === "file" && MCP_CONFIG_FILE.test(String(m.acceptance.path || "")))
      throw error(
        "acceptance-config-write",
        "Writing an MCP config file (mcp.json) does not load MCP tools, so it cannot complete a milestone. Use human_review, or finish only after the mcp tool actually ran in a reloaded session; if no MCP tools are available, tell the user instead."
      );
    const acceptance = {
      kind: m.acceptance.kind,
      path: clean(m.acceptance.path, 512),
      sha256: /^[a-f0-9]{64}$/.test(String(m.acceptance.sha256 || "")) ? m.acceptance.sha256 : null
    };
    if (["workspace", "vault", "research-run"].includes(
      String(m.acceptance.rootKind)
    ))
      acceptance.rootKind = m.acceptance.rootKind;
    for (const field of catalog.fields[m.acceptance.kind] || [])
      acceptance[field] = clean(m.acceptance[field]);
    seen.add(m.id);
    return {
      id: m.id,
      title: clean(m.title),
      dependsOn: [...m.dependsOn || []],
      acceptance,
      state: "pending",
      evidence: null
    };
  });
}

// src/task-runtime/workbench.mjs
import { createHash as createHash3, randomUUID } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

// src/task-runtime/runtime-bridge.mjs
import { AsyncLocalStorage } from "node:async_hooks";
var contexts = new AsyncLocalStorage();
var KeyedScheduler = class {
  #tails = /* @__PURE__ */ new Map();
  #disposed = false;
  async acquire(key) {
    if (this.#disposed) throw new Error("Runtime scheduler has been disposed");
    const previous = this.#tails.get(key) || Promise.resolve();
    let unlock;
    const gate = new Promise((resolve3) => {
      unlock = resolve3;
    });
    const tail = previous.then(() => gate);
    this.#tails.set(key, tail);
    await previous;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      unlock();
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    };
  }
  async run(key, task) {
    const release = await this.acquire(key);
    try {
      return await task();
    } finally {
      release();
    }
  }
  async dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#tails.clear();
  }
};
function createStandaloneRuntime(log = {}) {
  const disposables = /* @__PURE__ */ new Set();
  let disposed = false;
  let disposal;
  const registerDisposable = (resource) => {
    if (!resource || typeof resource.dispose !== "function" && typeof resource.close !== "function")
      return () => {
      };
    if (disposed) {
      void (resource.dispose?.() ?? resource.close?.());
      return () => {
      };
    }
    disposables.add(resource);
    return () => disposables.delete(resource);
  };
  const scheduler = new KeyedScheduler();
  const runtime = {
    knowledge: {},
    tasks: {},
    tools: { tools: /* @__PURE__ */ new Map(), families: /* @__PURE__ */ new Map() },
    scheduler,
    log,
    registerDisposable,
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      disposal = (async () => {
        const resources = [...disposables];
        disposables.clear();
        await Promise.allSettled(
          resources.map((resource) => {
            try {
              return resource.dispose?.() ?? resource.close?.();
            } catch (error4) {
              return Promise.reject(error4);
            }
          })
        );
        await scheduler.dispose();
      })();
      return disposal;
    }
  };
  return runtime;
}
function withRuntime(runtime, operation) {
  if (!runtime || typeof runtime !== "object" || !runtime.scheduler)
    throw new TypeError("A DroneRuntime with a scheduler is required");
  return contexts.run(runtime, operation);
}
function currentRuntime() {
  const scoped = contexts.getStore();
  if (scoped) return scoped;
  throw new Error("Task runtime is unavailable outside a session owner");
}
function hasRuntimeContext() {
  return Boolean(contexts.getStore());
}
function resolveSlot(domain, slot, create2) {
  const runtime = currentRuntime();
  let group = runtime[domain];
  if (!group) {
    group = {};
    runtime[domain] = group;
  }
  if (!group[slot]) {
    group[slot] = create2();
    runtime.registerDisposable?.(group[slot]);
  }
  return group[slot];
}
function runtimeSlot(domain, slot, create2) {
  if (typeof create2 !== "function") throw new TypeError("runtimeSlot requires a factory");
  const proxy = new Proxy(
    {},
    {
      get(_target, property) {
        const value = resolveSlot(domain, slot, create2)[property];
        return typeof value === "function" ? value.bind(resolveSlot(domain, slot, create2)) : value;
      },
      set(_target, property, value) {
        resolveSlot(domain, slot, create2)[property] = value;
        return true;
      },
      ownKeys() {
        return Reflect.ownKeys(resolveSlot(domain, slot, create2));
      },
      getOwnPropertyDescriptor(_target, property) {
        const descriptor = Object.getOwnPropertyDescriptor(resolveSlot(domain, slot, create2), property);
        return descriptor ? { ...descriptor, configurable: true } : void 0;
      }
    }
  );
  return proxy;
}

// src/task-runtime/acceptance.mjs
var CORE_ACCEPTANCE_KINDS = Object.freeze(["file", "human_review"]);
var CORE_FIELDS = Object.freeze(["kind", "path", "sha256", "rootKind"]);
var stringField = { type: "string", minLength: 1, maxLength: 512 };
var eventBridges = runtimeSlot("tasks", "acceptanceEventBridges", () => /* @__PURE__ */ new WeakSet());
var createRegistry = () => {
  const kinds = [...CORE_ACCEPTANCE_KINDS];
  return {
    verifiers: /* @__PURE__ */ new Map(),
    kinds,
    properties: {
      kind: { type: "string", enum: kinds },
      path: stringField,
      sha256: stringField,
      rootKind: { type: "string", enum: ["workspace", "vault", "research-run"], minLength: 1, maxLength: 32 }
    }
  };
};
var registry = runtimeSlot("tasks", "acceptance", createRegistry);
function ensureRegistryShape() {
  registry.verifiers ??= /* @__PURE__ */ new Map();
  registry.kinds ??= [...CORE_ACCEPTANCE_KINDS];
  registry.properties ??= {};
  registry.properties.kind ??= { type: "string", enum: registry.kinds };
  registry.properties.path ??= stringField;
  registry.properties.sha256 ??= stringField;
  registry.properties.rootKind ??= {
    type: "string",
    enum: ["workspace", "vault", "research-run"],
    minLength: 1,
    maxLength: 32
  };
}
function acceptanceVerifier(kind) {
  ensureRegistryShape();
  return registry.verifiers.get(kind) || null;
}
function acceptanceVerifiers() {
  ensureRegistryShape();
  return [...registry.verifiers.values()];
}
function acceptanceKinds() {
  ensureRegistryShape();
  return [...registry.kinds];
}
function effectiveAcceptance(milestone) {
  const acceptance = milestone?.acceptance || {};
  const bound = milestone?.bound?.fields;
  return bound && typeof bound === "object" ? { ...acceptance, ...bound } : { ...acceptance };
}

// src/task-runtime/consent.mjs
import { createHash } from "node:crypto";
var MAX_AUTO_RESUMES = 3;
function contractHash(task) {
  const contract = [
    task.id,
    task.goal,
    task.binding ?? null,
    task.authorizationSummary ?? "",
    task.writeRoots ?? []
  ];
  if (task.compute !== void 0) contract.push(task.compute ?? null);
  contract.push(
    task.milestones.map(({ id, title, dependsOn, acceptance }) => ({ id, title, dependsOn, acceptance }))
  );
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex");
}
function hasTaskConsent(task, maxCalls) {
  const c = task?.executionConsent;
  return !!(task?.planApproved && task.milestones.length && c?.version === 1 && c.contractHash === contractHash(task) && c.maxCalls === maxCalls && c.maxAutoResumes === MAX_AUTO_RESUMES && typeof c.approvedAt === "string");
}

// src/task-runtime/failure-feedback.mjs
function diagnosticText(value, max = 600) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).slice(0, 8192).replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
    try {
      const url = new URL(raw);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return "[URL omitted]";
    }
  }).replace(/(?:bearer\s+)[^\s,;"']+/gi, "Bearer [redacted]").replace(
    /(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|authorization|cookie)["']?\s*[=:]\s*)(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s,;]+)/gi,
    "$1[redacted]"
  ).replace(
    /(--(?:api[_-]?key|token|password|secret|authorization)(?:=|\s+))(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s,;]+)/gi,
    "$1[redacted]"
  ).replace(/\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{8,}/g, "[redacted]").split("").map((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || "<>".includes(c) ? " " : c).join("").slice(0, max);
}
function toolResultFailed(event) {
  const details = event.details || {};
  return !!(event.isError || details.ok === false || ["failed", "blocked", "budget-exhausted"].includes(details.status) || typeof details.exitCode === "number" && details.exitCode !== 0 || typeof details.exit_code === "number" && details.exit_code !== 0);
}
function failureObservation(event, at) {
  const details = event.details || {};
  const structured = typeof details.error === "string" ? details.error : details.error?.message;
  const blocks = Array.isArray(event.content) ? event.content.filter((b) => b.type === "text" && typeof b.text === "string").slice(0, 3) : [];
  const text2 = structured || (typeof details.stderr === "string" ? details.stderr : "") || blocks.map((b) => b.text.slice(0, 2048)).join("\n");
  const exitCode = details.exitCode ?? details.exit_code;
  return {
    id: diagnosticText(event.toolCallId, 100),
    tool: diagnosticText(event.toolName, 80),
    at,
    ...typeof event.input?.path === "string" ? { target: diagnosticText(event.input.path, 240) } : {},
    error: diagnosticText(text2) || "\u5DE5\u5177\u62A5\u544A\u5931\u8D25\uFF0C\u4F46\u6CA1\u6709\u63D0\u4F9B\u5177\u4F53\u9519\u8BEF\u4FE1\u606F\u3002",
    ...typeof exitCode === "number" ? { exitCode } : {}
  };
}
function failureReceipt(task) {
  const failure = task?.failures?.at(-1);
  if (!failure) return "\u4E4B\u524D\u6709\u4E00\u6B65\u51FA\u8FC7\u9519\uFF0C\u4F46\u5177\u4F53\u9519\u8BEF\u4FE1\u606F\u6CA1\u4FDD\u7559\u4E0B\u6765\uFF0C\u8BF4\u4E0D\u597D\u662F\u4EC0\u4E48\u539F\u56E0\u3002";
  return `${failure.tool}${failure.target ? `\uFF08${failure.target}\uFF09` : ""} \u8FD9\u4E00\u6B65\u51FA\u9519\u4E86${failure.exitCode !== void 0 ? `\uFF08\u9000\u51FA\u7801 ${failure.exitCode}\uFF09` : ""}\uFF1A${failure.error}\u3002\u540E\u6765\u53EF\u80FD\u5DF2\u7ECF\u8865\u6551\uFF0C\u5F71\u4E0D\u5F71\u54CD\u6700\u7EC8\u7ED3\u679C\u8981\u770B\u540E\u9762\u7684\u6267\u884C\u60C5\u51B5\u3002`;
}

// src/task-runtime/file-inspection.mjs
import { createHash as createHash2 } from "node:crypto";

// src/task-runtime/pdf-identity.mjs
import { Worker } from "node:worker_threads";
async function readPdfIdentity(bytes) {
  return new Promise((resolve3, reject) => {
    const worker = new Worker(new URL("./pdf-worker.mjs", import.meta.url), {
      workerData: { bytes },
      resourceLimits: { maxOldGenerationSizeMb: 128 }
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("PDF identity inspection timed out; no file was changed."));
    }, 3e4);
    worker.once("message", (result) => {
      clearTimeout(timer);
      void worker.terminate();
      if (result.error) reject(new Error(`PDF identity requires manual inspection: ${result.error}`));
      else resolve3(result);
    });
    worker.once("error", () => {
      clearTimeout(timer);
      reject(new Error("PDF identity extractor unavailable; no identity claim was made."));
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error("PDF identity worker stopped; no identity claim was made."));
    });
  });
}

// src/task-runtime/file-inspection.mjs
var error2 = (code, message) => Object.assign(new Error(message), { code });
async function inspectTaskBytes(bytes, descriptor, expected = {}) {
  const identity = {
    path: descriptor.path,
    absolutePath: descriptor.absolutePath,
    rootKind: descriptor.rootKind,
    bytes: bytes.length,
    sha256: createHash2("sha256").update(bytes).digest("hex"),
    observedAt: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "file",
    identity: "not-requested"
  };
  if (expected.kind === "pdf") {
    if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
      throw error2("not-pdf", "Not a PDF: HTML landing pages and renamed downloads are not accepted.");
    identity.kind = "pdf";
    if (expected.doi || expected.title) {
      const found = await readPdfIdentity(bytes);
      const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, "");
      const doi = String(expected.doi || "").toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "");
      const title = normalize(expected.title);
      const titleMatch = title.length >= 12 && normalize(found.text).includes(title);
      const doiMatch = !!doi && found.text.toLowerCase().includes(doi);
      if (doi && !doiMatch || title.length >= 12 && !titleMatch)
        throw error2(
          "identity-mismatch",
          "Selected PDF does not match the requested title/DOI in the inspected first pages. Choose the correct file or explicitly revise the request; original unchanged."
        );
      identity.identity = doiMatch && titleMatch ? "metadata-matched" : "needs-review";
      identity.extraction = { pages: found.pages, partial: found.partial };
    }
    identity.identity = expected.sha256 ? identity.sha256 === expected.sha256 ? "hash-matched" : "mismatch" : identity.identity === "metadata-matched" ? "metadata-matched" : "needs-review";
    if (identity.identity === "mismatch")
      throw error2(
        "identity-mismatch",
        "File hash does not match the requested artifact; original file was not changed."
      );
  }
  if (expected.sha256 && expected.kind !== "pdf" && identity.sha256 !== expected.sha256)
    throw error2("artifact-changed", "File version differs from the expected hash.");
  return identity;
}

// src/task-runtime/remaining.mjs
var text = (value, max = 180) => String(value || "").replace(/\s+/g, " ").slice(0, max);
function remainingExplanation(task) {
  const milestones = task.milestones || [], remaining = milestones.filter((m) => m.state !== "completed");
  const lines = [
    milestones.length ? `\u5DF2\u9A8C\u6536 ${milestones.length - remaining.length}/${milestones.length} \u9879\uFF1B\u5269\u4F59 ${remaining.length} \u9879\u3002` : "\u8FD8\u6CA1\u7EA6\u5B9A\u8981\u4EA4\u4ED8\u4EC0\u4E48\uFF0C\u6682\u4E0D\u8BA1\u7B97\u5B8C\u6210\u767E\u5206\u6BD4\uFF1B\u5148\u8BF4\u6E05\u695A\u60F3\u8981\u4EC0\u4E48\u7ED3\u679C\u3001\u505A\u5230\u4EC0\u4E48\u7A0B\u5EA6\u7B97\u5B8C\u6210\u3002"
  ];
  for (const m of remaining) {
    const acceptance = effectiveAcceptance(m);
    const deps = (m.dependsOn || []).map((id) => milestones.find((x) => x.id === id)).filter((x) => x && x.state !== "completed");
    const action = (task.actions || []).find((a) => a.milestoneId === m.id && a.state === "pending");
    const recorded = (task.operations || []).some(
      (o) => o.artifact?.path === acceptance.path && !o.artifact?.intentOnly && o.state !== "started"
    );
    let reason = "", next = "";
    if (deps.length) {
      reason = `\u524D\u7F6E\u9879\u5C1A\u672A\u9A8C\u6536\uFF1A${deps.map((d) => text(d.title, 70)).join("\u3001")}`;
      next = "\u5148\u628A\u524D\u9762\u8FD9\u51E0\u9879\u505A\u5B8C\uFF0C\u8FD9\u4E00\u9879\u81EA\u7136\u4F1A\u8DDF\u4E0A";
    } else if (action) {
      reason = `\u7B49\u5F85\u4F60\u5904\u7406\uFF1A${text(action.title)}\uFF1B${text(action.reason)}`;
      next = action.kind === "authorization" ? "\u5728\u5F39\u51FA\u7684\u786E\u8BA4\u6846\u91CC\u70B9\u540C\u610F" : action.kind === "rebind" ? "\u5728\u5F39\u51FA\u7684\u786E\u8BA4\u6846\u91CC\u51B3\u5B9A\u662F\u5426\u6362\u6210\u65B0\u7684\u6587\u732E" : action.kind === "file" || action.kind === "download" ? "\u628A\u5DF2\u6709\u6587\u4EF6\u7684\u8DEF\u5F84\u586B\u8FDB\u6765\uFF0C\u7A0B\u5E8F\u4F1A\u6838\u5BF9\uFF0C\u4E0D\u7528\u91CD\u65B0\u4E0B\u8F7D" : "\u4EB2\u81EA\u770B\u8FC7\u4E4B\u540E\u56DE\u6765\u786E\u8BA4\u4E00\u4E0B";
    } else if (acceptanceVerifier(m.acceptance.kind)?.pending) {
      const hint = acceptanceVerifier(m.acceptance.kind).pending({ ...m, acceptance }) || {};
      reason = hint.reason || `\u8FD9\u4E00\u9879\u8981\u7B49 ${m.acceptance.kind} \u6838\u5BF9\u901A\u8FC7`;
      next = hint.next || "\u5148\u6838\u5BF9\u5DF2\u6709\u7ED3\u679C\uFF0C\u518D\u51B3\u5B9A\u662F\u5426\u7EE7\u7EED";
    } else if (m.acceptance.kind === "human_review") {
      reason = "\u8FD9\u4E00\u9879\u7EA6\u5B9A\u8981\u4F60\u4EB2\u81EA\u770B\u8FC7\u624D\u7B97\u6570\uFF0C\u76EE\u524D\u8FD8\u6CA1\u6709";
      next = "\u5185\u5BB9\u51C6\u5907\u597D\u540E\u8BF7\u8FC7\u76EE\u4E00\u904D\uFF0C\u770B\u5B8C\u786E\u8BA4\u5373\u53EF";
    } else if (recorded) {
      reason = "\u5DF2\u6709\u4EA7\u7269\u8BB0\u5F55\uFF0C\u4F46\u548C\u7EA6\u5B9A\u7684\u6807\u51C6\u8FD8\u6CA1\u5BF9\u4E0A";
      next = "\u5148\u770B\u770B\u5DF2\u751F\u6210\u7684\u6587\u4EF6\u5BF9\u4E0D\u5BF9\uFF08\u4F4D\u7F6E\u3001\u7248\u672C\u3001\u5185\u5BB9\uFF09\uFF0C\u522B\u6025\u7740\u91CD\u65B0\u751F\u6210";
    } else if (m.evidence?.code === "ENOENT") {
      reason = "\u5728\u7EA6\u5B9A\u7684\u4F4D\u7F6E\u6CA1\u627E\u5230\u6587\u4EF6\u2014\u2014\u4E5F\u53EF\u80FD\u662F\u5B58\u5230\u522B\u5904\u4E86";
      next = `\u770B\u4E00\u4E0B ${text(acceptance.path, 140)} \u548C\u5B9E\u9645\u4FDD\u5B58\u7684\u4F4D\u7F6E\u662F\u4E0D\u662F\u540C\u4E00\u4E2A\uFF0C\u786E\u5B9E\u6CA1\u6709\u518D\u8865\u505A`;
    } else {
      reason = "\u8FD9\u4E00\u9879\u8FD8\u6CA1\u786E\u8BA4\u5B8C\u6210\uFF1B\u4E0D\u80FD\u636E\u6B64\u65AD\u8A00\u6587\u4EF6\u4E0D\u5B58\u5728\u6216\u5DE5\u4F5C\u672A\u505A";
      next = `\u5148\u770B\u770B${text(acceptance.path || acceptance.doi || "\u73B0\u6709\u7ED3\u679C", 140)}\uFF0C\u786E\u5B9E\u7F3A\u4E86\u518D\u8865`;
    }
    lines.push(`\u2022 ${text(m.title)}
  \u539F\u56E0\uFF1A${reason}
  \u4E0B\u4E00\u6B65\uFF1A${next}\u3002`);
  }
  if ((task.operations || []).some((o) => ["started", "unknown"].includes(o.state)))
    lines.push("\u6709\u64CD\u4F5C\u4E0A\u6B21\u6CA1\u7B49\u5230\u7ED3\u679C\uFF1A\u5148\u6838\u5BF9\u5B83\u5B9E\u9645\u505A\u6CA1\u505A\u6210\uFF0C\u522B\u76F4\u63A5\u91CD\u6765\u4E00\u904D\u3002");
  for (const a of (task.actions || []).filter(
    (a2) => a2.state === "pending" && !remaining.some((m) => m.id === a2.milestoneId)
  ))
    lines.push(`\u9700\u8981\u4F60\uFF1A${text(a.title)}\uFF1B${text(a.reason)}\u3002`);
  for (const u of (task.unboundIdentities || []).filter((u2) => remaining.some((m) => m.acceptance.kind === u2.kind)).slice(-4))
    lines.push(
      `\u5DF2\u8BB0\u5F55\u4F46\u672A\u5BF9\u5E94\u5230\u4EFB\u4F55\u4EA4\u4ED8\u9879\uFF1A${text(u.doi || u.kind, 140)}\u3002\u82E5\u8BA1\u5212\u91CC\u5199\u7684\u6587\u732E\u6709\u8BEF\uFF0C\u7528 task_wait kind=rebind\uFF08milestoneId + doi + reason\uFF09\u8BF7\u7528\u6237\u786E\u8BA4\u66F4\u6362\u3002`
    );
  if (milestones.length && !remaining.length) {
    lines.push("\u7EA6\u5B9A\u7684\u4EA4\u4ED8\u90FD\u5DF2\u786E\u8BA4\u5B8C\u6210\u3002\u8FD8\u60F3\u505A\u522B\u7684\uFF0C\u76F4\u63A5\u8BF4\u5C31\u884C\u3002");
    const returned = (task.operations || []).filter((o) => o.state === "returned").length;
    const failed = (task.operations || []).filter((o) => o.state === "failed").length;
    if (returned)
      lines.push(`\u5176\u4E2D ${returned} \u6B65\u547D\u4EE4/\u5916\u90E8\u64CD\u4F5C\u53EA\u6709\u8FD4\u56DE\u8BB0\u5F55\u3001\u6CA1\u6709\u72EC\u7ACB\u6838\u5BF9\uFF1B\u4EA4\u4ED8\u4EE5\u9A8C\u6536\u8FC7\u7684\u6587\u4EF6\u4E3A\u51C6\u3002`);
    if (failed) lines.push(`\u8FC7\u7A0B\u4E2D\u6709 ${failed} \u6B65\u64CD\u4F5C\u51FA\u8FC7\u9519\uFF1B\u4EA4\u4ED8\u4EE5\u6700\u7EC8\u9A8C\u6536\u8FC7\u7684\u6587\u4EF6\u4E3A\u51C6\u3002`);
  }
  return lines.join("\n").slice(0, 1e4);
}

// src/task-runtime/tool-manifest.mjs
var registry2 = runtimeSlot("tools", "manifest", () => ({ tools: /* @__PURE__ */ new Map(), families: /* @__PURE__ */ new Map() }));
var compatibilityFamilies = /* @__PURE__ */ new Map();
var eventBridges2 = runtimeSlot("tools", "manifestEventBridges", () => /* @__PURE__ */ new WeakSet());
function matchToolFamily(toolName, args) {
  const name = String(toolName || "").toLowerCase();
  const server = typeof args?.server === "string" ? args.server.toLowerCase() : "";
  const tool = typeof args?.tool === "string" ? args.tool.toLowerCase() : "";
  for (const family of (hasRuntimeContext() ? registry2.families : compatibilityFamilies).values()) {
    const m = family.match.toLowerCase();
    if (name === m || name.startsWith(`${m}_`) || name.startsWith(`${m}-`) || server === m || tool.startsWith(`${m}_`))
      return family;
  }
  return null;
}
var CORE_READ_ONLY = /^(?:read|grep|find|ls|webfetch|websearch|set_status|todo|task_status|capability_load)$/;
function isReadOnlyTool(name, args = void 0) {
  if (CORE_READ_ONLY.test(name)) return true;
  const meta = registry2.tools.get(name);
  if (meta) return meta.readOnly === true;
  return matchToolFamily(name, args)?.readOnly === true;
}

// src/task-runtime/workbench.mjs
var WORKBENCH_ENTRY = "drone-task-workbench-v2";
var LIMITS = Object.freeze({
  tasks: 12,
  operations: 64,
  milestones: 24,
  actions: 16,
  stageCalls: 48,
  totalCalls: 192,
  /** 授权后模型中途收口时宿主自动接续的上限：每次都要求有新进展，防止空转。 */
  autoHandoffs: 16,
  retries: 3,
  fileBytes: 8 * 1024 * 1024
});
var clean2 = (value, max = 180) => String(value ?? "").replace(/(?:bearer\s+|(?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi, "[redacted]").split("").map((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || "<>".includes(c) ? " " : c).join("").slice(0, max);
var hash = (value) => createHash3("sha256").update(value).digest("hex");
var ARTIFACT_ROOT_KINDS = Object.freeze(["workspace", "vault", "research-run"]);
var clone = (value) => structuredClone(value);
var controls = /* @__PURE__ */ new Set([
  "set_status",
  "todo",
  "capability_load",
  "task_status",
  "task_plan",
  "task_wait",
  "task_reconcile",
  "task_evidence_restore"
]);
var terminal = (state) => ["completed", "cancelled", "archived"].includes(state);
var sameArtifactPath = (cwd, declared, observed, observedAbsolute = null) => {
  const normalize = (path) => {
    const absolute = resolve(cwd || process.cwd(), path);
    return process.platform === "win32" ? absolute.toLowerCase() : absolute;
  };
  if (typeof declared === "string" && isAbsolute(declared) && typeof observedAbsolute === "string")
    return normalize(declared) === normalize(observedAbsolute);
  return typeof declared === "string" && typeof observed === "string" && normalize(declared) === normalize(observed);
};
var REASON_TEXT = Object.freeze({
  "task-authorization-required": "\u8BA1\u5212\u5DF2\u7ECF\u51C6\u5907\u597D\uFF0C\u7B49\u4F60\u70B9\u5934\u3002\u786E\u8BA4\u4E00\u6B21\uFF0C\u540E\u9762\u5C31\u81EA\u52A8\u505A\u5B8C\uFF0C\u4E0D\u518D\u53CD\u590D\u6253\u6270\u3002",
  "automatic-recovery": "\u521A\u624D\u4E2D\u65AD\u4E86\u4E00\u4E0B\uFF0C\u5DF2\u7ECF\u4ECE\u4E0A\u6B21\u4FDD\u5B58\u7684\u5730\u65B9\u63A5\u7740\u505A\uFF0C\u4E0D\u7528\u4F60\u64CD\u4F5C\u3002",
  "automatic-stage-checkpoint": "\u8FDB\u5C55\u5DF2\u4FDD\u5B58\uFF0C\u6B63\u5728\u63A5\u7740\u505A\u4E0B\u4E00\u90E8\u5206\u3002",
  "automatic-handoff": "\u8FD9\u4E00\u6B65\u5DF2\u4FDD\u5B58\uFF0C\u6309\u4F60\u4E4B\u524D\u7684\u6388\u6743\u63A5\u7740\u505A\u5269\u4E0B\u7684\uFF0C\u4E0D\u7528\u518D\u786E\u8BA4\u3002",
  "total-budget": "\u8FD9\u4E2A\u4EFB\u52A1\u7684\u6B65\u6570\u5DF2\u7ECF\u7528\u5B8C\uFF0C\u505A\u51FA\u6765\u7684\u7ED3\u679C\u90FD\u4FDD\u7559\u7740\u3002\u60F3\u7EE7\u7EED\u505A\uFF0C\u8BF7\u91CD\u65B0\u63CF\u8FF0\u9700\u6C42\u5F00\u4E00\u4E2A\u65B0\u4EFB\u52A1\u3002",
  "stage-budget": "\u6700\u8FD1\u4E00\u6BB5\u6CA1\u6709\u505A\u51FA\u65B0\u8FDB\u5C55\uFF0C\u5148\u505C\u4E0B\u6765\u4FDD\u7559\u7ED3\u679C\uFF0C\u907F\u514D\u7A7A\u8F6C\u3002",
  "budget-review-required": "\u8FD9\u4E00\u6BB5\u7684\u6B65\u6570\u7528\u5B8C\u4E86\u3002\u5148\u770B\u770B\u76EE\u524D\u7684\u7ED3\u679C\uFF0C\u786E\u8BA4\u540E\u53EF\u4EE5\u5728\u4EFB\u52A1\u9762\u677F\u7EE7\u7EED\u3002",
  "reconcile-before-retry": "\u4E0A\u6B21\u6709\u64CD\u4F5C\u6CA1\u7B49\u5230\u7ED3\u679C\u5C31\u4E2D\u65AD\u4E86\uFF08\u6BD4\u5982\u5199\u6587\u4EF6\u3001\u5B89\u88C5\u3001\u4E0A\u4F20\uFF09\uFF0C\u73B0\u5728\u4E0D\u786E\u5B9A\u5B83\u505A\u6CA1\u505A\u6210\u3002\u8BF7\u5148\u70B9\u201C\u6838\u5BF9\u5DF2\u6709\u7ED3\u679C\u201D\u770B\u4E00\u4E0B\u5B9E\u9645\u60C5\u51B5\uFF0C\u522B\u8BA9\u5B83\u76F2\u76EE\u91CD\u505A\u4E00\u904D\u3002",
  "binding-changed": "\u77E5\u8BC6\u5E93\u6362\u4E86\uFF0C\u65E7\u4EFB\u52A1\u91CC\u67E5\u5230\u7684\u5185\u5BB9\u4E0D\u80FD\u7EE7\u7EED\u7528\u3002\u8BF7\u91CD\u65B0\u63CF\u8FF0\u9700\u6C42\uFF0C\u5F00\u4E00\u4E2A\u65B0\u4EFB\u52A1\u3002",
  "tool-failure": "\u4E2D\u95F4\u6709\u4E00\u6B65\u51FA\u9519\u4E86\u3002\u5177\u4F53\u662F\u54EA\u4E00\u6B65\u3001\u5F71\u4E0D\u5F71\u54CD\u7ED3\u679C\uFF0C\u770B\u4E0B\u9762\u7684\u8BB0\u5F55\u3002",
  "user-cancelled-choice-not-consent": "\u4F60\u53D6\u6D88\u4E86\u521A\u624D\u7684\u9009\u62E9\u3002\u4EFB\u52A1\u505C\u5728\u539F\u5730\u7B49\u4F60\u51B3\u5B9A\uFF0C\u4E0D\u4F1A\u81EA\u4F5C\u4E3B\u5F20\u7EE7\u7EED\u3002",
  "user-action-cancelled": "\u4F60\u8DF3\u8FC7\u4E86\u4E00\u4E2A\u9700\u8981\u4F60\u5904\u7406\u7684\u4E8B\u9879\uFF0C\u4EFB\u52A1\u5148\u505C\u7740\u3002\u60F3\u7EE7\u7EED\u65F6\u518D\u8BF4\u4E00\u58F0\u5C31\u884C\u3002",
  "wiki-rejected-or-stale": "Wiki \u4FEE\u6539\u6CA1\u6709\u901A\u8FC7\u5BA1\u9605\uFF08\u6216\u8005\u6765\u6E90\u5185\u5BB9\u53D8\u4E86\uFF09\uFF0C\u8FD9\u4E00\u9879\u8FD8\u4E0D\u7B97\u5B8C\u6210\u3002",
  "verified-stage-checkpoint": "\u6709\u4E00\u9879\u4EA4\u4ED8\u5DF2\u7ECF\u786E\u8BA4\u5B8C\u6210\uFF0C\u63A5\u7740\u505A\u4E0B\u4E00\u9879\u3002",
  "session-restored": "\u4F1A\u8BDD\u5DF2\u6062\u590D\uFF0C\u4ECE\u4E0A\u6B21\u4FDD\u5B58\u7684\u8FDB\u5EA6\u63A5\u7740\u6765\u3002",
  "legacy-checkpoint-unreviewed": "\u8FD9\u662F\u4ECE\u65E7\u7248\u672C\u5E26\u8FC7\u6765\u7684\u4EFB\u52A1\u8BB0\u5F55\uFF0C\u4E4B\u524D\u505A\u4E86\u4EC0\u4E48\u8FD8\u6CA1\u6838\u5BF9\u8FC7\u3002",
  "user-cancelled": "\u4F60\u5DF2\u53D6\u6D88\u8FD9\u4E2A\u4EFB\u52A1\u3002",
  "user-archived": "\u4EFB\u52A1\u5DF2\u5F52\u6863\u3002"
});
var explainReason = (code) => code ? REASON_TEXT[code] || code : null;
var defersPendingReview = (query) => /^(?:继续(?:做完|吧|执行|处理|完成|上一任务)?|接着(?:做|处理)?|continue|resume)[\s,.!？，。！?]*$/i.test(
  String(query ?? "").trim()
);
var error3 = (code, message) => Object.assign(new Error(message), { code });
var stable = (value) => JSON.stringify(
  value,
  (_key, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v
);
async function inspectTaskFile(cwd, input, expected = {}) {
  const base = await realpath(cwd), path = await realpath(resolve(cwd, input));
  const rel = relative(base, path);
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`) || rel.split(sep).some((p) => p.startsWith(".") || /^(?:auth|credentials|secrets?|tokens?|password)(?:\.|$)/i.test(p)))
    throw error3("file-scope", "Choose an explicit non-private file within this task workspace.");
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > LIMITS.fileBytes)
    throw error3(
      "file-limit",
      "Expected a regular file of at most 8 MiB; larger files need a dedicated read-only adapter."
    );
  const file = await open(path, "r");
  try {
    const opened = await file.stat();
    if (await realpath(path) !== path || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size > LIMITS.fileBytes)
      throw error3("file-changed", "File scope/version changed before inspection.");
    const bytes = await file.readFile();
    if (bytes.length > LIMITS.fileBytes)
      throw error3("file-limit", "File changed beyond the inspection limit.");
    return await inspectTaskBytes(bytes, {
      path: rel.split(sep).join("/"),
      absolutePath: path,
      rootKind: ARTIFACT_ROOT_KINDS.includes(expected.rootKind) ? expected.rootKind : "workspace"
    }, expected);
  } finally {
    await file.close();
  }
}
function createTaskWorkbench({
  persist = () => {
  },
  now = () => (/* @__PURE__ */ new Date()).toISOString(),
  inspect = inspectTaskFile,
  // 验收器（挂钩 2）：默认读扩展登记表；测试可按 kind 注入覆盖 { kind: definition | null }
  verifiers = null,
  onCheckpoint = () => {
  },
  requireAuthorization = false,
  // The host supplies its session-bound manifest; standalone callers use the active runtime.
  readOnly = isReadOnlyTool
} = {}) {
  const verifierFor = (kind) => {
    if (verifiers && Object.hasOwn(verifiers, kind))
      return verifiers[kind] ? {
        fields: [],
        evidenceKind: `${kind}-verified`,
        operationVerifier: `${kind}-record-not-scientific-proof`,
        ...verifiers[kind],
        kind
      } : null;
    return acceptanceVerifier(kind);
  };
  const allVerifiers = () => {
    const kinds = /* @__PURE__ */ new Set([...acceptanceVerifiers().map((v) => v.kind), ...Object.keys(verifiers || {})]);
    return [...kinds].map(verifierFor).filter(Boolean);
  };
  const knownKinds = () => /* @__PURE__ */ new Set([...CORE_ACCEPTANCE_KINDS, ...acceptanceKinds(), ...Object.keys(verifiers || {})]);
  const depsDone = (t, m) => m.dependsOn.every((dep) => t.milestones.find((x) => x.id === dep)?.state === "completed");
  let book = {
    version: 2,
    scope: null,
    revision: 0,
    activeTaskId: null,
    selectionRequired: false,
    tasks: []
  }, requested = false, pinned = false, turnCapabilities = [], turnBinding = null;
  const active = () => book.tasks.find((t) => t.id === book.activeTaskId) || null;
  const save = () => {
    book.revision++;
    const t = active();
    if (t) t.updatedAt = now();
    persist(clone(book));
  };
  function attach(scope, entries = [], force = false) {
    if (book.scope === scope && !force) return;
    book = { version: 2, scope, revision: 0, activeTaskId: null, selectionRequired: false, tasks: [] };
    requested = false;
    pinned = false;
    turnCapabilities = [];
    turnBinding = null;
    for (const entry of entries) {
      const data = entry.data;
      if (entry.customType !== WORKBENCH_ENTRY || data?.version !== 2 || data.scope !== scope || !Array.isArray(data.tasks) || data.tasks.length > LIMITS.tasks || JSON.stringify(data).length > 22e4)
        continue;
      if (!data.tasks.every(
        (t) => typeof t?.id === "string" && typeof t.goal === "string" && Array.isArray(t.operations) && t.operations.length <= LIMITS.operations && Array.isArray(t.milestones) && Array.isArray(t.actions) && t.budget && Array.isArray(t.receipts)
      ))
        continue;
      book = clone(data);
    }
    if (!book.tasks.length) {
      const legacy = [...entries].reverse().find(
        (e) => e.customType === "drone-task-checkpoint-v1" && e.data?.scope === scope && typeof e.data?.goal === "string"
      );
      if (legacy) {
        const t = make(legacy.data.goal);
        t.state = "partial";
        t.reason = "legacy-checkpoint-unreviewed";
        t.receipts = (legacy.data.receipts || []).slice(-24).filter((r) => r && typeof r.tool === "string").map((r) => ({
          id: clean2(r.id),
          tool: clean2(r.tool),
          state: "legacy-unreviewed",
          at: clean2(r.at)
        }));
        book.tasks.push(t);
        book.activeTaskId = t.id;
      }
    }
    for (const t of book.tasks) {
      delete t.executionConsent;
      for (const op of t.operations)
        if (op.state === "started") {
          op.state = "unknown";
          t.state = "blocked";
          t.reason = "reconcile-before-retry";
        }
      if (t.state === "running") {
        t.state = "partial";
        t.reason = "session-restored";
      }
      if (t.waitStartedAt) {
        t.waitMs += Math.max(0, Date.parse(now()) - Date.parse(t.waitStartedAt));
        t.waitStartedAt = now();
      }
    }
  }
  function make(goal) {
    const t = {
      id: randomUUID(),
      goal: clean2(goal),
      state: "pending",
      createdAt: now(),
      updatedAt: now(),
      reason: null,
      stage: 1,
      stageProgress: 0,
      authorizationRequired: requireAuthorization,
      progressCount: 0,
      stageStartProgress: 0,
      progressKeys: [],
      pendingObservations: [],
      budget: { calls: 0, stageCalls: 0, recoveries: 0, bytes: 0, autoResumes: 0 },
      milestones: [],
      actions: [],
      operations: [],
      receipts: [],
      capabilities: [],
      waitMs: 0,
      waitStartedAt: null
    };
    return t;
  }
  function requireTask() {
    const t = active();
    if (!t || book.selectionRequired) throw error3("task-selection-required", "Select a task first.");
    return t;
  }
  function begin(query, capabilities = [], binding = null) {
    turnCapabilities = capabilities.filter((c) => typeof c === "string").slice(0, 16);
    turnBinding = binding;
    const eligible = book.tasks.filter((t2) => !terminal(t2.state));
    if (!active() && eligible.length === 1) book.activeTaskId = eligible[0].id;
    if (!active() && eligible.length > 1 && !pinned) {
      book.selectionRequired = true;
      save();
      return { selectionRequired: true };
    }
    const t = active();
    if (!t) {
      save();
      return { idle: true };
    }
    if (book.selectionRequired) return { selectionRequired: true };
    if (t.binding === void 0) t.binding = binding;
    if (t.binding !== binding) {
      t.state = "blocked";
      t.reason = "binding-changed";
      save();
      return { blocked: true };
    }
    if (terminal(t.state)) {
      book.activeTaskId = null;
      save();
      return { idle: true };
    }
    t.lastDefer = null;
    if (defersPendingReview(query) && !t.operations.some((o) => ["started", "unknown"].includes(o.state))) {
      let reviews = 0;
      for (const action of t.actions) {
        if (action.state === "pending" && action.kind === "review") {
          action.state = "cancelled";
          action.resolvedAt = now();
          reviews++;
        }
      }
      if (reviews) {
        settleWait(t);
        t.lastDefer = { reviews, releasedStage: false };
      }
    }
    if (t.operations.some((o) => ["started", "unknown"].includes(o.state))) {
      t.state = "blocked";
      t.reason = "reconcile-before-retry";
    } else if (t.actions.some((a) => a.state === "pending")) t.state = "waiting_user";
    else if (t.milestones.length && !t.planApproved) {
      t.state = "waiting_user";
      t.reason = "task-authorization-required";
    } else if (t.budget.stageCalls >= LIMITS.stageCalls && advanceStage()) t.state = "running";
    else if (t.budget.calls >= LIMITS.totalCalls || t.budget.stageCalls >= LIMITS.stageCalls) {
      t.state = "blocked";
      t.reason = "budget-review-required";
    } else t.state = "running";
    t.capabilities = [.../* @__PURE__ */ new Set([...t.capabilities, ...capabilities])].filter((c) => typeof c === "string").slice(0, 16);
    if (t.lastDefer)
      t.lastDefer.releasedStage = t.reason === "automatic-stage-checkpoint" && t.budget.stageCalls === 0;
    requested = false;
    save();
    return {
      taskId: t.id,
      deferredReview: Boolean(t.lastDefer?.reviews),
      stageReleased: t.lastDefer?.releasedStage === true
    };
  }
  function openTask(query, binding = turnBinding) {
    if (book.tasks.length >= LIMITS.tasks) {
      const archived = book.tasks.filter((x) => x.state === "archived");
      if (archived.length) book.tasks.splice(book.tasks.indexOf(archived[0]), 1);
    }
    if (book.tasks.length >= LIMITS.tasks)
      throw error3(
        "task-capacity",
        "Task history is full. Archive a finished task from the task panel (export first if needed); no open task is silently discarded."
      );
    if (active()?.state === "running") active().state = "partial";
    const t = make(query);
    t.binding = binding;
    t.capabilities = [...turnCapabilities];
    book.tasks.push(t);
    book.activeTaskId = t.id;
    pinned = false;
    save();
    return t;
  }
  function plan(input) {
    if (book.selectionRequired) throw error3("task-selection-required", "Select a task first.");
    const kinds = [...knownKinds()];
    const milestones = normalizeTaskMilestones(input.milestones, {
      kinds,
      fields: Object.fromEntries(kinds.map((kind) => [kind, verifierFor(kind)?.fields || []]))
    });
    const current = active();
    const t = current && !terminal(current.state) && !current.milestones.length ? current : openTask(input.goal || "\u4EFB\u52A1", turnBinding);
    if (t !== current && current && current.milestones.length && !terminal(current.state))
      current.state = "partial";
    if (input.goal) t.goal = clean2(input.goal);
    t.authorizationSummary = clean2(input.summary || t.goal, 1200);
    t.writeRoots = [...input.writeRoots || []];
    if (input.compute !== void 0) t.compute = clone(input.compute);
    else delete t.compute;
    t.milestones = milestones;
    t.planApproved = false;
    t.state = "waiting_user";
    t.reason = "task-authorization-required";
    save();
    return clone(milestones);
  }
  function wait(input) {
    const t = requireTask();
    if (!["file", "download", "authorization", "review", "rebind"].includes(input.kind))
      throw error3("action-kind", "Unknown user action.");
    if (t.actions.filter((a) => a.state === "pending").length >= LIMITS.actions)
      throw error3("action-limit", "Resolve an existing action first.");
    let rebind = null;
    if (input.kind === "rebind") {
      const m = t.milestones.find((m2) => m2.id === input.milestoneId);
      if (!m) throw error3("rebind-milestone", "Name an existing milestone of this task to rebind.");
      if (!t.planApproved)
        throw error3(
          "rebind-plan",
          "Rebind applies to an approved plan; before approval call task_plan with the correct identity."
        );
      const fields = verifierFor(m.acceptance.kind)?.fields || [];
      const doi = clean2(input.doi, 512);
      if (!fields.includes("doi") || !doi)
        throw error3(
          "rebind-identity",
          "Only milestones whose acceptance declares a doi field can be rebound; supply the new doi."
        );
      const current = effectiveAcceptance(m);
      if (sameIdentity(current.doi, doi))
        throw error3(
          "rebind-same",
          "This milestone already names that identity; verify it instead of rebinding."
        );
      if (t.actions.some((a) => a.kind === "rebind" && a.state === "pending" && a.milestoneId === m.id))
        throw error3("rebind-pending", "A rebind request for this milestone is already waiting for the user.");
      rebind = { milestoneId: m.id, doi, previous: clean2(current.doi, 512) || null };
    }
    let url = null;
    if (input.url) {
      const parsed = new URL(input.url);
      if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || /(?:token|key|secret|auth)=/i.test(parsed.search))
        throw error3("action-url", "Use a public browser link without embedded credentials.");
      url = parsed.href;
    }
    const action = {
      id: randomUUID(),
      kind: input.kind,
      title: clean2(input.title),
      reason: clean2(input.reason),
      url,
      expected: {
        kind: input.kind === "download" ? "pdf" : rebind ? "identity" : "file",
        doi: rebind ? rebind.doi : clean2(input.doi),
        title: clean2(input.title),
        sha256: /^[a-f0-9]{64}$/.test(input.sha256 || "") ? input.sha256 : null
      },
      ...rebind ? { previous: rebind.previous } : {},
      milestoneId: t.milestones.some((m) => m.id === input.milestoneId) ? input.milestoneId : null,
      state: "pending",
      createdAt: now(),
      file: null
    };
    t.actions.push(action);
    t.state = "waiting_user";
    if (["automatic-handoff", "automatic-stage-checkpoint", "automatic-recovery"].includes(t.reason))
      t.reason = null;
    t.waitStartedAt ||= now();
    save();
    return clone(action);
  }
  function checkRevision(id, revision) {
    if (revision !== book.revision) throw error3("stale-task-view", "Task changed. Refresh before acting.");
    const t = book.tasks.find((t2) => t2.id === id);
    if (!t) throw error3("task-scope", "Task does not belong to this session/branch.");
    return t;
  }
  function settleWait(t) {
    if (!t.actions.some((a) => a.state === "pending") && t.waitStartedAt) {
      t.waitMs += Math.max(0, Date.parse(now()) - Date.parse(t.waitStartedAt));
      t.waitStartedAt = null;
      if (t.state === "waiting_user") t.state = "partial";
    }
  }
  function command(input) {
    const t = checkRevision(input.taskId, input.revision);
    if (book.tasks.some((x) => x.operations.some((o) => o.state === "started")))
      throw error3("task-busy", "Stop the running agent before changing task state.");
    if (input.action === "authorize-task") {
      if (terminal(t.state) || !t.milestones.length)
        throw error3("plan-required", "Review a non-empty task plan before authorizing execution.");
      if (!hasTaskConsent(t, LIMITS.totalCalls)) {
        t.executionConsent = {
          version: 1,
          contractHash: contractHash(t),
          approvedAt: now(),
          maxCalls: LIMITS.totalCalls,
          maxAutoResumes: MAX_AUTO_RESUMES
        };
        t.stage++;
        t.budget.stageCalls = 0;
        t.stageStartProgress = t.progressCount || 0;
      }
      t.planApproved = true;
      t.planApprovedAt = t.executionConsent.approvedAt;
      book.activeTaskId = t.id;
      book.selectionRequired = false;
      pinned = true;
      t.state = "partial";
      t.reason = null;
    } else if (input.action === "approve-plan") {
      t.planApproved = true;
      t.planApprovedAt = now();
    } else if (input.action === "select") {
      book.activeTaskId = t.id;
      book.selectionRequired = false;
      pinned = true;
    } else if (input.action === "cancel") {
      if (t.operations.some((o) => o.state === "started"))
        throw error3("task-busy", "Stop the running agent before cancelling this task.");
      t.state = "cancelled";
      t.reason = "user-cancelled";
      for (const a of t.actions) if (a.state === "pending") a.state = "cancelled";
      settleWait(t);
    } else if (input.action === "archive") {
      if (!["completed", "cancelled", "partial", "blocked"].includes(t.state))
        throw error3("archive-state", "Cancel or finish the task before archiving it.");
      if (t.operations.some((o) => ["started", "unknown"].includes(o.state)))
        throw error3(
          "archive-unknown",
          "Reconcile unknown effects before archiving; archiving is not confirmation."
        );
      if (t.actions.some((a) => a.state === "pending"))
        throw error3("archive-pending", "Resolve or dismiss pending user actions before archiving.");
      t.archivedFrom = t.state;
      t.state = "archived";
      t.reason = "user-archived";
      t.archivedAt = now();
      settleWait(t);
      if (book.activeTaskId === t.id) {
        book.activeTaskId = null;
        pinned = false;
      }
    } else if (input.action === "next-stage") {
      if (t.budget.calls >= LIMITS.totalCalls)
        throw error3(
          "total-budget",
          "Absolute task budget reached. Export the checkpoint and explicitly scope a new task; no automatic continuation."
        );
      if (t.operations.some((o) => ["started", "unknown"].includes(o.state)) || t.actions.some((a) => a.state === "pending"))
        throw error3(
          "reconcile-before-resume",
          "Resolve unknown effects and pending user actions before another stage."
        );
      book.activeTaskId = t.id;
      book.selectionRequired = false;
      pinned = true;
      t.stage++;
      t.budget.stageCalls = 0;
      t.state = "partial";
      t.reason = null;
    } else if (input.action === "acknowledge" || input.action === "dismiss") {
      const a = t.actions.find((a2) => a2.id === input.actionId && a2.state === "pending");
      if (!a) throw error3("action-stale", "Action no longer pending.");
      if (input.action === "acknowledge" && ["download", "file"].includes(a.kind) && !a.file)
        throw error3("file-required", "Inspect the selected file first.");
      if (input.action === "acknowledge" && a.kind === "review" && a.milestoneId) {
        const kind = t.milestones.find((m2) => m2.id === a.milestoneId)?.acceptance.kind;
        const refusal = verifierFor(kind)?.acknowledgeError;
        if (refusal) throw error3(refusal.code, refusal.message);
      }
      a.state = input.action === "dismiss" ? "cancelled" : "acknowledged";
      a.resolvedAt = now();
      if (a.file) a.file.identity = a.file.identity === "hash-matched" ? "hash-matched" : "human-confirmed";
      const m = t.milestones.find((m2) => m2.id === a.milestoneId);
      if (m && a.state === "acknowledged" && a.kind === "rebind" && a.expected?.doi) {
        m.bound = { fields: { doi: a.expected.doi }, via: "rebind", actionId: a.id, at: now() };
        m.state = "pending";
        m.evidence = null;
        t.unboundIdentities = (t.unboundIdentities || []).filter((u) => !sameIdentity(u.doi, a.expected.doi));
      }
      if (m && a.state === "acknowledged" && m.acceptance.kind === "human_review" && m.dependsOn.every((id) => t.milestones.find((x) => x.id === id)?.state === "completed")) {
        m.state = "completed";
        m.evidence = { kind: "human-review", at: now(), scope: m.title };
      }
      settleWait(t);
      if (input.action === "dismiss") {
        t.state = "blocked";
        t.reason = "user-action-cancelled";
      }
    } else if (input.action === "confirm-outcome") {
      const op = t.operations.find((o) => o.id === input.operationId);
      if (!op || !["unknown", "returned"].includes(op.state))
        throw error3("operation-stale", "No uncertain operation to confirm.");
      op.state = "human-confirmed";
      op.checkedAt = now();
      op.verifier = "explicit-user-attestation-not-scientific-proof";
      t.reason = null;
      t.state = "partial";
    } else throw error3("task-command", "Unsupported task action.");
    save();
    return view();
  }
  async function acceptFile(input, cwd) {
    const t = checkRevision(input.taskId, input.revision), a = t.actions.find((a2) => a2.id === input.actionId && a2.state === "pending");
    if (!a || !["file", "download"].includes(a.kind))
      throw error3("action-file", "Select an active file/download action.");
    const file = await inspect(cwd, input.path, a.expected);
    checkRevision(input.taskId, input.revision);
    if (t.actions.some((other) => other.id !== a.id && other.file?.sha256 === file.sha256))
      throw error3(
        "duplicate-file",
        "This exact file is already associated with another action; original file was not changed."
      );
    a.file = file;
    a.fileCheckedAt = now();
    save();
    return clone(a);
  }
  function stillCurrent(id, t) {
    const cur = book.tasks.find((x) => x.id === id);
    if (!cur) throw error3("task-scope", "Task does not belong to this session/branch.");
    if (cur !== t)
      throw error3("stale-task-view", "Task was replaced while reconciling; call task_reconcile again.");
  }
  async function reconcile(cwd) {
    const t = requireTask(), id = t.id;
    const updates = [];
    for (const m of t.milestones) {
      const verifier = verifierFor(m.acceptance.kind);
      if (!verifier?.verify) continue;
      let result;
      try {
        result = await verifier.verify(effectiveAcceptance(m), { cwd, task: clone(t) }) || {
          state: "unknown"
        };
      } catch (e) {
        result = { state: "unknown", reason: clean2(e?.message || "verifier-failed") };
      }
      stillCurrent(id, t);
      m.state = result.state === "found" && depsDone(t, m) ? "completed" : result.state === "pending" ? "pending" : "blocked";
      m.evidence = { ...result, kind: verifier.evidenceKind, at: now() };
      if (result.state === "found") {
        for (const op of t.operations)
          if (op.identityMilestoneId === m.id && ["returned", "unknown"].includes(op.state)) {
            op.state = "verified";
            op.verifier = verifier.operationVerifier;
            op.checkedAt = now();
          }
      }
    }
    for (const m of t.milestones) {
      if (m.acceptance.kind !== "file") continue;
      try {
        const artifact = await inspect(cwd, m.evidence?.absolutePath || m.acceptance.path, {
          sha256: m.acceptance.sha256 || m.evidence?.sha256,
          rootKind: m.acceptance.rootKind || m.evidence?.rootKind
        });
        updates.push({ id: m.id, artifact });
      } catch (e) {
        updates.push({ id: m.id, error: e.code || "file-unavailable" });
      }
    }
    stillCurrent(id, t);
    for (const update of updates) {
      const m = t.milestones.find((m2) => m2.id === update.id);
      if (update.error) {
        m.state = "blocked";
        m.evidence = { code: update.error, at: now() };
      } else if (m.dependsOn.every((dep) => t.milestones.find((m2) => m2.id === dep)?.state === "completed")) {
        m.state = "completed";
        m.evidence = { ...update.artifact, kind: "file-observed", at: now() };
      }
    }
    for (const op of t.operations) {
      if (!op.artifact || !["verified", "returned", "unknown"].includes(op.state)) continue;
      try {
        const artifact = await inspect(cwd, op.artifact.absolutePath || op.artifact.path, {
          sha256: op.artifact.sha256,
          rootKind: op.artifact.rootKind
        });
        op.state = "verified";
        op.checkedAt = now();
        op.artifact = artifact;
      } catch (e) {
        op.state = e.code === "ENOENT" ? "not-found" : "changed";
        op.checkedAt = now();
      }
    }
    stillCurrent(id, t);
    for (const op of t.operations.filter((o) => o.state === "awaiting-review" && o.review?.id)) {
      const verifier = verifierFor(op.review.kind);
      if (!verifier?.resolve) continue;
      let result = null;
      try {
        result = await verifier.resolve(op.review, { cwd });
      } catch {
        result = null;
      }
      stillCurrent(id, t);
      if (!result) continue;
      op.checkedAt = now();
      if (result.status === "applied" && !result.stale) {
        op.state = "verified";
        op.verifier = verifier.operationVerifier;
        for (const m of t.milestones)
          if (m.acceptance.kind === op.review.kind && (!m.acceptance.path || !result.path || m.acceptance.path === result.path) && depsDone(t, m)) {
            m.state = "completed";
            m.evidence = { kind: verifier.evidenceKind, candidateId: op.review.id, at: now() };
          }
      } else if (result.status === "rejected" || result.stale) {
        op.state = "failed";
        t.reason = result.reason || `${op.review.kind.replaceAll("_", "-")}-rejected-or-stale`;
      }
    }
    t.lastReconciledAt = now();
    derive(t);
    save();
    return view();
  }
  function derive(t) {
    if (terminal(t.state) && t.state !== "completed") return;
    if (t.operations.some((o) => ["unknown", "started", "changed"].includes(o.state))) {
      t.state = "blocked";
      t.reason = "reconcile-before-retry";
    } else if (t.actions.some((a) => a.state === "pending")) t.state = "waiting_user";
    else if (t.planApproved && t.milestones.length && t.milestones.every((m) => m.state === "completed")) {
      t.state = "completed";
      t.reason = null;
    } else t.state = "partial";
  }
  function readRoots() {
    const t = active();
    return t && hasTaskConsent(t, LIMITS.totalCalls) && !["cancelled", "archived"].includes(t.state) && !book.selectionRequired && t.reason !== "binding-changed" ? [...t.writeRoots || []] : [];
  }
  function authorization(forWrite = false) {
    const t = active();
    if (!t || !hasTaskConsent(t, LIMITS.totalCalls) || terminal(t.state) || book.selectionRequired || t.reason === "binding-changed" || t.state === "waiting_user" || t.operations.some(
      (o) => (forWrite ? ["unknown", "changed"] : ["started", "unknown", "changed"]).includes(o.state)
    ))
      return null;
    const acceptances = [];
    for (const m of t.milestones || []) {
      const verifier = verifierFor(m.acceptance?.kind);
      if (!verifier?.consent) continue;
      const entry = verifier.consent(m.bound?.via === "rebind" ? effectiveAcceptance(m) : m.acceptance);
      if (!entry) continue;
      if (entry.slot && (m.bound || m.state === "completed")) continue;
      acceptances.push({ milestoneId: m.id, kind: m.acceptance.kind, ...entry });
    }
    return { taskId: t.id, writeRoots: [...t.writeRoots || []], ...t.executionConsent, acceptances };
  }
  function reserveContinuation(reason) {
    const t = active();
    const recoverable = /* @__PURE__ */ new Set([
      "tool-loop-stopped",
      "source-unread",
      "source-changed",
      "search-required",
      "search-stale",
      "citation-required",
      "check-timeout"
    ]);
    if (!authorization() || !recoverable.has(reason) || t.budget.calls >= LIMITS.totalCalls || (t.budget.autoResumes || 0) >= MAX_AUTO_RESUMES || t.actions.some((a) => a.state === "pending") || (t.progressCount || 0) <= (t.lastResumeProgress || 0))
      return false;
    t.budget.autoResumes = (t.budget.autoResumes || 0) + 1;
    t.lastResumeProgress = t.progressCount;
    t.stage++;
    t.budget.stageCalls = 0;
    t.stageStartProgress = t.progressCount;
    t.reason = "automatic-recovery";
    t.state = "partial";
    save();
    return true;
  }
  function reserveHandoff() {
    const t = active();
    if (!authorization() || t.state === "blocked" || !t.milestones.length || !t.milestones.some((m) => m.state !== "completed") || t.actions.some((a) => a.state === "pending") || t.operations.some((o) => ["started", "unknown", "changed"].includes(o.state)) || t.budget.calls >= LIMITS.totalCalls || (t.budget.autoHandoffs || 0) >= LIMITS.autoHandoffs || (t.progressCount || 0) <= (t.lastResumeProgress || 0))
      return false;
    t.budget.autoHandoffs = (t.budget.autoHandoffs || 0) + 1;
    t.lastResumeProgress = t.progressCount;
    t.reason = "automatic-handoff";
    t.state = "partial";
    save();
    return true;
  }
  function advanceStage() {
    const t = active();
    if (!t?.planApproved || t.budget.calls >= LIMITS.totalCalls || t.operations.some((o) => o.state === "unknown"))
      return false;
    const count = t.milestones.filter((m) => m.state === "completed").length;
    const automatic = hasTaskConsent(t, LIMITS.totalCalls) && (t.progressCount || 0) > (t.stageStartProgress || 0) && !t.actions.some((a) => a.state === "pending");
    if (!automatic && count <= (t.stageProgress || 0)) return false;
    t.stageStartProgress = t.progressCount || 0;
    t.stageProgress = count;
    t.stage++;
    t.budget.stageCalls = 0;
    t.state = "partial";
    t.reason = automatic ? "automatic-stage-checkpoint" : "verified-stage-checkpoint";
    save();
    onCheckpoint();
    return true;
  }
  function guard(event) {
    if (book.selectionRequired) throw error3("task-selection-required", "Select a task first.");
    if (event.toolName === "task_plan") return null;
    const t = active();
    if (!t || terminal(t.state)) {
      if (controls.has(event.toolName) || readOnly(event.toolName) || /^research_/.test(event.toolName) || event.toolName === "ask_user")
        return null;
      return {
        block: true,
        reason: bilingual(
          "\u8FD8\u6CA1\u6709\u83B7\u6279\u7684\u4EFB\u52A1\u65B9\u6848\uFF1AAgent \u9700\u5148\u505A\u53EA\u8BFB\u51C6\u5907\uFF0C\u518D\u7528 task_plan \u63D0\u4EA4\u76EE\u6807\u3001\u8303\u56F4\u3001\u5199\u5165\u76EE\u5F55\u548C\u4EA4\u4ED8\u7269\uFF0C\u7531\u4F60\u5728\u5F39\u7A97\u4E2D\u6279\u51C6\uFF1B\u6279\u51C6\u524D\u547D\u4EE4\u548C\u5199\u5165\u90FD\u4F1A\u88AB\u62E6\u622A\u3002",
          "No approved task plan exists yet. First prepare the inputs without side effects, then call task_plan once with the goal, scope, write directories and deliverables; the application will ask you to approve that plan. Commands and writes stay blocked until approval."
        )
      };
    }
    if (t.budget.stageCalls >= LIMITS.stageCalls) advanceStage();
    if (event.toolName === "task_status") return null;
    if (terminal(t.state) || book.selectionRequired)
      return { block: true, reason: "Select an unfinished task before starting tools." };
    const vaultTool = /^research_/.test(event.toolName);
    if (t.authorizationRequired && !hasTaskConsent(t, LIMITS.totalCalls) && !controls.has(event.toolName) && !readOnly(event.toolName) && !vaultTool && event.toolName !== "ask_user") {
      t.state = "waiting_user";
      t.reason = "task-authorization-required";
      save();
      return {
        block: true,
        reason: "First prepare the inputs without side effects, then call task_plan once with the goal, scope, write directories and deliverables. The application will ask you to approve that plan; the card alone never authorizes execution. Do not start commands or writes, and do not ask for separate stage approvals."
      };
    }
    if (t.budget.calls >= LIMITS.totalCalls || t.budget.stageCalls >= LIMITS.stageCalls) {
      t.state = "blocked";
      t.reason = t.budget.calls >= LIMITS.totalCalls ? "total-budget" : "stage-budget";
      save();
      return {
        block: true,
        reason: hasTaskConsent(t, LIMITS.totalCalls) ? "The approved task reached a hard limit or made no new progress. Deliver observed results, remaining work and the specific blocker. Do not request routine stage approval or silently reset the total budget." : "The host kept the checkpoint. Propose one task_plan covering execution and acceptance for the user to authorize. Do not repeatedly request stage budgets."
      };
    }
    if (t.reason === "binding-changed")
      return {
        block: true,
        reason: "Binding changed: start a newly scoped task; old evidence/permissions cannot be reused."
      };
    const resourceKey = hash(`${book.scope}\0${event.toolName}\0${stable(event.input || {})}`);
    if (book.tasks.some(
      (other) => other.id !== t.id && other.operations.some(
        (o) => o.resourceKey === resourceKey && ["unknown", "started"].includes(o.state)
      )
    ))
      return {
        block: true,
        reason: "Another task has this unknown effect; reconcile its outcome before repeating it."
      };
    const effect = !controls.has(event.toolName) && !readOnly(event.toolName), key = hash(`${book.scope}\0${t.id}\0${event.toolName}\0${stable(event.input || {})}`);
    if (effect && t.operations.some((o) => o.state === "unknown"))
      return {
        block: true,
        reason: "Unknown side effect: read-only reconciliation or explicit human outcome review required before new writes."
      };
    if (effect && t.operations.some((o) => o.key === key && !["failed", "not-found"].includes(o.state)))
      return {
        block: true,
        reason: "idempotency-check: this effect already returned or has an unknown outcome. Query the saved receipt/read-only state before retrying; do not replay writes."
      };
    if (effect && t.operations.filter((o) => o.key === key && o.state === "failed").length >= LIMITS.retries)
      return {
        block: true,
        reason: "no-progress: identical effect failed three times. Repair the input or deliver the checkpoint."
      };
    if (t.operations.length >= LIMITS.operations && effect)
      return {
        block: true,
        reason: "Bounded operation ledger full. Deliver/export checkpoint; no entries silently removed."
      };
    t.budget.calls++;
    t.budget.stageCalls++;
    if (!controls.has(event.toolName) && event.toolCallId) {
      t.pendingObservations ||= [];
      t.pendingObservations.push(clean2(event.toolCallId, 100));
      t.pendingObservations = t.pendingObservations.slice(-LIMITS.totalCalls);
    }
    if (effect) {
      const op = {
        id: clean2(event.toolCallId, 100),
        key,
        tool: clean2(event.toolName, 80),
        state: "started",
        at: now(),
        stage: t.stage
      };
      if (event.toolName === "write" && typeof event.input?.path === "string" && typeof event.input?.content === "string") {
        op.artifact = {
          path: clean2(event.input.path, 512),
          sha256: hash(event.input.content),
          bytes: Buffer.byteLength(event.input.content),
          intentOnly: true
        };
      }
      op.resourceKey = hash(`${book.scope}\0${event.toolName}\0${stable(event.input || {})}`);
      t.operations.push(op);
      if (event.toolName === "ask_user") {
        t.state = "waiting_user";
        t.waitStartedAt ||= now();
      }
    }
    save();
    return null;
  }
  const sameIdentity = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  function bindIdentity(t, verifier, identity, op) {
    if (!identity || typeof identity !== "object") return null;
    const fields = {};
    for (const field of verifier.fields || [])
      if (typeof identity[field] === "string" && identity[field].trim())
        fields[field] = clean2(identity[field], 512);
    const keys = Object.keys(fields);
    if (!keys.length) return null;
    const candidates = t.milestones.filter((m) => m.acceptance?.kind === verifier.kind);
    if (!candidates.length) return null;
    const matches = (m) => {
      const current = effectiveAcceptance(m);
      return keys.every((k) => sameIdentity(current[k], fields[k]));
    };
    const named = candidates.find(matches);
    if (named) {
      if (op) op.identityMilestoneId = named.id;
      return null;
    }
    const slot = candidates.find((m) => {
      const current = effectiveAcceptance(m);
      return m.state !== "completed" && keys.every((k) => !current[k]);
    });
    if (!slot) {
      t.unboundIdentities = [
        ...(t.unboundIdentities || []).filter((u) => !keys.every((k) => sameIdentity(u[k], fields[k]))),
        { kind: verifier.kind, ...fields, tool: op?.tool || null, at: now() }
      ].slice(-8);
      return null;
    }
    slot.bound = { fields, via: op?.tool || "tool-receipt", operationId: op?.id || null, at: now() };
    slot.evidence = null;
    if (op) op.identityMilestoneId = slot.id;
    return slot;
  }
  async function observe(event, cwd) {
    const t = active();
    if (!t) return;
    if (event.toolName === "capability_load") {
      t.capabilities = [.../* @__PURE__ */ new Set([...t.capabilities, ...event.input?.capabilities || []])].filter((c) => typeof c === "string").slice(0, 16);
      save();
      return;
    }
    const bad = toolResultFailed(event);
    const observedCall = t.pendingObservations?.includes(clean2(event.toolCallId, 100));
    t.pendingObservations = (t.pendingObservations || []).filter((id) => id !== clean2(event.toolCallId, 100));
    if (observedCall && !bad && !controls.has(event.toolName) && event.toolName !== "ask_user") {
      const progressKey = hash(`${event.toolName}\0${stable(event.input || {})}`);
      t.progressKeys ||= [];
      if (!t.progressKeys.includes(progressKey)) {
        t.progressKeys.push(progressKey);
        t.progressKeys = t.progressKeys.slice(-64);
        t.progressCount = (t.progressCount || 0) + 1;
      }
    }
    const op = t.operations.find((o) => o.id === event.toolCallId);
    if (bad && (observedCall || op?.state === "started")) {
      const failure = failureObservation(event, now());
      t.failures = [...(t.failures || []).filter((f) => f.id !== failure.id), failure].slice(-4);
      if (!op && !terminal(t.state) && !["blocked", "waiting_user"].includes(t.state)) {
        t.state = "partial";
        t.reason = "tool-failure";
      }
    }
    if (!op) {
      save();
      return;
    }
    const details = event.details || {}, text2 = (event.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ");
    const failed = bad;
    const cancelled = event.toolName === "ask_user" && (details.cancelled || /cancelled|canceled/i.test(text2));
    op.state = failed ? "failed" : cancelled ? "cancelled" : "returned";
    op.at = now();
    if (!failed && ["write", "edit"].includes(event.toolName) && typeof event.input?.path === "string") {
      try {
        op.artifact = await inspect(cwd, event.input.path);
        op.state = "verified";
        op.verifier = "workspace-file-readback-not-scientific-review";
        for (const m of t.milestones)
          if (m.acceptance.kind === "file" && (!m.acceptance.rootKind || m.acceptance.rootKind === op.artifact.rootKind) && sameArtifactPath(cwd, m.acceptance.path, op.artifact.path, op.artifact.absolutePath) && (!m.acceptance.sha256 || m.acceptance.sha256 === op.artifact.sha256) && m.dependsOn.every((dep) => t.milestones.find((x) => x.id === dep)?.state === "completed")) {
            m.state = "completed";
            m.evidence = { ...op.artifact, kind: "file-observed", at: now() };
          }
      } catch {
      }
    }
    if (!failed) {
      for (const verifier of allVerifiers()) {
        if (!verifier.observe) continue;
        let review = null;
        try {
          review = verifier.observe(event, details);
        } catch {
          review = null;
        }
        if (!review?.id) continue;
        op.state = "awaiting-review";
        op.candidateId = clean2(review.id);
        op.review = { kind: verifier.kind, id: clean2(review.id), path: clean2(review.path, 512) || null };
        break;
      }
      for (const verifier of allVerifiers()) {
        if (!verifier.identify) continue;
        let identity = null;
        try {
          identity = verifier.identify(event, details);
        } catch {
          identity = null;
        }
        bindIdentity(t, verifier, identity, op);
      }
    }
    t.receipts.push({
      id: op.id,
      tool: op.tool,
      state: op.state,
      at: op.at,
      ...op.artifact ? { artifact: op.artifact } : {}
    });
    t.receipts = t.receipts.slice(-24);
    if (cancelled) {
      t.state = "waiting_user";
      t.reason = "user-cancelled-choice-not-consent";
    } else if (failed) {
      t.state = "partial";
      t.reason = "tool-failure";
    } else if (event.toolName === "ask_user") {
      if (t.waitStartedAt) {
        t.waitMs += Math.max(0, Date.parse(now()) - Date.parse(t.waitStartedAt));
        t.waitStartedAt = null;
      }
      t.state = "running";
    }
    save();
  }
  function pause(reason) {
    const t = active();
    if (t) {
      t.state = "partial";
      t.reason = clean2(reason);
      for (const op of t.operations) if (op.state === "started") op.state = "unknown";
      save();
    }
  }
  function settle() {
    const t = active();
    if (t && !terminal(t.state)) {
      if (t.state === "running") derive(t);
      save();
    }
  }
  function view() {
    return clone({
      version: 2,
      revision: book.revision,
      activeTaskId: book.activeTaskId,
      selectionRequired: book.selectionRequired,
      tasks: book.tasks.map(({ progressKeys, pendingObservations, ...t }) => ({
        ...t,
        remainingSummary: remainingExplanation(t),
        operations: t.operations.map(({ key, ...op }) => op),
        waitMs: t.waitMs + (t.waitStartedAt ? Math.max(0, Date.parse(now()) - Date.parse(t.waitStartedAt)) : 0)
      })),
      limits: LIMITS
    });
  }
  function render() {
    const t = active();
    if (!t) return "\u8FD9\u4E2A\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u4EFB\u52A1\u8BB0\u5F55\u3002";
    const labels = {
      pending: "\u5F85\u5F00\u59CB",
      running: "\u6267\u884C\u4E2D",
      waiting_user: "\u7B49\u4F60\u51B3\u5B9A",
      blocked: "\u53D7\u963B",
      partial: "\u90E8\u5206\u5B8C\u6210",
      completed: "\u5DF2\u5B8C\u6210",
      cancelled: "\u5DF2\u53D6\u6D88",
      archived: "\u5DF2\u5F52\u6863"
    };
    return [
      "### \u4EFB\u52A1\u8FDB\u5C55",
      `\u4EFB\u52A1\uFF1A${t.goal}`,
      `\u72B6\u6001\uFF1A${labels[t.state]}\uFF1B\u66F4\u65B0\u4E8E ${t.updatedAt}`,
      `\u5BBF\u4E3B\u8BA1\u6570\uFF1A\u9636\u6BB5 ${t.budget.stageCalls}/${LIMITS.stageCalls}\uFF1B\u603B\u8BA1 ${t.budget.calls}/${LIMITS.totalCalls}`,
      `\u4EA4\u4ED8\uFF1A\u5DF2\u5B8C\u6210 ${t.milestones.filter((m) => m.state === "completed").length}/${t.milestones.length} \u9879`,
      ...[
        ...new Map(
          t.operations.filter((o) => o.artifact && !o.artifact.intentOnly && o.state !== "started").map((o) => [o.artifact.path, o])
        ).values()
      ].slice(-6).map((o) => {
        const path = o.artifact.path.replaceAll("\\", "/");
        const encoded = path.split("/").map((p) => encodeURIComponent(p).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)).join("/");
        const href = /^[a-z]:\//i.test(path) ? `file:///${path.slice(0, 2)}${encoded.slice(4)}` : path.startsWith("/") ? `file://${encoded}` : `./${encoded}`;
        const label = (path.split("/").pop() || "\u4EA7\u7269").replace(/[[\]\\]/g, "\\$&");
        const stateLabel = o.state === "changed" ? "\u5185\u5BB9\u540E\u6765\u53D8\u8FC7\uFF0C\u9700\u8981\u518D\u770B\u4E00\u773C" : o.state === "verified" ? "\u5DF2\u751F\u6210\u5E76\u6838\u5BF9" : o.state === "returned" ? "\u5DF2\u751F\u6210" : o.state;
        return `- \u6587\u4EF6\uFF1A[${label}](${href}) \xB7 ${stateLabel}`;
      }),
      remainingExplanation(t),
      t.reason ? `\u8BF4\u660E\uFF1A${t.reason === "tool-failure" ? failureReceipt(t) : explainReason(t.reason)}` : null,
      book.selectionRequired ? "\u6709\u591A\u4E2A\u4EFB\u52A1\u53EF\u4EE5\u7EE7\u7EED\uFF0C\u8BF7\u5148\u5728\u4EFB\u52A1\u9762\u677F\u9009\u4E00\u4E2A\u3002" : null
    ].filter(Boolean).join("\n");
  }
  return {
    checkpoint: () => clone({ book, requested, pinned, turnCapabilities, turnBinding }),
    rollback: (state) => {
      ({ book, requested, pinned, turnCapabilities, turnBinding } = clone(state));
    },
    advanceStage,
    authorization,
    scope: () => book.scope,
    readRoots,
    reserveContinuation,
    reserveHandoff,
    attach,
    begin,
    plan,
    openTask,
    wait,
    guard,
    observe,
    command,
    acceptFile,
    reconcile,
    pause,
    settle,
    view,
    render,
    snapshot: () => active() ? clone({
      ...active(),
      pending: active().operations.filter((o) => ["started", "unknown"].includes(o.state))
    }) : null,
    requestReport: () => {
      requested = true;
    },
    takeReport: () => {
      const yes = requested;
      requested = false;
      return yes ? render() : null;
    }
  };
}

// src/task-runtime/evidence.mjs
function createEvidenceRecovery({ authorize, files, persist = () => {
} }) {
  let scope = null, taskId = null, records = [], used = 0;
  const save = () => persist({ version: 1, scope, taskId, records, used });
  return {
    checkpoint: () => structuredClone({ version: 1, scope, taskId, records, used }),
    rollback: (state) => {
      ({ scope, taskId, records, used } = structuredClone(state));
    },
    scope: () => scope,
    attach(nextScope, nextTaskId, entries = [], force = false) {
      if (!force && scope === nextScope && taskId === nextTaskId) return;
      scope = nextScope;
      taskId = nextTaskId;
      records = [];
      used = 0;
      for (const e of entries)
        if (e.customType === "drone-task-evidence-v1" && e.data?.scope === scope && e.data.taskId === taskId && Array.isArray(e.data.records) && e.data.records.length <= 8) {
          records = structuredClone(e.data.records);
          used = Number(e.data.used) || 0;
        }
    },
    async capture(event, cwd, binding) {
      if (!taskId || typeof event.input?.path !== "string" || records.some((r) => r.id === event.toolCallId))
        return;
      let file;
      try {
        file = await files.inspect(cwd, event.input.path);
      } catch (error4) {
        console.warn("Task evidence capture unavailable:", error4.code || "file-unavailable");
        return;
      }
      const offset = Math.max(1, Math.floor(event.input.offset || event.input.start_line || 1));
      const limit = Math.min(120, Math.max(1, Math.floor(event.input.limit || 120)));
      records.push({
        id: clean2(event.toolCallId, 100),
        path: file.path,
        sha256: file.sha256,
        ...file.rootKind ? { rootKind: file.rootKind } : {},
        ...file.absolutePath ? { absolutePath: file.absolutePath } : {},
        offset,
        limit,
        binding,
        evicted: false
      });
      records = records.slice(-8);
      save();
    },
    evict(ids) {
      if (!Array.isArray(ids)) return;
      let changed = false;
      for (const r of records)
        if (ids.includes(r.id)) {
          r.evicted = true;
          changed = true;
        }
      if (changed) save();
    },
    async restore(input, cwd, bindingProvider) {
      const record = records.find((r) => r.id === input.receiptId);
      if (!record?.evicted || used >= 2 || input.path !== record.path)
        throw new Error(
          "recovery-unavailable: only recorded evicted windows, twice per task; normal read budget remains active."
        );
      const binding = await bindingProvider();
      if (binding !== record.binding) throw new Error("recovery-binding-changed");
      await authorize(cwd, record.path);
      await files.inspect(cwd, record.absolutePath || record.path, {
        sha256: record.sha256,
        rootKind: record.rootKind
      });
      const text2 = (await files.readText(record.absolutePath || resolve2(cwd, record.path))).split(/\r?\n/).slice(record.offset - 1, record.offset - 1 + record.limit).join("\n").slice(0, 16e3);
      await files.inspect(cwd, record.absolutePath || record.path, {
        sha256: record.sha256,
        rootKind: record.rootKind
      });
      used++;
      record.evicted = false;
      save();
      return {
        status: "restored",
        path: record.path,
        sha256: record.sha256,
        ...record.rootKind ? { rootKind: record.rootKind } : {},
        offset: record.offset,
        limit: record.limit,
        text: text2,
        scientificallyVerified: false,
        remaining: 2 - used
      };
    }
  };
}

// src/task-runtime/task-session.mjs
var TASK_SESSION_ENTRY = "drone-task-session-v1";
var EVIDENCE_ENTRY = "drone-task-evidence-v1";
function taskEntries(entries) {
  return entries.flatMap(
    (entry) => entry.customType === TASK_SESSION_ENTRY && entry.data?.version === 1 ? [
      { customType: WORKBENCH_ENTRY, data: entry.data.workbench },
      { customType: EVIDENCE_ENTRY, data: entry.data.evidence }
    ] : [entry]
  );
}
function createTaskSession({
  persist,
  inspect,
  evidenceFiles,
  authorize,
  readOnly,
  onChanged,
  readFailure,
  onPersistenceFailed
}) {
  const lifetime = new AbortController();
  let tail = Promise.resolve(), closed = false, dirty = false, checkpointRequested = false, records = [], storage = null, lastDurable = null;
  const journal = createTaskWorkbench({
    requireAuthorization: true,
    readOnly,
    inspect,
    persist: () => {
      dirty = true;
    },
    onCheckpoint: () => {
      checkpointRequested = true;
    }
  });
  const evidence = createEvidenceRecovery({
    authorize,
    files: evidenceFiles,
    persist: () => {
      dirty = true;
    }
  });
  const projection = () => ({
    scope: journal.scope(),
    view: { ...journal.view(), storage: structuredClone(storage) },
    storage: structuredClone(storage),
    snapshot: journal.snapshot(),
    render: journal.render(),
    readRoots: journal.readRoots(),
    authorization: storage?.mode === "memory" || storage?.state === "durable" ? journal.authorization() : null,
    writeAuthorization: storage?.mode === "memory" || storage?.state === "durable" ? journal.authorization(true) : null
  });
  let live = projection(), persistenceFailure;
  const failure = () => persistenceFailure || readFailure();
  const execute = (signal, operation) => {
    const previous = tail;
    let release;
    tail = new Promise((resolve3) => {
      release = resolve3;
    });
    const combined = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
    return (async () => {
      await previous;
      let before, beforeEvidence, beforeRecords, accepted = false;
      try {
        if (closed) throw new Error("Task session is closed");
        if (failure())
          throw new Error(
            "Task storage failed; reopen the application from disk before changing this session. " + failure().message
          );
        combined.throwIfAborted();
        before = journal.checkpoint();
        beforeEvidence = evidence.checkpoint();
        beforeRecords = records;
        dirty = false;
        checkpointRequested = false;
        const result = await operation(journal, evidence, combined);
        evidence.attach(journal.scope(), journal.snapshot()?.id, records);
        combined.throwIfAborted();
        if (dirty) {
          try {
            storage = await persist(
              {
                customType: TASK_SESSION_ENTRY,
                data: {
                  version: 1,
                  workbench: journal.checkpoint().book,
                  evidence: evidence.checkpoint()
                }
              },
              combined
            );
          } catch (error4) {
            persistenceFailure = {
              state: "needs-reopen",
              message: error4.message,
              lastCommitted: structuredClone(lastDurable || live)
            };
            onPersistenceFailed(persistenceFailure);
            throw error4;
          }
        }
        live = projection();
        if (storage?.state === "durable") lastDurable = structuredClone(live);
        accepted = true;
        combined.throwIfAborted();
        if (checkpointRequested) await onChanged(live);
        return result;
      } catch (error4) {
        if (!accepted && before) {
          journal.rollback(before);
          evidence.rollback(beforeEvidence);
          records = beforeRecords;
        }
        throw error4;
      } finally {
        release();
      }
    })();
  };
  const status = () => {
    if (closed) throw new Error("Task session is closed");
    const result = structuredClone(failure()?.lastCommitted || live);
    if (failure()) {
      result.persistence = { state: failure().state, message: failure().message };
      result.storage = { ...result.storage, state: "needs-reopen" };
      result.view.storage = result.storage;
      result.authorization = null;
      result.writeAuthorization = null;
      result.readRoots = [];
      result.render += "\nTask storage failed. This is the last confirmed task state; reopen the application from disk before continuing.";
    }
    if (!failure() && result.storage?.state === "deferred") {
      result.render += "\n" + (hostLanguage() === "zh" ? result.storage.mode === "memory" ? "\u5F53\u524D\u4EFB\u52A1\u4EC5\u4FDD\u7559\u5728\u5185\u5B58\u4E2D\uFF0C\u672A\u4FDD\u5B58\u5230\u78C1\u76D8\uFF1B\u91CD\u65B0\u52A0\u8F7D\u4E0D\u4F1A\u6062\u590D\u672C\u8F6E\u6388\u6743\u3002" : "\u4EFB\u52A1\u68C0\u67E5\u70B9\u4ECD\u4E3A deferred\uFF0C\u5C1A\u672A\u4FDD\u5B58\u5230\u78C1\u76D8\uFF1B\u5916\u90E8\u5199\u5165\u987B\u7B49\u5F85\u771F\u5B9E\u843D\u76D8\u56DE\u6267\u3002" : result.storage.mode === "memory" ? "This task is live-only in memory, not saved to disk; reloading does not restore this activation's authorization." : "Task checkpoint durability is deferred; external writes require an actual disk receipt.");
    }
    return result;
  };
  return {
    status,
    input: ({ query, capabilities, binding }, signal) => execute(signal, (journal2) => journal2.begin(query, capabilities, binding)),
    turn: (event, signal) => execute(signal, (journal2, evidence2) => {
      switch (event.kind) {
        case "attach": {
          storage = { mode: event.storage.mode, state: event.storage.state };
          records = taskEntries(event.entries);
          journal2.attach(event.scope, records, event.force);
          evidence2.attach(event.scope, journal2.snapshot()?.id, records, event.force);
          return;
        }
        case "storage":
          storage = { mode: event.storage.mode, state: event.storage.state };
          if (storage.state === "needs-reopen") {
            persistenceFailure = { state: "needs-reopen", message: event.storage.code, lastCommitted: structuredClone(lastDurable || live) };
            onPersistenceFailed(persistenceFailure);
            throw new Error("Task storage needs-reopen: " + event.storage.code);
          }
          return;
        case "pause":
          return journal2.pause(event.reason);
        case "settle":
          return journal2.settle();
        case "reserve-continuation":
          return journal2.reserveContinuation(event.reason);
        case "reserve-handoff":
          return journal2.reserveHandoff();
        case "advance-stage":
          return journal2.advanceStage();
        case "request-report":
          return journal2.requestReport();
        case "take-report":
          return journal2.takeReport();
        default:
          throw new Error("Unknown task turn: " + event.kind);
      }
    }),
    observe: (event, signal) => execute(signal, async (journal2, evidence2) => {
      if (event.kind === "call") {
        if (storage?.mode !== "memory" && storage?.state !== "durable" && !readOnly(event.value.toolName))
          throw new Error("Task checkpoint is not durable; wait for actual session persistence before external effects.");
        return journal2.guard(event.value);
      }
      if (event.kind === "result") return journal2.observe(event.value, event.cwd);
      if (event.kind === "capture")
        return evidence2.capture(event.value, event.cwd, event.binding);
      if (event.kind === "evicted") return evidence2.evict(event.ids);
      throw new Error("Unknown task observation: " + event.kind);
    }),
    action: (event, signal) => execute(signal, (journal2, evidence2) => {
      switch (event.kind) {
        case "plan":
          return journal2.plan(event.input);
        case "wait":
          return journal2.wait(event.input);
        case "command":
          return journal2.command(event.input);
        case "file":
          return journal2.acceptFile(event.input, event.cwd);
        case "reconcile":
          return journal2.reconcile(event.cwd);
        case "evidence-restore":
          return evidence2.restore(event.input, event.cwd, event.binding);
        default:
          throw new Error("Unknown task action: " + event.kind);
      }
    }),
    close: () => {
      closed = true;
      lifetime.abort(new Error("Task session closed"));
      return tail;
    }
  };
}

// src/task-runtime/managed-application.mjs
var empty = { type: "null" };
var statusSchema = { type: "object", properties: { snapshot: {}, render: { type: "string" }, storage: {} }, required: ["snapshot", "render", "storage"], additionalProperties: false };
function createManagedTaskApplication(context) {
  const application = createTaskApplicationState();
  const invocation = new AsyncLocalStorage2();
  const sessions = /* @__PURE__ */ new Set(), attached = /* @__PURE__ */ new Map();
  const lifetime = new AbortController();
  const run = (session, signal, operation2) => withRuntime(session.runtime, () => invocation.run(signal, operation2));
  const signalFor = (signal) => AbortSignal.any([context.signal, lifetime.signal, ...signal ? [signal] : []]);
  const readScope = async (signal) => {
    const scope = await context.capabilities.call("caller.scope", null, signal);
    if (scope.kind !== "session") throw new Error("Task data service requires an actual attached SDK session");
    return scope;
  };
  const keyFor = (scope) => createHash4("sha256").update(`${scope.sessionId}\0${scope.workspaceDirectory}`).digest("hex");
  const project = (session) => {
    const state = session.actor.status(), task = state.snapshot;
    return {
      snapshot: task ? {
        id: task.id,
        goal: task.goal,
        state: task.state,
        reason: task.reason ?? null,
        milestones: task.milestones.map(({ id, title, state: state2, dependsOn }) => ({ id, title, state: state2, dependsOn })),
        budget: task.budget,
        pending: task.operations.filter((operation2) => ["started", "unknown"].includes(operation2.state)).map(({ id, tool, state: state2 }) => ({ id, tool, state: state2 }))
      } : null,
      render: state.render,
      storage: state.storage
    };
  };
  const withCurrentSession = async (signal, operation2) => {
    const current = signalFor(signal), scope = await readScope(current), session = attached.get(keyFor(scope));
    if (!session) throw new Error("Task data service has no native attachment for this SDK session");
    current.throwIfAborted();
    const result = await run(session, current, () => operation2(session));
    current.throwIfAborted();
    return result;
  };
  const operation = (effect, inputSchema, execute, resultSchema = statusSchema) => ({
    effect,
    inputSchema,
    resultSchema,
    execute: (input, call) => withCurrentSession(call.signal, async (session) => {
      await session.refresh(call.signal);
      return execute(input, session);
    })
  });
  const operations = {
    status: operation("read", empty, (_input, session) => project(session)),
    pause: operation("write", { type: "object", properties: { reason: { type: "string", minLength: 1, maxLength: 128 } }, required: ["reason"], additionalProperties: false }, async (input, session) => {
      await session.controller.journal.pause(input.reason);
      return project(session);
    }),
    advanceStage: operation("write", empty, async (_input, session) => {
      const advanced = await session.controller.journal.advanceStage();
      return { ...project(session), advanced };
    }, { ...statusSchema, properties: { ...statusSchema.properties, advanced: { type: "boolean" } }, required: [...statusSchema.required, "advanced"] }),
    takeReport: operation("write", empty, async (_input, session) => {
      const report = await session.controller.journal.takeReport();
      return { ...project(session), report };
    }, { ...statusSchema, properties: { ...statusSchema.properties, report: { type: ["string", "null"] } }, required: [...statusSchema.required, "report"] })
  };
  const createNativeSession = () => {
    lifetime.signal.throwIfAborted();
    const runtime = createStandaloneRuntime();
    const own = new AbortController();
    let key, scope;
    let tools = /* @__PURE__ */ new Map();
    const currentSignal = () => AbortSignal.any([signalFor(invocation.getStore()), own.signal]);
    const read = async (signal) => {
      const observed = await context.capabilities.call("session.records.read", null, signal);
      return observed;
    };
    const actor = withRuntime(runtime, () => createTaskSession({
      persist: async (record, signal) => {
        const receipt = await context.capabilities.call("session.records.append", { type: record.customType, data: record.data }, signal);
        const observed = await read(signal);
        if (observed.state === "needs-reopen") throw new Error("Task storage needs-reopen: " + observed.error);
        if (!observed.records.some((row) => row.id === receipt.id && row.type === record.customType)) throw new Error("Task checkpoint is no longer on the actual SDK branch");
        return { mode: observed.mode, state: observed.state };
      },
      readOnly: (name) => tools.get(name) === true,
      onChanged: () => context.events.changed(),
      readFailure: () => application.readFailure(key),
      onPersistenceFailed: (failure) => application.recordFailure(key, failure)
    }));
    const controller = createTaskController(actor, currentSignal);
    const session = {
      actor,
      controller,
      runtime,
      refresh: async (signal) => {
        const observed = await read(signal);
        tools = new Map((await context.capabilities.call("session.tools", null, signal)).map((tool) => [tool.name, tool.readOnlyHint]));
        if (observed.state === "needs-reopen" && !application.readFailure(key)) application.recordFailure(key, { state: "needs-reopen", message: observed.error, lastCommitted: actor.status() });
        if (!application.readFailure(key)) await actor.turn({ kind: "storage", storage: observed }, signal);
      },
      attach: async (signal, force) => {
        const selected = await readScope(signal), selectedKey = keyFor(selected);
        if (key && key !== selectedKey) throw new Error("Task native attachment cannot switch SDK sessions");
        if (attached.has(selectedKey) && attached.get(selectedKey) !== session) throw new Error("Task SDK session already has a native owner");
        const observed = await read(signal);
        const entries = observed.records.filter((row) => row.type === TASK_SESSION_ENTRY).map((row) => ({ customType: row.type, data: row.data }));
        tools = new Map((await context.capabilities.call("session.tools", null, signal)).map((tool) => [tool.name, tool.readOnlyHint]));
        key = selectedKey;
        scope = selected;
        if (!application.readFailure(key)) await run(session, signal, () => actor.turn({ kind: "attach", scope: selectedKey, entries, storage: observed, force }, signal));
        if (observed.state === "needs-reopen" && !application.readFailure(key)) application.recordFailure(key, { state: "needs-reopen", message: observed.error, lastCommitted: actor.status() });
        attached.set(key, session);
      },
      dispose: async () => {
        own.abort(new Error("Managed task attachment closed"));
        await actor.close();
        await runtime.dispose();
        if (attached.get(key) === session) attached.delete(key);
        sessions.delete(session);
      }
    };
    sessions.add(session);
    return {
      eventEffects: { session_start: "read", session_tree: "read", context: "read" },
      extension: (pi) => {
        pi.on("session_start", async (_event, ctx) => session.attach(signalFor(ctx.signal), true));
        pi.on("session_tree", async (_event, ctx) => session.attach(signalFor(ctx.signal), true));
        pi.on("context", async (_event, ctx) => {
          const selected = await readScope(signalFor(ctx.signal));
          if (!scope || keyFor(selected) !== key) throw new Error("Task context has no current SDK attachment");
          await run(session, signalFor(ctx.signal), () => session.refresh(signalFor(ctx.signal)));
        });
      },
      dispose: session.dispose
    };
  };
  return {
    operations,
    createNativeSession,
    withCurrentSession,
    dispose: async () => {
      lifetime.abort(new Error("Managed task application closed"));
      await Promise.all([...sessions].map((session) => session.dispose()));
    }
  };
}

// src/managed-runtime.ts
var create = async (context) => {
  const application = createManagedTaskApplication(context);
  return {
    operations: application.operations,
    createNativeSession: application.createNativeSession,
    dispose: application.dispose
  };
};
var managed_runtime_default = create;
export {
  createManagedTaskApplication,
  managed_runtime_default as default
};
