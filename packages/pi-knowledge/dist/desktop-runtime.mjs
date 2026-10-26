// src/core/config.ts
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
function createKnowledgeConfigState() {
  return { local: new AsyncLocalStorage(), queues: /* @__PURE__ */ new Map() };
}
function projectIdentity(cwd, configured) {
  if (typeof configured === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(configured)) return configured;
  const path = resolve(cwd);
  const stem = basename(path).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "project";
  return `${stem}-${createHash("sha256").update(path).digest("hex").slice(0, 10)}`;
}
function validateBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1 || !isAbsolute(String(value.vault || "")) || !/^[a-f0-9]{24}$/.test(String(value.vaultId || "")) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || !["project", "literature", "hybrid"].includes(String(value.profile)) || !["run-only", "verified", "rich"].includes(String(value.depositMode)) || !["none", "read-local"].includes(String(value.subagentPolicy)) || typeof value.updatedAt !== "string")
    throw new Error("Invalid application knowledge binding; no project fallback was used");
}
function parseKnowledgeBinding(value) {
  validateBinding(value);
  return value;
}
var defaultState = createKnowledgeConfigState();

// src/core/owner-lifecycle.ts
function createKnowledgeOwnerLifecycle(resources) {
  const operations = /* @__PURE__ */ new Set();
  const sessions = /* @__PURE__ */ new Set();
  let disposed = false;
  let disposal = null;
  function assertActive() {
    if (disposed) throw new Error("Knowledge runtime has been disposed");
  }
  function run(work) {
    assertActive();
    const operation = Promise.resolve().then(work);
    operations.add(operation);
    return operation.finally(() => operations.delete(operation));
  }
  function attachSession(close) {
    assertActive();
    sessions.add(close);
    return () => {
      sessions.delete(close);
    };
  }
  function dispose() {
    if (disposal) return disposal;
    disposed = true;
    disposal = (async () => {
      const sessionResults = await Promise.allSettled([...sessions].map((close) => close()));
      sessions.clear();
      resources.beforeDrain?.();
      const operationResults = await Promise.allSettled([...operations]);
      const resourceResults = await Promise.allSettled([resources.dispose()]);
      const failures = [...sessionResults, ...operationResults, ...resourceResults].filter((result2) => result2.status === "rejected");
      if (failures.length) throw new AggregateError(failures.map((result2) => result2.reason), "Knowledge runtime disposal failed");
    })();
    return disposal;
  }
  return { assertActive, run, attachSession, dispose };
}

// src/desktop/read-model.ts
import { basename as basename2 } from "node:path";
function createKnowledgeReadModel(owner) {
  async function overview(project) {
    return owner.run(async () => {
      const binding = await owner.config.readKnowledgeBinding({ fresh: true });
      if (!binding) return { state: "unconfigured", binding: null, project, index: null, recentNotes: [] };
      const service = await owner.services.getKnowledgeService(binding);
      await service.request("reconcile");
      const recent = await service.request("recentNotes", { project, limit: 10 });
      const index = await service.request("status", { flushPending: true });
      return owner.config.withKnowledgeBinding(binding, () => ({
        state: "bound",
        binding: { vaultId: binding.vaultId, revision: binding.revision, label: basename2(binding.vault) },
        project,
        index: {
          revision: index.revision,
          coverage: index.coverage,
          noteCount: index.noteCount,
          pendingChanges: index.pendingChanges,
          lastReconciledAt: index.lastReconciledAt
        },
        recentNotes: recent.items.map(({ path, title, kind, updatedAt }) => ({ path, title, kind, updatedAt }))
      }));
    });
  }
  async function search(input, project) {
    return owner.run(async () => {
      const binding = await owner.config.readKnowledgeBinding({ fresh: true });
      if (!binding) throw new Error("No application knowledge Vault is bound");
      if (input.revision !== binding.revision) throw new Error("Knowledge binding changed; refresh before searching");
      const service = await owner.services.getKnowledgeService(binding);
      await service.request("reconcile");
      const found = await service.request("search", { query: input.query, project, limit: input.limit ?? 6 });
      return owner.config.withKnowledgeBinding(binding, () => ({
        query: found.query,
        revision: found.revision,
        bindingRevision: binding.revision,
        coverage: found.coverage,
        complete: found.complete,
        hits: found.hits.map(({ path, title, kind, hash, text, startLine, endLine }) => ({ path, title, kind, hash, text, startLine, endLine }))
      }));
    });
  }
  async function boundRead(input, project, read) {
    return owner.run(async () => {
      const binding = await owner.config.readKnowledgeBinding({ fresh: true });
      if (!binding) throw new Error("No application knowledge Vault is bound");
      if (input.revision !== binding.revision) throw new Error("Knowledge binding changed; refresh before reading");
      const service = await owner.services.getKnowledgeService(binding);
      await service.request("reconcile");
      const value = await read(service);
      return owner.config.withKnowledgeBinding(binding, () => ({ ...value, bindingRevision: binding.revision, project }));
    });
  }
  async function readNote(input, project) {
    return boundRead(input, project, async (service) => {
      const note = await service.request("read", { path: input.path, project, startLine: input.startLine ?? 1, maxChars: 6e3, reviewMaxChars: 1600 });
      if (input.expectedHash !== void 0 && note.hash !== input.expectedHash) throw new Error("Note changed; refresh before continuing");
      if (note.missing) return { path: note.path, missing: true, revision: note.revision };
      const { path, title, kind, category, hash, text, startLine, endLine, totalLines, truncated, humanReview, pending, revision } = note;
      return { path, missing: false, title, kind, category, hash, text, startLine, endLine, totalLines, truncated, humanReview, pending, revision };
    });
  }
  const links = (input, project) => boundRead(input, project, (service) => service.request("noteLinks", { path: input.path, project }));
  const graph = (input, project) => boundRead(input, project, (service) => service.request("graph", { project, limit: input.limit ?? 200, view: input.view ?? "semantic", mergeMirrors: input.mergeMirrors ?? true }));
  const jobs = (input, project) => boundRead(input, project, (service) => service.request("uiJobs", { project, offset: input.offset ?? 0, limit: input.limit ?? 20 }));
  const recentByCategory = (input, project) => boundRead(input, project, (service) => service.request("recentByCategory", { project, limit: input.limit ?? 10 }));
  return { overview, search, readNote, links, graph, jobs, recentByCategory };
}

// src/core/project-identity.ts
import { readFile as readFile2 } from "node:fs/promises";
import { homedir } from "node:os";
import { join as join2, resolve as resolve2 } from "node:path";

// src/core/extension-helpers.ts
function result(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    details: data
  };
}

// src/core/native-session-lifecycle.ts
function createKnowledgeNativeAdapter(owner, controller, register, cleanup) {
  const operations = /* @__PURE__ */ new Set();
  let registered = false;
  let closed = false;
  let disposal = null;
  function run(work, signal = controller.signal) {
    if (closed) throw new Error("Knowledge session has been disposed");
    const operation = owner.run(async () => {
      signal.throwIfAborted();
      const result2 = await work();
      signal.throwIfAborted();
      return result2;
    });
    operations.add(operation);
    return operation.finally(() => operations.delete(operation));
  }
  function dispose() {
    if (disposal) return disposal;
    closed = true;
    controller.abort(new Error("Knowledge session has been disposed"));
    const sessionCleanup = cleanup?.();
    disposal = (async () => {
      const cleanupResult = await Promise.allSettled([sessionCleanup]);
      await Promise.allSettled([...operations]);
      detach();
      if (cleanupResult[0].status === "rejected") throw cleanupResult[0].reason;
    })();
    return disposal;
  }
  const detach = owner.attachSession(dispose);
  function extension(pi) {
    owner.assertActive();
    if (closed || registered) throw new Error("A native knowledge session can only be registered once");
    registered = true;
    const scopedContext = (context, signal) => new Proxy(context, {
      get(target, property) {
        return property === "signal" ? signal : Reflect.get(target, property, target);
      }
    });
    const scopedSignal = (signal) => signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    const ownedPi = new Proxy(pi, {
      get(target, property) {
        if (property === "registerTool") return (definition) => target.registerTool({
          ...definition,
          execute: (id, input, signal, update, context) => {
            const combined = scopedSignal(signal);
            return run(() => definition.execute(id, input, combined, update, scopedContext(context, combined)), combined);
          }
        });
        if (property === "registerCommand") return (name, definition) => target.registerCommand(name, {
          ...definition,
          handler: (args, context) => {
            const signal = scopedSignal(context.signal);
            return run(() => definition.handler(args, scopedContext(context, signal)), signal);
          }
        });
        if (property === "on") return (event, handler) => target.on(
          event,
          event === "session_shutdown" ? handler : (value, context) => {
            const signal = scopedSignal(context.signal);
            return run(() => handler(value, scopedContext(context, signal)), signal);
          }
        );
        return Reflect.get(target, property, target);
      }
    });
    register(ownedPi);
    pi.on("session_shutdown", dispose);
  }
  return { extension, signal: controller.signal, dispose };
}

// src/desktop/native.ts
function createDesktopKnowledgeNativeSession(owner, projectFor2) {
  const controller = new AbortController();
  const reads = createKnowledgeReadModel(owner);
  const adapter = createKnowledgeNativeAdapter(owner, controller, (pi) => {
    pi.registerTool({
      name: "knowledge_status",
      label: "Knowledge status",
      drone: { readOnly: true, capabilities: ["knowledge"] },
      description: "Report the configured local knowledge index.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      async execute(_id, _input, _signal, _update, context) {
        const overview = await reads.overview(await projectFor2(context));
        return result({ status: overview.state === "bound" ? "configured" : "unconfigured", ...overview });
      }
    });
    pi.registerTool({
      name: "knowledge_search",
      label: "Knowledge \xB7 local search",
      drone: { readOnly: true, capabilities: ["knowledge"] },
      description: "Search the configured local knowledge index. Results are excerpts, not publication proofs.",
      parameters: { type: "object", properties: {
        query: { type: "string", minLength: 1, maxLength: 2e3 },
        limit: { type: "integer", minimum: 1, maximum: 12 }
      }, required: ["query"], additionalProperties: false },
      async execute(_id, input, _signal, _update, context) {
        const binding = await owner.config.readKnowledgeBinding({ fresh: true });
        if (!binding) throw new Error("No application knowledge Vault is bound");
        return result(await reads.search({ ...input, revision: binding.revision }, await projectFor2(context)));
      }
    });
  });
  return { ...adapter, toolEffects: { knowledge_status: "read", knowledge_search: "read" } };
}

// src/desktop/contract.ts
var string = { type: "string" };
var integer = { type: "integer", minimum: 0 };
var coverage = { enum: ["uninitialized", "indexing", "partial", "ready"] };
var nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
var object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false
});
var overviewInputSchema = { type: "null" };
var overviewResultSchema = object({
  state: { enum: ["unconfigured", "bound"] },
  binding: nullable(object({ vaultId: string, revision: { type: "integer", minimum: 1 }, label: string })),
  project: nullable(string),
  index: nullable(object({ revision: integer, coverage, noteCount: integer, pendingChanges: integer, lastReconciledAt: nullable(string) })),
  recentNotes: { type: "array", items: object({ path: string, title: string, kind: string, updatedAt: { type: "number" } }) }
});
var searchInputSchema = object({
  query: { type: "string", minLength: 1, maxLength: 2e3 },
  revision: { type: "integer", minimum: 1 },
  limit: { type: "integer", minimum: 1, maximum: 12 }
}, ["query", "revision"]);
var searchResultSchema = object({
  query: string,
  revision: integer,
  bindingRevision: { type: "integer", minimum: 1 },
  coverage,
  complete: { type: "boolean" },
  hits: { type: "array", items: object({ path: string, title: string, kind: string, hash: string, text: string, startLine: { type: "integer", minimum: 1 }, endLine: integer }) }
});
var boolean = { type: "boolean" };
var array = (items) => ({ type: "array", items });
var record = (additionalProperties) => ({ type: "object", additionalProperties });
var bindingRevision = { type: "integer", minimum: 1 };
var readScope = { revision: integer, bindingRevision, project: nullable(string) };
var notePath = { type: "string", minLength: 1, maxLength: 1e3 };
var snippetProperties = { text: string, startLine: bindingRevision, endLine: integer, totalLines: integer, truncated: boolean };
var snippetSchema = object(snippetProperties);
var recentNoteSchema = object({ path: string, title: string, kind: string, updatedAt: { type: "number" } });
var readNoteInputSchema = object({
  path: notePath,
  revision: bindingRevision,
  startLine: bindingRevision,
  expectedHash: { type: "string", pattern: "^[a-f0-9]{64}$" }
}, ["path", "revision"]);
var readNoteResultSchema = { anyOf: [
  object({ ...readScope, path: string, missing: { const: true } }),
  object({
    ...readScope,
    path: string,
    missing: { const: false },
    title: string,
    kind: string,
    category: { enum: ["paper", "software", "method", "idea", "other"] },
    hash: string,
    ...snippetProperties,
    humanReview: nullable(snippetSchema),
    pending: array(object({ kind: string, revision: integer }))
  })
] };
var linksInputSchema = object({ path: notePath, revision: bindingRevision });
var linksResultSchema = object({
  ...readScope,
  path: string,
  title: string,
  outgoing: array(object({ path: string, title: string, exists: boolean })),
  incoming: array(object({ path: string, title: string, exists: boolean }))
});
var graphInputSchema = object({
  revision: bindingRevision,
  limit: { type: "integer", minimum: 10, maximum: 500 },
  view: { enum: ["semantic", "all"] },
  mergeMirrors: boolean
}, ["revision"]);
var edgeSchema = object({ source: string, target: string });
var graphNodeProperties = { path: string, title: string, kind: string, degree: integer, warnings: array(string) };
var semanticNodeSchema = object({
  ...graphNodeProperties,
  nodeType: { enum: ["note", "wiki", "navigation", "mirror", "infrastructure", "memory"] },
  isInfrastructure: boolean,
  community: { type: "integer", minimum: -1 },
  x: { type: "number" },
  y: { type: "number" },
  mirrors: array(string),
  contentType: string,
  isMain: boolean,
  sharedWith: array(string)
}, ["path", "title", "kind", "degree", "nodeType", "isInfrastructure", "community", "x", "y"]);
var graphResultSchema = object({
  ...readScope,
  nodes: array(object(graphNodeProperties, ["path", "title", "kind", "degree"])),
  edges: array(edgeSchema),
  totalNotes: integer,
  semantic: object({
    nodes: array(semanticNodeSchema),
    edges: array(edgeSchema),
    totalNotes: integer,
    view: { enum: ["semantic", "all"] },
    mergeMirrors: boolean,
    relations: array(object({ source: string, target: string, type: { enum: ["link", "directory", "duplicate"] } })),
    duplicates: array(object({ canonical: string, duplicate: string })),
    communities: record({ type: "integer", minimum: -1 }),
    layout: record(object({ x: { type: "number" }, y: { type: "number" } })),
    health: object({ isolated: integer, duplicates: integer, infrastructure: integer, truncated: boolean, candidateNodes: integer, candidateLimit: integer })
  })
});
var jobsInputSchema = object({
  revision: bindingRevision,
  offset: { type: "integer", minimum: 0, maximum: 1e5 },
  limit: { type: "integer", minimum: 1, maximum: 50 }
}, ["revision"]);
var jobsResultSchema = object({
  ...readScope,
  items: array(object({ key: string, kind: string, path: string, scope: string, revision: integer, updated: string })),
  total: integer,
  offset: integer,
  nextOffset: nullable(integer)
});
var recentByCategoryInputSchema = object({ revision: bindingRevision, limit: { type: "integer", minimum: 1, maximum: 24 } }, ["revision"]);
var recentByCategoryResultSchema = object({
  ...readScope,
  groups: object({ paper: array(recentNoteSchema), software: array(recentNoteSchema), method: array(recentNoteSchema), idea: array(recentNoteSchema) }),
  counts: object({ paper: integer, software: integer, method: integer, idea: integer, other: integer })
});

// src/desktop/runtime.ts
async function projectFor(capabilities, workspace) {
  if (workspace === null) return null;
  const { handle } = await capabilities.call("roots.resolve", { path: workspace, kind: "files" });
  let text;
  try {
    ({ text } = await capabilities.call("files.readText", { root: handle, path: ".pi/research-workspace.json" }));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return projectIdentity(workspace);
  }
  const document = JSON.parse(text);
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("Invalid research workspace configuration");
  return projectIdentity(workspace, document.knowledgeProjectId);
}
var createDesktopRuntime = async (context) => {
  const states = context.resources.filter((resource) => resource.kind === "state");
  if (states.length !== 1) throw new Error("Knowledge runtime requires exactly one authorized application-state root");
  const state = states[0].handle;
  async function readKnowledgeBinding() {
    const response = await context.capabilities.call("state.readJson", { root: state, path: "binding.json" });
    return response.kind === "missing" ? null : parseKnowledgeBinding(response.value);
  }
  const config = {
    readKnowledgeBinding,
    async withKnowledgeBinding(binding, operation) {
      const current = await readKnowledgeBinding();
      if (!current || current.vaultId !== binding.vaultId || current.revision !== binding.revision)
        throw new Error("Knowledge binding changed; refresh before reading");
      return operation();
    }
  };
  const resources = /* @__PURE__ */ new Map();
  async function getKnowledgeService(binding) {
    const current = binding ?? await readKnowledgeBinding();
    if (!current) throw new Error("No application knowledge Vault is bound");
    const existing = resources.get(current.vaultId);
    if (existing) return existing;
    const opening = (async () => {
      const vault = await context.capabilities.call("roots.resolve", { path: current.vault, kind: "files" });
      const resource = await context.capabilities.call("resource.create", {
        resource: "index",
        storage: { root: state, key: current.vaultId },
        parameters: { vaultRoot: vault.handle },
        reservation: {
          namespace: "knowledge-writers",
          roots: [{ root: vault.handle, path: "", kind: "vault" }],
          storage: { path: "index.sqlite", kind: "index" }
        }
      });
      return { handle: resource.handle, request: (operation, input = {}) => context.capabilities.call("resource.invoke", { handle: resource.handle, operation, input }) };
    })();
    resources.set(current.vaultId, opening);
    try {
      return await opening;
    } catch (error) {
      resources.delete(current.vaultId);
      throw error;
    }
  }
  const lifecycle = createKnowledgeOwnerLifecycle({
    async dispose() {
      resources.clear();
    }
  });
  const owner = { config, services: { getKnowledgeService }, ...lifecycle };
  const reads = createKnowledgeReadModel(owner);
  return {
    operations: {
      overview: {
        inputSchema: overviewInputSchema,
        resultSchema: overviewResultSchema,
        effect: "read",
        execute: async (_input, call) => reads.overview(await projectFor(call.capabilities, call.scope.kind === "application" ? null : call.scope.workspaceDirectory))
      },
      search: {
        inputSchema: searchInputSchema,
        resultSchema: searchResultSchema,
        effect: "read",
        execute: async (input, call) => reads.search(input, await projectFor(call.capabilities, call.scope.kind === "application" ? null : call.scope.workspaceDirectory))
      },
      readNote: {
        inputSchema: readNoteInputSchema,
        resultSchema: readNoteResultSchema,
        effect: "read",
        execute: async (input, call) => reads.readNote(input, await projectFor(call.capabilities, call.scope.kind === "application" ? null : call.scope.workspaceDirectory))
      },
      links: {
        inputSchema: linksInputSchema,
        resultSchema: linksResultSchema,
        effect: "read",
        execute: async (input, call) => reads.links(input, await projectFor(call.capabilities, call.scope.kind === "application" ? null : call.scope.workspaceDirectory))
      },
      graph: {
        inputSchema: graphInputSchema,
        resultSchema: graphResultSchema,
        effect: "read",
        execute: async (input, call) => reads.graph(input, await projectFor(call.capabilities, call.scope.kind === "application" ? null : call.scope.workspaceDirectory))
      },
      jobs: {
        inputSchema: jobsInputSchema,
        resultSchema: jobsResultSchema,
        effect: "read",
        execute: async (input, call) => reads.jobs(input, await projectFor(call.capabilities, call.scope.kind === "application" ? null : call.scope.workspaceDirectory))
      },
      recentByCategory: {
        inputSchema: recentByCategoryInputSchema,
        resultSchema: recentByCategoryResultSchema,
        effect: "read",
        execute: async (input, call) => reads.recentByCategory(input, await projectFor(call.capabilities, call.scope.kind === "application" ? null : call.scope.workspaceDirectory))
      }
    },
    createNativeSession: () => createDesktopKnowledgeNativeSession(owner, (native) => projectFor(context.capabilities, native.cwd)),
    dispose: () => owner.dispose()
  };
};
var runtime_default = createDesktopRuntime;
export {
  runtime_default as default
};
