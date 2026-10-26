// Opt-in real Pi SDK acceptance of a packed default CLI extension.
// Uses synthetic temporary Vault/state and an offline faux model; never loads user credentials.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	createAgentSessionRuntime,
	createAgentSessionFromServices,
	createAgentSessionServices,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai";
const root = await realpath(
	await mkdtemp(join(tmpdir(), "knowledge-state-packed-cli-")),
);
const tarball = process.argv[2];
assert(
	tarball,
	"Usage: node scripts/check-native-policy-session.mjs <candidate.tgz> [evidence.json]",
);
execFileSync("tar", ["-xzf", tarball, "-C", root]);
const state = join(root, "state"),
	vault = join(root, "Vault"),
	workspace = join(root, "workspace");
for (const path of [
	state,
	workspace,
	join(vault, "Wiki"),
	join(vault, "Library/Methods"),
])
	await mkdir(path, { recursive: true });
const vaultId = createHash("sha256").update(vault).digest("hex").slice(0, 24);
await writeFile(
	join(state, "binding.json"),
	JSON.stringify({
		version: 1,
		vault,
		vaultId,
		revision: 1,
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "none",
		updatedAt: new Date().toISOString(),
	}),
);
await writeFile(
	join(state, "review-policy.json"),
	JSON.stringify({ version: 1, mode: "strict" }),
);
await writeFile(join(vault, "Home.md"), "# Home\n[[Wiki/Orchid]]\n");
await writeFile(join(vault, "Wiki/Index.md"), "# Wiki\n[[Wiki/Orchid]]\n");
await writeFile(
	join(vault, "Wiki/Orchid.md"),
	"# Orchid\nOrchid method overview.\n",
);
await writeFile(
	join(vault, "Library/Methods/orchid.md"),
	"# Orchid method\nOrchid assay evidence.\n",
);
process.env.DRONE_KNOWLEDGE_DIR = state;
delete process.env.DRONE_REVIEW_MODE;
const extension = (
	await import(pathToFileURL(join(root, "package/dist/index.mjs")).href)
).default;
const leasePaths = [
	`vault:${vault}`,
	`index:${join(state, vaultId, "index.sqlite")}`,
].map((key) =>
	join(
		homedir(),
		".drone/runtime-leases/knowledge-writers",
		createHash("sha256").update(key).digest("hex") + ".lock",
	),
);
const runs = [];
try {
	for (let i = 0; i < 2; i++) {
		const agentDir = join(root, "agent-" + i);
		await mkdir(agentDir);
		const modelRuntime = await ModelRuntime.create({
			authPath: join(agentDir, "auth.json"),
			modelsPath: null,
			modelsStorePath: join(agentDir, "models.json"),
			allowModelNetwork: false,
			refreshOnCreate: false,
		});
		const provider = fauxProvider({
			provider: "state-cli-" + i,
			tokensPerSecond: 100000,
		});
		modelRuntime.registerNativeProvider(provider.provider);
		await modelRuntime.setRuntimeApiKey("state-cli-" + i, "offline-test-only");
		const runtime = await createAgentSessionRuntime(
			async ({ cwd, agentDir, sessionManager }) => {
				const services = await createAgentSessionServices({
					cwd,
					agentDir,
					modelRuntime,
					settingsManager: SettingsManager.inMemory(),
					resourceLoaderOptions: {
						noExtensions: true,
						noSkills: true,
						noContextFiles: true,
						extensionFactories: [extension],
					},
				});
				const result = await createAgentSessionFromServices({
					services,
					sessionManager,
					model: provider.getModel(),
					tools: [
						"knowledge_status",
						"research_read_knowledge",
						"research_search_knowledge",
						"research_check_answer",
					],
				});
				return { ...result, services, diagnostics: services.diagnostics };
			},
			{
				cwd: workspace,
				agentDir,
				sessionManager: SessionManager.inMemory(workspace),
			},
		);
		const errors = [],
			receipts = [];
		await runtime.session.bindExtensions({
			onError: (error) => errors.push(error),
		});
		runtime.session.subscribe((event) => {
			if (event.type === "tool_execution_end")
				receipts.push({
					tool: event.toolName,
					error: event.isError,
					details: event.result?.details,
				});
		});
		try {
			const answer =
				"Orchid assay evidence is recorded in [[Library/Methods/orchid.md]].";
			provider.setResponses([
				fauxAssistantMessage([fauxToolCall("knowledge_status", {})], {
					stopReason: "toolUse",
				}),
				fauxAssistantMessage(
					[
						fauxToolCall("research_read_knowledge", {
							path: "Library/Methods/orchid.md",
						}),
					],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage(
					[fauxToolCall("research_search_knowledge", { query: "Orchid" })],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage(
					[fauxToolCall("research_check_answer", { draft: answer })],
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage(answer),
			]);
			await runtime.session.prompt(
				"Use the knowledge library to explain the Orchid method.",
			);
			assert.equal(errors.length, 0);
			assert.equal(receipts.length, 4);
			assert(
				receipts.every((item) => !item.error),
				JSON.stringify(receipts),
			);
			assert.equal(
				receipts.at(-1).details.ok,
				true,
				JSON.stringify(receipts.at(-1).details),
			);
			assert.equal(receipts.at(-1).details.proof.status, "ready");
			assert.equal(
				receipts.at(-1).details.proof.sources[0].path,
				"Library/Methods/orchid.md",
			);
			assert(
				leasePaths.every((path) => existsSync(path)),
				"real writer reservations missing",
			);
			runs.push({
				iteration: i + 1,
				tools: receipts.map(({ tool, error }) => ({ tool, error })),
				preflight: receipts.at(-1).details.proof.status,
			});
		} finally {
			await runtime.dispose();
		}
		assert(
			leasePaths.every((path) => !existsSync(path)),
			"default native shutdown left writer reservation",
		);
	}
	const report = {
		status: "PASS",
		sdk: "1.1.0",
		defaultPackedExtension: true,
		tarballSha256: createHash("sha256")
			.update(await readFile(tarball))
			.digest("hex"),
		strictPolicy: true,
		runs,
		shutdownReleasesLease: true,
	};
	if (process.argv[3])
		await writeFile(process.argv[3], JSON.stringify(report, null, 2) + "\n");
	console.log(JSON.stringify(report));
} finally {
	await rm(root, { recursive: true, force: true });
}
