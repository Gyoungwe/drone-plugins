#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const root = new URL("..", import.meta.url).pathname;
const { default: register } = await import(pathToFileURL(join(root, "dist/index.mjs")));
const { researchHostLoader, registerResearchHost } = await import(pathToFileURL(join(root, "dist/host.mjs")));
const { default: createDesktopRuntime } = await import(pathToFileURL(join(root, "dist/desktop-runtime.mjs")));
const hostFiles = new Map([
  ["workspace:.pi/research-workspace.json", JSON.stringify({ resultsRoot: "results" })],
  ["workspace:results/demo/run-smoke/metadata.json", JSON.stringify({ run_id: "run-smoke", result_slug: "demo", project: "smoke", status: "running", evidence_gate: { stage: "created", answerable: false } })],
]);
const hostPort = {
  async resolveRoot() { return { handle: "workspace" }; },
  async readText(rootHandle, path) {
    const value = hostFiles.get(`${rootHandle}:${path}`);
    if (value === undefined) { const error = new Error("missing"); error.code = "ENOENT"; throw error; }
    return value;
  },
  async listFiles(_root, path) {
    if (path === "results") return [{ name: "demo", kind: "directory" }];
    if (path === "results/demo") return [{ name: "run-smoke", kind: "directory" }];
    return [];
  },
};
const registeredHostOperations = new Map();
const hostAdapter = registerResearchHost({ register(name, operation) { registeredHostOperations.set(name, operation); } }, hostPort);
assert.equal(researchHostLoader.contractVersion, 1);
assert.equal(hostAdapter.contractVersion, 1);
assert.deepEqual([...registeredHostOperations.keys()], ["status", "listRuns"]);
assert.equal((await registeredHostOperations.get("listRuns")({ workspace: "/workspace" })).total, 1);
const desktopRuntime = await createDesktopRuntime({ applicationId: "smoke", signal: new AbortController().signal, resources: [], capabilities: { call: async () => { throw new Error("desktop capability was not expected during load"); } }, events: { changed() {} } });
assert.equal(desktopRuntime.operations.status.effect, "read");
assert.equal(desktopRuntime.operations.listRuns.effect, "read");
const tools = new Map();
register({registerTool(tool) { tools.set(tool.name, tool); }});
assert.deepEqual([...tools.keys()], ["research_search_sources", "research_read_source", "research_deposit_research_note", "research_answer_sources", "research_status", "research_loop"]);
const workspace = await mkdtemp(join(tmpdir(), "pi-research-smoke-"));
await writeFile(join(workspace, "research.md"), "# Evidence\nLocal source text\n", "utf8");
const ctx = {cwd: workspace, sessionId: "smoke"};
const search = await tools.get("research_search_sources").execute("smoke", {query: "source", source_dir: "."}, new AbortController().signal, () => undefined, ctx);
assert.equal(search.details.count, 1);
const run = await tools.get("research_loop").execute("smoke", {action: "start", query: "source"}, new AbortController().signal, () => undefined, ctx);
assert.equal(run.details.evidence_gate.stage, "created");
await rm(workspace, {recursive: true, force: true});
console.log(JSON.stringify({registered: [...tools.keys()], hostOperations: [...registeredHostOperations.keys()], searchCount: search.details.count, lifecycleStage: run.details.evidence_gate.stage}));
