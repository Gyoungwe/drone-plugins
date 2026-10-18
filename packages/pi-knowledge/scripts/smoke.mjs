#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const packageManifest = JSON.parse(await readFile(join(packageRoot, "plugin.manifest.json"), "utf8"));
const root = await mkdtemp(join(tmpdir(), "drone-pi-knowledge-smoke-"));
const packRoot = join(root, "pack");
const extractRoot = join(root, "extract");
await mkdir(packRoot, { recursive: true });
await mkdir(extractRoot, { recursive: true });
const output = await execFileAsync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", packRoot], {
	cwd: packageRoot,
	maxBuffer: 8 * 1024 * 1024,
});
const pack = JSON.parse(output.stdout.trim());
const files = new Set(pack[0]?.files?.map((file) => file.path) || []);
for (const required of [
	"dist/index.mjs",
	"lib/knowledge/runtime/worker.mjs",
	"plugin.manifest.json",
	"build-manifest.json",
	"skills/research-vault/SKILL.md",
	"skills/research-show-me/SKILL.md",
]) assert(files.has(required), `npm pack is missing ${required}`);
assert(!files.has("skills/research-workflow/SKILL.md"), "npm pack includes the pi-research-owned research-workflow skill");
for (const forbidden of ["src/index.ts", "types/host-shims.d.ts"]) assert(!files.has(forbidden), `npm pack includes ${forbidden}`);
const tarball = join(packRoot, pack[0]?.filename || "");
assert(tarball.endsWith(".tgz"), "npm pack did not produce a tarball");
await execFileAsync("tar", ["-xzf", tarball, "-C", extractRoot]);
const artifactRoot = join(extractRoot, "package");
const previousKnowledgeDir = process.env.DRONE_KNOWLEDGE_DIR;
try {
	process.env.DRONE_KNOWLEDGE_DIR = join(root, "unconfigured");
	const { default: register } = await import(pathToFileURL(join(artifactRoot, "dist/index.mjs")).href);
	const tools = new Map();
	const commands = new Map();
	const pi = {
		events: { on() {}, emit() {} },
		on() {},
		appendEntry() {},
		getCommands() {
			return [...commands.keys()].map((name) => ({ name }));
		},
		readSemanticSettings: async () => ({}),
		saveSemanticSettings: async () => undefined,
		sendMessage: async () => undefined,
		sendUserMessage: async () => undefined,
		registerTool(definition) {
			tools.set(definition.name, definition);
		},
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
	};
	register(pi);
	assert(tools.has("knowledge_status"), "knowledge_status was not registered");
	assert(tools.has("knowledge_search"), "knowledge_search was not registered");
	for (const name of ["task_status", "task_plan", "task_wait", "task_reconcile", "task_evidence_restore"])
		assert(!tools.has(name), `${name} must be owned by pi-core, not pi-knowledge`);
	for (const name of ["task-status", "task-action"])
		assert(!commands.has(name), `${name} must be owned by pi-core, not pi-knowledge`);
	assert(commands.has("drone-init"), "drone-init was not registered");
	const ctx = {
		cwd: root,
		sessionId: "external-package-smoke",
		hasUI: false,
		isProjectTrusted: () => true,
		sessionManager: { getSessionId: () => "external-package-smoke", getBranch: () => [] },
		ui: { notify: () => undefined },
	};
	const status = await tools.get("knowledge_status").execute("smoke:status", {}, new AbortController().signal, () => undefined, ctx);
	assert.equal(status.details.status, "unconfigured");
	assert.equal(status.details.next, "/drone-init");
	const search = await tools.get("knowledge_search").execute(
		"smoke:search",
		{ query: "package-fixture-marker" },
		new AbortController().signal,
		() => undefined,
		ctx,
	);
	assert.equal(search.details.local.status, "unconfigured");
	console.log(
		JSON.stringify({
			package: packageJson.name,
			version: packageJson.version,
			manifest: packageManifest.id,
			tarballFiles: files.size,
			tools: [...tools.keys()],
			status: status.details.status,
			search: search.details.local.status,
		}),
	);
} finally {
	if (previousKnowledgeDir === undefined) delete process.env.DRONE_KNOWLEDGE_DIR;
	else process.env.DRONE_KNOWLEDGE_DIR = previousKnowledgeDir;
	await rm(root, { recursive: true, force: true });
}
