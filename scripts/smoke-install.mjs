#!/usr/bin/env node

// Install every currently publishable package from real npm tarballs into a
// clean prefix. The probe intentionally uses the native registration surface
// and does not make a model call or touch the user's Pi state.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const packageNames = ["pi-knowledge", "pi-research", "pi-analysis", "pi-evidence", "pi-connectors", "desktop-ui-pack", "research-suite"];
const smokeRoot = await mkdtemp(join(tmpdir(), "drone-plugin-install-smoke-"));
const tarballRoot = join(smokeRoot, "tarballs");
const installRoot = join(smokeRoot, "install");
await mkdir(tarballRoot, { recursive: true });
await mkdir(installRoot, { recursive: true });

const packageJsonFor = async (name) => JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8"));
const tarballs = {};
try {
	for (const name of packageNames) {
		const packageJson = await packageJsonFor(name);
		const output = await execFileAsync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", tarballRoot], {
			cwd: join(root, "packages", name),
			maxBuffer: 8 * 1024 * 1024,
		});
		const metadata = JSON.parse(output.stdout.trim())[0];
		assert(metadata?.filename?.endsWith(".tgz"), `${name} did not produce an npm tarball`);
		tarballs[name] = { packageJson, path: join(tarballRoot, metadata.filename) };
	}

	const installPackage = {
		name: "drone-plugin-install-smoke",
		version: "0.0.0",
		private: true,
		type: "module",
		dependencies: {
			...Object.fromEntries(
				packageNames.map((name) => [tarballs[name].packageJson.name, `file:${tarballs[name].path}`]),
			),
			"@gyoungwe/plugin-api": `file:${join(root, "vendor", "gyoungwe-plugin-api-1.2.0.tgz")}`,
		},
	};
	await writeFile(join(installRoot, "package.json"), `${JSON.stringify(installPackage, null, 2)}\n`);
	await execFileAsync(
		"npm",
		["install", "--prefix", installRoot, "--ignore-scripts", "--legacy-peer-deps", "--no-audit", "--no-fund"],
		{ cwd: root, maxBuffer: 16 * 1024 * 1024 },
	);

	for (const name of packageNames) {
		const packageJson = tarballs[name].packageJson;
		const installedRoot = join(installRoot, "node_modules", ...packageJson.name.split("/"));
		const installed = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
		assert.equal(installed.name, packageJson.name, `${name} installed under the wrong package name`);
		await readFile(join(installedRoot, "plugin.manifest.json"));
	}
	const suiteTarball = tarballs["research-suite"].path;
	const suiteListing = new Set(
		(await execFileAsync("tar", ["-tzf", suiteTarball], { maxBuffer: 8 * 1024 * 1024 })).stdout
			.split(/\r?\n/)
			.filter(Boolean),
	);
	for (const required of [
		"package/node_modules/@gyoungwe/pi-core/dist/index.mjs",
		"package/node_modules/@gyoungwe/pi-knowledge/dist/index.mjs",
		"package/node_modules/@gyoungwe/pi-knowledge/lib/knowledge/runtime/.knowledge-worker-manifest.json",
		"package/node_modules/@gyoungwe/pi-research/dist/index.mjs",
		"package/node_modules/@gyoungwe/plugin-api/package.json",
		"package/node_modules/@gyoungwe/pi-knowledge/skills/research-vault/SKILL.md",
		"package/node_modules/@gyoungwe/pi-research/skills/research-workflow/SKILL.md",
	])
		assert(suiteListing.has(required), `research-suite tarball is missing ${required}`);
	assert(
		![...suiteListing].some((entry) => entry.endsWith("pi-knowledge/skills/research-workflow/SKILL.md")),
		"research-suite tarball contains a duplicate pi-knowledge research-workflow skill",
	);

	const piAnalysisRoot = join(installRoot, "node_modules", "@gyoungwe", "pi-analysis");
	const piAnalysisPackage = JSON.parse(await readFile(join(piAnalysisRoot, "package.json"), "utf8"));
	const piAnalysisExtensionPath = join(
		installRoot,
		"node_modules",
		"@gyoungwe",
		"pi-analysis",
		piAnalysisPackage.pi.extensions[0],
	);
	const { DefaultResourceLoader, SettingsManager } = await import("@earendil-works/pi-coding-agent");
	const loader = new DefaultResourceLoader({
		cwd: installRoot,
		agentDir: join(installRoot, "agent"),
		settingsManager: SettingsManager.inMemory(),
		noExtensions: true,
		noSkills: true,
		additionalExtensionPaths: [piAnalysisExtensionPath],
	});
	await loader.reload();
	const loaded = loader.getExtensions();
	assert.deepEqual(loaded.errors, [], JSON.stringify(loaded.errors));
	const piAnalysis = loaded.extensions.find((item) => item.path === piAnalysisExtensionPath);
	assert(piAnalysis, "installed pi-analysis extension was not discovered by Pi loader");
	assert.deepEqual([...piAnalysis.tools.keys()], ["analysis_list_adapters", "analysis_assess_readiness"]);

	async function discoverInstalled(name, expectedTools) {
		const packageRoot = join(installRoot, "node_modules", "@gyoungwe", name);
		const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
		const extensionPath = join(packageRoot, packageJson.pi.extensions[0]);
		const extensionLoader = new DefaultResourceLoader({
			cwd: installRoot,
			agentDir: join(installRoot, "agent"),
			settingsManager: SettingsManager.inMemory(),
			noExtensions: true,
			noSkills: true,
			additionalExtensionPaths: [extensionPath],
		});
		await extensionLoader.reload();
		const discovered = extensionLoader.getExtensions();
		assert.deepEqual(discovered.errors, [], JSON.stringify(discovered.errors));
		const extension = discovered.extensions.find((item) => item.path === extensionPath);
		assert(extension, `${name} extension was not discovered by Pi loader`);
		assert.deepEqual([...extension.tools.keys()], expectedTools);
		return extension;
	}
	const piEvidence = await discoverInstalled("pi-evidence", [
		"evidence_validate_manifest",
		"evidence_validate_capsule",
		"evidence_verify_replay",
	]);
	const piResearch = await discoverInstalled("pi-research", [
		"research_search_sources",
		"research_read_source",
		"research_deposit_research_note",
		"research_answer_sources",
		"research_status",
		"research_loop",
	]);
	const piConnectors = await discoverInstalled("pi-connectors", ["connector_list", "connector_get"]);
	const suiteRoot = join(installRoot, "node_modules", "@gyoungwe", "research-suite");
	const suitePackage = JSON.parse(await readFile(join(suiteRoot, "package.json"), "utf8"));
	const suiteExtensions = suitePackage.pi.extensions.map((entry) => join(suiteRoot, entry));
	const suiteLoader = new DefaultResourceLoader({
		cwd: installRoot,
		agentDir: join(installRoot, "agent-suite"),
		settingsManager: SettingsManager.inMemory(),
		noExtensions: true,
		noSkills: true,
		additionalExtensionPaths: suiteExtensions,
	});
	await suiteLoader.reload();
	const suiteLoaded = suiteLoader.getExtensions();
	assert.deepEqual(suiteLoaded.errors, [], JSON.stringify(suiteLoaded.errors));
	const suiteCore = suiteLoaded.extensions.find((item) => item.path.endsWith("@gyoungwe/pi-core/dist/index.mjs"));
	const suiteKnowledge = suiteLoaded.extensions.find((item) => item.path.endsWith("@gyoungwe/pi-knowledge/dist/index.mjs"));
	assert(suiteCore, "research-suite did not load bundled pi-core");
	assert(suiteKnowledge, "research-suite did not load bundled pi-knowledge");
	assert(suiteCore.tools.has("task_plan"), "bundled pi-core did not register task_plan");
	for (const name of ["task_status", "task_plan", "task_wait", "task_reconcile", "task_evidence_restore"])
		assert(!suiteKnowledge.tools.has(name), `${name} leaked into bundled pi-knowledge`);

	const piRoot = join(installRoot, "node_modules", "@gyoungwe", "pi-knowledge");
	const previousKnowledgeDir = process.env.DRONE_KNOWLEDGE_DIR;
	process.env.DRONE_KNOWLEDGE_DIR = join(smokeRoot, "unconfigured");
	const { default: register } = await import(pathToFileURL(join(piRoot, "dist/index.mjs")).href);
	const tools = new Map();
	const commands = new Map();
	const pi = {
		events: { on() {}, emit() {} },
		on() {},
		appendEntry() {},
		getCommands: () => [...commands.keys()].map((name) => ({ name })),
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
	assert(tools.has("knowledge_status"), "installed pi-knowledge did not register knowledge_status");
	assert(tools.has("knowledge_search"), "installed pi-knowledge did not register knowledge_search");
	try {
		const status = await tools.get("knowledge_status").execute(
			"combined:status",
			{},
			new AbortController().signal,
			() => undefined,
			{ cwd: installRoot, sessionId: "combined-install-smoke" },
		);
		assert.equal(status.details.status, "unconfigured");
		console.log(
			JSON.stringify({
				packages: packageNames.map((name) => tarballs[name].packageJson.name),
				installed: true,
				piKnowledgeTools: tools.size,
				piAnalysisTools: [...piAnalysis.tools.keys()],
				piEvidenceTools: [...piEvidence.tools.keys()],
				piResearchTools: [...piResearch.tools.keys()],
				piConnectorTools: [...piConnectors.tools.keys()],
				piAnalysisLoaderDiscovered: true,
				knowledgeStatus: status.details.status,
			}),
		);
	} finally {
		if (previousKnowledgeDir === undefined) delete process.env.DRONE_KNOWLEDGE_DIR;
		else process.env.DRONE_KNOWLEDGE_DIR = previousKnowledgeDir;
	}
} finally {
	await rm(smokeRoot, { recursive: true, force: true });
}
