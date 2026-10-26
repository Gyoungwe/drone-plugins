import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, "plugin.manifest.json"), "utf8"));

test("manifest tools equal the tools registered by every bundled extension", async () => {
	const knowledgeDir = await mkdtemp(join(tmpdir(), "drone-research-suite-tools-"));
	const previous = process.env.DRONE_KNOWLEDGE_DIR;
	process.env.DRONE_KNOWLEDGE_DIR = knowledgeDir;
	const names = [];
	const bus = new EventEmitter();
	const pi = {
		registerTool(tool) { names.push(tool.name); },
		registerCommand() {},
		events: {
			on(name, listener) { bus.on(name, listener); return () => bus.off(name, listener); },
			emit(name, payload) { bus.emit(name, payload); },
		},
		on() {},
		appendEntry() {},
		sendMessage() {},
		sendUserMessage() {},
	};
	try {
		for (const packageName of [
			"@gyoungwe/pi-core",
			"@gyoungwe/pi-workbench",
			"@gyoungwe/pi-knowledge",
			"@gyoungwe/pi-research",
		]) {
			const module = await import(pathToFileURL(join(root, "node_modules", ...packageName.split("/"), "dist/index.mjs")).href);
			module.default(pi);
		}
		assert.deepEqual(names, manifest.tools);
	} finally {
		if (previous === undefined) delete process.env.DRONE_KNOWLEDGE_DIR;
		else process.env.DRONE_KNOWLEDGE_DIR = previous;
		await rm(knowledgeDir, { recursive: true, force: true });
	}
});

test("bundled versions and public research host resources match the suite pins", async () => {
	const suite = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
	assert.equal(suite.version, "0.2.0");
	assert.equal(manifest.version, suite.version);
	for (const name of suite.bundleDependencies) {
		const dependencyRoot = join(root, "node_modules", ...name.split("/"));
		const dependency = JSON.parse(await readFile(join(dependencyRoot, "package.json"), "utf8"));
		assert.equal(dependency.version, suite.dependencies[name]);
		for (const entry of dependency.pi.extensions) assert.ok((await readFile(join(dependencyRoot, entry))).length);
	}
	const researchRoot = join(root, "node_modules/@gyoungwe/pi-research");
	const research = JSON.parse(await readFile(join(researchRoot, "package.json"), "utf8"));
	assert.equal(research.version, "0.2.0");
	const host = await import(pathToFileURL(join(researchRoot, research.exports["./host"].import)).href);
	assert.equal(typeof host.createResearchLoop, "function");
	assert.equal(typeof host.registerResearchExtension, "function");
	assert.ok((await readFile(join(researchRoot, research.exports["./host"].types), "utf8")).includes("createResearchLoop"));
	const bundledManifest = JSON.parse(await readFile(join(researchRoot, "plugin.manifest.json"), "utf8"));
	for (const key of ["filesystem", "network", "subprocess", "credentials", "externalSideEffects"])
		for (const value of bundledManifest.permissions[key]) assert.ok(manifest.permissions[key].includes(value));
	assert.equal(manifest.permissions.externalWrites, bundledManifest.permissions.externalWrites);
});

test("the aggregate includes the full research gate rather than the former stage-only lifecycle", async () => {
	const workspace = await mkdtemp(join(tmpdir(), "drone-suite-research-gate-"));
	try {
		const research = await import(pathToFileURL(join(root, "node_modules/@gyoungwe/pi-research/dist/index.mjs")).href);
		const tools = new Map();
		research.default({ registerTool: (tool) => tools.set(tool.name, tool), on() {} });
		const tool = tools.get("research_loop");
		const ctx = {cwd: workspace, sessionId: "suite-research"};
		const start = await tool.execute("start", {action: "start", query: "Verify source claims"}, undefined, undefined, ctx);
		assert.equal(start.details.evidence_gate.answerable, false);
		await assert.rejects(tool.execute("claims", {action: "bind_claims", run_dir: start.details.run_dir}, undefined, undefined, ctx), /sources_archived/);
		await assert.rejects(tool.execute("finalize", {action: "finalize", run_dir: start.details.run_dir}, undefined, undefined, ctx));
	} finally {
		await rm(workspace, {recursive: true, force: true});
	}
});
