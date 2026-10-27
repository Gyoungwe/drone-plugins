import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai";
import {
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntime } from "../src/core/knowledge-runtime.js";
import { createKnowledgePublication } from "../src/core/publication.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";
import { createNativeSession } from "../src/extension/knowledge-extension.js";

it("real native SDK keeps text/toolCall protocol and provider metadata through read, but rejects an unchecked final answer", async () => {
	const root = await realpath(
		await mkdtemp(join(tmpdir(), "knowledge-native-publication-")),
	);
	const vault = join(root, "Vault"),
		agentDir = join(root, "agent");
	await mkdir(join(vault, "Wiki"), { recursive: true });
	await mkdir(agentDir);
	await writeFile(join(vault, "Home.md"), "# Home\n[[Wiki/Index]]\n");
	await writeFile(join(vault, "Wiki/Index.md"), "# Wiki\n");
	await writeFile(join(root, "input.txt"), "Actual SDK read evidence.\n");
	const config = createKnowledgeConfigApi(undefined, join(root, "state"));
	await config.saveKnowledgeBinding({
		vault,
		profile: "hybrid",
		depositMode: "verified",
		subagentPolicy: "none",
	});
	await writeFile(
		join(root, "state/review-policy.json"),
		JSON.stringify({ version: 1, mode: "strict" }),
	);
	const host = createKnowledgeRuntimeHost();
	host.configureKnowledgeWorker(
		(_url, options) =>
			new Worker(
				new URL("../lib/knowledge/runtime/worker.mjs", import.meta.url),
				options,
			),
	);
	const owner = createKnowledgeRuntime(config, host, {}, (input) =>
		acquireKnowledgeWriterLease(input, join(root, "leases")),
	);
	const native = createNativeSession(owner);
	const observer = createKnowledgePublication(
		owner.ui,
		owner.reviewPolicy,
		config,
		native.signal,
	);
	const modelRuntime = await ModelRuntime.create({
		authPath: join(agentDir, "auth.json"),
		modelsPath: null,
		allowModelNetwork: false,
		refreshOnCreate: false,
	});
	const provider = fauxProvider({
		provider: "native-publication",
		tokensPerSecond: 0,
	});
	modelRuntime.registerNativeProvider(provider.provider);
	await modelRuntime.setRuntimeApiKey(
		"native-publication",
		"offline-test-only",
	);
	const sdk = await createAgentSessionRuntime(
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
					extensionFactories: [native.extension],
				},
			});
			const result = await createAgentSessionFromServices({
				services,
				sessionManager,
				model: provider.getModel(),
				tools: ["read"],
			});
			return { ...result, services, diagnostics: services.diagnostics };
		},
		{ cwd: root, agentDir, sessionManager: SessionManager.inMemory(root) },
	);
	const errors: unknown[] = [];
	await sdk.session.bindExtensions({ onError: (error) => errors.push(error) });
	const progress = "I will read the actual file before answering.";
	const unchecked =
		"UNCHECKED_FINAL_CLAIM is scientifically established. [[Library/Papers/unread]]";
	const response = Object.assign(
		fauxAssistantMessage(
			[
				{ type: "text", text: progress },
				fauxToolCall("read", { path: "input.txt" }),
			],
			{ stopReason: "toolUse", responseId: "provider-tool-response" },
		),
		{ id: "provider-message-id" },
	);
	provider.setResponses([
		response,
		fauxAssistantMessage(unchecked, { responseId: "provider-final-response" }),
	]);
	try {
		await sdk.session.prompt(
			"Research the bounded evidence in input.txt and explain the scientific result.",
		);
		const toolMessage: any = sdk.session.messages.find(
			(message) =>
				message.role === "assistant" && message.stopReason === "toolUse",
		);
		expect(toolMessage.content).toEqual(response.content);
		expect(toolMessage).toMatchObject({
			id: "provider-message-id",
			responseId: "provider-tool-response",
			api: provider.getModel().api,
			provider: provider.provider.id,
			model: provider.getModel().id,
		});
		expect(toolMessage.usage).toBeDefined();
		expect(toolMessage.usage.input).toBeGreaterThan(0);
		expect(
			sdk.session.messages.find((message) => message.role === "toolResult"),
		).toMatchObject({
			toolName: "read",
			isError: false,
			content: [
				expect.objectContaining({ text: "Actual SDK read evidence.\n" }),
			],
		});
		const untrustedProofCopy = structuredClone(toolMessage);
		expect(
			observer.projectKnowledgeEvent({
				type: "message_end",
				message: untrustedProofCopy,
			}).message.content,
		).toEqual(response.content);
		expect(
			observer.projectKnowledgeSnapshot([structuredClone(toolMessage)])[0]
				.content,
		).toEqual(response.content);
		const final: any = sdk.session.messages
			.filter((message) => message.role === "assistant")
			.at(-1);
		expect(final.knowledgePublication.status).toBe("blocked");
		expect(JSON.stringify(final.content)).not.toContain(unchecked);
		expect(final.responseId).toBe("provider-final-response");
		expect(final.usage.input).toBeGreaterThan(0);
		expect(errors).toEqual([]);
	} finally {
		await sdk.dispose();
		await owner.dispose();
		await rm(root, { recursive: true, force: true });
	}
});
