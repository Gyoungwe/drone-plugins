#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createAgentSession, createAgentSessionRuntime, createAgentSessionServices, createAgentSessionFromServices, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";

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
	"ui/plugin.json",
	"ui/bundle.js",
	"ui/build-manifest.json",
	"lib/knowledge/runtime/worker.mjs",
	"lib/knowledge/runtime/.knowledge-worker-manifest.json",
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
const worker = await readFile(join(artifactRoot, "lib/knowledge/runtime/worker.mjs"));
const workerManifest = JSON.parse(await readFile(join(artifactRoot, "lib/knowledge/runtime/.knowledge-worker-manifest.json"), "utf8"));
assert.equal(workerManifest.outputSha256, createHash("sha256").update(worker).digest("hex"));
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
	assert.deepEqual([...tools.keys()], packageManifest.tools);
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
	// A real official SDK session loads the packed native entry without Desktop,
	// React or the new UI entrypoint. The model is deterministic and offline.
	const agentDir = join(root, "agent");
	await mkdir(agentDir);
	const settingsManager = SettingsManager.inMemory();
	const loader = new DefaultResourceLoader({
		cwd: root, agentDir, settingsManager, noExtensions: true, noSkills: true,
		additionalExtensionPaths: [join(artifactRoot, "dist/index.mjs")],
	});
	await loader.reload();
	assert.deepEqual(loader.getExtensions().errors, []);
	const modelRuntime = await ModelRuntime.create({
		authPath: join(agentDir, "auth.json"), modelsPath: null,
		modelsStorePath: join(agentDir, "models.json"), allowModelNetwork: false, refreshOnCreate: false,
	});
	const provider = fauxProvider({ provider: "knowledge-package-smoke", tokensPerSecond: 100000 });
	modelRuntime.registerNativeProvider(provider.provider);
	await modelRuntime.setRuntimeApiKey("knowledge-package-smoke", "offline-test-only");
	const { session } = await createAgentSession({
		cwd: root, agentDir, settingsManager, resourceLoader: loader, modelRuntime,
		model: provider.getModel(), sessionManager: SessionManager.inMemory(root), tools: ["knowledge_status"],
	});
	const receipts = [];
	const unsubscribe = session.subscribe(event => {
		if (event.type === "tool_execution_end") receipts.push(event);
	});
	try {
		await session.bindExtensions({});
		provider.setResponses([
			fauxAssistantMessage([fauxToolCall("knowledge_status", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("Knowledge package is unconfigured."),
		]);
		await session.prompt("Check the current knowledge binding without creating a Vault.");
		assert.equal(receipts.length, 1);
		assert.equal(receipts[0].toolName, "knowledge_status");
		assert.equal(receipts[0].isError, false);
		assert.equal(receipts[0].result.details.status, "unconfigured");
	} finally {
		unsubscribe();
		await session.dispose();
	}
	// The packed default CLI entry owns its runtime. Real SDK shutdown must
	// drain its configured SQLite worker and release the shared local lease.
	const configuredDirectory = join(await realpath(root), "configured");
	const vault = join(await realpath(root), "Vault");
	await mkdir(vault);
	process.env.DRONE_KNOWLEDGE_DIR = configuredDirectory;
	const packedHost = await import(pathToFileURL(join(artifactRoot, "dist/host.mjs")).href);
	const binding = await packedHost.createKnowledgeConfigApi(undefined, configuredDirectory)
		.saveKnowledgeBinding({ vault, profile: "hybrid", depositMode: "verified", subagentPolicy: "none" });
	const indexPath = join(configuredDirectory, binding.vaultId, "index.sqlite");
	const leasePaths = [`vault:${vault}`, `index:${indexPath}`].map(resource =>
		join(homedir(), ".drone/runtime-leases/knowledge-writers", `${createHash("sha256").update(resource).digest("hex")}.lock`));
	const configuredReceipts = [];
	for (let attempt = 0; attempt < 2; attempt++) {
		const runtime = await createAgentSessionRuntime(async ({ cwd, agentDir, sessionManager }) => {
			const services = await createAgentSessionServices({ cwd, agentDir, modelRuntime,
				settingsManager: SettingsManager.inMemory(), resourceLoaderOptions: {
					noExtensions: true, noSkills: true, noContextFiles: true,
					additionalExtensionPaths: [join(artifactRoot, "dist/index.mjs")],
				} });
			const result = await createAgentSessionFromServices({ services, sessionManager,
				model: provider.getModel(), tools: ["knowledge_status", "research_knowledge_status"] });
			return { ...result, services, diagnostics: services.diagnostics };
		}, { cwd: root, agentDir, sessionManager: SessionManager.inMemory(root) });
		const errors = [];
		const runReceipts = [];
		runtime.session.subscribe(event => { if (event.type === "tool_execution_end") runReceipts.push(event); });
		try {
			await runtime.session.bindExtensions({ onError: error => errors.push(error) });
			provider.setResponses([
				fauxAssistantMessage([fauxToolCall("knowledge_status", {}), fauxToolCall("research_knowledge_status", {})], { stopReason: "toolUse" }),
				fauxAssistantMessage("The configured local index responded."),
			]);
			await runtime.session.prompt("Report local index state.");
			assert.deepEqual(errors, []);
			assert.equal(runReceipts.length, 2);
			assert(runReceipts.every(receipt => !receipt.isError));
			assert.equal(runReceipts.find(receipt => receipt.toolName === "knowledge_status").result.details.status, "configured");
			await Promise.all(leasePaths.map(path => access(path)));
			configuredReceipts.push({ attempt, tools: runReceipts.map(receipt => receipt.toolName).sort() });
		} finally { await runtime.dispose(); }
		for (const path of leasePaths) await assert.rejects(access(path), { code: "ENOENT" });
	}
	console.log(
		JSON.stringify({
			package: packageJson.name,
			version: packageJson.version,
			manifest: packageManifest.id,
			tarballFiles: files.size,
			tools: [...tools.keys()],
			status: status.details.status,
			search: search.details.local.status,
			realAgentSession: true,
			configuredNativeSessions: configuredReceipts,
			configuredShutdownLeaseReleased: true,
			configuredRestart: true,
			dispatchCount: receipts.length,
			model: "Official SDK faux provider; offline deterministic model",
		}),
	);
} finally {
	if (previousKnowledgeDir === undefined) delete process.env.DRONE_KNOWLEDGE_DIR;
	else process.env.DRONE_KNOWLEDGE_DIR = previousKnowledgeDir;
	await rm(root, { recursive: true, force: true });
}
