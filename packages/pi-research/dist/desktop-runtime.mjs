// src/research-connectors.ts
import { createHash } from "node:crypto";
var DEFAULT_TIMEOUT_MS = 12e3;
function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function clampLimit(value) {
  return Math.max(1, Math.min(50, Math.trunc(value ?? 10)));
}
function text(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}
function record(value) {
  return value !== null && typeof value === "object" ? value : {};
}
function receipt(input) {
  return {
    sourceRef: input.sourceRef,
    locator: input.locator,
    sourceType: input.kind,
    title: input.title,
    accessedAt: isoNow(),
    contentHash: hash(input.payload),
    readOnly: true
  };
}
function retryable(error) {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  return status === 408 || status === 429 || status >= 500 || status === 0;
}
function failure(connectorId, error) {
  return {
    connectorId,
    message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    retryable: retryable(error),
    at: isoNow()
  };
}
async function fetchJson(fetchImpl, url, options, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Drone-Research-Workbench/0.33",
        ...extraHeaders
      },
      signal
    });
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
async function fetchText(fetchImpl, url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/atom+xml,application/xml,text/xml",
        "user-agent": "Drone-Research-Workbench/0.33"
      },
      signal
    });
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
function bibliographicAuthors(value) {
  return Array.isArray(value) ? value.flatMap((author) => {
    const name = text(record(author).name);
    return name ? [name] : [];
  }) : [];
}
function semanticScholarHit(item) {
  const value = record(item);
  const paperId = text(value.paperId) || text(value.corpusId);
  const title = text(value.title);
  if (!paperId || !title) return [];
  const externalIds = record(value.externalIds);
  const doi = text(externalIds.DOI) || void 0;
  const locator = doi ? `https://doi.org/${doi}` : text(value.url) || `https://www.semanticscholar.org/paper/${paperId}`;
  return [
    {
      id: `semantic-scholar:${paperId}`,
      title,
      summary: text(value.abstract) || text(value.venue) || "Semantic Scholar record",
      locator,
      sourceType: "literature",
      authors: bibliographicAuthors(value.authors),
      year: typeof value.year === "number" ? value.year : void 0,
      doi,
      publishedAt: text(value.publicationDate) || void 0,
      sourceReceipt: receipt({
        sourceRef: `semantic-scholar:${paperId}`,
        locator,
        kind: "literature",
        title,
        payload: item
      })
    }
  ];
}
function createSemanticScholarConnector(fetchImpl) {
  const connector = {
    descriptor: { id: "semantic-scholar", kind: "literature", label: "Semantic Scholar", enabled: true },
    async search(query, options) {
      const limit = clampLimit(options.limit);
      const config = record(record(options.config).semanticScholar);
      const apiBase = (text(config.apiBase) || "https://api.semanticscholar.org").replace(/\/$/u, "");
      const headers = {};
      const apiKey = text(config.apiKey);
      if (apiKey) headers["x-api-key"] = apiKey;
      const fields = "title,abstract,authors,year,externalIds,url,venue,publicationDate";
      const value = record(
        await fetchJson(
          fetchImpl,
          `${apiBase}/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`,
          options,
          headers
        )
      );
      return (Array.isArray(value.data) ? value.data : []).slice(0, limit).flatMap(semanticScholarHit);
    },
    recommend: async (seed, options) => {
      const limit = clampLimit(options.limit);
      const config = record(record(options.config).semanticScholar);
      const apiBase = (text(config.apiBase) || "https://api.semanticscholar.org").replace(/\/$/u, "");
      const headers = {};
      const apiKey = text(config.apiKey);
      if (apiKey) headers["x-api-key"] = apiKey;
      const fields = "title,abstract,authors,year,externalIds,url,venue,publicationDate";
      const value = record(
        await fetchJson(
          fetchImpl,
          `${apiBase}/recommendations/v1/papers/for/${encodeURIComponent(seed)}?limit=${limit}&fields=${fields}`,
          options,
          headers
        )
      );
      return (Array.isArray(value.recommendedPapers) ? value.recommendedPapers : []).slice(0, limit).flatMap(semanticScholarHit);
    }
  };
  return connector;
}
function xmlTag(value, tag) {
  const match = value.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "iu"));
  return text(match?.[1]).replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"');
}
function createArxivConnector(fetchImpl) {
  return {
    descriptor: { id: "arxiv", kind: "literature", label: "arXiv", enabled: true },
    async search(query, options) {
      const limit = clampLimit(options.limit);
      const xml = await fetchText(
        fetchImpl,
        `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`,
        options
      );
      return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/giu)].slice(0, limit).flatMap((match) => {
        const entry = match[1] ?? "";
        const rawId = xmlTag(entry, "id");
        const arxivId = rawId.match(/arxiv\.org\/(?:abs|pdf)\/([^?#]+?)(?:\.pdf)?$/iu)?.[1];
        const title = xmlTag(entry, "title");
        if (!arxivId || !title) return [];
        const locator = `https://arxiv.org/abs/${arxivId}`;
        const authors = [
          ...entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/giu)
        ].map((item) => text(item[1]).replaceAll("&amp;", "&"));
        const publishedAt = xmlTag(entry, "published") || void 0;
        return [
          {
            id: `arxiv:${arxivId}`,
            title,
            summary: xmlTag(entry, "summary") || "arXiv record",
            locator,
            sourceType: "literature",
            authors,
            publishedAt,
            arxivId,
            sourceReceipt: receipt({
              sourceRef: `arxiv:${arxivId}`,
              locator,
              kind: "literature",
              title,
              payload: entry
            })
          }
        ];
      });
    }
  };
}
function createProjectStorageConnector(projectStorage) {
  return {
    descriptor: { id: "project-storage", kind: "project-storage", label: "Project files", enabled: true },
    async search(query, options) {
      if (!options.cwd) throw new Error("Project storage connector requires a project root");
      const limit = clampLimit(options.limit);
      const items = await projectStorage.search({ cwd: options.cwd, query, limit, signal: options.signal });
      return items.slice(0, limit).flatMap((item) => {
        const relativePath2 = text(item.relativePath).replaceAll("\\", "/");
        if (!relativePath2 || relativePath2.endsWith("/")) return [];
        const sourceRef = `project-storage:${hash({ cwd: options.cwd, relativePath: relativePath2 })}`;
        const title = text(item.title) || relativePath2;
        return [
          {
            id: sourceRef,
            title,
            summary: text(item.summary) || [item.format, item.size == null ? "" : `${item.size} bytes`].filter(Boolean).join(" \xB7 "),
            locator: relativePath2,
            sourceType: "project-storage",
            sourceReceipt: {
              sourceRef,
              locator: relativePath2,
              sourceType: "project-storage",
              title,
              version: item.modifiedAt,
              accessedAt: isoNow(),
              contentHash: item.contentHash || hash({ cwd: options.cwd, relativePath: relativePath2, size: item.size, modifiedAt: item.modifiedAt }),
              readOnly: true
            }
          }
        ];
      });
    }
  };
}
function createResearchConnectorHostLoader(options) {
  const connectors = [
    ...options.fetchImpl ? [createSemanticScholarConnector(options.fetchImpl), createArxivConnector(options.fetchImpl)] : [],
    ...options.projectStorage ? [createProjectStorageConnector(options.projectStorage)] : []
  ];
  if (!connectors.length) {
    return {
      contractVersion: 1,
      load: () => ({
        contractVersion: 1,
        status: "unavailable",
        list: () => [],
        recommend: async () => {
          throw new Error(
            "Research connector transport is unavailable; the host must inject an authorized connector registry"
          );
        },
        search: async () => {
          throw new Error(
            "Research connector transport is unavailable; the host must inject an authorized connector registry"
          );
        }
      })
    };
  }
  const byId = new Map(connectors.map((connector) => [connector.descriptor.id, connector]));
  const list = () => connectors.map((connector) => connector.descriptor);
  return {
    contractVersion: 1,
    load() {
      return {
        contractVersion: 1,
        status: "ready",
        list,
        async recommend(seed, connectorId, context = {}, limit = 10) {
          const connector = byId.get(connectorId);
          if (!connector) {
            return {
              hits: [],
              failures: [
                {
                  connectorId,
                  message: `Unknown research connector: ${connectorId}`,
                  retryable: false,
                  at: isoNow()
                }
              ]
            };
          }
          if (!connector.recommend) return { hits: [], failures: [] };
          try {
            return { hits: await connector.recommend(seed, { ...context, limit }), failures: [] };
          } catch (error) {
            return { hits: [], failures: [failure(connectorId, error)] };
          }
        },
        async search(input, context = {}) {
          const query = input.query.normalize("NFKC").trim();
          if (!query || query.length > 512) throw new Error("Research search query is required");
          const requested = input.connectorIds ? [...input.connectorIds] : connectors.map((connector) => connector.descriptor.id);
          const selected = requested.map((id) => byId.get(id)).filter((connector) => Boolean(connector));
          const limit = clampLimit(input.limit);
          const failures = requested.filter((id) => !byId.has(id)).map((connectorId) => ({
            connectorId,
            message: `Unknown research connector: ${connectorId}`,
            retryable: false,
            at: isoNow()
          }));
          const settled = await Promise.allSettled(
            selected.map(
              (connector) => connector.search(query, {
                ...context,
                cwd: input.cwd ?? context.cwd,
                signal: input.signal ?? context.signal,
                limit
              })
            )
          );
          const hits = [];
          settled.forEach((result, index) => {
            const connector = selected[index];
            if (!connector) return;
            if (result.status === "fulfilled") hits.push(...result.value);
            else failures.push(failure(connector.descriptor.id, result.reason));
          });
          const deduped = [...new Map(hits.map((hit) => [hit.id, hit])).values()].slice(
            0,
            limit * Math.max(1, selected.length)
          );
          return { query, hits: deduped, failures, connectors: requested, complete: failures.length === 0 };
        }
      };
    }
  };
}

// src/research-host.ts
var STAGES = /* @__PURE__ */ new Set([
  "created",
  "local_query_recorded",
  "external_search_recorded",
  "sources_inspected",
  "sources_archived",
  "sources_reused",
  "claims_bound",
  "answerable"
]);
function text2(value, max = 1e3) {
  return String(value ?? "").normalize("NFKC").replace(new RegExp("\\p{Cc}", "gu"), " ").replace(/\s+/gu, " ").trim().slice(0, max);
}
function relativePath(value, label) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes(".."))
    throw new Error(`${label} must stay inside the configured workspace`);
  return normalized;
}
function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function isErrno(error, code) {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === code
  );
}
function gate(metadata) {
  const value = metadata.evidence_gate;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { stage: "created", answerable: false };
  const candidate = value;
  const stage = text2(candidate.stage, 80);
  return { stage: STAGES.has(stage) ? stage : "created", answerable: candidate.answerable === true };
}
function summary(metadata, runDir, resultsPath) {
  const evidence = gate(metadata);
  const normalizedRunDir = runDir.replaceAll("\\", "/");
  const relativeRunDir = resultsPath && normalizedRunDir.startsWith(`${resultsPath}/`) ? normalizedRunDir.slice(resultsPath.length + 1) : normalizedRunDir;
  return {
    runId: text2(metadata.run_id || normalizedRunDir.split("/").at(-1), 180),
    resultSlug: text2(metadata.result_slug || relativeRunDir.split("/")[0], 180),
    project: text2(metadata.project, 180),
    topicId: text2(metadata.topic_id, 180) || null,
    query: text2(metadata.query),
    status: text2(metadata.status, 80) || "unknown",
    stage: evidence.stage,
    answerable: evidence.answerable,
    startedAt: text2(metadata.started_at, 80) || null,
    updatedAt: text2(metadata.updated_at || metadata.started_at, 80) || null,
    runDir: relativeRunDir
  };
}
function detail(metadata, runDir, resultsPath) {
  const item = summary(metadata, runDir, resultsPath);
  const gateValue = metadata.evidence_gate;
  const gateObject = gateValue && typeof gateValue === "object" && !Array.isArray(gateValue) ? gateValue : {};
  const events = Array.isArray(gateObject.events) ? gateObject.events : [];
  const stages = [
    "created",
    "local_query_recorded",
    "external_search_recorded",
    "sources_inspected",
    "sources_archived",
    "sources_reused",
    "claims_bound",
    "answerable"
  ];
  const current = stages.includes(item.stage) ? item.stage : "created";
  const currentIndex = stages.indexOf(current);
  const route = stages.map((key, index) => ({
    key,
    state: index < currentIndex || key === current && item.answerable ? "complete" : key === current ? "active" : "pending",
    at: null,
    detail: null
  }));
  const timeline = events.slice(-128).map((event) => {
    const value = event && typeof event === "object" && !Array.isArray(event) ? event : {};
    return {
      type: text2(value.type, 100) || "event",
      at: text2(value.at, 80) || null,
      detail: text2(value.notes || value.outcome || value.reason, 320) || null,
      status: value.failed === true || value.status === "failed" ? "failed" : value.observed === true ? "observed" : "ok"
    };
  });
  const sourceRefs = Array.isArray(gateObject.source_refs) ? gateObject.source_refs : [];
  const sources = sourceRefs.map((source) => ({
    path: text2(source, 480),
    status: "inspected",
    hash: null,
    verified: false
  }));
  const bindings = Array.isArray(gateObject.claim_bindings) ? gateObject.claim_bindings : [];
  const claims = bindings.map((binding) => {
    const value = binding && typeof binding === "object" && !Array.isArray(binding) ? binding : {};
    const support = Array.isArray(value.sources) ? value.sources.map((source) => {
      if (source && typeof source === "object" && !Array.isArray(source))
        return text2(source.path, 480);
      return text2(source, 480);
    }).filter(Boolean) : [];
    return {
      id: text2(value.id, 120) || null,
      claim: text2(value.claim, 480),
      support,
      status: text2(value.status || value.relationship, 80) || "bound"
    };
  }).filter((claim) => claim.claim);
  const warnings = Array.isArray(gateObject.warnings) ? gateObject.warnings.map((warning) => text2(warning, 240)).filter(Boolean) : [];
  const archiveCount = Number(gateObject.archive_count);
  const reuseCount = Number(gateObject.reuse_count);
  return {
    ...item,
    route,
    timeline,
    sources,
    claims,
    warnings,
    coverage: metadata.retrieval_coverage && typeof metadata.retrieval_coverage === "object" && !Array.isArray(metadata.retrieval_coverage) ? metadata.retrieval_coverage : null,
    archive: {
      count: Number.isFinite(archiveCount) ? archiveCount : 0,
      reused: Number.isFinite(reuseCount) ? reuseCount : 0,
      verified: false
    }
  };
}
async function configuredResultsRoot(port, workspace) {
  const workspaceRoot = await port.resolveRoot(workspace);
  if (!workspaceRoot.handle) throw new Error("Host did not grant a workspace files root");
  let config = {};
  try {
    config = asObject(
      JSON.parse(await port.readText(workspaceRoot.handle, ".pi/research-workspace.json")),
      "research workspace configuration"
    );
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
  if (config.resultsRoot !== void 0 && typeof config.resultsRoot !== "string")
    throw new Error("resultsRoot must be a path");
  if (!config.resultsRoot || !config.resultsRoot.startsWith("/"))
    return {
      handle: workspaceRoot.handle,
      path: relativePath(config.resultsRoot || "results", "resultsRoot")
    };
  const resultRoot = await port.resolveRoot(config.resultsRoot);
  if (!resultRoot.handle) throw new Error("Host did not grant the configured results root");
  return { handle: resultRoot.handle, path: "" };
}
async function readMetadata(port, root, runDir) {
  const normalized = relativePath(runDir, "runDir");
  const segments = normalized.split("/");
  if (segments.length !== 2 || !segments[1].startsWith("run-"))
    throw new Error("runDir must be a result slug followed by a run directory");
  const path = [root.path, normalized, "metadata.json"].filter(Boolean).join("/");
  return asObject(JSON.parse(await port.readText(root.handle, path)), "research run metadata");
}
async function discover(port, root, project) {
  let slugs;
  try {
    slugs = await port.listFiles(root.handle, root.path);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return [];
    throw error;
  }
  const found = [];
  for (const slug of slugs.filter((entry) => entry.kind === "directory" && !entry.name.startsWith("."))) {
    const slugPath = [root.path, relativePath(slug.name, "result slug")].filter(Boolean).join("/");
    const runs = await port.listFiles(root.handle, slugPath);
    for (const run of runs.filter((entry) => entry.kind === "directory" && entry.name.startsWith("run-"))) {
      const runDir = `${slug.name}/${run.name}`;
      const metadata = await readMetadata(port, root, runDir);
      if (!project || text2(metadata.project, 180) === text2(project, 180))
        found.push(summary(metadata, runDir, root.path));
    }
  }
  return found.sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || ""));
}
function limitOf(value) {
  return Math.max(1, Math.min(50, Number(value) || 10));
}
function createResearchHost(port) {
  const listRuns = async (input) => {
    const root = await configuredResultsRoot(port, input.workspace);
    const items = await discover(port, root, input.project);
    return { items: items.slice(0, limitOf(input.limit)), total: items.length };
  };
  const status = async (input) => {
    const root = await configuredResultsRoot(port, input.workspace);
    if (input.runDir !== void 0 && input.runDir !== null) {
      const runDir = relativePath(text2(input.runDir, 240), "runDir");
      const metadata = await readMetadata(port, root, runDir);
      return { item: summary(metadata, runDir, root.path) };
    }
    const items = await discover(port, root, input.project);
    return { items: items.slice(0, limitOf(input.limit)), total: items.length };
  };
  const detailOperation = async (input) => {
    const root = await configuredResultsRoot(port, input.workspace);
    let runDir = input.runDir ? relativePath(text2(input.runDir, 240), "runDir") : null;
    if (!runDir && input.runId) {
      const items = await discover(port, root);
      runDir = items.find((item) => item.runId === text2(input.runId, 180))?.runDir ?? null;
    }
    if (!runDir) throw new Error("Research run detail requires runDir or runId");
    const metadata = await readMetadata(port, root, runDir);
    return detail(metadata, runDir, root.path);
  };
  return { contractVersion: 1, operations: { status, listRuns, detail: detailOperation } };
}
var researchConnectorHostLoader = createResearchConnectorHostLoader({});

// src/core/literature-receipt.ts
import { createHash as createHash2 } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
function normalizeDoi(value) {
  const doi = String(value || "").trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, "").toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : null;
}
function exactDoiItems(items, doi) {
  const wanted = normalizeDoi(doi);
  return wanted ? items.filter((item) => normalizeDoi(item.data?.DOI || item.doi || item.DOI) === wanted) : [];
}

// src/core/zotero-identity.ts
var ZOTERO_KEY_PATTERN = /^[A-Z0-9]{8}$/;
function normalizeZoteroDoi(value) {
  return normalizeDoi(value);
}
function isValidZoteroDoi(value) {
  const doi = normalizeZoteroDoi(value);
  return Boolean(doi && /^10\.\d{4,9}\/\S+$/.test(doi));
}
function isZoteroItemKey(value) {
  return typeof value === "string" && ZOTERO_KEY_PATTERN.test(value);
}
function zoteroItemDoi(item) {
  return normalizeZoteroDoi(item?.data?.DOI);
}
function findZoteroItemsByIdentity(items, query) {
  const doi = normalizeZoteroDoi(query.doi);
  if (!doi) return [];
  const collection = query.collection == null ? "" : String(query.collection);
  return items.filter((item) => {
    if (zoteroItemDoi(item) !== doi) return false;
    if (!collection) return true;
    return Array.isArray(item.data?.collections) && item.data.collections.includes(collection);
  });
}
function summarizeZoteroAttachments(children, parentKey) {
  if (!isZoteroItemKey(parentKey)) return [];
  return children.filter(
    (child) => child.data?.itemType === "attachment" && child.data.parentItem === parentKey && isZoteroItemKey(child.key)
  ).map((child) => ({
    key: child.key,
    contentType: typeof child.data?.contentType === "string" ? child.data.contentType : null,
    metadataOnly: true
  }));
}

// src/core/zotero-library.ts
function zoteroLibraryPath(value) {
  if (value === void 0 || value === null) return "users";
  const text5 = String(value).trim().toLowerCase();
  if (text5 === "" || text5 === "user" || text5 === "users") return "users";
  if (text5 === "group" || text5 === "groups") return "groups";
  return null;
}

// src/core/zotero-reconcile.ts
async function lookupZoteroByDoi(get, expected, context = {}) {
  const doi = normalizeZoteroDoi(expected.doi);
  if (!doi || !isValidZoteroDoi(doi)) return { state: "blocked", reason: "exact-doi-required" };
  const result = await get(`items?format=json&limit=100&q=${encodeURIComponent(doi)}&qmode=everything`);
  if (!Array.isArray(result.data) || result.data.length > 100 || result.total !== void 0 && result.total > 100) {
    return { state: "unknown", reason: "lookup-incomplete" };
  }
  const observedAt = context.observedAt || (/* @__PURE__ */ new Date()).toISOString();
  let matches = findZoteroItemsByIdentity(result.data, expected);
  const named = expected.collection == null ? "" : String(expected.collection).trim();
  if (!matches.length && named && !isZoteroItemKey(named)) {
    const collection = await resolveCollection(get, named);
    if (collection.state !== "ok")
      return { state: collection.state, doi, reason: collection.reason, observedAt, safeToAutoRetry: false };
    matches = findZoteroItemsByIdentity(result.data, {
      ...expected,
      collection: collection.key
    });
  }
  if (!matches.length) return { state: "not-found", doi, observedAt, safeToAutoRetry: false };
  if (matches.length !== 1) return { state: "ambiguous", doi, count: matches.length, safeToAutoRetry: false };
  const item = matches[0];
  if (!item) return { state: "unknown", reason: "lookup-incomplete" };
  if (!isZoteroItemKey(item.key)) return { state: "unknown", reason: "invalid-resource-id" };
  const children = await get(`items/${item.key}/children?format=json&limit=100`);
  if (!Array.isArray(children.data) || children.total !== void 0 && children.total > 100) {
    return { state: "unknown", reason: "attachment-lookup-incomplete" };
  }
  return {
    state: "found",
    ...context.libraryType ? { libraryType: context.libraryType } : {},
    ...context.libraryId ? { libraryId: context.libraryId } : {},
    itemId: item.key,
    doi,
    attachments: summarizeZoteroAttachments(children.data, item.key),
    observedAt,
    ...context.verifier ? { verifier: context.verifier } : {},
    attachmentContentsVerified: false,
    scientificallyVerified: false,
    safeToAutoRetry: false
  };
}
async function resolveCollection(get, raw) {
  const wanted = raw == null ? "" : String(raw).trim();
  if (!wanted) return { state: "ok", key: null };
  if (isZoteroItemKey(wanted)) return { state: "ok", key: wanted };
  const keys = [];
  for (let start = 0; start < 1e3; start += 100) {
    const page = await get(`collections?format=json&limit=100&start=${start}`);
    if (!Array.isArray(page.data)) return { state: "unknown", reason: "collection-lookup-incomplete" };
    for (const entry of page.data)
      if (isZoteroItemKey(entry?.key) && String(entry.data?.name ?? "").trim().toLowerCase() === wanted.toLowerCase())
        keys.push(String(entry.key));
    if (page.data.length < 100 || !((page.total ?? 0) > start + 100)) break;
  }
  if (keys.length === 1) return { state: "ok", key: keys[0] };
  return keys.length ? { state: "ambiguous", reason: `several collections are named "${wanted}"` } : { state: "not-found", reason: `collection "${wanted}" not found` };
}

// src/core/zotero-reconcile-runtime.ts
var LOCAL_API = "http://127.0.0.1:23119/api/users/0";
var LOCAL_USER_LIBRARY_IDS = /* @__PURE__ */ new Set(["0", "1"]);
function createLocalZoteroReconciler({
  request,
  timeoutMs = 4e3,
  userLibraryIds = [],
  fetchImpl = fetch
} = {}) {
  const get = request || (async (path) => {
    const response = await fetchImpl(`${LOCAL_API}/${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error"
    });
    if (!response.ok)
      throw new Error(`Zotero local API lookup failed (${response.status}); no write/retry performed.`);
    const body = await response.text();
    if (body.length > 2 * 1024 * 1024)
      throw new Error("Zotero lookup response too large; outcome remains unknown.");
    return { data: JSON.parse(body), total: Number(response.headers.get("Total-Results")) };
  });
  return async (expected) => {
    if (expected.libraryId && !LOCAL_USER_LIBRARY_IDS.has(String(expected.libraryId)) && !userLibraryIds.includes(expected.libraryId))
      return { state: "unavailable", reason: "local-api-covers-only-the-user-library" };
    try {
      return await lookupZoteroByDoi(get, expected, {
        libraryType: "users",
        libraryId: expected.libraryId || "0",
        verifier: "zotero-local-api-item-identity"
      });
    } catch (error) {
      return {
        state: "unavailable",
        reason: error.name === "TimeoutError" ? "local-api-timeout" : "local-api-unreachable"
      };
    }
  };
}

// src/desktop/capability-fetch.ts
var READ_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD"]);
var NO_BODY = /* @__PURE__ */ new Set([101, 204, 205, 304]);
function capabilityFetch(call, { reads = [], summary: summary2, allowance, credential } = {}) {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const read = READ_METHODS.has(request.method) || request.method === "POST" && reads.includes(`${url.host}${url.pathname}`);
    const body = READ_METHODS.has(request.method) ? void 0 : Buffer.from(await request.arrayBuffer());
    const slot = credential?.hosts.includes(url.host) ? credential : void 0;
    const headers = {};
    request.headers.forEach((value, name) => {
      if (name !== slot?.header.toLowerCase()) headers[name] = value;
    });
    const result = await call(
      read ? "network.read" : "network.write",
      {
        method: request.method,
        url: request.url,
        headers,
        ...body?.length ? { bodyBase64: body.toString("base64") } : {},
        ...!read && summary2 ? { summary: summary2 } : {},
        ...!read && allowance ? { allowance } : {},
        ...slot ? { credential: slot.slot } : {}
      },
      request.signal
    );
    const bytes = NO_BODY.has(result.status) || request.method === "HEAD" ? null : Buffer.from(result.base64, "base64");
    return new Response(bytes, { status: result.status, headers: result.headers });
  };
}

// src/desktop/zotero-acceptance.ts
var ZOTERO_ACCEPTANCE_OPERATIONS = Object.freeze(["describe", "verify", "identify"]);
var FIELDS = Object.freeze(["doi", "libraryId", "collection"]);
var EVIDENCE_KIND = "zotero-read-only-item-identity";
var ZOTERO_KEY = /^[A-Z0-9]{8}$/;
var SAVE_BOUND_STATUSES = /* @__PURE__ */ new Set(["saved", "reused"]);
var text3 = (value) => typeof value === "string" ? value.trim() : "";
function describeZoteroAcceptance(acceptance) {
  if (!acceptance) return { fields: [...FIELDS], evidenceKind: EVIDENCE_KIND };
  const doi = text3(acceptance.doi);
  return {
    fields: [...FIELDS],
    evidenceKind: EVIDENCE_KIND,
    label: doi ? `\u6587\u732E\u8FDB\u5165 Zotero\uFF08${doi}\uFF09` : "\u6587\u732E\u8FDB\u5165 Zotero\uFF08\u672C\u4EFB\u52A1\u7CBE\u8BFB\u540E\u5199\u5165\u7684\u4E00\u7BC7\uFF1B\u5199\u5165\u65F6\u4E0D\u518D\u5355\u72EC\u8BE2\u95EE\uFF09",
    // A milestone without a DOI is a slot: "one paper written after close reading".
    consent: {
      ...doi ? { doi } : { slot: true },
      libraryId: text3(acceptance.libraryId) || null,
      collection: text3(acceptance.collection) || null
    },
    pending: doi ? {
      reason: `Zotero \u91CC\u8FD8\u6CA1\u6709\u8BFB\u56DE\u8FD9\u6761\u6587\u732E\uFF08${doi}\uFF09\u7684\u8EAB\u4EFD`,
      next: "\u5148\u7528 research_zotero_save \u5199\u5165\u5E76\u6838\u5BF9\uFF0C\u518D\u7EE7\u7EED\uFF1B\u82E5\u8FD9\u4E2A DOI \u672C\u8EAB\u4E0D\u5BF9\uFF0C\u7528 task_wait kind=rebind \u8BF7\u7528\u6237\u786E\u8BA4\u6362\u6210\u771F\u5B9E\u6587\u732E"
    } : {
      reason: "\u8FD9\u4E00\u9879\u8FD8\u6CA1\u6709\u5BF9\u5E94\u7684\u6587\u732E\uFF1A\u7CBE\u8BFB\u540E\u5199\u5165 Zotero \u7684\u56DE\u6267\u4F1A\u628A DOI \u7ED1\u5B9A\u8FC7\u6765",
      next: "\u5BF9\u7CBE\u8BFB\u8FC7\u7684\u6BCF\u7BC7\u8C03\u7528 research_zotero_save\uFF0C\u8BFB\u56DE\u540E\u81EA\u52A8\u7ED1\u5B9A\u5E76\u9A8C\u6536"
    }
  };
}
function describeZoteroEvidence(result) {
  const key = ZOTERO_KEY.test(result?.itemId || "") ? result.itemId : null;
  const state = result?.state || "unknown";
  const summary2 = state === "found" && key ? `Zotero \u5DF2\u627E\u5230\u6761\u76EE ${key}` : state === "not-found" ? "Zotero \u4E2D\u672A\u627E\u5230\u8BE5 DOI" : state === "ambiguous" ? "Zotero \u4E2D\u6709\u591A\u6761\u540C DOI \u6761\u76EE" : `Zotero \u6682\u4E0D\u53EF\u6838\u5BF9\uFF1A${result?.reason || state}`;
  const pdf = (result?.attachments || []).some((a) => a?.contentType === "application/pdf");
  const note = state === "found" ? `\u672C\u673A \xB7 ${pdf ? "\u6709 PDF \u9644\u4EF6\uFF08\u672A\u8BFB\uFF09" : "\u4EC5\u5143\u6570\u636E"}` : null;
  return {
    ...result,
    summary: summary2,
    note,
    links: key ? [
      {
        kind: "resource",
        target: `zotero://select/library/items/${key}`,
        label: "\u5728 Zotero \u4E2D\u6253\u5F00",
        i18n: "flow.link.openInZotero"
      }
    ] : []
  };
}
function identifyZoteroReceipt(event) {
  if (event?.toolName !== "research_zotero_save" || event.isError) return null;
  const receipt2 = event.result?.details;
  if (!receipt2 || typeof receipt2 !== "object") return null;
  if (!SAVE_BOUND_STATUSES.has(receipt2.status) || !ZOTERO_KEY.test(receipt2.zoteroKey || "")) return null;
  const doi = normalizeZoteroDoi(receipt2.doi);
  return doi && isValidZoteroDoi(doi) ? { doi } : null;
}
function verifyZoteroAcceptance(call, acceptance, signal) {
  if (!text3(acceptance.doi))
    return Promise.resolve({ state: "pending", reason: "doi-unbound", summary: "\u8FD8\u6CA1\u6709\u6587\u732E\u7ED1\u5B9A\u5230\u8FD9\u4E00\u9879" });
  const send = capabilityFetch(call);
  const fetchImpl = (input, init) => send(input, {
    ...init,
    signal: AbortSignal.any([init?.signal, signal].filter((s) => !!s))
  });
  const reconcile = createLocalZoteroReconciler({ fetchImpl });
  return reconcile(acceptance).then(describeZoteroEvidence);
}
var acceptanceInput = { anyOf: [{ type: "null" }, { type: "object" }] };
function zoteroAcceptanceOperations() {
  return {
    describe: {
      effect: "read",
      inputSchema: acceptanceInput,
      resultSchema: { type: "object" },
      execute: async (input) => describeZoteroAcceptance(input ?? null)
    },
    verify: {
      effect: "read",
      inputSchema: { type: "object" },
      resultSchema: { type: "object" },
      execute: async (input, invocation) => verifyZoteroAcceptance(
        (name, value, signal) => invocation.capabilities.call(name, value, signal),
        input,
        invocation.signal
      )
    }
  };
}
var zoteroIdentifyNativeOperation = Object.freeze({
  event: "tool_execution_end",
  effect: "read",
  inputSchema: { type: "null" },
  resultSchema: { anyOf: [{ type: "null" }, { type: "object" }] },
  execute: async (_input, actual) => identifyZoteroReceipt(actual)
});

// src/core/zotero-write.ts
var ZOTERO_ITEM_SPECS = Object.freeze({
  journalArticle: { container: "publicationTitle", doi: true, fields: ["volume", "issue", "pages"] },
  conferencePaper: { container: "proceedingsTitle", doi: true, fields: ["volume", "pages"] },
  preprint: { container: "repository", doi: true, fields: [] },
  dataset: { container: "repository", doi: true, fields: [] },
  book: { container: null, doi: false, fields: ["volume"] },
  bookSection: { container: "bookTitle", doi: false, fields: ["volume", "pages"] },
  thesis: { container: "university", doi: false, fields: [] },
  report: { container: "institution", doi: false, fields: ["pages"] },
  webpage: { container: "websiteTitle", doi: false, fields: [] }
});
var ZOTERO_ITEM_TYPES = Object.freeze(Object.keys(ZOTERO_ITEM_SPECS));
var ZOTERO_WRITE_LIMITS = Object.freeze({
  title: 1e3,
  field: 500,
  abstract: 5e3,
  creators: 200,
  tags: 32,
  tag: 200
});
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function textField(value, max, name) {
  if (value === void 0 || value === null) return "";
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${name} must be a string`);
  const text5 = String(value).replace(new RegExp("\\p{Cc}", "gu"), " ").replace(/\s+/g, " ").trim();
  if (text5.length > max) throw new Error(`${name} exceeds ${max} characters`);
  return text5;
}
function normalizeCreators(input) {
  if (input === void 0 || input === null) return [];
  if (!Array.isArray(input)) throw new Error("creators must be an array");
  if (input.length > ZOTERO_WRITE_LIMITS.creators)
    throw new Error(`creators exceeds ${ZOTERO_WRITE_LIMITS.creators} entries`);
  return input.map((raw, index) => {
    const creator = typeof raw === "string" ? { name: raw } : isRecord(raw) ? raw : null;
    if (!creator) throw new Error(`creators[${index}] must be an object or a string`);
    const creatorType = textField(creator.creator_type || creator.creatorType, 40, "creator_type") || "author";
    if (!/^[a-z][A-Za-z]{2,30}$/.test(creatorType))
      throw new Error(`creators[${index}] has an invalid creator_type`);
    const lastName = textField(creator.last_name ?? creator.lastName, ZOTERO_WRITE_LIMITS.field, "last_name");
    const firstName = textField(
      creator.first_name ?? creator.firstName,
      ZOTERO_WRITE_LIMITS.field,
      "first_name"
    );
    const name = textField(creator.name, ZOTERO_WRITE_LIMITS.field, "name");
    if (lastName) return { creatorType, lastName, firstName };
    if (name) return { creatorType, name };
    throw new Error(`creators[${index}] needs last_name or name`);
  });
}
function normalizeTags(input) {
  if (input === void 0 || input === null) return [];
  if (!Array.isArray(input)) throw new Error("tags must be an array of strings");
  const tags = [
    ...new Set(
      input.map((tag, index) => textField(tag, ZOTERO_WRITE_LIMITS.tag, `tags[${index}]`)).filter(Boolean)
    )
  ];
  if (tags.length > ZOTERO_WRITE_LIMITS.tags)
    throw new Error(`tags exceeds ${ZOTERO_WRITE_LIMITS.tags} entries`);
  return tags;
}
function httpUrl(value, name) {
  const text5 = textField(value, 2048, name);
  if (!text5) return "";
  let url;
  try {
    url = new URL(text5);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL`);
  }
  if (![`http:`, `https:`].includes(url.protocol)) throw new Error(`${name} must use http or https`);
  return url.href;
}
function normalizeZoteroItem(input = {}) {
  const doi = normalizeDoi(input.doi);
  if (!doi) throw new Error("A valid DOI (10.xxxx/...) is required; Zotero writes are keyed by exact DOI.");
  const itemType = textField(input.item_type || input.itemType, 40, "item_type") || "journalArticle";
  const spec = ZOTERO_ITEM_SPECS[itemType];
  if (!spec)
    throw new Error(`Unsupported item_type "${itemType}"; use one of ${ZOTERO_ITEM_TYPES.join(", ")}`);
  const title = textField(input.title, ZOTERO_WRITE_LIMITS.title, "title");
  if (!title) throw new Error("title is required");
  const fields = {};
  for (const name of spec.fields) {
    const value = textField(input[name], ZOTERO_WRITE_LIMITS.field, name);
    if (value) fields[name] = value;
  }
  const container = textField(
    input.publication ?? input.container_title,
    ZOTERO_WRITE_LIMITS.field,
    "publication"
  );
  if (container && spec.container) fields[spec.container] = container;
  const extra = [];
  if (container && !spec.container) extra.push(`Published in: ${container}`);
  if (!spec.doi) extra.push(`DOI: ${doi}`);
  return {
    doi,
    itemType,
    title,
    creators: normalizeCreators(input.creators),
    date: textField(input.date, 64, "date"),
    url: httpUrl(input.url, "url") || `https://doi.org/${doi}`,
    abstractNote: textField(input.abstract ?? input.abstractNote, ZOTERO_WRITE_LIMITS.abstract, "abstract"),
    fields,
    extra: extra.join("\n"),
    tags: normalizeTags(input.tags),
    doiField: spec.doi
  };
}
function normalizeZoteroAttachment(input = {}) {
  const url = httpUrl(input.attachment_url ?? input.attachmentUrl, "attachment_url");
  if (!url) return null;
  return {
    url,
    title: textField(input.attachment_title, ZOTERO_WRITE_LIMITS.field, "attachment_title") || "Full Text PDF"
  };
}
function toConnectorItem(item, attachment = null) {
  const payload = {
    itemType: item.itemType,
    title: item.title,
    creators: item.creators.map(
      (creator) => creator.name ? { creatorType: creator.creatorType, lastName: creator.name, fieldMode: 1 } : { ...creator }
    ),
    date: item.date,
    url: item.url,
    abstractNote: item.abstractNote,
    ...item.fields,
    tags: item.tags.map((tag) => ({ tag })),
    attachments: attachment ? [{ title: attachment.title, url: attachment.url, mimeType: "application/pdf" }] : []
  };
  if (item.doiField) payload.DOI = item.doi;
  if (item.extra) payload.extra = item.extra;
  return payload;
}
function toWebApiItem(item, { collectionKey = null } = {}) {
  const payload = {
    itemType: item.itemType,
    title: item.title,
    creators: item.creators.map((creator) => ({ ...creator })),
    date: item.date,
    url: item.url,
    abstractNote: item.abstractNote,
    ...item.fields,
    tags: item.tags.map((tag) => ({ tag })),
    collections: collectionKey ? [collectionKey] : []
  };
  if (item.doiField) payload.DOI = item.doi;
  if (item.extra) payload.extra = item.extra;
  return payload;
}
function connectorTargetId(value) {
  const text5 = textField(value, 32, "target");
  if (!text5) return null;
  if (!/^[LC]\d{1,12}$/.test(text5))
    throw new Error('target must look like "L1" (library) or "C123" (collection)');
  return text5;
}

// src/core/zotero-write-runtime.ts
import { createHash as createHash4, randomUUID } from "node:crypto";
import { open, realpath as realpath2, stat as stat2 } from "node:fs/promises";
import { basename, isAbsolute as isAbsolute2, relative as relative2, resolve as resolve2, sep as sep2 } from "node:path";

// src/core/external-effect-key.ts
import { createHash as createHash3 } from "node:crypto";
function externalEffectKey(namespace, identity) {
  if (!namespace.trim()) throw new Error("external effect namespace is required");
  const stable = JSON.stringify(
    identity,
    (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry
  );
  return `${namespace.trim()}:${createHash3("sha256").update(stable).digest("hex")}`;
}

// src/core/zotero-write-runtime.ts
var ZOTERO_ENDPOINTS = Object.freeze({
  connector: "http://127.0.0.1:23119",
  localApi: "http://127.0.0.1:23119/api",
  webApi: "https://api.zotero.org"
});
var KEY = /^[A-Z0-9]{8}$/;
function timeoutSignal(ms, signal) {
  const timer = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timer]) : timer;
}
async function readJson(response, limit = 2 * 1024 * 1024) {
  const body = await response.text();
  if (body.length > limit) throw new Error("Zotero response too large; outcome remains unknown.");
  if (!body.trim()) return null;
  try {
    return JSON.parse(body);
  } catch {
    return { text: body.slice(0, 2e3) };
  }
}
async function connectorPost(fetchImpl, path, body, { timeoutMs = 2e4, signal } = {}) {
  const response = await fetchImpl(`${ZOTERO_ENDPOINTS.connector}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: timeoutSignal(timeoutMs, signal),
    redirect: "error"
  });
  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    json: await readJson(response)
  };
}
async function probeZoteroConnector({
  fetchImpl = fetch,
  signal,
  timeoutMs = 3e3
} = {}) {
  try {
    const response = await connectorPost(fetchImpl, "/connector/ping", {}, { timeoutMs, signal });
    return {
      reachable: response.ok,
      status: response.status,
      version: response.headers?.get?.("X-Zotero-Version") || null
    };
  } catch (error) {
    return { reachable: false, error: error.name === "TimeoutError" ? "timeout" : "unreachable" };
  }
}
async function connectorSaveTarget({ fetchImpl = fetch, signal } = {}) {
  const response = await connectorPost(fetchImpl, "/connector/getSelectedCollection", {}, { signal });
  if (!response.ok || !response.json || typeof response.json !== "object")
    throw new Error(`Zotero desktop did not report a save target (HTTP ${response.status}).`);
  const t = response.json;
  return {
    libraryId: t.libraryID === void 0 || t.libraryID === null ? null : String(t.libraryID),
    libraryName: typeof t.libraryName === "string" ? t.libraryName.slice(0, 200) : "My Library",
    editable: t.libraryEditable !== false && t.editable !== false,
    collectionId: t.id ? String(t.id) : null,
    collectionName: t.id && typeof t.name === "string" ? t.name.slice(0, 200) : null
  };
}
async function localApiGet(fetchImpl, path, { signal, timeoutMs = 1e4 } = {}) {
  const response = await fetchImpl(`${ZOTERO_ENDPOINTS.localApi}/users/0/${path}`, {
    headers: { Accept: "application/json" },
    signal: timeoutSignal(timeoutMs, signal),
    redirect: "error"
  });
  if (!response.ok) throw new Error(`Zotero local API HTTP ${response.status}`);
  return { data: await readJson(response), total: Number(response.headers.get("Total-Results")) };
}
function summarizeMatches(items, doi) {
  return exactDoiItems(items, doi).filter((item) => KEY.test(item.key || "")).map((item) => ({
    key: item.key,
    title: String(item.data?.title || "").slice(0, 200),
    itemType: item.data?.itemType || null,
    collections: Array.isArray(item.data?.collections) ? item.data.collections.slice(0, 20) : []
  }));
}
async function localApiSearchByDoi({ fetchImpl = fetch, doi, signal } = {}) {
  const wanted = normalizeDoi(doi);
  if (!wanted) throw new Error("Valid DOI required");
  const result = await localApiGet(
    fetchImpl,
    `items?format=json&limit=100&q=${encodeURIComponent(wanted)}&qmode=everything`,
    { signal }
  );
  const complete = Array.isArray(result.data) && result.data.length <= 100 && !(result.total > 100);
  return { complete, items: complete ? summarizeMatches(result.data, wanted) : [] };
}
async function localApiChildren({ fetchImpl = fetch, key, signal } = {}) {
  if (!KEY.test(key || "")) throw new Error("Valid Zotero key required");
  const result = await localApiGet(fetchImpl, `items/${key}/children?format=json&limit=100`, { signal });
  return Array.isArray(result.data) ? result.data : [];
}
function zoteroWebApiConfig(env = process.env) {
  const path = zoteroLibraryPath(env.ZOTERO_LIBRARY_TYPE);
  const libraryType = path ?? String(env.ZOTERO_LIBRARY_TYPE);
  const libraryId = env.ZOTERO_LIBRARY_ID || env.ZOTERO_USER_ID || "";
  const apiKey = env.ZOTERO_API_KEY || "";
  const configured = path !== null && /^\d+$/.test(libraryId) && apiKey.length > 0;
  return { libraryType, libraryId, apiKey, configured };
}
function zoteroLocalWriteConfig(env = process.env) {
  const apiKey = env.ZOTERO_LOCAL_API_KEY || "";
  const serverId = env.ZOTERO_LOCAL_SERVER_ID || "";
  return {
    libraryType: "users",
    libraryId: "0",
    apiKey,
    serverId,
    base: ZOTERO_ENDPOINTS.localApi,
    local: true,
    configured: apiKey.length > 0 && /^[A-Za-z0-9]{1,64}$/.test(serverId)
  };
}
async function localServerId({ fetchImpl = fetch, signal } = {}) {
  try {
    const response = await fetchImpl(`${ZOTERO_ENDPOINTS.localApi}/`, {
      headers: { "Zotero-API-Version": "3" },
      signal: timeoutSignal(3e3, signal),
      redirect: "error"
    });
    return response.headers.get("zotero-server-id") || null;
  } catch {
    return null;
  }
}
function authHeaders(config) {
  return config.local ? { "Zotero-API-Key": config.apiKey, "Zotero-Server-ID": config.serverId } : { "Zotero-API-Key": config.apiKey };
}
async function webRequest(fetchImpl, config, path, { method = "GET", body, signal, timeoutMs = 2e4, write = false } = {}) {
  const headers = {
    "Zotero-API-Version": "3",
    ...authHeaders(config),
    Accept: "application/json"
  };
  if (write) {
    headers["Content-Type"] = "application/json";
    headers["Zotero-Write-Token"] = randomUUID().replace(/-/g, "");
  }
  const response = await fetchImpl(`${config.base || ZOTERO_ENDPOINTS.webApi}${path}`, {
    method,
    headers,
    body: body === void 0 ? void 0 : JSON.stringify(body),
    signal: timeoutSignal(timeoutMs, signal),
    redirect: "error"
  });
  return {
    status: response.status,
    ok: response.ok,
    json: await readJson(response),
    total: Number(response.headers.get("Total-Results"))
  };
}
async function webKeyAccess({ fetchImpl = fetch, config, signal } = {}) {
  const response = await webRequest(fetchImpl, config, "/keys/current", { signal });
  if (!response.ok)
    throw new Error(`Zotero Web API rejected the key (HTTP ${response.status}); no write performed.`);
  const access = response.json?.access || {};
  const scope = config.libraryType === "groups" ? access.groups?.[config.libraryId] || access.groups?.all || {} : String(response.json?.userID ?? "") === config.libraryId ? access.user || {} : {};
  return {
    userID: response.json?.userID ?? null,
    username: typeof response.json?.username === "string" ? response.json.username.slice(0, 100) : null,
    library: scope.library === true,
    write: scope.write === true
  };
}
async function webSearchByDoi({ fetchImpl = fetch, config, doi, signal } = {}) {
  const wanted = normalizeDoi(doi);
  if (!wanted) throw new Error("Valid DOI required");
  const response = await webRequest(
    fetchImpl,
    config,
    `/${config.libraryType}/${config.libraryId}/items?format=json&limit=100&q=${encodeURIComponent(wanted)}&qmode=everything`,
    { signal }
  );
  if (!response.ok)
    throw new Error(`Zotero Web API lookup failed (HTTP ${response.status}); no write performed.`);
  const complete = Array.isArray(response.json) && response.json.length <= 100 && !(response.total > 100);
  return { complete, items: complete ? summarizeMatches(response.json, wanted) : [] };
}
async function webCreateItems({ fetchImpl = fetch, config, items, signal } = {}) {
  const response = await webRequest(fetchImpl, config, `/${config.libraryType}/${config.libraryId}/items`, {
    method: "POST",
    body: items,
    write: true,
    signal,
    timeoutMs: 3e4
  });
  const successful = Object.entries(response.json?.successful || {}).map(([index, entry]) => ({
    index: Number(index),
    key: entry?.key || entry?.data?.key || null,
    version: entry?.version ?? null
  }));
  const failed = Object.entries(response.json?.failed || {}).map(([index, entry]) => ({
    index: Number(index),
    code: entry?.code ?? null,
    message: String(entry?.message || "").slice(0, 300)
  }));
  return { status: response.status, ok: response.ok, successful, failed };
}
async function webChildren({ fetchImpl = fetch, config, key, signal } = {}) {
  if (!KEY.test(key || "")) throw new Error("Valid Zotero key required");
  const response = await webRequest(
    fetchImpl,
    config,
    `/${config.libraryType}/${config.libraryId}/items/${key}/children?format=json&limit=100`,
    { signal }
  );
  if (!response.ok)
    throw new Error(
      `Zotero ${config.local ? "local" : "Web"} API children lookup failed (HTTP ${response.status})`
    );
  return Array.isArray(response.json) ? response.json : [];
}
function publicWebConfig(config) {
  return { configured: config.configured, libraryType: config.libraryType, libraryId: config.libraryId };
}
async function prepareZoteroSave(input = {}, { fetchImpl = fetch, env = process.env, signal } = {}) {
  const item = normalizeZoteroItem(input);
  const attachment = normalizeZoteroAttachment(input);
  const requested = textField(input.channel, 16, "channel") || "auto";
  if (!["auto", "connector", "web"].includes(requested))
    throw new Error("channel must be auto, connector or web");
  const collectionKey = textField(input.collection_key ?? input.collectionKey, 8, "collection_key") || null;
  if (collectionKey && !KEY.test(collectionKey))
    throw new Error("collection_key must be an 8-character Zotero key");
  const target = connectorTargetId(input.target);
  const webConfig = zoteroWebApiConfig(env);
  const connector = requested === "web" ? { reachable: false, skipped: true } : await probeZoteroConnector({ fetchImpl, signal });
  const channel = requested !== "web" && connector.reachable ? "connector" : requested !== "connector" && webConfig.configured ? "web" : null;
  if (!channel)
    throw new Error(
      requested === "web" ? "Zotero Web API is not configured: set ZOTERO_API_KEY (write scope) and ZOTERO_LIBRARY_ID / ZOTERO_USER_ID in the host environment, never in chat." : requested === "connector" ? "Zotero desktop is not reachable on 127.0.0.1:23119. Start Zotero 7 and enable Settings \u2192 Advanced \u2192 Allow other applications on this computer to communicate with Zotero." : "No Zotero write channel: start Zotero desktop (connector) or configure a write-scoped ZOTERO_API_KEY with ZOTERO_LIBRARY_ID in the environment. No library was queried."
    );
  const plan = {
    doi: item.doi,
    idempotencyKey: externalEffectKey("zotero.create", {
      doi: item.doi,
      collectionKey
    }),
    item,
    attachment,
    channel,
    connector,
    web: publicWebConfig(webConfig),
    target: null,
    existing: [],
    dedupComplete: false,
    action: "blocked",
    reason: null,
    readBackVia: channel === "connector" ? "local-api" : "web-api"
  };
  if (channel === "connector") {
    const selected = await connectorSaveTarget({ fetchImpl, signal });
    if (!selected.editable)
      throw new Error(
        `Zotero desktop's current target "${selected.libraryName}" is read-only; select an editable library or collection in Zotero first.`
      );
    plan.target = { kind: "connector", ...selected, requestedTarget: target, local: true };
    const found = await localApiSearchByDoi({ fetchImpl, doi: item.doi, signal });
    plan.existing = found.items;
    plan.dedupComplete = found.complete;
  } else {
    const access = await webKeyAccess({ fetchImpl, config: webConfig, signal });
    if (!access.write)
      throw new Error(
        `ZOTERO_API_KEY has no write permission for ${webConfig.libraryType}/${webConfig.libraryId}; create a write-scoped key in the Zotero account settings. No write performed.`
      );
    plan.target = {
      kind: "web",
      libraryType: webConfig.libraryType,
      libraryId: webConfig.libraryId,
      libraryName: webConfig.libraryType === "groups" ? `group ${webConfig.libraryId}` : access.username || "My Library",
      collectionKey,
      local: false
    };
    const found = await webSearchByDoi({ fetchImpl, config: webConfig, doi: item.doi, signal });
    plan.existing = found.items;
    plan.dedupComplete = found.complete;
  }
  if (!plan.dedupComplete) plan.reason = "dedup-incomplete";
  else if (plan.existing.length === 1) plan.action = "reuse";
  else if (plan.existing.length > 1) {
    plan.action = "ambiguous";
    plan.reason = "multiple-items-share-doi";
  } else plan.action = "create";
  return plan;
}
function selectLink(key) {
  return KEY.test(String(key || "")) ? `zotero://select/library/items/${key}` : null;
}
function fulltextFromChildren(children) {
  const pdfs = children.filter((child) => child?.data?.contentType === "application/pdf");
  return {
    pdfAttachmentKeys: pdfs.map((child) => child.key),
    status: pdfs.length ? "attachment-indexed-not-read" : "metadata-only"
  };
}
async function readBackByDoi(plan, { fetchImpl, env, signal, attempts, delayMs, sleep }) {
  const config = zoteroWebApiConfig(env);
  let last = { state: "unavailable", count: 0, attempts: 0 };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const found = plan.channel === "connector" ? await localApiSearchByDoi({ fetchImpl, doi: plan.doi, signal }) : await webSearchByDoi({ fetchImpl, config, doi: plan.doi, signal });
      last = {
        state: !found.complete ? "unknown" : found.items.length === 1 ? "found" : found.items.length ? "ambiguous" : "not-found",
        count: found.items.length,
        items: found.items,
        attempts: attempt
      };
      if (last.state === "found" || last.state === "ambiguous") break;
    } catch (error) {
      last = {
        state: "unavailable",
        count: 0,
        attempts: attempt,
        error: String(error.message || error).slice(0, 200)
      };
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  if (last.state === "found") {
    try {
      const children = plan.channel === "connector" ? await localApiChildren({ fetchImpl, key: last.items[0].key, signal }) : await webChildren({ fetchImpl, config, key: last.items[0].key, signal });
      last.fulltext = fulltextFromChildren(children);
    } catch {
      last.fulltext = { pdfAttachmentKeys: [], status: "unavailable" };
    }
  }
  return last;
}
function baseReceipt(plan, at) {
  return {
    doi: plan.doi,
    idempotencyKey: plan.idempotencyKey,
    title: plan.item.title,
    itemType: plan.item.itemType,
    channel: plan.channel,
    library: {
      type: plan.target?.libraryType || "users",
      id: plan.target?.libraryId ?? null,
      name: plan.target?.libraryName || null,
      local: plan.target?.local === true
    },
    collection: plan.target?.collectionKey ? { key: plan.target.collectionKey, name: null } : plan.target?.collectionId ? { id: plan.target.collectionId, name: plan.target.collectionName } : null,
    attachment: {
      requested: Boolean(plan.attachment),
      url: plan.attachment?.url || null,
      mode: plan.attachment ? plan.channel === "connector" ? "zotero-downloads-url" : "linked_url" : null,
      key: null
    },
    dedup: { existing: plan.existing, complete: plan.dedupComplete },
    zoteroKey: null,
    zoteroSelect: null,
    fulltextStatus: "unavailable",
    readBack: null,
    write: { performed: false, at },
    writesToLibraries: 0,
    autoRetry: false,
    attachmentContentsVerified: false,
    scientificallyVerified: false
  };
}
function receiptWithoutWrite(plan, { now = () => /* @__PURE__ */ new Date() } = {}) {
  const receipt2 = baseReceipt(plan, now().toISOString());
  if (plan.action === "reuse") {
    receipt2.status = "reused";
    receipt2.zoteroKey = plan.existing[0].key;
    receipt2.zoteroSelect = selectLink(receipt2.zoteroKey);
    receipt2.reason = "existing-item-with-same-doi";
  } else {
    receipt2.status = ["ambiguous", "cancelled"].includes(plan.action) ? plan.action : "blocked";
    receipt2.reason = plan.reason || plan.action;
  }
  return receipt2;
}
async function executeZoteroSave(plan, {
  fetchImpl = fetch,
  env = process.env,
  signal,
  now = () => /* @__PURE__ */ new Date(),
  sleep = (ms) => new Promise((resolve3) => setTimeout(resolve3, ms)),
  readBackAttempts = 4,
  readBackDelayMs = 750
} = {}) {
  if (plan.action !== "create") throw new Error(`Refusing to write: plan action is ${plan.action}`);
  const at = now().toISOString();
  const receipt2 = baseReceipt(plan, at);
  receipt2.write = { performed: true, at, httpStatus: null, error: null };
  receipt2.writesToLibraries = 1;
  let writtenKey = null;
  try {
    if (plan.channel === "connector") {
      const payload = {
        sessionID: randomUUID().replace(/-/g, "").slice(0, 8),
        uri: plan.item.url,
        items: [toConnectorItem(plan.item, plan.attachment)]
      };
      if (plan.target?.requestedTarget) payload.target = plan.target.requestedTarget;
      const response = await connectorPost(fetchImpl, "/connector/saveItems", payload, {
        timeoutMs: 3e4,
        signal
      });
      receipt2.write.httpStatus = response.status;
      if (!response.ok)
        receipt2.write.error = `connector HTTP ${response.status}${response.json?.text ? `: ${response.json.text.slice(0, 200)}` : ""}`;
    } else {
      const config = zoteroWebApiConfig(env);
      const created = await webCreateItems({
        fetchImpl,
        config,
        items: [toWebApiItem(plan.item, { collectionKey: plan.target?.collectionKey || null })],
        signal
      });
      receipt2.write.httpStatus = created.status;
      writtenKey = created.successful[0]?.key || null;
      if (!created.ok || !writtenKey)
        receipt2.write.error = created.failed[0]?.message || `web api HTTP ${created.status}`;
      else if (plan.attachment) {
        const linked = await webCreateItems({
          fetchImpl,
          config,
          items: [
            {
              itemType: "attachment",
              linkMode: "linked_url",
              parentItem: writtenKey,
              title: plan.attachment.title,
              url: plan.attachment.url,
              contentType: "application/pdf",
              tags: []
            }
          ],
          signal
        });
        receipt2.attachment.key = linked.successful[0]?.key || null;
        if (!receipt2.attachment.key)
          receipt2.attachment.error = linked.failed[0]?.message || `web api HTTP ${linked.status}`;
      }
    }
  } catch (error) {
    receipt2.write.error = String(error.message || error).slice(0, 300);
  }
  const { items: observedItems = [], ...readBack } = await readBackByDoi(plan, {
    fetchImpl,
    env,
    signal,
    attempts: readBackAttempts,
    delayMs: readBackDelayMs,
    sleep
  });
  receipt2.readBack = readBack;
  if (readBack.state === "found") {
    const observed = observedItems[0];
    receipt2.zoteroKey = observed.key;
    receipt2.zoteroSelect = selectLink(observed.key);
    receipt2.fulltextStatus = receipt2.readBack.fulltext?.status || "unavailable";
    receipt2.status = writtenKey && writtenKey !== observed.key ? "unverified" : "saved";
    if (receipt2.status === "unverified") receipt2.reason = "read-back-key-differs";
  } else if (receipt2.readBack.state === "ambiguous") {
    receipt2.status = "ambiguous";
    receipt2.reason = "multiple-items-share-doi-after-write";
  } else if (receipt2.write.error) {
    receipt2.status = "failed";
    receipt2.reason = receipt2.write.error;
  } else {
    receipt2.status = "unverified";
    receipt2.reason = receipt2.readBack.state === "not-found" ? "written-but-not-read-back" : "read-back-unavailable";
  }
  return receipt2;
}
var MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
async function webJson(fetchImpl, config, path, signal) {
  const response = await webRequest(fetchImpl, config, path, { signal });
  if (!response.ok)
    throw new Error(
      config.local && response.status === 401 ? "Zotero rejected the local write key (revoked or expired); authorize local writes again in Drone Settings \u2192 Zotero" : `Zotero ${config.local ? "local" : "Web"} API HTTP ${response.status} for ${path.split("?")[0]}`
    );
  return response;
}
async function webGetItem({ fetchImpl = fetch, config, key, signal } = {}) {
  if (!KEY.test(key || "")) throw new Error("Valid Zotero key required");
  const response = await webJson(
    fetchImpl,
    config,
    `/${config.libraryType}/${config.libraryId}/items/${key}?format=json`,
    signal
  );
  const item = response.json || {};
  return {
    key: item.key,
    version: Number(item.version ?? item.data?.version ?? 0),
    title: String(item.data?.title || "").slice(0, 300),
    doi: normalizeDoi(item.data?.DOI || ""),
    itemType: item.data?.itemType || null,
    parentItem: item.data?.parentItem || null,
    collections: Array.isArray(item.data?.collections) ? item.data.collections : []
  };
}
async function webListCollections({ fetchImpl = fetch, config, signal } = {}) {
  const collections = [];
  for (let start = 0; start < 1e3; start += 100) {
    const response = await webJson(
      fetchImpl,
      config,
      `/${config.libraryType}/${config.libraryId}/collections?format=json&limit=100&start=${start}`,
      signal
    );
    const page = Array.isArray(response.json) ? response.json : [];
    for (const entry of page)
      if (KEY.test(entry?.key || ""))
        collections.push({
          key: entry.key,
          name: String(entry.data?.name || "").slice(0, 200),
          parent: entry.data?.parentCollection || null
        });
    if (page.length < 100 || !(response.total > start + 100)) break;
  }
  return collections;
}
async function webWrite(fetchImpl, config, path, { method, headers = {}, body, signal, timeoutMs = 3e4 }) {
  const response = await fetchImpl(`${config.base || ZOTERO_ENDPOINTS.webApi}${path}`, {
    method,
    headers: { "Zotero-API-Version": "3", ...authHeaders(config), ...headers },
    body,
    signal: timeoutSignal(timeoutMs, signal),
    redirect: "error"
  });
  return { status: response.status, ok: response.ok, json: await readJson(response) };
}
async function inspectLocalPdf(cwd, rawPath) {
  const path = textField(rawPath, 1e3, "local_file");
  if (!path) return null;
  const root = await realpath2(cwd);
  const full = await realpath2(isAbsolute2(path) ? path : resolve2(root, path));
  const rel = relative2(root, full);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep2}`) || isAbsolute2(rel))
    throw new Error("local_file must be inside the current project");
  const info = await stat2(full);
  if (!info.isFile()) throw new Error("local_file is not a file");
  if (info.size > MAX_UPLOAD_BYTES) throw new Error("local_file is larger than 100 MB");
  const handle = await open(full, "r");
  const hash2 = createHash4("md5");
  const head = Buffer.alloc(5);
  try {
    await handle.read(head, 0, 5, 0);
    const stream = handle.createReadStream({ autoClose: false, start: 0 });
    for await (const chunk of stream) hash2.update(chunk);
  } finally {
    await handle.close();
  }
  if (head.toString("latin1") !== "%PDF-") throw new Error("local_file is not a PDF");
  return {
    path: full,
    relativePath: rel.split(sep2).join("/"),
    filename: basename(full),
    size: info.size,
    mtime: Math.round(info.mtimeMs),
    md5: hash2.digest("hex")
  };
}
async function prepareZoteroUpdate(input = {}, { fetchImpl = fetch, env = process.env, cwd = process.cwd(), signal } = {}) {
  const web = zoteroWebApiConfig(env);
  const localConfig = zoteroLocalWriteConfig(env);
  const plan = {
    kind: "update",
    channel: "web",
    web: publicWebConfig(web),
    action: "blocked",
    reason: null,
    item: null,
    doi: null,
    changes: { addCollection: null, attachUrl: null, uploadFile: null },
    skipped: []
  };
  let config = web;
  let staleLocalKey = false;
  if (localConfig.configured && !(web.configured && web.libraryType === "groups")) {
    const serverId = await localServerId({ fetchImpl, signal });
    if (serverId === localConfig.serverId) config = localConfig;
    else staleLocalKey = Boolean(serverId);
  }
  if (config.local) {
    plan.channel = "local";
    plan.target = {
      kind: "local",
      libraryType: "users",
      libraryId: "0",
      libraryName: "My Library",
      local: true
    };
  } else {
    if (!web.configured) {
      plan.reason = staleLocalKey ? "The saved Zotero local write key belongs to a different Zotero database; authorize local writes again in Drone Settings \u2192 Zotero. No change made." : "Changing an existing Zotero item needs write access: on Zotero 10+ ask the user to authorize local writes in Drone Settings \u2192 Zotero (Zotero shows a dialog; choose \u201CAlways Allow\u201D), or to add a write-enabled API key under Settings \u2192 Zotero \u2192 Web API (or set ZOTERO_API_KEY and ZOTERO_LIBRARY_ID). No change made.";
      return plan;
    }
    const access = await webKeyAccess({ fetchImpl, config, signal });
    if (!access.write) {
      plan.reason = `The Zotero API key has no write permission for ${config.libraryType}/${config.libraryId}; create a key with library write access. No change made.`;
      return plan;
    }
    plan.target = {
      kind: "web",
      libraryType: config.libraryType,
      libraryId: config.libraryId,
      libraryName: config.libraryType === "groups" ? `group ${config.libraryId}` : access.username || "My Library",
      local: false
    };
  }
  let key = textField(input.zotero_key ?? input.key, 8, "zotero_key") || null;
  const doi = normalizeDoi(input.doi || "");
  if (!key) {
    if (!doi) throw new Error("zotero_key or doi is required");
    const found = await webSearchByDoi({ fetchImpl, config, doi, signal });
    if (!found.complete) {
      plan.reason = "dedup-incomplete";
      return plan;
    }
    if (found.items.length !== 1) {
      plan.reason = found.items.length ? "multiple-items-share-doi: pass zotero_key to choose one" : "no item with this DOI in the library; create it with research_zotero_save first";
      plan.candidates = found.items;
      return plan;
    }
    key = found.items[0]?.key ?? null;
  }
  const item = await webGetItem({ fetchImpl, config, key, signal });
  if (item.parentItem) throw new Error("zotero_key points to a child attachment/note, not a top-level item");
  plan.item = item;
  plan.doi = item.doi || doi || null;
  const collectionKey = textField(input.collection_key, 8, "collection_key") || null;
  const collectionName = textField(input.collection_name, 200, "collection_name") || null;
  if (collectionKey || collectionName) {
    const collections = await webListCollections({ fetchImpl, config, signal });
    const match = collectionKey ? collections.filter((entry) => entry.key === collectionKey) : collections.filter(
      (entry) => entry.name.trim().toLowerCase() === collectionName?.trim().toLowerCase()
    );
    if (match.length !== 1) {
      plan.reason = match.length ? `several collections are named "${collectionName}"; pass collection_key` : `collection ${collectionKey || `"${collectionName}"`} not found in this library`;
      plan.collections = collections.slice(0, 50).map(({ key: key2, name }) => ({ key: key2, name }));
      return plan;
    }
    const target = match[0];
    if (item.collections.includes(target.key)) plan.skipped.push(`already in collection "${target.name}"`);
    else plan.changes.addCollection = { key: target.key, name: target.name };
  }
  const attachmentUrl = textField(input.attachment_url, 2e3, "attachment_url") || null;
  const localFile = await inspectLocalPdf(cwd, input.local_file);
  if (attachmentUrl || localFile) {
    const children = await webChildren({ fetchImpl, config, key, signal });
    const existing = children.map((child) => child?.data || {});
    if (attachmentUrl) {
      if (!/^https?:\/\//i.test(attachmentUrl)) throw new Error("attachment_url must be http(s)");
      if (existing.some((child) => child.url === attachmentUrl))
        plan.skipped.push("link already attached");
      else
        plan.changes.attachUrl = {
          url: attachmentUrl,
          title: textField(input.attachment_title, 200, "attachment_title") || "Full Text (link)"
        };
    }
    if (localFile) {
      if (existing.some((child) => child.md5 === localFile.md5))
        plan.skipped.push("same PDF already attached");
      else plan.changes.uploadFile = localFile;
    }
  }
  plan.action = Object.values(plan.changes).some(Boolean) ? "update" : "unchanged";
  if (plan.action === "unchanged") plan.reason = plan.skipped.join("; ") || "nothing to change";
  return plan;
}
async function uploadAttachment(fetchImpl, config, parentKey, file, signal) {
  const lib = `/${config.libraryType}/${config.libraryId}`;
  const created = await webCreateItems({
    fetchImpl,
    config,
    items: [
      {
        itemType: "attachment",
        linkMode: "imported_file",
        parentItem: parentKey,
        title: file.filename,
        contentType: "application/pdf",
        filename: file.filename,
        tags: []
      }
    ],
    signal
  });
  const key = created.successful[0]?.key;
  if (!key) return { key: null, error: created.failed[0]?.message || `web api HTTP ${created.status}` };
  const form = { "Content-Type": "application/x-www-form-urlencoded", "If-None-Match": "*" };
  const auth = await webWrite(fetchImpl, config, `${lib}/items/${key}/file`, {
    method: "POST",
    headers: form,
    body: new URLSearchParams({
      md5: file.md5,
      filename: file.filename,
      filesize: String(file.size),
      mtime: String(file.mtime)
    }).toString(),
    signal
  });
  if (!auth.ok)
    return {
      key,
      error: `upload authorization HTTP ${auth.status}${auth.json?.text ? `: ${auth.json.text.slice(0, 200)}` : ""}`
    };
  if (auth.json?.exists === 1) return { key, error: null, deduplicated: true };
  const handle = await open(file.path, "r");
  let bytes;
  try {
    bytes = await handle.readFile();
  } finally {
    await handle.close();
  }
  const body = Buffer.concat([
    Buffer.from(auth.json.prefix || "", "utf8"),
    bytes,
    Buffer.from(auth.json.suffix || "", "utf8")
  ]);
  const uploadUrl = String(auth.json.url || "");
  const allowed = config.local ? uploadUrl.startsWith(`${new URL(ZOTERO_ENDPOINTS.localApi).origin}/`) : /^https:\/\//.test(uploadUrl);
  if (!allowed) return { key, error: "upload authorization returned an unexpected upload URL" };
  const uploaded = await fetchImpl(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": String(auth.json.contentType || "application/octet-stream"),
      // The local receiver rejects an upload without the database id; it does not take the key.
      ...config.local ? { "Zotero-Server-ID": config.serverId } : {}
    },
    body,
    signal: timeoutSignal(12e4, signal),
    redirect: "error"
  });
  if (uploaded.status !== 201 && uploaded.status !== 204)
    return { key, error: `file upload HTTP ${uploaded.status}` };
  const registered = await webWrite(fetchImpl, config, `${lib}/items/${key}/file`, {
    method: "POST",
    headers: form,
    body: new URLSearchParams({ upload: String(auth.json.uploadKey || "") }).toString(),
    signal
  });
  return { key, error: registered.status === 204 ? null : `upload registration HTTP ${registered.status}` };
}
async function executeZoteroUpdate(plan, { fetchImpl = fetch, env = process.env, signal, now = () => /* @__PURE__ */ new Date() } = {}) {
  if (plan.action !== "update") throw new Error(`Refusing to write: plan action is ${plan.action}`);
  const config = plan.channel === "local" ? zoteroLocalWriteConfig(env) : zoteroWebApiConfig(env);
  const lib = `/${config.libraryType}/${config.libraryId}`;
  const at = now().toISOString();
  const results = {};
  if (plan.changes.addCollection) {
    const patched = await webWrite(fetchImpl, config, `${lib}/items/${plan.item.key}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "If-Unmodified-Since-Version": String(plan.item.version)
      },
      body: JSON.stringify({ collections: [...plan.item.collections, plan.changes.addCollection.key] }),
      signal
    });
    results.addCollection = {
      ...plan.changes.addCollection,
      httpStatus: patched.status,
      error: patched.status === 204 ? null : patched.status === 412 ? "the item changed in Zotero after it was read; nothing was overwritten, run the update again" : `HTTP ${patched.status}`
    };
  }
  if (plan.changes.attachUrl) {
    const linked = await webCreateItems({
      fetchImpl,
      config,
      items: [
        {
          itemType: "attachment",
          linkMode: "linked_url",
          parentItem: plan.item.key,
          title: plan.changes.attachUrl.title,
          url: plan.changes.attachUrl.url,
          contentType: "application/pdf",
          tags: []
        }
      ],
      signal
    });
    results.attachUrl = {
      url: plan.changes.attachUrl.url,
      key: linked.successful[0]?.key || null,
      error: linked.successful[0]?.key ? null : linked.failed[0]?.message || `HTTP ${linked.status}`
    };
  }
  if (plan.changes.uploadFile) {
    try {
      results.uploadFile = {
        file: plan.changes.uploadFile.relativePath,
        size: plan.changes.uploadFile.size,
        ...await uploadAttachment(fetchImpl, config, plan.item.key, plan.changes.uploadFile, signal)
      };
    } catch (error) {
      results.uploadFile = {
        file: plan.changes.uploadFile.relativePath,
        key: null,
        error: String(error.message || error).slice(0, 300)
      };
    }
  }
  const readBack = {};
  try {
    const item = await webGetItem({ fetchImpl, config, key: plan.item.key, signal });
    readBack.collections = item.collections;
    if (results.addCollection)
      results.addCollection.verified = item.collections.includes(results.addCollection.key);
    const children = await webChildren({ fetchImpl, config, key: plan.item.key, signal });
    const childKeys = new Set(children.map((child) => child?.key));
    if (results.attachUrl?.key) results.attachUrl.verified = childKeys.has(results.attachUrl.key);
    if (results.uploadFile?.key) {
      const child = children.find((entry) => entry?.key === results.uploadFile.key);
      results.uploadFile.verified = Boolean(child) && (results.uploadFile.deduplicated || child?.data?.md5 === plan.changes.uploadFile.md5);
    }
  } catch (error) {
    readBack.error = String(error.message || error).slice(0, 200);
  }
  const outcomes = Object.values(results);
  const failed = outcomes.filter((entry) => entry.error);
  const verified = outcomes.filter((entry) => entry.verified);
  return {
    kind: "update",
    channel: plan.channel,
    doi: plan.doi,
    title: plan.item.title,
    zoteroKey: plan.item.key,
    zoteroSelect: selectLink(plan.item.key),
    library: {
      type: config.libraryType,
      id: config.libraryId,
      name: plan.target?.libraryName || null,
      local: Boolean(config.local)
    },
    changes: results,
    skipped: plan.skipped,
    readBack,
    write: { performed: true, at },
    status: failed.length === outcomes.length ? "failed" : failed.length ? "partial" : verified.length === outcomes.length ? "updated" : "unverified",
    autoRetry: false,
    attachmentContentsVerified: false
  };
}
function receiptWithoutUpdate(plan) {
  return {
    kind: "update",
    channel: plan.channel,
    doi: plan.doi,
    title: plan.item?.title || null,
    zoteroKey: plan.item?.key || null,
    zoteroSelect: selectLink(plan.item?.key),
    status: plan.action === "unchanged" ? "unchanged" : plan.action === "cancelled" ? "cancelled" : "blocked",
    reason: plan.reason,
    skipped: plan.skipped,
    ...plan.candidates ? { candidates: plan.candidates } : {},
    ...plan.collections ? { collections: plan.collections } : {},
    write: { performed: false }
  };
}

// src/desktop/zotero-tools.ts
var ZOTERO_NETWORK_READS = Object.freeze([
  "127.0.0.1:23119/connector/ping",
  "127.0.0.1:23119/connector/getSelectedCollection"
]);
var ZOTERO_WEB_CREDENTIAL = Object.freeze({
  slot: "zotero-web",
  header: "Zotero-API-Key",
  hosts: Object.freeze(["api.zotero.org"])
});
var HOST_ATTACHED_KEY = "attached-by-drone";
var MANAGED_LIMITS = "In Drone Desktop, saving goes through Zotero desktop (the connector) when it is running, otherwise through the Zotero Web API with the key the user saved in Drone Settings \u2192 UI plugins \u2192 Plugin credentials; Drone attaches the key, so never ask for it in chat. Changing an existing item needs that Web API key; Zotero 10 local writes are unavailable here.";
var zoteroFetch = (call, options = {}) => capabilityFetch(call, { reads: ZOTERO_NETWORK_READS, credential: ZOTERO_WEB_CREDENTIAL, ...options });
async function webEnv(call, signal) {
  let status;
  try {
    status = await call("credentials.status", null, signal);
  } catch {
    return {};
  }
  const saved = status?.slots?.[ZOTERO_WEB_CREDENTIAL.slot];
  if (!saved?.configured) return {};
  return {
    ZOTERO_API_KEY: HOST_ATTACHED_KEY,
    ZOTERO_LIBRARY_TYPE: saved.fields.libraryType ?? "",
    ZOTERO_LIBRARY_ID: saved.fields.libraryId ?? ""
  };
}
var text4 = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  details: value
});
function observedWrites(call) {
  const state = { wrote: false, declined: false };
  const observed = async (name, input, signal) => {
    try {
      const result = await call(name, input, signal);
      if (name === "network.write") state.wrote = true;
      return result;
    } catch (error) {
      if (name === "network.write" && /denied/i.test(error.message)) state.declined = true;
      throw error;
    }
  };
  return { call: observed, declinedBeforeAnyWrite: () => state.declined && !state.wrote };
}
async function allowanceFor(call, doi, signal) {
  let held;
  try {
    held = await call("task.grant.allowances", null, signal);
  } catch {
    return void 0;
  }
  const open2 = (held?.allowances ?? []).filter((item) => item.member === "zotero_item" && !item.used);
  const named = open2.find((item) => normalizeZoteroDoi(item.consent?.doi) === doi);
  return (named ?? open2.find((item) => item.consent?.slot === true && !item.consent?.doi))?.id;
}
async function saveToZotero(call, params, signal) {
  const env = await webEnv(call, signal);
  const plan = await prepareZoteroSave(params, {
    fetchImpl: zoteroFetch(call),
    env,
    signal
  });
  let receipt2;
  let allowance;
  if (plan.action !== "create") receipt2 = receiptWithoutWrite(plan);
  else {
    const writes = observedWrites(call);
    allowance = await allowanceFor(call, plan.doi, signal);
    receipt2 = await executeZoteroSave(plan, {
      fetchImpl: zoteroFetch(writes.call, {
        summary: `\u5199\u5165 Zotero \u6587\u732E\u5E93\uFF1A\u300A${plan.item.title}\u300B\uFF08DOI ${plan.doi}\uFF09`,
        allowance
      }),
      env,
      signal
    });
    if (writes.declinedBeforeAnyWrite())
      receipt2 = receiptWithoutWrite({ ...plan, action: "cancelled", reason: "user-declined" });
  }
  receipt2.consent = allowance ? { via: "task-grant", milestoneId: allowance } : { via: "host-dialog" };
  if (receipt2.status === "reused" && params.attachment_url)
    receipt2.update = "The item already exists, so nothing was changed.";
  receipt2.next = receipt2.zoteroKey ? `research_deposit_knowledge type=paper zotero_key=${receipt2.zoteroKey} doi=${receipt2.doi}, then research_verify_literature.` : "Do not retry automatically. Inspect Zotero or ask the user before any further write.";
  return receipt2;
}
async function updateInZotero(call, params, cwd, signal) {
  const env = await webEnv(call, signal);
  const plan = await prepareZoteroUpdate(params, {
    fetchImpl: zoteroFetch(call),
    env,
    cwd,
    signal
  });
  if (plan.action !== "update") return { ...receiptWithoutUpdate(plan), consent: { via: "not-needed" } };
  const writes = observedWrites(call);
  const receipt2 = await executeZoteroUpdate(plan, {
    fetchImpl: zoteroFetch(writes.call, {
      summary: `\u4FEE\u6539 Zotero \u6761\u76EE ${plan.item.key}`
    }),
    env,
    signal
  });
  if (writes.declinedBeforeAnyWrite())
    return {
      ...receiptWithoutUpdate({ ...plan, action: "cancelled", reason: "user-declined" }),
      consent: { via: "host-dialog" }
    };
  return { ...receipt2, consent: { via: "host-dialog" } };
}
async function webApiStatus(call, signal) {
  const config = zoteroWebApiConfig(await webEnv(call, signal));
  if (!config.configured) return { configured: false, reason: "not-saved-in-drone-settings" };
  const library = { libraryType: config.libraryType, libraryId: config.libraryId };
  try {
    const access = await webKeyAccess({ fetchImpl: zoteroFetch(call), config, signal });
    return { configured: true, ...library, library: access.library, write: access.write };
  } catch (error) {
    return { configured: true, ...library, error: error.message };
  }
}
async function zoteroStatus(call, signal) {
  return {
    runtime: "drone-desktop-managed",
    connector: await probeZoteroConnector({
      fetchImpl: zoteroFetch(call),
      signal
    }),
    webApi: await webApiStatus(call, signal),
    localWrite: { configured: false, reason: "managed-runtime-has-no-local-key" },
    note: MANAGED_LIMITS
  };
}
var ZOTERO_TOOL_EFFECTS = Object.freeze({
  research_zotero_status: "read",
  research_zotero_save: "read",
  research_zotero_update: "read"
});
function registerManagedZoteroTools(pi, call) {
  pi.registerTool({
    name: "research_zotero_status",
    label: "Zotero literature status",
    description: `Read-only: report whether Zotero desktop is reachable and which write channels are available. ${MANAGED_LIMITS}`,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    execute: async (_id, _params, signal) => text4(await zoteroStatus(call, signal))
  });
  pi.registerTool({
    name: "research_zotero_save",
    label: "Save one paper to Zotero (host-controlled)",
    description: `Write ONE bibliographic item into the user's Zotero library, keyed by exact DOI. Dedups by DOI first (an existing item is reused, nothing is written); otherwise the host asks the user once on its own dialog, writes once and reads the item back by DOI. Never deletes, merges or retries; never ask the user for confirmation in chat. ${MANAGED_LIMITS}`,
    parameters: {
      type: "object",
      required: ["doi", "title"],
      properties: {
        doi: { type: "string", description: "Exact DOI, e.g. 10.1038/s41586-020-2649-2" },
        title: { type: "string" },
        item_type: {
          type: "string",
          enum: [...ZOTERO_ITEM_TYPES],
          description: "Zotero item type; default journalArticle."
        },
        creators: {
          type: "array",
          description: "Authors in order. Use last_name/first_name, or name for organisations.",
          items: {
            type: "object",
            properties: {
              last_name: { type: "string" },
              first_name: { type: "string" },
              name: { type: "string" },
              creator_type: { type: "string", description: "author (default), editor, contributor" }
            }
          }
        },
        date: { type: "string" },
        publication: { type: "string", description: "Journal, proceedings, book or repository title." },
        volume: { type: "string" },
        issue: { type: "string" },
        pages: { type: "string" },
        url: { type: "string" },
        abstract: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        attachment_url: {
          type: "string",
          description: "Optional http(s) URL of an open-access PDF whose license allows saving; Zotero desktop downloads it."
        },
        attachment_title: { type: "string" },
        target: {
          type: "string",
          description: '"L<libraryID>" or "C<collectionID>" as reported by Zotero desktop. Default: the library/collection currently selected in Zotero.'
        }
      }
    },
    execute: async (_id, params, signal) => text4(await saveToZotero(call, params || {}, signal))
  });
  pi.registerTool({
    name: "research_zotero_update",
    label: "Update an existing Zotero item (host-controlled)",
    description: `Change ONE existing item in the user's Zotero library (collection, PDF link, local PDF). Identify it by zotero_key or exact DOI; the host asks the user on its own dialog before writing, then reads the item back. Never deletes or retries. Without a write channel it returns status=blocked with the reason; never ask for a key in chat. ${MANAGED_LIMITS}`,
    parameters: {
      type: "object",
      properties: {
        zotero_key: { type: "string", description: "8-character key of the existing item (preferred)." },
        doi: {
          type: "string",
          description: "Exact DOI when the key is unknown; must match exactly one item."
        },
        collection_key: {
          type: "string",
          description: "8-character key of the collection to add the item to."
        },
        collection_name: {
          type: "string",
          description: "Exact collection name, used when the key is unknown."
        },
        attachment_url: {
          type: "string",
          description: "http(s) URL of an open-access PDF to attach as a link."
        },
        attachment_title: { type: "string" },
        local_file: {
          type: "string",
          description: "Path (inside the project) of a PDF to upload as a stored attachment."
        }
      }
    },
    execute: async (_id, params, signal, _update, ctx) => text4(await updateInZotero(call, params || {}, ctx.cwd, signal))
  });
}

// src/desktop/runtime.ts
function scopeWorkspace(scope) {
  if (scope.kind === "application") throw new Error("Research status requires a selected workspace");
  return scope.workspaceDirectory;
}
function paramsOf(input) {
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}
function portFor(capabilities) {
  return {
    async resolveRoot(path) {
      const response = await capabilities.call("roots.resolve", { path, kind: "files" });
      if (!response || typeof response.handle !== "string" || !response.handle)
        throw new Error("Host did not grant a workspace files root");
      return { handle: response.handle };
    },
    async readText(root, path) {
      const response = await capabilities.call("files.readText", { root, path });
      if (!response || typeof response.text !== "string")
        throw new Error(`Host returned invalid text for ${path}`);
      return response.text;
    },
    async listFiles(root, path) {
      const response = await capabilities.call("files.list", { root, path });
      if (!Array.isArray(response)) throw new Error(`Host returned invalid directory listing for ${path}`);
      return response.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error("directory entry must be an object");
        const entry = value;
        if (typeof entry.name !== "string" || typeof entry.kind !== "string")
          throw new Error("Host returned an invalid directory entry");
        return {
          name: entry.name,
          kind: ["file", "directory", "symlink", "other"].includes(entry.kind) ? entry.kind : "other"
        };
      });
    }
  };
}
var createDesktopRuntime = async (context) => {
  const adapterFor = (capabilities) => createResearchHost(portFor(capabilities));
  const operation = (name) => ({
    inputSchema: { type: "object" },
    resultSchema: { type: "object" },
    effect: "read",
    execute: async (input, callContext) => {
      const workspace = scopeWorkspace(callContext.scope);
      const params = paramsOf(input);
      const adapter = adapterFor(callContext.capabilities);
      const base = {
        workspace,
        project: params.project === void 0 ? void 0 : String(params.project),
        limit: params.limit === void 0 ? void 0 : Number(params.limit)
      };
      const runDir = params.runDir === void 0 ? void 0 : String(params.runDir);
      if (name === "status") return adapter.operations.status({ ...base, runDir });
      if (name === "detail") {
        if (!adapter.operations.detail) throw new Error("Research detail operation is unavailable");
        return adapter.operations.detail({
          ...base,
          runDir,
          runId: params.runId === void 0 ? void 0 : String(params.runId)
        });
      }
      return adapter.operations.listRuns(base);
    }
  });
  return {
    operations: {
      status: operation("status"),
      listRuns: operation("listRuns"),
      detail: operation("detail"),
      ...zoteroAcceptanceOperations()
    },
    createNativeSession: async () => ({
      toolEffects: ZOTERO_TOOL_EFFECTS,
      nativeOperations: { identify: zoteroIdentifyNativeOperation },
      extension: (pi) => registerManagedZoteroTools(
        pi,
        (name, input, signal) => context.capabilities.call(name, input, signal)
      ),
      dispose: async () => {
      }
    }),
    dispose: async () => {
    }
  };
};
var runtime_default = createDesktopRuntime;
export {
  runtime_default as default
};
