// @ts-nocheck

// src/core/worker.ts
import { parentPort, workerData } from "node:worker_threads";

// src/core/index-runtime.ts
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setImmediate as yieldTurn } from "node:timers/promises";

// src/core/files.ts
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
var MAX_NOTE_BYTES = 1024 * 1024;
var OMIT = /* @__PURE__ */ new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "venv",
  "__pycache__",
  "Attachments",
  "Templates",
  "_template"
]);
var RESERVED = ["Projects", "Library", "Wiki", "Attachments", "Templates", "Indexes", "Inbox"];
function allowedSegment(name) {
  return !!name && !name.startsWith(".") && !OMIT.has(name) && !/^(?:secrets?|credentials?|id_rsa|id_ed25519)(?:[.\-_]|$)/i.test(name);
}
function validateNote(path) {
  if (typeof path !== "string" || isAbsolute(path) || path.includes("\\") || !path.endsWith(".md") || !path.split("/").every(allowedSegment))
    throw new Error("Expected an allowed Vault-relative Markdown path");
  const first = path.split("/")[0] ?? "";
  if (RESERVED.some((name) => name.toLowerCase() === first.toLowerCase() && name !== first))
    throw new Error("Reserved Vault directories require canonical casing");
  return path;
}
function noteScope(path) {
  const parts = path.split("/");
  return path.startsWith("Projects/") && parts.length > 2 ? parts[1] ?? "shared" : "shared";
}
function canRead(path, project) {
  const scope = noteScope(path);
  return scope === "shared" || scope === project;
}
function fileVersion(stat) {
  return `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`;
}
async function safeNotePath(vault, path) {
  validateNote(path);
  let full = vault;
  for (const part of path.split("/")) {
    full = join(full, part);
    if ((await lstat(full)).isSymbolicLink()) throw new Error("Knowledge reads do not follow symlinks");
  }
  const actual = await realpath(full);
  const rel = relative(vault, actual);
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`))
    throw new Error("Note is outside the bound Vault");
  return actual;
}
async function inspectNote(vault, path) {
  const full = await safeNotePath(vault, path);
  const stat = await lstat(full);
  if (!stat.isFile()) throw new Error("Expected a regular note");
  return { full, stat, signature: fileVersion(stat) };
}
async function closeQuietly(handle) {
  try {
    await handle.close();
  } catch {
  }
}
async function readNoteFile(vault, path) {
  const { full } = await inspectNote(vault, path);
  const handle = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > MAX_NOTE_BYTES)
      throw new Error("Note exceeds the 1 MiB indexing limit");
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    const current = await inspectNote(vault, path);
    if (fileVersion(before) !== fileVersion(after) || fileVersion(after) !== current.signature || offset !== before.size)
      throw new Error("Note changed while reading; retry against its latest version");
    const bytes = buffer.subarray(0, offset);
    return {
      path,
      text: bytes.toString("utf8"),
      hash: createHash("sha256").update(bytes).digest("hex"),
      signature: fileVersion(after),
      bytes: offset
    };
  } catch (error) {
    await closeQuietly(handle);
    throw error;
  } finally {
    await closeQuietly(handle);
  }
}
function snippet(text, { startLine = 1, maxChars = 5e3 } = {}) {
  const lines = text.split("\n");
  const start = Math.max(0, Math.floor(startLine) - 1);
  const selected = [];
  let chars = 0;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (chars + line.length + 1 > maxChars) {
      if (!selected.length) selected.push(line.slice(0, maxChars));
      break;
    }
    selected.push(line);
    chars += line.length + 1;
  }
  return {
    text: selected.join("\n"),
    startLine: start + 1,
    endLine: start + selected.length,
    totalLines: lines.length,
    truncated: start > 0 || start + selected.length < lines.length || selected.length === 1 && (selected[0]?.length ?? 0) < (lines[start]?.length || 0)
  };
}

// src/core/graph-cache.ts
function createRevisionCache() {
  let activeRevision = null;
  const values = /* @__PURE__ */ new Map();
  const align = (revision) => {
    if (activeRevision === revision) return;
    activeRevision = revision;
    values.clear();
  };
  return {
    get(revision, key) {
      align(revision);
      return values.get(key);
    },
    set(revision, key, value) {
      align(revision);
      values.set(key, value);
    },
    clear() {
      activeRevision = null;
      values.clear();
    }
  };
}

// src/core/ingest-identity.ts
import { createHash as createHash2 } from "node:crypto";

// src/core/ingest-frontmatter.ts
var KNOWLEDGE_TYPES = [
  "paper",
  "method",
  "software",
  "dataset",
  "concept",
  "entity",
  "idea",
  "claim",
  "evidence",
  "decision",
  "question",
  "wiki"
];
var RUN_RESULT_TYPES = ["run", "artifact", "explainer"];
var NOTE_TYPES = [...KNOWLEDGE_TYPES, ...RUN_RESULT_TYPES];
var MAX_FRONTMATTER_CHARS = 64 * 1024;
var MAX_DEPTH = 6;
var UNSAFE_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
function splitFrontmatter(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const open2 = source.match(/^---[ \t]*\r?\n/);
  if (!open2) return { raw: null, body: source };
  const start = open2[0].length;
  const rest = source.slice(start);
  const close = rest.match(/^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m);
  if (!close || close.index === void 0) return { raw: null, body: source };
  return { raw: rest.slice(0, close.index), body: rest.slice(close.index + close[0].length) };
}
function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === "\\" && quote === '"') i++;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "#" && (i === 0 || /\s/.test(text[i - 1] ?? ""))) return text.slice(0, i).trimEnd();
  }
  return text;
}
function splitFlow(inner) {
  const items = [];
  let current = "";
  let quote = null;
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i] ?? "";
    if (quote) {
      current += char;
      if (char === "\\" && quote === '"') current += inner[++i] ?? "";
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") depth--;
    if (char === "," && depth === 0) {
      items.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}
function parseScalar(raw) {
  const text = raw.trim();
  if (text === "" || text === "~" || text === "null" || text === "Null" || text === "NULL") return null;
  if (text === "true" || text === "True") return true;
  if (text === "false" || text === "False") return false;
  if (text.startsWith('"')) {
    if (text.endsWith('"') && text.length >= 2) {
      try {
        return JSON.parse(text);
      } catch {
        return text.slice(1, -1).replace(/\\"/g, '"');
      }
    }
    throw new Error("Unterminated double-quoted string");
  }
  if (text.startsWith("'")) {
    if (text.endsWith("'") && text.length >= 2) return text.slice(1, -1).replace(/''/g, "'");
    throw new Error("Unterminated single-quoted string");
  }
  if (text.startsWith("[")) {
    if (!text.endsWith("]")) throw new Error("Unterminated flow sequence");
    const inner = text.slice(1, -1).trim();
    return inner ? splitFlow(inner).map(parseScalar) : [];
  }
  if (text.startsWith("{")) {
    if (!text.endsWith("}")) throw new Error("Unterminated flow mapping");
    const inner = text.slice(1, -1).trim();
    const out = {};
    if (!inner) return out;
    for (const pair of splitFlow(inner)) {
      const match = pair.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/);
      if (!match) throw new Error(`Invalid flow mapping entry: ${pair}`);
      const key = String(parseScalar(match[1] ?? ""));
      if (!UNSAFE_KEYS.has(key)) out[key] = parseScalar(match[2] ?? "");
    }
    return out;
  }
  if (/^[&*!|>]/.test(text)) throw new Error(`Unsupported YAML syntax: ${text.slice(0, 20)}`);
  if (/^-?\d+(?:\.\d+)?$/.test(text) && text.length <= 15) return Number(text);
  return text;
}
var KEY_LINE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s"'#\-[{][^:#]*?|-[^\s:#][^:#]*?)\s*:(?:\s+(.*)|\s*)$/;
function isListItem(line) {
  return line.text === "-" || line.text.startsWith("- ");
}
var Parser = class {
  constructor(lines) {
    this.lines = lines;
  }
  index = 0;
  parseDocument() {
    if (!this.lines.length) return {};
    const first = this.lines[0];
    if (first.indent !== 0) throw new Error(`Line ${first.number}: top-level key must not be indented`);
    if (isListItem(first)) throw new Error(`Line ${first.number}: frontmatter must be a mapping`);
    const value = this.parseMap(0, 0);
    if (this.index < this.lines.length) {
      const line = this.lines[this.index];
      throw new Error(`Line ${line.number}: unexpected indentation`);
    }
    return value;
  }
  peek() {
    return this.lines[this.index];
  }
  parseBlock(indent, depth) {
    if (depth > MAX_DEPTH) throw new Error("Frontmatter nesting is too deep");
    const line = this.peek();
    if (!line) return null;
    return isListItem(line) ? this.parseList(line.indent, depth) : this.parseMap(indent, depth);
  }
  valueAfterKey(indent, depth, rest) {
    if (rest !== void 0 && rest.trim() !== "") {
      const value = stripComment(rest);
      if (/^[|>][+-]?$/.test(value.trim())) return this.parseBlockScalar(indent, value.trim());
      return parseScalar(value);
    }
    const next = this.peek();
    if (!next) return null;
    if (next.indent > indent) return this.parseBlock(next.indent, depth + 1);
    if (next.indent === indent && isListItem(next)) return this.parseList(indent, depth + 1);
    return null;
  }
  parseBlockScalar(indent, style) {
    const collected = [];
    let blockIndent = null;
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line.indent <= indent) break;
      blockIndent ??= line.indent;
      collected.push(`${" ".repeat(Math.max(0, line.indent - blockIndent))}${line.text}`);
      this.index++;
    }
    const joined = style.startsWith("|") ? collected.join("\n") : collected.join(" ");
    return style.endsWith("-") ? joined : `${joined}
`;
  }
  parseMap(indent, depth) {
    const out = {};
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line.indent < indent) break;
      if (line.indent > indent) throw new Error(`Line ${line.number}: unexpected indentation`);
      if (isListItem(line)) break;
      const match = line.text.match(KEY_LINE);
      if (!match) throw new Error(`Line ${line.number}: expected "key: value"`);
      const key = String(parseScalar(match[1] ?? "")).trim();
      this.index++;
      const value = this.valueAfterKey(indent, depth, match[2]);
      if (UNSAFE_KEYS.has(key)) continue;
      if (Object.hasOwn(out, key)) throw new Error(`Line ${line.number}: duplicate key "${key}"`);
      out[key] = value;
    }
    return out;
  }
  parseList(indent, depth) {
    const out = [];
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line.indent !== indent || !isListItem(line)) {
        if (line.indent > indent) throw new Error(`Line ${line.number}: unexpected indentation`);
        break;
      }
      const rest = line.text === "-" ? "" : line.text.slice(2);
      const offset = line.text === "-" ? 1 : 2 + (rest.length - rest.trimStart().length);
      const content = rest.trim();
      if (!content) {
        this.index++;
        const next = this.peek();
        out.push(next && next.indent > indent ? this.parseBlock(next.indent, depth + 1) : null);
        continue;
      }
      if (KEY_LINE.test(stripComment(content)) && !/^["'[{]/.test(content)) {
        this.lines[this.index] = { indent: indent + offset, text: content, number: line.number };
        out.push(this.parseMap(indent + offset, depth + 1));
        continue;
      }
      this.index++;
      out.push(parseScalar(stripComment(content)));
    }
    return out;
  }
};
function toLines(raw) {
  const lines = [];
  const source = raw.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < source.length; i++) {
    const text = source[i] ?? "";
    if (!text.trim() || /^\s*#/.test(text)) continue;
    const leading = text.match(/^[ \t]*/)?.[0] ?? "";
    if (leading.includes("	")) throw new Error(`Line ${i + 2}: tabs are not allowed for indentation`);
    lines.push({ indent: leading.length, text: text.slice(leading.length).trimEnd(), number: i + 2 });
  }
  return lines;
}
function parseFrontmatter(text) {
  const { raw, body } = splitFrontmatter(text);
  if (raw === null) return { data: null, body, errors: [] };
  if (raw.length > MAX_FRONTMATTER_CHARS) return { data: null, body, errors: ["Frontmatter exceeds 64 KiB"] };
  try {
    return { data: new Parser(toLines(raw)).parseDocument(), body, errors: [] };
  } catch (error) {
    return { data: null, body, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

// src/core/note-category.ts
function keywordCategory(value) {
  if (/paper|literature|文献|论文/.test(value)) return "paper";
  if (/software|tool|软件/.test(value)) return "software";
  if (/method|protocol|方法/.test(value)) return "method";
  if (/idea|hypothes|想法|假设/.test(value)) return "idea";
  return "other";
}
var classifications = { count: 0 };
function noteCategoryCount() {
  return classifications.count;
}
function noteCategory(row) {
  classifications.count++;
  const type = String(parseFrontmatter(row.body).data?.type || "").trim().toLowerCase();
  if (type) return keywordCategory(type);
  const segments = row.path.toLowerCase().split("/");
  const filename = segments.pop();
  for (const directory of segments.reverse()) {
    if (/^(papers?|literature|文献|论文|software|tools?|软件|methods?|protocols?|方法|ideas?|hypotheses|想法|假设)$/.test(
      directory
    ))
      return keywordCategory(directory);
  }
  return keywordCategory(filename);
}

// src/core/category-count-cache.ts
function emptyCounts() {
  return { paper: 0, software: 0, method: 0, idea: 0, other: 0 };
}
function updatedAt(signature) {
  return Number.parseFloat(String(signature ?? "").split(":", 1)[0]) || 0;
}
function createCategoryCountCache() {
  const counts = createRevisionCache();
  const notes = createRevisionCache();
  function scan(revision, load, project) {
    const scope = project === void 0 ? "*" : project;
    const cachedCounts = counts.get(revision, scope);
    const cachedNotes = notes.get(revision, scope);
    if (cachedCounts && cachedNotes) return { counts: cachedCounts, notes: cachedNotes };
    const result = emptyCounts();
    const categorized = [];
    for (const note of load()) {
      if (project !== void 0 && !canRead(note.path, project)) continue;
      const category = noteCategory(note);
      result[category]++;
      categorized.push({
        path: note.path,
        title: note.title ?? note.path,
        kind: note.kind ?? "note",
        category,
        updatedAt: updatedAt(note.signature)
      });
    }
    counts.set(revision, scope, result);
    notes.set(revision, scope, categorized);
    return { counts: result, notes: categorized };
  }
  function categoryCounts(revision, load, project) {
    return { ...scan(revision, load, project).counts };
  }
  function categorizedNotes(revision, load, project) {
    return scan(revision, load, project).notes;
  }
  return { categoryCounts, categorizedNotes };
}

// src/core/category-views.ts
function categoryRowLoader(query) {
  return () => query();
}
function groupRecentByCategory(notes, limit = 10) {
  const groups = {
    paper: [],
    software: [],
    method: [],
    idea: []
  };
  for (const note of notes) {
    if (note.category === "other") continue;
    groups[note.category].push({
      path: note.path,
      title: note.title,
      kind: note.kind,
      updatedAt: note.updatedAt
    });
  }
  const max = Math.max(1, Math.min(24, Math.floor(limit || 10)));
  for (const key of Object.keys(groups))
    groups[key] = groups[key].sort((left, right) => right.updatedAt - left.updatedAt || left.path.localeCompare(right.path)).slice(0, max);
  return groups;
}
function createCategoryViews(readRevision) {
  const cache = createCategoryCountCache();
  function counts(load, project) {
    return cache.categoryCounts(readRevision(), load, project);
  }
  function notes(load, project) {
    return cache.categorizedNotes(readRevision(), load, project);
  }
  function recent(load, project, limit) {
    return groupRecentByCategory(notes(load, project), limit);
  }
  return { counts, notes, recent };
}

// src/core/graph-retrieval.ts
function backlinkContext(body, target, max = 240) {
  const bare = target.split("/").at(-1)?.replace(/\.md$/, "") || target;
  const full = target.replace(/\.md$/, "");
  for (const line of String(body || "").split(/\r?\n/)) {
    for (const m of line.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
      const t = (m[1] || "").trim().replace(/\.md$/, "");
      if (t === full || t.toLowerCase() === bare.toLowerCase()) {
        const s = line.trim();
        return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
      }
    }
  }
  return void 0;
}

// src/core/link-resolver.ts
function createLinkResolver(database, canRead2) {
  function resolve(target, project) {
    const exact = database.prepare("SELECT path FROM notes WHERE path=?").get(target);
    if (exact && (project === void 0 || canRead2(target, project))) return target;
    if (target.includes("/")) return null;
    const rows = project === void 0 ? database.prepare("SELECT path FROM notes WHERE filename=? LIMIT 2").all(target) : database.prepare("SELECT path FROM notes WHERE filename=? AND (scope='shared' OR scope=?) LIMIT 2").all(target, project || "");
    return rows.length === 1 ? rows[0].path : null;
  }
  function lookupPlan() {
    return database.prepare("EXPLAIN QUERY PLAN SELECT path FROM notes WHERE filename=? LIMIT 2").all("").map((row) => String(row.detail ?? "")).join(" ");
  }
  return { resolve, lookupPlan };
}

// src/core/note-filename.ts
function noteFilename(path) {
  const separator = path.lastIndexOf("/");
  if (separator < 0) return "";
  return path.slice(separator + 1);
}
function backfillNoteFilenames(database) {
  const rows = database.prepare("SELECT path FROM notes WHERE filename = ''").all();
  if (!rows.length) return 0;
  const update = database.prepare("UPDATE notes SET filename=? WHERE path=?");
  for (const row of rows) update.run(noteFilename(String(row.path)), String(row.path));
  return rows.length;
}
function ensureNoteFilenameColumn(database) {
  const columns = database.prepare("PRAGMA table_info(notes)").all().map((column) => String(column.name ?? ""));
  if (columns.includes("filename")) return;
  database.exec("ALTER TABLE notes ADD COLUMN filename TEXT NOT NULL DEFAULT ''");
  database.exec("BEGIN IMMEDIATE");
  try {
    backfillNoteFilenames(database);
    database.exec("COMMIT");
  } catch {
    database.exec("ROLLBACK");
  }
  database.exec("CREATE INDEX IF NOT EXISTS notes_filename ON notes(filename)");
}

// src/core/note-title.ts
var clean = (value) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 200) : "";
function looksLikeFileName(title) {
  const value = String(title || "").trim();
  if (!value) return true;
  if (/\.(?:pdf|html?|md|txt|docx?|xlsx?|csv|json|zip|tar|gz)$/i.test(value)) return true;
  if (/^(?:PMC|PMID)?\d[\d.]*$/i.test(value)) return true;
  return /^[a-z0-9]+(?:[-_][a-z0-9]+){2,}$/.test(value) && /\d{4,}|[a-f0-9]{12,}/.test(value);
}
function noteDisplayTitle(text, path) {
  let data = null;
  try {
    data = parseFrontmatter(text).data;
  } catch {
    data = null;
  }
  const topic = clean(data?.topic);
  if (topic) return topic;
  const title = clean(data?.title);
  const heading = clean(text.match(/^#\s+(.+)$/m)?.[1]);
  if (title && (!heading || looksLikeFileName(heading))) return title;
  return heading || title || path.split("/").at(-1)?.replace(/\.md$/i, "") || path;
}

// src/core/search-policy.ts
function tokenizeKnowledgeText(text) {
  const words = String(text).normalize("NFKC").toLowerCase().match(/[a-z0-9][a-z0-9._+-]*|[\p{Script=Han}]+/gu) || [];
  const output = [];
  for (const word of words) {
    if (new RegExp("\\p{Script=Han}", "u").test(word)) {
      const characters = [...word];
      for (let index = 0; index < characters.length; index++) {
        const character = characters[index];
        if (!character) continue;
        output.push(character);
        const next = characters[index + 1];
        if (next) output.push(character + next);
      }
    } else output.push(word);
  }
  return output;
}
function buildKnowledgeSearchExpression(query) {
  if (typeof query !== "string" || !query.trim() || query.length > 2e3)
    throw new Error("Query must contain 1\u20132000 characters");
  const terms = [...new Set(tokenizeKnowledgeText(query))].slice(0, 32);
  if (!terms.length) throw new Error("Query has no searchable terms");
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
}
function splitKnowledgeChunks(text, maxChars = 1200) {
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > 8e3)
    throw new Error("Semantic chunk size must be an integer between 1 and 8000");
  const chunks = [];
  for (let start = 0; start < text.length && chunks.length < 64; start += maxChars)
    chunks.push(text.slice(start, start + maxChars));
  return chunks;
}

// src/core/note-write.ts
function internalLinks(path, text) {
  const out = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    let target = match[1].trim();
    if (!target.includes("/")) {
      target = ["Home", "Index", "Context"].includes(target) && target !== "Home" ? `${path.split("/").slice(0, -1).join("/")}/${target}` : target;
    }
    if (!target.endsWith(".md")) target += ".md";
    try {
      validateNote(target);
      out.add(target);
    } catch {
    }
  }
  return out;
}
function noteKind(path) {
  if (/(?:^|\/)(?:Index|Context|Home)\.md$/i.test(path)) return "navigation";
  if (/(?:^|\/)Wiki\//.test(path)) return "wiki";
  if (path.startsWith("Library/Explainers/")) return "explainer";
  return "note";
}
function prepareNote(path, previous, file) {
  const title = noteDisplayTitle(file.text, path);
  return {
    path,
    previous,
    file,
    title,
    kind: noteKind(path),
    scope: noteScope(path),
    terms: tokenizeKnowledgeText(file.text).join(" "),
    titleTerms: tokenizeKnowledgeText(title).join(" "),
    links: [...internalLinks(path, file.text)]
  };
}
function applyNoteWrite(note, sink) {
  const { path, file } = note;
  const current = sink.get(path);
  if (current) sink.removeFts(current.id);
  if (current && (current.hash !== file.hash || current.signature !== file.signature))
    sink.semanticDelete(path);
  sink.upsertNote(note);
  const row = sink.get(path);
  if (!row) return;
  sink.removeFts(row.id);
  sink.insertSearch(row.id, note.titleTerms, note.terms);
  sink.clearLinks(path);
  for (const target of note.links) sink.addLink(path, target);
  sink.clearProblem(path);
  sink.bump();
  sink.changed(path, note.previous);
}
function applySignatureUpdate(path, file, sink, setSignature) {
  setSignature(path, file.signature);
  sink.clearProblem(path);
}
function applyNoteRemoval(path, previous, sink) {
  if (!previous) return;
  const current = sink.get(path);
  if (current) sink.removeFts(current.id);
  sink.remove(path);
  sink.semanticDelete(path);
  sink.clearLinks(path);
  sink.bump();
  sink.changed(path, previous);
}

// src/core/note-write-runtime.ts
function createNoteWriteSink(runtime) {
  const { statements } = runtime;
  return {
    get: (path) => statements.get.get(path) ?? null,
    removeFts: (id) => statements.removeFts.run(id),
    remove: (path) => statements.remove.run(path),
    semanticDelete: (path) => statements.semanticDelete.run(path),
    upsertNote: (note) => {
      statements.upsertNote.run(
        note.path,
        note.title,
        note.file.text,
        note.file.hash,
        note.file.signature,
        note.scope,
        note.kind,
        note.file.bytes,
        noteFilename(note.path)
      );
    },
    insertSearch: (id, titleTerms, terms) => statements.insertSearch.run(id, titleTerms, terms),
    clearLinks: (path) => statements.links.run(path),
    addLink: (path, target) => statements.addLink.run(path, target),
    clearProblem: (path) => statements.clearProblem.run(path),
    bump: () => runtime.bump(),
    changed: (path, previous) => runtime.changed(path, previous)
  };
}
function applyUpdate(update, transaction, runtime, sink) {
  const { statements } = runtime;
  if (update.kind === "unchanged") return statements.get.get(update.path) ?? null;
  if (update.kind === "signature") {
    transaction.within(
      () => applySignatureUpdate(
        update.path,
        update.file,
        sink,
        (path, signature) => statements.setSignature.run(signature, path)
      )
    );
    return statements.get.get(update.path) ?? null;
  }
  if (update.kind === "remove") {
    const path = update.path;
    const error = update.error;
    const code = error.code ?? "";
    const gone = ["ENOENT", "ENOTDIR"].includes(code);
    if (gone) statements.clearProblem.run(path);
    else statements.problem.run(path, String(error.message).slice(0, 400));
    transaction.within(() => applyNoteRemoval(path, update.previous, sink));
    if (!gone) throw error;
    return null;
  }
  transaction.within(() => applyNoteWrite(update.note, sink));
  return statements.get.get(update.note.path) ?? null;
}

// src/core/write-batch.ts
var BATCH_LIMIT = 64;
function createWriteBatcher(exec) {
  let open2 = false;
  let commits = 0;
  let writes = 0;
  function begin() {
    return {
      get open() {
        return open2;
      },
      within(work) {
        if (!open2) {
          exec("BEGIN IMMEDIATE");
          open2 = true;
        }
        work();
        writes++;
      }
    };
  }
  function commit() {
    if (!open2) return;
    try {
      exec("COMMIT");
    } finally {
      open2 = false;
      commits++;
    }
  }
  function rollback() {
    if (!open2) return;
    try {
      exec("ROLLBACK");
    } finally {
      open2 = false;
    }
  }
  return {
    begin,
    commit,
    rollback,
    commits: () => commits,
    writes: () => writes
  };
}

// src/core/reconcile-batch.ts
async function reconcileInBatches(paths, sink) {
  const batcher = createWriteBatcher((sql) => sink.exec(sql));
  const batch = batcher.begin();
  const prepared = [];
  const flush = () => {
    if (!prepared.length) return;
    const group = prepared.splice(0, prepared.length);
    try {
      batch.within(() => {
        for (const update of group) {
          try {
            sink.apply(update, batch);
          } catch (error) {
            const path = update.path ?? update.note?.path ?? "";
            sink.problem(path, String(error.message).slice(0, 400));
          }
        }
      });
      batcher.commit();
      sink.committed();
    } catch (error) {
      batcher.rollback();
      const message = String(error.message).slice(0, 400);
      for (const update of group) sink.problem(update.path ?? update.note?.path ?? "", message);
    }
  };
  for await (const path of paths) {
    const update = await sink.prepare(path);
    prepared.push(update);
    if (prepared.length >= BATCH_LIMIT) flush();
  }
  flush();
}

// src/core/semantic-model.ts
var WIDTH = 720;
var HEIGHT = 440;
var LAYOUT_MARGIN = 28;
var INFRASTRUCTURE = /(?:^|\/)(?:Index|Context|Home|Template|Templates)\.md$/i;
var MAIN_TYPES = /* @__PURE__ */ new Set(["question", "concept", "claim", "decision"]);
var CATEGORY_BY_PATH = [
  [/\/Papers\//i, "paper"],
  [/\/Methods?\//i, "method"],
  [/\/Software\//i, "software"],
  [/\/Datasets?\//i, "dataset"],
  [/\/(?:Wiki|Wikis)\//i, "wiki"],
  [/\/(?:Questions?|Research)\//i, "question"],
  [/\/Memory\//i, "memory"]
];
function contentCategory(node) {
  const explicit = node.contentType?.trim().toLowerCase();
  if (explicit) return explicit;
  for (const [pattern, category] of CATEGORY_BY_PATH) if (pattern.test(node.path)) return category;
  if (node.kind === "wiki") return "wiki";
  return "other";
}
function isMainNode(node, category) {
  if (MAIN_TYPES.has(category)) return true;
  return /(?:^|\/)(?:Questions?|Research[-_ ]?Questions?)\/|(?:研究问题|研究主题|research question)/i.test(
    `${node.path} ${node.title}`
  );
}
var SECTOR_ANGLES = {
  // SVG y grows downwards: 7 o'clock is 120° and 8 o'clock is 150°.
  paper: 2 * Math.PI / 3,
  software: 5 * Math.PI / 6,
  method: Math.PI,
  dataset: 7 * Math.PI / 6,
  evidence: 4 * Math.PI / 3,
  claim: 3 * Math.PI / 2,
  concept: 11 * Math.PI / 6,
  entity: 0,
  idea: Math.PI / 6,
  decision: Math.PI / 3,
  question: Math.PI / 2,
  wiki: 3 * Math.PI / 4,
  other: 11 * Math.PI / 6
};
function sectorLayout(nodes, relations, seed) {
  const paths = [...nodes.keys()].sort(comparePath);
  const adjacency = new Map(paths.map((path) => [path, /* @__PURE__ */ new Set()]));
  for (const relation of relations) {
    if (relation.type !== "link") continue;
    adjacency.get(relation.source)?.add(relation.target);
    adjacency.get(relation.target)?.add(relation.source);
  }
  const categories = new Map(
    paths.map((path) => [path, contentCategory(nodes.get(path))])
  );
  const mains = new Set(
    paths.filter((path) => isMainNode(nodes.get(path), categories.get(path) ?? "other"))
  );
  if (!mains.size) {
    paths.slice().sort((a, b) => (adjacency.get(b)?.size ?? 0) - (adjacency.get(a)?.size ?? 0) || comparePath(a, b)).slice(0, Math.min(3, paths.length)).forEach((path) => {
      mains.add(path);
    });
  }
  const sharedWith = /* @__PURE__ */ new Map();
  for (const path of paths) {
    if (mains.has(path)) continue;
    const connected = [...adjacency.get(path) ?? []].filter((candidate) => mains.has(candidate)).sort(comparePath);
    if (connected.length > 1) sharedWith.set(path, connected);
  }
  const mainPaths = [...mains].sort(comparePath);
  const centers = /* @__PURE__ */ new Map();
  const centerY = HEIGHT * 0.48;
  const columns = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(mainPaths.length * WIDTH / HEIGHT))));
  const rows = Math.ceil(mainPaths.length / columns);
  const xStep = columns === 1 ? 0 : (WIDTH - LAYOUT_MARGIN * 2) / (columns - 1);
  const yStep = rows === 1 ? 0 : (HEIGHT - LAYOUT_MARGIN * 2) / (rows - 1);
  mainPaths.forEach((path, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowSize = Math.min(columns, mainPaths.length - row * columns);
    const rowWidth = rowSize === 1 ? 0 : xStep * (rowSize - 1);
    centers.set(path, {
      x: columns === 1 ? WIDTH / 2 : WIDTH / 2 - rowWidth / 2 + column * xStep,
      y: rows === 1 ? centerY : LAYOUT_MARGIN + row * yStep
    });
  });
  const clampPoint = (point) => ({
    x: Math.min(WIDTH - LAYOUT_MARGIN, Math.max(LAYOUT_MARGIN, point.x)),
    y: Math.min(HEIGHT - LAYOUT_MARGIN, Math.max(LAYOUT_MARGIN, point.y))
  });
  const layout = {};
  for (const path of mainPaths) layout[path] = clampPoint(centers.get(path));
  const siblingGroups = /* @__PURE__ */ new Map();
  for (const path of paths) {
    if (mains.has(path) || sharedWith.has(path)) continue;
    const connectedMain = [...adjacency.get(path) ?? []].find((candidate) => mains.has(candidate)) ?? "";
    const category = categories.get(path) ?? "other";
    const key = `${connectedMain}\0${category}`;
    const group = siblingGroups.get(key) ?? [];
    group.push(path);
    siblingGroups.set(key, group);
  }
  for (const group of siblingGroups.values()) group.sort(comparePath);
  for (const path of paths) {
    if (mains.has(path)) continue;
    const bridges = sharedWith.get(path);
    if (bridges?.length) {
      const average = bridges.reduce(
        (point, main) => ({
          x: point.x + (centers.get(main)?.x ?? WIDTH / 2),
          y: point.y + (centers.get(main)?.y ?? centerY)
        }),
        { x: 0, y: 0 }
      );
      const jitter2 = (hash(`${path}:bridge`, seed) - 0.5) * 30;
      layout[path] = clampPoint({
        x: average.x / bridges.length,
        y: average.y / bridges.length - 36 + jitter2
      });
      continue;
    }
    const connectedMain = [...adjacency.get(path) ?? []].find((candidate) => mains.has(candidate));
    const anchor = connectedMain ? centers.get(connectedMain) : { x: WIDTH / 2, y: centerY };
    const category = categories.get(path) ?? "other";
    const angle = SECTOR_ANGLES[category] ?? SECTOR_ANGLES.other ?? 0;
    const siblings = siblingGroups.get(`${connectedMain ?? ""}\0${category}`) ?? [];
    const index = Math.max(0, siblings.indexOf(path));
    const spread = Math.min(0.22, 0.08 + siblings.length * 0.012);
    const offset = (index - (siblings.length - 1) / 2) * spread;
    const radius = 92 + Math.floor(index / 3) * 26 + hash(`${path}:radius`, seed) * 10;
    const jitter = (hash(`${path}:angle`, seed) - 0.5) * 0.06;
    layout[path] = clampPoint({
      x: (anchor?.x ?? WIDTH / 2) + radius * Math.cos(angle + offset + jitter),
      y: (anchor?.y ?? centerY) + radius * Math.sin(angle + offset + jitter)
    });
  }
  for (const path of paths) {
    if (layout[path]) continue;
    const angle = 2 * Math.PI * hash(`${path}:outer`, seed);
    layout[path] = clampPoint({ x: WIDTH / 2 + 175 * Math.cos(angle), y: centerY + 145 * Math.sin(angle) });
  }
  return { layout, mains, sharedWith };
}
function isInfrastructureNode(node) {
  return node.kind === "navigation" || INFRASTRUCTURE.test(node.path);
}
function nodeType(node) {
  if (isInfrastructureNode(node)) return "infrastructure";
  if (contentCategory(node) === "memory") return "memory";
  if (node.kind === "wiki") return "wiki";
  return "note";
}
function classifyRelation(source, target, type) {
  if (type) return type;
  const sourceDir = source.path.slice(0, source.path.lastIndexOf("/"));
  const targetDir = target.path.slice(0, target.path.lastIndexOf("/"));
  return sourceDir && sourceDir === targetDir ? "directory" : "link";
}
function normalizeIdentity2(value) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "");
  if (/^doi:\s*/.test(normalized) || /^10\.\d{4,9}\//.test(normalized))
    return `doi:${normalized.replace(/^doi:\s*/, "")}`;
  if (/^pmid:\s*\d+$/.test(normalized) || /^\d{1,9}$/.test(normalized))
    return `pmid:${normalized.replace(/^pmid:\s*/, "")}`;
  if (/^arxiv:\s*/.test(normalized) || /^\d{4}\.\d{4,5}(?:v\d+)?$/.test(normalized))
    return `arxiv:${normalized.replace(/^arxiv:\s*/, "")}`;
  return normalized || null;
}
function fallbackIdentity(node) {
  if (node.identity) return normalizeIdentity2(node.identity);
  return null;
}
function canonicalRank(path) {
  return [path.startsWith("Library/") ? 0 : path.startsWith("Projects/") ? 1 : 2, path];
}
function comparePath(a, b) {
  return a.localeCompare(b);
}
function hash(value, seed = 42) {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
function assignCommunities(paths, edges, seed = 42) {
  const ordered = [...new Set(paths)].sort(comparePath);
  const adjacency = new Map(ordered.map((path) => [path, /* @__PURE__ */ new Set()]));
  for (const edge of edges) {
    if (edge.type !== "link" || !adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  const labels = new Map(ordered.map((path, index) => [path, index]));
  const degree = new Map(ordered.map((path) => [path, adjacency.get(path)?.size ?? 0]));
  const total = [...degree.values()].reduce((sum, value) => sum + value, 0) || 1;
  for (let round = 0; round < 12; round++) {
    let changed = false;
    for (const path of ordered) {
      const neighbours = [...adjacency.get(path) ?? []].sort(comparePath);
      if (!neighbours.length) continue;
      const scores = /* @__PURE__ */ new Map();
      for (const neighbour of neighbours) {
        const label = labels.get(neighbour) ?? 0;
        scores.set(
          label,
          (scores.get(label) ?? 0) + 1 - (degree.get(path) ?? 0) * (degree.get(neighbour) ?? 0) / total
        );
      }
      const current = labels.get(path) ?? 0;
      const best = [...scores.entries()].sort(
        (a, b) => b[1] - a[1] || hash(`${path}:${a[0]}`, seed) - hash(`${path}:${b[0]}`, seed) || a[0] - b[0]
      )[0];
      if (best && best[1] > 0 && best[0] !== current) {
        labels.set(path, best[0]);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const counts = /* @__PURE__ */ new Map();
  for (const label of labels.values()) counts.set(label, (counts.get(label) ?? 0) + 1);
  const rank = new Map(
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([label], index) => [label, index])
  );
  return Object.fromEntries(
    ordered.map((path) => [path, degree.get(path) ?? 0 ? rank.get(labels.get(path) ?? -1) ?? -1 : -1])
  );
}
function createSemanticModel(input, options = {}) {
  const view = options.view ?? "semantic";
  const mergeMirrors = options.mergeMirrors ?? true;
  const seed = options.seed ?? 42;
  const sourceNodes = [...input.nodes].sort((a, b) => comparePath(a.path, b.path));
  const visible = sourceNodes.filter((node) => view === "all" || !isInfrastructureNode(node));
  const groups = /* @__PURE__ */ new Map();
  for (const node of visible) {
    const identity = fallbackIdentity(node);
    if (mergeMirrors && identity) {
      const group = groups.get(identity) ?? [];
      group.push(node);
      groups.set(identity, group);
    }
  }
  const canonicalFor = /* @__PURE__ */ new Map();
  const duplicates = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => {
      const [ar, ap] = canonicalRank(a.path);
      const [br, bp] = canonicalRank(b.path);
      return ar - br || ap.localeCompare(bp);
    });
    const first = ordered[0];
    if (!first) continue;
    const canonical = first.path;
    for (const node of ordered) {
      canonicalFor.set(node.path, canonical);
      if (node.path !== canonical) duplicates.push({ canonical, duplicate: node.path });
    }
  }
  const modelNodes = /* @__PURE__ */ new Map();
  for (const node of visible) {
    const canonical = canonicalFor.get(node.path) ?? node.path;
    if (!modelNodes.has(canonical)) modelNodes.set(canonical, node);
  }
  const relations = [];
  const relationKeys = /* @__PURE__ */ new Set();
  const addRelation = (relation) => {
    const key = `${relation.type}\0${relation.source}\0${relation.target}`;
    if (relationKeys.has(key)) return;
    relationKeys.add(key);
    relations.push(relation);
  };
  for (const raw of input.edges ?? []) {
    const source = canonicalFor.get(raw.source) ?? raw.source;
    const target = canonicalFor.get(raw.target) ?? raw.target;
    if (source === target || !modelNodes.has(source) || !modelNodes.has(target)) continue;
    const type = classifyRelation({ path: source }, { path: target }, raw.type);
    addRelation({ source, target, type });
  }
  if (view === "all") {
    const all = [...modelNodes.keys()].sort(comparePath);
    const siblings = /* @__PURE__ */ new Map();
    for (const path of all) {
      const parent = path.slice(0, path.lastIndexOf("/"));
      const group = siblings.get(parent) ?? [];
      group.push(path);
      siblings.set(parent, group);
    }
    for (const group of siblings.values()) {
      for (let i = 1; i < group.length; i++) {
        const source = group[i - 1];
        const target = group[i];
        if (source && target) addRelation({ source, target, type: "directory" });
      }
    }
  }
  for (const duplicate of duplicates)
    addRelation({ source: duplicate.canonical, target: duplicate.duplicate, type: "duplicate" });
  const communities = assignCommunities([...modelNodes.keys()], relations, seed);
  const { layout, mains, sharedWith } = sectorLayout(modelNodes, relations, seed);
  const linkRelations = relations.filter((edge) => edge.type === "link");
  const degree = /* @__PURE__ */ new Map();
  for (const edge of linkRelations) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const mirrorsByCanonical = /* @__PURE__ */ new Map();
  for (const [mirror, canonical] of canonicalFor) {
    if (mirror === canonical) continue;
    const mirrors = mirrorsByCanonical.get(canonical) ?? [];
    mirrors.push(mirror);
    mirrorsByCanonical.set(canonical, mirrors);
  }
  for (const mirrors of mirrorsByCanonical.values()) mirrors.sort(comparePath);
  const nodes = [...modelNodes.entries()].sort(([a], [b]) => comparePath(a, b)).map(([path, node]) => {
    const mirrorPaths = mirrorsByCanonical.get(path) ?? [];
    const type = nodeType(node);
    const category = contentCategory(node);
    return {
      path,
      title: node.title,
      kind: node.kind,
      degree: degree.get(path) ?? 0,
      nodeType: mirrorPaths.length ? "mirror" : type,
      isInfrastructure: type === "infrastructure",
      community: communities[path] ?? -1,
      contentType: category,
      isMain: mains.has(path),
      ...sharedWith.has(path) ? { sharedWith: sharedWith.get(path) } : {},
      ...layout[path] ?? { x: WIDTH / 2, y: HEIGHT / 2 },
      ...mirrorPaths.length ? { mirrors: mirrorPaths, warnings: ["mirror"] } : {}
    };
  });
  return {
    nodes,
    edges: linkRelations.map(({ source, target }) => ({ source, target })),
    relations,
    duplicates,
    communities,
    layout
  };
}

// src/core/semantic-scan.ts
var SCAN_WINDOW = 32;
function createSemanticScanState() {
  return { cursors: /* @__PURE__ */ new Map() };
}
function scanKey(fingerprint, scope) {
  return `${fingerprint}\0${scope}`;
}
function semanticCursor(state, fingerprint, scope, revision) {
  const key = scanKey(fingerprint, scope);
  const cursor = state.cursors.get(key);
  if (!cursor) {
    const fresh = { path: "", revision };
    state.cursors.set(key, fresh);
    return fresh;
  }
  if (cursor.revision !== revision) {
    cursor.path = "";
    cursor.revision = revision;
  }
  return cursor;
}
function semanticMissingNotes(db, fingerprint, scope, chunkChars, afterPath, limit) {
  return db.prepare(
    `SELECT n.path,n.title,n.hash,n.signature,length(n.body) bodyLength,
	     (SELECT count(*) FROM semantic_chunks s
	        WHERE s.path=n.path AND s.hash=n.hash AND s.fingerprint=?) stored
	     FROM notes n
	     WHERE (n.scope='shared' OR n.scope=?) AND n.kind NOT IN ('navigation','explainer')
	       AND n.path > ?
	       AND (SELECT count(*) FROM semantic_chunks s
	            WHERE s.path=n.path AND s.hash=n.hash AND s.fingerprint=?)
	           < min(64, CASE WHEN length(n.body)=0 THEN 0
	                         ELSE (length(n.body)+CAST(? AS INTEGER)-1)/CAST(? AS INTEGER) END)
	     ORDER BY n.path LIMIT ?`
  ).all(fingerprint, scope, afterPath, fingerprint, chunkChars, chunkChars, limit);
}
async function scanSemanticBatch(state, db, request, hooks) {
  const { fingerprint, scope, limit, chunkChars } = request;
  const cursor = semanticCursor(state, fingerprint, scope, request.revision);
  const items = [];
  let after = cursor.path;
  let handled = cursor.path;
  while (true) {
    if (items.length >= limit) {
      cursor.path = handled;
      return { items, partial: true };
    }
    const window = semanticMissingNotes(db, fingerprint, scope, chunkChars, after, SCAN_WINDOW);
    if (!window.length) break;
    after = window[window.length - 1].path;
    for (const row of window) {
      if (items.length >= limit) {
        cursor.path = handled;
        return { items, partial: true };
      }
      if (/(?:^|\/)(?:Runs|Explainers)\//i.test(row.path)) continue;
      if (!hooks.canRead(row.path, request.project)) continue;
      let current;
      try {
        current = await hooks.updatePath(row.path);
      } catch {
        continue;
      }
      if (!current || current.hash !== row.hash || current.signature !== row.signature) continue;
      const chunks = splitKnowledgeChunks(current.body, chunkChars);
      let produced = 0;
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        if (hooks.isStored(row.path, chunkIndex, row.hash, fingerprint)) continue;
        if (items.length >= limit) {
          cursor.path = handled;
          return { items, partial: true };
        }
        if (row.path > handled) handled = row.path;
        const chunk = chunks[chunkIndex];
        const startChar = chunkIndex * chunkChars;
        items.push({
          path: row.path,
          chunkIndex,
          hash: current.hash,
          mtime: current.signature,
          text: chunk,
          startChar,
          endChar: startChar + chunk.length
        });
        produced++;
      }
      if (produced && row.path > handled) handled = row.path;
    }
  }
  cursor.path = handled;
  return { items, partial: false };
}

// src/core/vector-codec.ts
var FLOAT32_BYTES = 4;
function encodeVector(vector) {
  const bytes = new Uint8Array(vector.length * FLOAT32_BYTES);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < vector.length; index++)
    view.setFloat32(index * FLOAT32_BYTES, vector[index], true);
  return bytes;
}
function vectorNorm(vector) {
  let sum = 0;
  for (const component of vector) sum += component * component;
  return Math.sqrt(sum);
}
function decodeVector(row) {
  if (typeof row.bytes === "string") {
    const parsed = JSON.parse(row.bytes);
    if (!Array.isArray(parsed)) throw new Error("Stored vector is not an array");
    return parsed.map((component) => Number(component));
  }
  const view = new DataView(row.bytes.buffer, row.bytes.byteOffset, row.bytes.byteLength);
  const values = [];
  for (let index = 0; index < row.dimension; index++)
    values.push(view.getFloat32(index * FLOAT32_BYTES, true));
  return values;
}
function storedVectorNorm(decoded, row, norm) {
  if (typeof row.bytes !== "string" && typeof norm === "number" && Number.isFinite(norm)) return norm;
  return vectorNorm(decoded);
}
function cosineSimilarity(query, stored, storedNorm) {
  let dot = 0;
  let queryNorm = 0;
  for (let index = 0; index < query.length; index++) {
    const q = query[index];
    const v = stored[index];
    if (typeof q !== "number" || !Number.isFinite(q) || typeof v !== "number" || !Number.isFinite(v))
      return Number.NaN;
    dot += q * v;
    queryNorm += q * q;
  }
  return dot / Math.sqrt(queryNorm * storedNorm * storedNorm);
}

// src/core/vector-migration.ts
function migrateVectorStorage(database, statements) {
  const rows = statements.legacy.all();
  let migrated = 0;
  let skipped = 0;
  for (const row of rows) {
    let components;
    try {
      components = decodeVector({ bytes: row.vector, dimension: row.dimension });
    } catch {
      skipped++;
      continue;
    }
    if (components.length !== row.dimension) {
      skipped++;
      continue;
    }
    const norm = vectorNorm(components);
    if (!Number.isFinite(norm) || !(norm > 0)) {
      skipped++;
      continue;
    }
    statements.update.run(
      encodeVector(components),
      norm,
      row.path,
      row.chunk_index,
      row.hash,
      row.fingerprint
    );
    migrated++;
  }
  return { migrated, skipped };
}
function migrateVectorStorageOnOpen(database) {
  const legacy = database.prepare(
    "SELECT path,chunk_index,hash,fingerprint,vector,dimension FROM semantic_chunks WHERE typeof(vector)='text'"
  ).all();
  if (!legacy.length) return { migrated: 0, skipped: 0 };
  database.exec("BEGIN IMMEDIATE");
  try {
    const update = database.prepare(
      "UPDATE semantic_chunks SET vector=?, norm=? WHERE path=? AND chunk_index=? AND hash=? AND fingerprint=?"
    );
    const result = migrateVectorStorage(database, { legacy: { all: () => legacy }, update });
    database.exec("COMMIT");
    if (result.migrated) database.prepare("INSERT OR REPLACE INTO meta VALUES('vectorStorage',1)").run();
    return result;
  } catch {
    database.exec("ROLLBACK");
    return { migrated: 0, skipped: legacy.length };
  }
}

// src/core/index-runtime.ts
var UPSERT_NOTE = [
  "INSERT INTO notes(path,title,body,hash,signature,scope,kind,bytes,filename) VALUES(?,?,?,?,?,?,?,?,?)",
  "ON CONFLICT(path) DO UPDATE SET title=excluded.title,body=excluded.body,hash=excluded.hash,",
  "signature=excluded.signature,scope=excluded.scope,kind=excluded.kind,bytes=excluded.bytes,filename=excluded.filename"
].join(" ");
async function createKnowledgeIndexRuntime(options, files, transport) {
  await mkdir(dirname(options.database), { recursive: true, mode: 448 });
  const db = new DatabaseSync(options.database, { timeout: 1500 });
  const priorSchemaVersion = Number(db.prepare("PRAGMA user_version").get().user_version ?? 0);
  if (!Number.isInteger(priorSchemaVersion) || priorSchemaVersion > 1)
    throw new Error("Knowledge database schema is newer than this worker");
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1500; PRAGMA synchronous=NORMAL;
	CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value INTEGER NOT NULL);
	INSERT OR IGNORE INTO meta VALUES('revision',0);
	CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE,
	 title TEXT NOT NULL, body TEXT NOT NULL, hash TEXT NOT NULL, signature TEXT NOT NULL,
	 scope TEXT NOT NULL, kind TEXT NOT NULL, bytes INTEGER NOT NULL, filename TEXT NOT NULL DEFAULT '');
	CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(title, terms, tokenize='unicode61');
	CREATE TABLE IF NOT EXISTS links(source TEXT NOT NULL, target TEXT NOT NULL, PRIMARY KEY(source,target));
	CREATE INDEX IF NOT EXISTS links_target ON links(target);
	CREATE INDEX IF NOT EXISTS notes_scope ON notes(scope,kind);
	CREATE INDEX IF NOT EXISTS notes_filename ON notes(filename);
	CREATE TABLE IF NOT EXISTS jobs(key TEXT PRIMARY KEY, kind TEXT NOT NULL, path TEXT NOT NULL,
	 scope TEXT NOT NULL, revision INTEGER NOT NULL, updated TEXT NOT NULL);
	CREATE INDEX IF NOT EXISTS jobs_scope_updated ON jobs(scope,updated DESC);
	CREATE INDEX IF NOT EXISTS jobs_scope_kind_updated ON jobs(scope,kind,updated DESC);
	CREATE TABLE IF NOT EXISTS problems(path TEXT PRIMARY KEY, message TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS semantic_chunks(
	 path TEXT NOT NULL, chunk_index INTEGER NOT NULL, hash TEXT NOT NULL, fingerprint TEXT NOT NULL,
	 mtime TEXT NOT NULL, vector BLOB NOT NULL, dimension INTEGER NOT NULL,
	 start_char INTEGER, end_char INTEGER, norm REAL,
	 PRIMARY KEY(path,chunk_index,hash,fingerprint)
	);
	CREATE INDEX IF NOT EXISTS semantic_chunks_lookup ON semantic_chunks(fingerprint,hash,path);
	CREATE TABLE IF NOT EXISTS semantic_meta(fingerprint TEXT PRIMARY KEY, dimension INTEGER NOT NULL);
	`);
  if (priorSchemaVersion < 1) db.exec("PRAGMA user_version=1;");
  if (!db.prepare("SELECT value FROM meta WHERE key='titlePolicy'").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const setTitle = db.prepare("UPDATE notes SET title=? WHERE id=?");
      const setSearchTitle = db.prepare("UPDATE search SET title=? WHERE rowid=?");
      let refreshed = 0;
      for (const row of db.prepare("SELECT id,path,title,body FROM notes").all()) {
        const title = noteDisplayTitle(row.body, row.path);
        if (title === row.title) continue;
        setTitle.run(title, row.id);
        setSearchTitle.run(tokenizeKnowledgeText(title).join(" "), row.id);
        refreshed++;
      }
      if (refreshed) db.prepare("UPDATE meta SET value=value+1 WHERE key='revision'").run();
      db.prepare("INSERT OR REPLACE INTO meta VALUES('titlePolicy',1)").run();
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
    }
  }
  const semanticColumns = db.prepare("PRAGMA table_info(semantic_chunks)").all().map((column) => column.name);
  if (!semanticColumns.includes("start_char"))
    db.exec("ALTER TABLE semantic_chunks ADD COLUMN start_char INTEGER");
  if (!semanticColumns.includes("end_char"))
    db.exec("ALTER TABLE semantic_chunks ADD COLUMN end_char INTEGER");
  if (!semanticColumns.includes("norm")) db.exec("ALTER TABLE semantic_chunks ADD COLUMN norm REAL");
  ensureNoteFilenameColumn(db);
  if (semanticColumns.includes("text")) {
    db.exec(`BEGIN IMMEDIATE;
	DROP INDEX IF EXISTS semantic_chunks_lookup;
	ALTER TABLE semantic_chunks RENAME TO semantic_chunks_legacy;
	CREATE TABLE semantic_chunks(
	 path TEXT NOT NULL, chunk_index INTEGER NOT NULL, hash TEXT NOT NULL, fingerprint TEXT NOT NULL,
	 mtime TEXT NOT NULL, vector BLOB NOT NULL, dimension INTEGER NOT NULL,
	 start_char INTEGER, end_char INTEGER, norm REAL,
	 PRIMARY KEY(path,chunk_index,hash,fingerprint)
	);
	INSERT INTO semantic_chunks(path,chunk_index,hash,fingerprint,mtime,vector,dimension)
	 SELECT path,chunk_index,hash,fingerprint,mtime,vector,dimension FROM semantic_chunks_legacy;
	DROP TABLE semantic_chunks_legacy;
	CREATE INDEX IF NOT EXISTS semantic_chunks_lookup ON semantic_chunks(fingerprint,hash,path);
	COMMIT;`);
  }
  migrateVectorStorageOnOpen(db);
  let revision = Number(db.prepare("SELECT value FROM meta WHERE key='revision'").get().value);
  let scan = null, coverage = "uninitialized", lastReconciledAt = null, watching = false, timer = null, _closed = false;
  let fullScanRequested = false;
  const activeRequests = /* @__PURE__ */ new Set();
  const flushes = /* @__PURE__ */ new Set();
  let closePromise;
  const dirty = /* @__PURE__ */ new Set(), inflight = /* @__PURE__ */ new Map();
  const stats = {
    bodyReads: 0,
    metadataChecks: 0,
    reconciliations: 0,
    changes: 0,
    searches: 0,
    // KP4 — the number of transactions the write path committed.  A cold
    // index used to commit one transaction per note; the count is what
    // the guard pins, because it does not change with the machine.
    transactions: 0
  };
  const graphSnapshots = createRevisionCache();
  const statements = {
    get: db.prepare("SELECT * FROM notes WHERE path=?"),
    count: db.prepare("SELECT count(*) count FROM notes"),
    removeFts: db.prepare("DELETE FROM search WHERE rowid=?"),
    remove: db.prepare("DELETE FROM notes WHERE path=?"),
    links: db.prepare("DELETE FROM links WHERE source=?"),
    addLink: db.prepare("INSERT OR IGNORE INTO links VALUES(?,?)"),
    problem: db.prepare("INSERT OR REPLACE INTO problems VALUES(?,?)"),
    clearProblem: db.prepare("DELETE FROM problems WHERE path=?"),
    semanticDelete: db.prepare("DELETE FROM semantic_chunks WHERE path=?"),
    job: db.prepare(
      "INSERT INTO jobs VALUES(?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision,updated=excluded.updated"
    ),
    // KP4 — the cold path runs these once per note, so they are prepared
    // once and reused.  Re-preparing a statement costs a parse per note.
    upsertNote: db.prepare(UPSERT_NOTE),
    insertSearch: db.prepare("INSERT INTO search(rowid,title,terms) VALUES(?,?,?)"),
    setSignature: db.prepare("UPDATE notes SET signature=? WHERE path=?"),
    dependents: db.prepare("SELECT source FROM links WHERE target=?"),
    revision: db.prepare("SELECT value FROM meta WHERE key='revision'"),
    bumpRevision: db.prepare("UPDATE meta SET value=value+1 WHERE key='revision' RETURNING value")
  };
  function bump() {
    revision = Number(statements.bumpRevision.get().value);
  }
  function job(kind, path, scope) {
    statements.job.run(`${kind}:${path}`, kind, path, scope, revision, (/* @__PURE__ */ new Date()).toISOString());
  }
  let uiTimer = null;
  function signalUiChange() {
    if (_closed || uiTimer) return;
    uiTimer = setTimeout(() => {
      uiTimer = null;
      transport.send({ uiChanged: true });
    }, 500);
    uiTimer.unref();
  }
  function changed(path, previous) {
    signalUiChange();
    stats.changes++;
    const scope = noteScope(path);
    if (!/(?:^|\/)(?:Index|Context|Home)\.md$/i.test(path)) {
      job(
        "navigation",
        scope === "shared" ? path.startsWith("Wiki/") ? "Wiki/Index.md" : "Library/Index.md" : `Projects/${scope}/Index.md`,
        scope
      );
      if (!/(?:^|\/)Wiki\//.test(path)) job("evidence-review", path, scope);
    }
    const dependents = statements.dependents.all(path);
    for (const { source } of dependents)
      if (/(?:^|\/)Wiki\//.test(source) && !source.endsWith("/Index.md"))
        job("wiki-review", source, noteScope(source));
    if (previous && previous.scope !== scope)
      job("navigation", `Projects/${previous.scope}/Index.md`, previous.scope);
  }
  async function prepareUpdate(path, force) {
    const previous = statements.get.get(path) ?? null;
    try {
      stats.metadataChecks++;
      const info = await files.inspect(path);
      if (!force && previous?.signature === info.signature) return { kind: "unchanged", path, previous };
      const file = await files.read(path);
      stats.bodyReads++;
      if (previous?.hash === file.hash) return { kind: "signature", path, previous, file };
      return { kind: "write", path, note: prepareNote(path, previous, file) };
    } catch (error) {
      return { kind: "remove", path, previous, error };
    }
  }
  const writeRuntime = {
    statements,
    bump: () => bump(),
    changed: (path, previous) => changed(path, previous)
  };
  const writeSink = createNoteWriteSink(writeRuntime);
  async function updatePath(path, force = false) {
    validateNote(path);
    if (inflight.has(path)) return inflight.get(path);
    const task = (async () => {
      const update = await prepareUpdate(path, force);
      const batcher = createWriteBatcher((sql) => db.exec(sql));
      const transaction = batcher.begin();
      try {
        const row = applyUpdate(update, transaction, writeRuntime, writeSink);
        batcher.commit();
        stats.transactions++;
        return row;
      } catch (error) {
        batcher.rollback();
        revision = Number(statements.revision.get().value);
        throw error;
      }
    })();
    inflight.set(path, task);
    try {
      return await task;
    } finally {
      if (inflight.get(path) === task) inflight.delete(path);
    }
  }
  async function* walk(directory, prefix = "") {
    for (const entry of await files.list(directory)) {
      if (!allowedSegment(entry.name) || entry.kind === "symlink") continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") yield* walk(path, path);
      else if (entry.kind === "file" && path.endsWith(".md")) yield path;
    }
  }
  function beginReconcile(force = false) {
    if (_closed) return Promise.resolve();
    if (scan) return scan;
    const priorRevision = revision;
    const priorCoverage = coverage;
    coverage = "indexing";
    stats.reconciliations++;
    scan = (async () => {
      const seen = /* @__PURE__ */ new Set(), initial = db.prepare("SELECT path FROM notes").all();
      let n = 0, interrupted = false;
      const sink = {
        prepare: (path) => prepareUpdate(path, force),
        apply: (update, transaction) => applyUpdate(update, transaction, writeRuntime, writeSink),
        problem: (path, message) => statements.problem.run(path, message),
        committed: () => stats.transactions++,
        exec: (sql) => db.exec(sql)
      };
      try {
        await reconcileInBatches(walk(""), {
          ...sink,
          prepare: async (path) => {
            seen.add(path);
            return prepareUpdate(path, force);
          }
        });
      } catch (error) {
        interrupted = true;
        statements.problem.run("<inventory>", String(error.message));
      }
      if (!interrupted) {
        statements.clearProblem.run("<inventory>");
        const removed = (async function* () {
          for (const { path } of initial) if (!seen.has(path)) yield path;
        })();
        await reconcileInBatches(removed, { ...sink, prepare: (path) => prepareUpdate(path, true) });
        lastReconciledAt = (/* @__PURE__ */ new Date()).toISOString();
      }
      coverage = interrupted ? "partial" : "ready";
      if (revision !== priorRevision || coverage !== priorCoverage) signalUiChange();
    })().finally(() => {
      scan = null;
    });
    return scan;
  }
  function flushDirty(limit = 32) {
    if (_closed) return Promise.resolve();
    const task = flushDirtyBatch(limit);
    flushes.add(task);
    void task.then(
      () => flushes.delete(task),
      () => flushes.delete(task)
    );
    return task;
  }
  async function flushDirtyBatch(limit) {
    const paths = [...dirty].slice(0, limit);
    for (let i = 0; i < paths.length; i++) {
      dirty.delete(paths[i]);
      try {
        await updatePath(paths[i]);
      } catch {
      }
      if (i % 16 === 15) await yieldTurn();
    }
    if (dirty.size) schedule();
    if (fullScanRequested && !scan) {
      fullScanRequested = false;
      void beginReconcile();
    }
  }
  function schedule() {
    if (_closed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flushDirty();
    }, 150);
    timer.unref();
  }
  let watcher;
  if (files.watch)
    try {
      watcher = await files.watch(
        (name) => {
          if (_closed) return;
          const path = name?.toString().replaceAll("\\", "/");
          if (path?.endsWith(".md")) {
            try {
              validateNote(path);
              dirty.add(path);
            } catch {
              return;
            }
          } else if (!path || path.split("/").every(allowedSegment)) fullScanRequested = true;
          schedule();
        },
        (error) => {
          if (_closed) return;
          watching = false;
          statements.problem.run("<watcher>", String(error.message));
        }
      );
      watching = true;
    } catch (error) {
      statements.problem.run("<watcher>", String(error.message));
    }
  const reconcileTimer = options.backgroundReconcile === false ? null : setInterval(() => {
    if (!scan) void beginReconcile();
  }, options.reconcileMs || 12e4);
  reconcileTimer?.unref();
  function closeWorker() {
    if (closePromise) return closePromise;
    _closed = true;
    if (timer) clearTimeout(timer);
    if (uiTimer) clearTimeout(uiTimer);
    if (reconcileTimer) clearInterval(reconcileTimer);
    watcher?.close();
    watching = false;
    fullScanRequested = false;
    closePromise = (async () => {
      await Promise.allSettled([...activeRequests, ...flushes, ...inflight.values(), scan]);
      dirty.clear();
      db.close();
    })();
    return closePromise;
  }
  function status() {
    revision = Number(db.prepare("SELECT value FROM meta WHERE key='revision'").get().value);
    return {
      revision,
      coverage,
      noteCount: Number(statements.count.get().count),
      lastReconciledAt,
      watching,
      pendingChanges: dirty.size,
      jobs: Number(db.prepare("SELECT count(*) count FROM jobs").get().count),
      problems: db.prepare("SELECT * FROM problems ORDER BY path LIMIT 20").all(),
      categoryCounts: categoryCounts(),
      stats: {
        ...stats,
        categoryScans: noteCategoryCount(),
        // KP5b — the plan the bare-link lookup runs under.
        linkLookupPlan: linkResolver.lookupPlan()
      },
      semantic: {
        vectors: Number(db.prepare("SELECT count(*) count FROM semantic_chunks").get().count),
        paths: Number(db.prepare("SELECT count(DISTINCT path) count FROM semantic_chunks").get().count)
      }
    };
  }
  const categoryViews = createCategoryViews(() => revision);
  const semanticScanState = createSemanticScanState();
  const categoryRows = categoryRowLoader(
    () => db.prepare("SELECT path,title,kind,body,signature FROM notes WHERE kind IN ('note','wiki')").all()
  );
  function categoryCounts(project = void 0) {
    return categoryViews.counts(categoryRows, project);
  }
  function semanticStatus(fingerprint = null, project = null) {
    if (!fingerprint) return { vectors: 0, paths: 0, coverage: "unconfigured" };
    const scope = project || "";
    const row = db.prepare(`SELECT count(*) vectors,count(DISTINCT s.path) paths
	    FROM semantic_chunks s JOIN notes n ON n.path=s.path AND n.hash=s.hash
	    WHERE s.fingerprint=? AND (n.scope='shared' OR n.scope=?) AND n.kind NOT IN ('navigation','explainer')`).get(fingerprint, scope);
    return { vectors: Number(row.vectors), paths: Number(row.paths), fingerprint, project: scope };
  }
  function pending(project, limit = 20, kind = null) {
    return db.prepare(
      "SELECT * FROM jobs WHERE (scope='shared' OR scope=?) AND (? IS NULL OR kind=?) ORDER BY updated DESC LIMIT ?"
    ).all(project || "", kind, kind, limit);
  }
  async function recentByCategory(project, limit = 10) {
    await flushDirty();
    return categoryViews.recent(categoryRows, project || void 0, limit);
  }
  async function recentNotes(project, limit = 8) {
    await flushDirty();
    const scope = project || "";
    const rows = db.prepare(
      "SELECT path,title,kind,signature FROM notes WHERE (scope='shared' OR scope=?) AND kind IN ('note','wiki')"
    ).all(scope);
    return rows.map((row) => ({
      path: row.path,
      title: row.title,
      kind: row.kind,
      updatedAt: Number.parseFloat(String(row.signature).split(":", 1)[0]) || 0
    })).sort((left, right) => right.updatedAt - left.updatedAt || left.path.localeCompare(right.path)).slice(0, Math.max(1, Math.min(24, Math.floor(limit || 8))));
  }
  async function read(path, project, options2 = {}) {
    if (!canRead(validateNote(path), project))
      throw new Error("Note is outside shared/current-project scope");
    const row = await updatePath(path);
    if (!row) return { path, missing: true, revision };
    const part = snippet(row.body, options2);
    const reviewAt = row.body.split("\n").findIndex((line) => /^## Human review\s*$/i.test(line));
    const humanReview = reviewAt >= 0 ? snippet(row.body, { startLine: reviewAt + 1, maxChars: options2.reviewMaxChars || 1600 }) : null;
    return {
      path,
      hash: row.hash,
      title: row.title,
      kind: row.kind,
      category: noteCategory(row),
      revision,
      ...part,
      humanReview,
      pending: db.prepare("SELECT kind,revision FROM jobs WHERE path=?").all(path)
    };
  }
  async function search(args) {
    stats.searches++;
    if (options.backgroundReconcile === false) await beginReconcile();
    else if (coverage === "uninitialized") void beginReconcile();
    await flushDirty();
    const expression = buildKnowledgeSearchExpression(args.query);
    const limit = Math.max(1, Math.min(12, Math.floor(args.limit || 5)));
    const kindFilter = args.wikiOnly ? "AND n.kind='wiki'" : args.explainerOnly ? "AND n.kind='explainer'" : "AND n.kind!='explainer'";
    const rows = db.prepare(`SELECT n.path,n.title,n.hash,n.kind,n.body,bm25(search,6.0,1.0) rank
	    FROM search CROSS JOIN notes n ON n.id=search.rowid
	    WHERE search MATCH ? AND (n.scope='shared' OR n.scope=?) ${kindFilter}
	    ORDER BY rank,n.path LIMIT ?`).all(expression, args.project || "", limit * 2);
    const hits = [];
    let staleCandidates = 0;
    for (const item of rows) {
      if (hits.length >= limit) break;
      let current;
      try {
        current = await updatePath(item.path);
      } catch {
        continue;
      }
      if (!current || current.hash !== item.hash) {
        staleCandidates++;
        continue;
      }
      const lower = current.body.normalize("NFKC").toLowerCase();
      const needle = String(args.query).normalize("NFKC").toLowerCase();
      let at = lower.indexOf(needle);
      if (at < 0)
        at = tokenizeKnowledgeText(args.query).map((t) => lower.indexOf(t)).find((i) => i >= 0) ?? 0;
      const startLine = Math.max(1, current.body.slice(0, at).split("\n").length - 2);
      const part = snippet(current.body, { startLine, maxChars: 1600 });
      hits.push({
        path: item.path,
        title: item.title,
        hash: current.hash,
        kind: item.kind,
        rank: item.rank,
        ...part
      });
    }
    return {
      query: args.query,
      hits,
      ...status(),
      pendingMaintenance: pending(args.project, 8),
      staleCandidates,
      complete: staleCandidates === 0 && coverage === "ready" && dirty.size === 0 && db.prepare("SELECT count(*) count FROM problems").get().count === 0,
      warning: coverage === "ready" ? null : "Index is still being reconciled; zero hits are not proof of absence."
    };
  }
  async function hydrateCandidates(args) {
    const candidates = Array.isArray(args.candidates) ? args.candidates.slice(0, 24) : Array.isArray(args.paths) ? [...new Set(args.paths)].slice(0, 24).map((path) => ({ path })) : [];
    const limit = Math.max(1, Math.min(12, Math.floor(args.limit || 5)));
    const hits = [];
    for (const candidate of candidates) {
      if (hits.length >= limit || typeof candidate?.path !== "string") break;
      let path;
      try {
        path = validateNote(candidate.path);
        if (!canRead(path, args.project)) continue;
      } catch {
        continue;
      }
      let current;
      try {
        current = await updatePath(path);
      } catch {
        continue;
      }
      if (!current || current.kind === "explainer" || candidate.hash && candidate.hash !== current.hash)
        continue;
      const startChar = Number.isInteger(candidate.startChar) ? candidate.startChar : -1;
      const startLine = startChar >= 0 && startChar <= current.body.length ? current.body.slice(0, startChar).split("\n").length : 1;
      const part = snippet(current.body, { startLine, maxChars: 1600 });
      hits.push({
        path,
        title: current.title,
        hash: current.hash,
        kind: current.kind,
        rank: null,
        ...Number.isInteger(candidate.chunkIndex) ? { chunkIndex: candidate.chunkIndex } : {},
        ...part
      });
    }
    return { hits };
  }
  async function semanticBatch(args) {
    const fingerprint = String(args.fingerprint || "");
    if (!fingerprint || fingerprint.length > 300) throw new Error("Invalid semantic fingerprint");
    const limit = Math.max(1, Math.min(16, Math.floor(args.limit || 8)));
    const chunkChars = Math.max(256, Math.min(8e3, Math.floor(args.chunkChars || 1200)));
    const scope = args.project || "";
    const scan2 = await scanSemanticBatch(
      semanticScanState,
      db,
      { fingerprint, project: args.project, scope, revision, limit, chunkChars },
      {
        canRead: (path, project) => canRead(path, project),
        updatePath,
        isStored: (path, chunkIndex, hash2, fp) => Boolean(
          db.prepare(
            "SELECT 1 FROM semantic_chunks WHERE path=? AND chunk_index=? AND hash=? AND fingerprint=? LIMIT 1"
          ).get(path, chunkIndex, hash2, fp)
        )
      }
    );
    return { items: scan2.items, partial: scan2.partial, nextCursor: null };
  }
  function semanticStore(args) {
    const fingerprint = String(args.fingerprint || "");
    if (!fingerprint || fingerprint.length > 300 || !Array.isArray(args.items) || args.items.length > 32)
      throw new Error("Invalid semantic storage request");
    let dimension = null;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of args.items) {
        const row = statements.get.get(item.path);
        if (!row || row.hash !== item.hash || row.signature !== item.mtime || !Array.isArray(item.vector) || !Number.isInteger(item.chunkIndex) || item.chunkIndex < 0)
          throw new Error("Semantic batch is stale");
        const vector = item.vector;
        if (!vector.length || vector.length > 16384 || vector.some((n) => typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e6))
          throw new Error("Invalid semantic vector");
        let norm = 0;
        for (const value of vector) {
          norm += value * value;
          if (!Number.isFinite(norm) || norm > 1e18) throw new Error("Invalid semantic vector norm");
        }
        if (!(norm > 0)) throw new Error("Invalid semantic vector norm");
        if (dimension === null) dimension = vector.length;
        if (vector.length !== dimension) throw new Error("Semantic batch dimensions do not match");
        const meta = db.prepare("SELECT dimension FROM semantic_meta WHERE fingerprint=?").get(fingerprint);
        if (meta && Number(meta.dimension) !== vector.length)
          throw new Error("Semantic fingerprint dimension mismatch");
        db.prepare(
          "INSERT OR REPLACE INTO semantic_chunks(path,chunk_index,hash,fingerprint,mtime,vector,dimension,start_char,end_char,norm) VALUES(?,?,?,?,?,?,?,?,?,?)"
        ).run(
          item.path,
          item.chunkIndex,
          item.hash,
          fingerprint,
          item.mtime,
          encodeVector(vector),
          vector.length,
          Number.isInteger(item.startChar) ? item.startChar : null,
          Number.isInteger(item.endChar) ? item.endChar : null,
          vectorNorm(vector)
        );
      }
      if (dimension !== null)
        db.prepare(
          "INSERT INTO semantic_meta(fingerprint,dimension) VALUES(?,?) ON CONFLICT(fingerprint) DO UPDATE SET dimension=excluded.dimension"
        ).run(fingerprint, dimension);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return status();
  }
  function semanticCandidates(args) {
    if (!Array.isArray(args.vector) || !args.vector.length || args.vector.some((n) => typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e6))
      throw new Error("Invalid semantic query vector");
    const fingerprint = String(args.fingerprint || "");
    if (!fingerprint || fingerprint.length > 300) throw new Error("Invalid semantic fingerprint");
    const minSimilarity = args.minSimilarity === void 0 ? 0.45 : args.minSimilarity;
    if (typeof minSimilarity !== "number" || !Number.isFinite(minSimilarity) || minSimilarity < 0 || minSimilarity > 1)
      throw new Error("Invalid semantic similarity threshold");
    const query = args.vector, limit = Math.max(1, Math.min(12, Math.floor(args.limit || 5)));
    const rows = db.prepare(
      "SELECT s.path,s.hash,s.vector,s.dimension,s.norm,s.chunk_index,s.start_char,s.end_char,n.title,n.kind FROM semantic_chunks s JOIN notes n ON n.path=s.path AND n.hash=s.hash WHERE s.fingerprint=? AND (n.scope='shared' OR n.scope=?) AND n.kind!='explainer' ORDER BY s.path LIMIT 5000"
    ).all(fingerprint, args.project || "");
    const totalEligible = Number(
      db.prepare(
        "SELECT COUNT(*) AS count FROM semantic_chunks s JOIN notes n ON n.path=s.path AND n.hash=s.hash WHERE s.fingerprint=? AND (n.scope='shared' OR n.scope=?) AND n.kind!='explainer'"
      ).get(fingerprint, args.project || "").count
    );
    const best = /* @__PURE__ */ new Map();
    for (const row of rows) {
      if (row.dimension !== query.length) continue;
      let vector;
      try {
        vector = decodeVector({ bytes: row.vector, dimension: row.dimension });
      } catch {
        continue;
      }
      if (vector.length !== query.length) continue;
      const norm = storedVectorNorm(vector, { bytes: row.vector, dimension: row.dimension }, row.norm);
      const score = cosineSimilarity(query, vector, norm);
      if (!Number.isFinite(score) || score < minSimilarity) continue;
      const current = best.get(row.path);
      if (!current || score > current.score)
        best.set(row.path, {
          path: row.path,
          title: row.title,
          hash: row.hash,
          kind: row.kind,
          score,
          chunkIndex: row.chunk_index,
          startChar: row.start_char,
          endChar: row.end_char
        });
    }
    const result = [...best.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit);
    return {
      items: result,
      partial: totalEligible > rows.length,
      scanned: rows.length,
      totalEligible,
      nextCursor: null
    };
  }
  const linkResolver = createLinkResolver(db, canRead);
  const resolveLinkTarget = linkResolver.resolve;
  function noteTitle(path) {
    return db.prepare("SELECT title FROM notes WHERE path=?").get(path)?.title || path.split("/").at(-1).slice(0, -3);
  }
  async function noteLinks(args) {
    await flushDirty();
    const path = validateNote(String(args.path || ""));
    const project = args.project;
    if (project !== void 0 && !canRead(path, project))
      throw new Error("Note is outside shared/current-project scope");
    const outgoing = [];
    for (const { target } of db.prepare("SELECT target FROM links WHERE source=? ORDER BY target").all(path)) {
      if (project !== void 0 && !canRead(target, project)) continue;
      const resolved = resolveLinkTarget(target, project);
      outgoing.push(
        resolved ? { path: resolved, title: noteTitle(resolved), exists: true } : { path: target, title: target.split("/").at(-1).slice(0, -3), exists: false }
      );
    }
    const name = path.split("/").at(-1);
    const targets = resolveLinkTarget(name, project) === path ? [path, name] : [path, path];
    const incoming = db.prepare("SELECT DISTINCT source FROM links WHERE target=? OR target=? ORDER BY source LIMIT 200").all(...targets).map(({ source }) => source).filter((source) => source !== path && (project === void 0 || canRead(source, project))).map((source) => ({ path: source, title: noteTitle(source), exists: true }));
    return { path, title: noteTitle(path), outgoing, incoming, revision };
  }
  async function graphNeighbors(args) {
    await flushDirty();
    const project = args.project || "";
    const seeds = (Array.isArray(args.paths) ? args.paths : []).slice(0, 6).map(String);
    const per = Math.max(1, Math.min(12, Math.floor(args.perSeed || 8)));
    const noteRow = db.prepare("SELECT path,title,kind,hash,body,scope FROM notes WHERE path=?");
    const visible = (row) => row && (row.kind === "note" || row.kind === "wiki") && (row.scope === "shared" || row.scope === project);
    const degreeOf = (path) => {
      const name = path.split("/").at(-1);
      const out = db.prepare("SELECT COUNT(*) c FROM links WHERE source=?").get(path).c;
      const inc = db.prepare("SELECT COUNT(DISTINCT source) c FROM links WHERE target=? OR target=?").get(path, name).c;
      return out + inc;
    };
    const items = [];
    for (const seed of seeds) {
      let seedPath;
      try {
        seedPath = validateNote(seed);
      } catch {
        continue;
      }
      const seedRow = noteRow.get(seedPath);
      if (!visible(seedRow)) continue;
      const found = /* @__PURE__ */ new Map();
      for (const { target } of db.prepare("SELECT target FROM links WHERE source=? ORDER BY target LIMIT 64").all(seedPath)) {
        const resolved = resolveLinkTarget(target);
        if (resolved && resolved !== seedPath && !found.has(resolved))
          found.set(resolved, { direction: "outgoing" });
      }
      const name = seedPath.split("/").at(-1);
      const targets = resolveLinkTarget(name) === seedPath ? [seedPath, name] : [seedPath, seedPath];
      for (const { source } of db.prepare("SELECT DISTINCT source FROM links WHERE target=? OR target=? ORDER BY source LIMIT 64").all(...targets))
        if (source !== seedPath && !found.has(source)) found.set(source, { direction: "backlink" });
      const rows = [];
      for (const [path, meta] of found) {
        const row = noteRow.get(path);
        if (!visible(row)) continue;
        rows.push({
          from: seedPath,
          path,
          title: row.title,
          kind: row.kind,
          hash: row.hash,
          direction: meta.direction,
          degree: degreeOf(path),
          ...meta.direction === "backlink" ? { context: backlinkContext(row.body, seedPath) } : {}
        });
      }
      rows.sort((a, b) => b.degree - a.degree || a.path.localeCompare(b.path));
      items.push(...rows.slice(0, per));
    }
    return { items, revision };
  }
  function noteIdentity(body) {
    if (typeof body !== "string") return null;
    const match = body.match(/^(?:---[\s\S]*?\n)?(?:doi|DOI|pmid|PMID|arxiv|ArXiv)\s*:\s*([^\s#]+)\s*$/m);
    if (!match?.[1]) return null;
    const field = match[0].split(":", 1)[0]?.toLowerCase();
    return `${field}:${match[1].replace(/[<>"']/g, "").trim()}`;
  }
  async function knowledgeGraph(args) {
    await flushDirty();
    revision = Number(db.prepare("SELECT value FROM meta WHERE key='revision'").get().value);
    const limit = Math.max(10, Math.min(5e3, Math.floor(args.limit || 200)));
    const view = args.view === "all" ? "all" : "semantic";
    const mergeMirrors = args.mergeMirrors !== false;
    const project = args.project;
    const scopeKey = project === void 0 ? "legacy-all" : `project:${project || ""}`;
    const cacheKey = `${scopeKey}\0${view}\0${limit}\0${mergeMirrors ? "merge" : "raw"}`;
    const cached = graphSnapshots.get(revision, cacheKey);
    if (cached) return cached;
    const allNotes = new Map(
      db.prepare("SELECT path,title,kind,scope,body FROM notes").all().filter((row) => project === void 0 || row.scope === "shared" || row.scope === project).map((row) => [row.path, row])
    );
    const notes = new Map([...allNotes].filter(([, row]) => row.kind === "note" || row.kind === "wiki"));
    const rawEdges = [];
    for (const { source, target } of db.prepare("SELECT source,target FROM links").all()) {
      if (!notes.has(source)) continue;
      const resolved = resolveLinkTarget(target, project);
      if (!resolved || resolved === source || !notes.has(resolved)) continue;
      rawEdges.push({ source, target: resolved, type: "link" });
    }
    const degree = /* @__PURE__ */ new Map();
    for (const edge of rawEdges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }
    const legacyEdges = /* @__PURE__ */ new Map();
    for (const edge of rawEdges) {
      const key = edge.source < edge.target ? `${edge.source}\0${edge.target}` : `${edge.target}\0${edge.source}`;
      legacyEdges.set(key, [edge.source, edge.target]);
    }
    const legacyDegree = /* @__PURE__ */ new Map();
    for (const [source, target] of legacyEdges.values()) {
      legacyDegree.set(source, (legacyDegree.get(source) || 0) + 1);
      legacyDegree.set(target, (legacyDegree.get(target) || 0) + 1);
    }
    const legacyChosen = [...notes.keys()].sort((a, b) => (legacyDegree.get(b) || 0) - (legacyDegree.get(a) || 0) || a.localeCompare(b)).slice(0, limit);
    const legacyKeep = new Set(legacyChosen);
    const semanticCandidateLimit = Math.min(1600, Math.max(limit, limit * 4));
    const neighbours = new Map(legacyChosen.map((path) => [path, []]));
    for (const edge of rawEdges) {
      if (neighbours.has(edge.source)) neighbours.get(edge.source).push(edge.target);
      if (neighbours.has(edge.target)) neighbours.get(edge.target).push(edge.source);
    }
    for (const paths of neighbours.values())
      paths.sort((a, b) => (degree.get(b) || 0) - (degree.get(a) || 0) || a.localeCompare(b));
    const semanticCandidatePaths = new Set(legacyChosen);
    for (let offset = 0; semanticCandidatePaths.size < semanticCandidateLimit; offset++) {
      let added = false;
      for (const path of legacyChosen) {
        const neighbour = neighbours.get(path)?.[offset];
        if (!neighbour || semanticCandidatePaths.size >= semanticCandidateLimit) continue;
        const previousSize = semanticCandidatePaths.size;
        semanticCandidatePaths.add(neighbour);
        added ||= semanticCandidatePaths.size !== previousSize;
      }
      if (!added) break;
    }
    const semanticCandidateNodes = [...semanticCandidatePaths].map((path) => allNotes.get(path)).filter(Boolean);
    const semanticCandidateEdges = rawEdges.filter(
      (edge) => semanticCandidatePaths.has(edge.source) && semanticCandidatePaths.has(edge.target)
    );
    const duplicateCounts = /* @__PURE__ */ new Map();
    if (mergeMirrors) {
      for (const row of notes.values()) {
        const identity = noteIdentity(row.body);
        if (identity) duplicateCounts.set(identity, (duplicateCounts.get(identity) || 0) + 1);
      }
    }
    const totalDuplicateCount = [...duplicateCounts.values()].reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0
    );
    const model = createSemanticModel(
      {
        nodes: semanticCandidateNodes.map((row) => ({
          path: row.path,
          title: row.title,
          kind: row.kind,
          scope: row.scope,
          degree: degree.get(row.path) || 0,
          identity: noteIdentity(row.body),
          contentType: (() => {
            const type = parseFrontmatter(row.body).data?.type;
            return typeof type === "string" ? type : null;
          })()
        })),
        edges: semanticCandidateEdges
      },
      { view, mergeMirrors }
    );
    const chosen = [...model.nodes].sort((a, b) => b.degree - a.degree || a.path.localeCompare(b.path)).slice(0, limit);
    const keep = new Set(chosen.map((node) => node.path));
    const links = model.edges.filter(({ source, target }) => keep.has(source) && keep.has(target));
    const relations = (model.relations || []).filter(
      ({ source, target }) => keep.has(source) && keep.has(target)
    );
    const result = {
      nodes: legacyChosen.map((path) => {
        const row = notes.get(path);
        const warnings = parseFrontmatter(row.body).warnings || [];
        return {
          path,
          title: row.title,
          kind: row.kind,
          degree: legacyDegree.get(path) || 0,
          ...warnings.length ? { warnings } : {}
        };
      }),
      edges: [...legacyEdges.values()].filter(([source, target]) => legacyKeep.has(source) && legacyKeep.has(target)).map(([source, target]) => ({ source, target })),
      totalNotes: notes.size,
      revision,
      semantic: {
        nodes: chosen.map((node) => ({ ...node })),
        edges: links,
        totalNotes: notes.size,
        view,
        mergeMirrors,
        relations,
        duplicates: (model.duplicates || []).filter(
          ({ canonical, duplicate }) => keep.has(canonical) || keep.has(duplicate)
        ),
        communities: Object.fromEntries(
          Object.entries(model.communities || {}).filter(([path]) => keep.has(path))
        ),
        layout: Object.fromEntries(Object.entries(model.layout || {}).filter(([path]) => keep.has(path))),
        health: {
          isolated: chosen.filter((node) => node.degree === 0).length,
          duplicates: totalDuplicateCount,
          infrastructure: chosen.filter((node) => node.isInfrastructure).length,
          truncated: semanticCandidatePaths.size < notes.size,
          candidateNodes: semanticCandidatePaths.size,
          candidateLimit: semanticCandidateLimit
        }
      }
    };
    graphSnapshots.set(revision, cacheKey, result);
    return result;
  }
  async function dispatch(op, args) {
    if (op === "status") {
      if (args.flushPending) await flushDirty();
      return { ...status(), semanticScoped: semanticStatus(args.fingerprint, args.project) };
    }
    if (op === "read") return read(args.path, args.project, args);
    if (op === "search") return search(args);
    if (op === "noteLinks") return noteLinks(args);
    if (op === "graph") return knowledgeGraph(args);
    if (op === "graphNeighbors") return graphNeighbors(args);
    if (op === "hydrateCandidates") return hydrateCandidates(args);
    if (op === "semanticBatch") return semanticBatch(args);
    if (op === "semanticStore") return semanticStore(args);
    if (op === "semanticCandidates") return semanticCandidates(args);
    if (op === "warm") {
      if (options.backgroundReconcile === false) await beginReconcile();
      else void beginReconcile();
      return status();
    }
    if (op === "reconcile") {
      const pendingScan = Boolean(scan);
      fullScanRequested = false;
      await beginReconcile(!!args.force);
      if (pendingScan) await beginReconcile(!!args.force);
      await flushDirty();
      if (scan) await scan;
      return status();
    }
    if (op === "changed") {
      for (const path of args.paths.slice(0, 100)) {
        const previous = statements.get.get(path);
        let signature = null;
        try {
          signature = (await files.inspect(path)).signature;
        } catch {
        }
        if (previous?.signature === signature && signature) continue;
        await updatePath(path, true);
        dirty.delete(path);
      }
      return status();
    }
    if (op === "enqueueNavigation") {
      const project = args.project;
      if (project && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project)) throw new Error("Invalid project scope");
      if (project) job("navigation", `Projects/${project}/Index.md`, project);
      job("navigation", "Library/Index.md", "shared");
      return status();
    }
    if (op === "uiJobs") {
      const offset = Math.max(0, Math.min(1e5, Math.floor(args.offset || 0))), limit = Math.max(1, Math.min(50, Math.floor(args.limit || 20)));
      const scope = args.project || "";
      const where = "(scope='shared' OR scope=?)";
      const total = Number(db.prepare(`SELECT count(*) n FROM jobs WHERE ${where}`).get(scope).n);
      const items = db.prepare(`SELECT * FROM jobs WHERE ${where} ORDER BY updated DESC,key LIMIT ? OFFSET ?`).all(scope, limit, offset);
      return {
        items,
        total,
        offset,
        nextOffset: offset + items.length < total ? offset + items.length : null,
        revision
      };
    }
    if (op === "recentNotes") return { items: await recentNotes(args.project, args.limit), revision };
    if (op === "recentByCategory")
      return {
        groups: await recentByCategory(args.project, args.limit),
        counts: categoryCounts(args.project),
        revision
      };
    if (op === "jobs") return { ...status(), items: pending(args.project, 100, args.kind || null) };
    if (op === "completeJob") {
      db.prepare("DELETE FROM jobs WHERE key=? AND revision=?").run(args.key, args.revision);
      return status();
    }
    if (op === "navigation") {
      const scope = args.project || "shared";
      const filter = args.targetPath === "Wiki/Index.md" ? "AND kind='wiki' AND path LIKE 'Wiki/%'" : args.targetPath === "Library/Index.md" ? "AND path LIKE 'Library/%'" : "AND kind!='navigation'";
      return db.prepare(`SELECT path,title,kind FROM notes WHERE scope=? ${filter} ORDER BY path LIMIT 61`).all(scope);
    }
    throw new Error("Unknown knowledge operation");
  }
  transport.onMessage(async ({ id, op, args = {} }) => {
    if (op === "close") {
      try {
        await closeWorker();
        transport.send({ id, result: { closed: true } });
        transport.close();
      } catch (error) {
        transport.send({ id, error: String(error.message) });
      }
      return;
    }
    if (_closed) {
      transport.send({ id, error: "Knowledge worker is closing" });
      return;
    }
    const task = dispatch(op, args);
    activeRequests.add(task);
    try {
      const result = await task;
      transport.send({ id, result });
    } catch (error) {
      transport.send({ id, error: String(error.message) });
    } finally {
      activeRequests.delete(task);
    }
  });
  transport.send({ ready: true });
  return { close: closeWorker };
}

// src/core/index-runtime-local.ts
import { watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { join as join2 } from "node:path";
function createLocalKnowledgeIndexFiles(vault) {
  return {
    inspect: (path) => inspectNote(vault, path),
    read: (path) => readNoteFile(vault, path),
    list: async (path) => (await readdir(join2(vault, path), { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      kind: entry.isSymbolicLink() ? "symlink" : entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other"
    })),
    async watch(change, error) {
      const watcher = watch(vault, { recursive: true, persistent: false }, (_event, name) => change(name));
      watcher.on("error", error);
      return { close: () => watcher.close() };
    }
  };
}

// src/core/worker.ts
await createKnowledgeIndexRuntime(workerData, createLocalKnowledgeIndexFiles(workerData.vault), {
  onMessage: (handler) => {
    parentPort.on("message", handler);
  },
  send: (message) => parentPort.postMessage(message),
  close: () => parentPort.close()
});
