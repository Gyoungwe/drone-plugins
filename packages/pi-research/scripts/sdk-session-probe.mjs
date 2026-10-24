// Copied into the clean install prefix by check-sdk-sessions.mjs.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

const cwd = resolve("workspace");
const agentDir = process.env.PI_CODING_AGENT_DIR;
await mkdir(cwd);
await mkdir(agentDir, { recursive: true });
await writeFile(
	join(cwd, "source.md"),
	"# SDK acceptance source\nBounded local evidence for SDKRESEARCH.\n",
);
await writeFile(
	join(cwd, "second.md"),
	"# Independent SDK source\nA distinct bounded observation for SDKRESEARCH.\n",
);
const extensionPath = resolve(
	"node_modules/@gyoungwe/pi-research/dist/index.mjs",
);
const manifest = JSON.parse(
	await readFile(
		resolve("node_modules/@gyoungwe/pi-research/plugin.manifest.json"),
		"utf8",
	),
);
const settingsManager = SettingsManager.inMemory({ projectTrusted: true });
const contexts = [];
const loader = new DefaultResourceLoader({
	cwd,
	agentDir,
	settingsManager,
	noExtensions: true,
	noSkills: true,
	additionalExtensionPaths: [extensionPath],
	extensionFactories: [
		(pi) => {
			pi.on("tool_call", (_event, ctx) => {
				// The real SDK context supplies sessionManager, not the ad-hoc sessionId used in old smoke tests.
				assert.equal(Object.hasOwn(ctx, "sessionId"), false);
				contexts.push(ctx.sessionManager.getSessionId());
			});
		},
	],
});
await loader.reload();
assert.deepEqual(loader.getExtensions().errors, []);
const extension = loader
	.getExtensions()
	.extensions.find((item) => item.path === extensionPath);
assert.deepEqual(
	[...extension.tools.keys()].sort(),
	[...manifest.tools].sort(),
);
const runtime = await ModelRuntime.create({
	authPath: join(agentDir, "auth.json"),
	modelsPath: null,
	modelsStorePath: join(agentDir, "models.json"),
	allowModelNetwork: false,
	refreshOnCreate: false,
});
const faux = fauxProvider({
	provider: "research-acceptance",
	tokensPerSecond: 100000,
});
runtime.registerNativeProvider(faux.provider);
await runtime.setRuntimeApiKey("research-acceptance", "offline-test-only");
const ids = [];
let dispatchCount = 0;
async function openSession() {
	const sessionManager = SessionManager.inMemory(cwd);
	ids.push(sessionManager.getSessionId());
	const { session } = await createAgentSession({
		cwd,
		agentDir,
		settingsManager,
		resourceLoader: loader,
		modelRuntime: runtime,
		model: faux.getModel(),
		sessionManager,
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
		fauxAssistantMessage("SDK acceptance turn complete."),
	]);
	try {
		await session.prompt("Execute the scheduled acceptance tool.");
		assert.equal(
			receipts.length,
			1,
			"must execute exactly one real tool via the agent loop",
		);
		assert.equal(receipts[0].toolName, name);
		dispatchCount++;
		return receipts[0];
	} finally {
		stop();
	}
}
let session = await openSession();
const firstSession = session;
try {
	const search = await call(session, "research_search_sources", {
		query: "SDKRESEARCH",
		source_dir: ".",
	});
	assert.equal(search.isError, false);
	assert.equal(search.result.details.count, 2);
	const sourceId = search.result.details.hits[0].source_id;
	const read = await call(session, "research_read_source", {
		source_id: sourceId,
	});
	assert.equal(read.isError, false);
	const firstStatus = await call(session, "research_status", {});
	assert.equal(firstStatus.result.details.reads, 1);
	const insufficient = await call(session, "research_answer_sources", {
		question: "SDKRESEARCH",
	});
	assert.equal(insufficient.isError, true);
	const sourceIds = search.result.details.hits.map((hit) => hit.source_id);
	const secondRead = await call(session, "research_read_source", {
		source_id: sourceIds[1],
	});
	assert.equal(secondRead.isError, false);
	const answer = await call(session, "research_answer_sources", {
		question: "SDKRESEARCH",
		source_ids: sourceIds,
	});
	assert.equal(answer.isError, false);
	assert.equal(answer.result.details.source_count, 2);
	assert.equal(answer.result.details.citations.length, 2);
	const deposit = await call(session, "research_deposit_research_note", {
		title: "SDK acceptance",
		markdown: "Candidate fixture synthesis.",
		source_ids: sourceIds,
		slug: "sdk-acceptance",
	});
	assert.equal(deposit.isError, false);
	assert.equal(deposit.result.details.scientificallyVerified, false);
	const savedNote = await readFile(
		join(cwd, deposit.result.details.path),
		"utf8",
	);
	assert(savedNote.includes("Candidate fixture synthesis."));
	for (const citation of answer.result.details.citations)
		assert(savedNote.includes(citation.read_hash));
	const started = await call(session, "research_loop", {
		action: "start",
		query: "SDKRESEARCH",
	});
	assert.equal(started.isError, false);
	const runDir = started.result.details.run_dir;
	const premature = await call(session, "research_loop", {
		action: "finalize",
		run_dir: runDir,
	});
	assert.equal(premature.isError, true, "unbound run must not finalize");
	const emptyBind = await call(session, "research_loop", {
		action: "bind_claims",
		run_dir: runDir,
		claim_bindings: [],
	});
	const emptyFinalize = await call(session, "research_loop", {
		action: "finalize",
		run_dir: runDir,
	});
	assert(
		emptyBind.isError ||
			emptyBind.result.details.evidence_gate.answerable === false,
	);
	const emptyClaimsBlocked =
		emptyFinalize.isError ||
		emptyFinalize.result.details.evidence_gate.answerable === false;
	// Keep the first session active so its run remains owned.
	// Reuse this loader, so both sessions exercise the same extension closure and maps.
	session = await openSession();
	assert.notEqual(ids[0], ids[1]);
	const secondStatus = await call(session, "research_status", {});
	assert.equal(secondStatus.result.details.searches, 0);
	assert.equal(secondStatus.result.details.reads, 0);
	const leakedRead = await call(session, "research_read_source", {
		source_id: sourceId,
	});
	assert.equal(
		leakedRead.isError,
		true,
		"second session must not read a first-session source ID",
	);
	const leakedRun = await call(session, "research_loop", {
		action: "status",
		run_dir: runDir,
	});
	assert.equal(
		leakedRun.isError,
		true,
		"second session must not access the first-session ledger",
	);
	assert.deepEqual(new Set(contexts), new Set(ids));
	console.log(
		JSON.stringify({
			status: emptyClaimsBlocked ? "PASS" : "FAIL",
			dispatchCount,
			tools: manifest.tools.length,
			sessions: ids.length,
			sameWorkspace: true,
			sharedExtensionClosure: true,
			contextSessionManager: true,
			sourcedAnswer: true,
			candidateDepositionReadBack: true,
			emptyClaimsBlocked,
			crossSessionReadBlocked: true,
			crossSessionLedgerBlocked: true,
		}),
	);
	if (!emptyClaimsBlocked) process.exitCode = 1;
} finally {
	firstSession.dispose();
	if (session !== firstSession) session.dispose();
}
