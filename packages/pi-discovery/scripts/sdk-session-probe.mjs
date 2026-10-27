// Copied into an isolated SDK installation; workspaces are produced by the backend's actual installed-plugin writer.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
	fauxProvider,
	fauxAssistantMessage,
	fauxToolCall,
} from "@earendil-works/pi-ai";
import {
	createAgentSession,
	DefaultResourceLoader,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";

const [a, b, empty] = process.argv.slice(2);
const agentDir = process.env.PI_CODING_AGENT_DIR;
await mkdir(agentDir, { recursive: true });
const packageRoot = resolve("node_modules/@gyoungwe/pi-discovery");
const manifest = JSON.parse(
	await readFile(join(packageRoot, "plugin.manifest.json"), "utf8"),
);
const runtime = await ModelRuntime.create({
	authPath: join(agentDir, "auth.json"),
	modelsPath: null,
	modelsStorePath: join(agentDir, "models.json"),
	allowModelNetwork: false,
	refreshOnCreate: false,
});
const faux = fauxProvider({
	provider: "discovery-acceptance",
	tokensPerSecond: 100000,
});
runtime.registerNativeProvider(faux.provider);
await runtime.setRuntimeApiKey("discovery-acceptance", "offline-test-only");
let dispatches = 0;
async function open(cwd) {
	const settingsManager = SettingsManager.inMemory({ projectTrusted: true });
	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		noExtensions: true,
		noSkills: true,
		additionalExtensionPaths: [join(packageRoot, "dist/index.mjs")],
	});
	await resourceLoader.reload();
	assert.deepEqual(resourceLoader.getExtensions().errors, []);
	const loaded = resourceLoader
		.getExtensions()
		.extensions.find(
			(item) => item.path === join(packageRoot, "dist/index.mjs"),
		);
	assert.deepEqual([...loaded.tools.keys()].sort(), [...manifest.tools].sort());
	const { session } = await createAgentSession({
		cwd,
		agentDir,
		settingsManager,
		resourceLoader,
		modelRuntime: runtime,
		model: faux.getModel(),
		sessionManager: SessionManager.inMemory(cwd),
		tools: manifest.tools,
	});
	await session.bindExtensions({});
	return session;
}
async function call(session, name, args) {
	const receipts = [];
	const stop = session.subscribe((event) => {
		if (event.type === "tool_execution_end") receipts.push(event);
	});
	faux.setResponses([
		fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" }),
		fauxAssistantMessage("Discovery readback complete."),
	]);
	try {
		await session.prompt(
			"Read the existing discovery records with the specified tool.",
		);
		assert.equal(receipts.length, 1);
		assert.equal(receipts[0].toolName, name);
		assert.equal(
			receipts[0].isError,
			false,
			JSON.stringify(receipts[0].result),
		);
		dispatches++;
		return receipts[0].result.details;
	} finally {
		stop();
	}
}
const sessions = [];
try {
	for (const [cwd, own, other] of [
		[a, "writer-session-a", "writer-session-b"],
		[b, "writer-session-b", "writer-session-a"],
	]) {
		const session = await open(cwd);
		sessions.push(session);
		assert.equal(
			(await call(session, "discovery_status", {})).status,
			"configured",
		);
		const records = await call(session, "discovery_list_records", {
			journal: "sessions",
		});
		assert.equal(records.records[0].sessionId, own);
		assert.equal(
			(
				await call(session, "discovery_search_records", {
					journal: "sessions",
					query: own,
				})
			).count,
			1,
		);
		assert.equal(
			(
				await call(session, "discovery_search_records", {
					journal: "sessions",
					query: other,
				})
			).count,
			0,
		);
	}
	const session = await open(empty);
	sessions.push(session);
	const status = await call(session, "discovery_status", {});
	assert.equal(status.status, "unconfigured");
	assert.equal(status.execution, "unavailable");
	assert.equal(status.inquiry, "unavailable");
	console.log(
		JSON.stringify({
			status: "PASS",
			dispatches,
			nativeReadOnly: true,
			independentWorkspaces: 2,
			emptyWorkspace: "unconfigured",
			model: "faux offline provider; real SDK tool dispatch",
			execution: "NOT_PROVIDED",
			desktopSharedOwner: "NOT_RUN",
			container: "NOT_RUN",
			formalGui: "NOT_RUN",
		}),
	);
} finally {
	for (const session of sessions) await session.dispose();
}
