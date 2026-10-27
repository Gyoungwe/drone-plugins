// src/memory.ts
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var MEMORY_TYPES = ["user", "feedback", "project", "reference"];
var MEMORY_INDEX = "MEMORY.md";
var MAX_INDEX_LINES = 200;
function memoryDir(cwd) {
  return join(cwd, ".pi", "memory");
}
function memorySlug(name) {
  const slug = name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return slug || "memory";
}
function serializeMemory(entry) {
  const oneLine = (s) => s.replace(/\s+/g, " ").trim();
  return `---
name: ${oneLine(entry.name)}
description: ${oneLine(entry.description)}
type: ${entry.type}
---

${entry.body.trim()}
`;
}
function parseMemory(text) {
  const m = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const fields = {};
  for (const line of (m[1] ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const type = fields.type;
  if (!fields.name || !MEMORY_TYPES.includes(type)) return null;
  return { name: fields.name, description: fields.description ?? "", type, body: (m[2] ?? "").trim() };
}
function renderMemoryIndex(entries) {
  const lines = entries.slice().sort(
    (a, b) => MEMORY_TYPES.indexOf(a.type) - MEMORY_TYPES.indexOf(b.type) || a.name.localeCompare(b.name)
  ).map((e) => `- [${e.name}](${e.file}) \u2014 ${e.type}: ${e.description}`);
  return `# Memory index

${lines.join("\n")}
`;
}
function atomicWrite(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}
function listMemories(cwd) {
  const dir = memoryDir(cwd);
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== MEMORY_INDEX);
  } catch {
    return [];
  }
  const out = [];
  for (const file of files) {
    const entry = parseMemory(readFileSync(join(dir, file), "utf8"));
    if (entry) out.push({ ...entry, file });
  }
  return out;
}
function writeMemory(cwd, entry) {
  const dir = memoryDir(cwd);
  mkdirSync(dir, { recursive: true });
  const file = `${entry.type}_${memorySlug(entry.name)}.md`;
  atomicWrite(join(dir, file), serializeMemory(entry));
  atomicWrite(join(dir, MEMORY_INDEX), renderMemoryIndex(listMemories(cwd)));
  return file;
}
function memoryIndexPrompt(cwd) {
  let index;
  try {
    index = readFileSync(join(memoryDir(cwd), MEMORY_INDEX), "utf8");
  } catch {
    return [];
  }
  const lines = index.split(/\r?\n/).filter((l) => l.startsWith("- "));
  if (!lines.length) return [];
  const shown = lines.slice(0, MAX_INDEX_LINES);
  return [
    `\u9879\u76EE\u8BB0\u5FC6\u7D22\u5F15\uFF08.pi/memory/MEMORY.md\uFF0C\u6B63\u6587\u6309\u9700\u7528 read \u8BFB\u53D6 .pi/memory/<\u6587\u4EF6>\uFF09\uFF1A
${shown.join("\n")}${lines.length > shown.length ? `
\u2026\u53E6\u6709 ${lines.length - shown.length} \u6761` : ""}`
  ];
}
function forgetMemory(cwd, file) {
  if (!/^[^\\/]+\.md$/.test(file) || file === MEMORY_INDEX) return false;
  if (!listMemories(cwd).some((e) => e.file === file)) return false;
  rmSync(join(memoryDir(cwd), file));
  atomicWrite(join(memoryDir(cwd), MEMORY_INDEX), renderMemoryIndex(listMemories(cwd)));
  return true;
}
export {
  MAX_INDEX_LINES,
  MEMORY_INDEX,
  MEMORY_TYPES,
  forgetMemory,
  listMemories,
  memoryDir,
  memoryIndexPrompt,
  memorySlug,
  parseMemory,
  renderMemoryIndex,
  serializeMemory,
  writeMemory
};
