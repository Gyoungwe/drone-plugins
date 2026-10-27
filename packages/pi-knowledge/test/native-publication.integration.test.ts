import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
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
import { createKnowledgeUi } from "../src/core/ui-state.js";
import { acquireKnowledgeWriterLease } from "../src/core/writer-lease.js";
import { createNativeSession } from "../src/extension/knowledge-extension.js";

it("real native SDK privately replays signed protocol, persists only tool calls and keeps provider metadata while rejecting an unchecked final answer", async () => {
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
	const observedPublication: string[] = [];
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
					extensionFactories: [
						native.extension,
						(pi) => {
							pi.on("message_end", (event) => {
								if (event.message.role !== "assistant") return;
								const { knowledgePublication, ...message } =
									event.message as any;
								observedPublication.push(knowledgePublication.status);
								// An untrusted domain proof is removed by transport; provider replay must survive.
								return { message };
							});
						},
					],
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
		{
			cwd: root,
			agentDir,
			sessionManager: SessionManager.create(root, join(root, "history")),
		},
	);
	const errors: unknown[] = [];
	await sdk.session.bindExtensions({ onError: (error) => errors.push(error) });
	const progress = "I will read the actual file before answering.";
	const thinking = "PRIVATE_SIGNED_THINKING";
	const unchecked =
		"UNCHECKED_FINAL_CLAIM is scientifically established. [[Library/Papers/unread]]";
	const response = Object.assign(
		fauxAssistantMessage(
			[
				{ type: "text", text: progress },
				{
					type: "thinking",
					thinking,
					thinkingSignature: "provider-signed-thinking",
				},
				fauxToolCall("read", { path: "input.txt" }),
			],
			{ stopReason: "toolUse", responseId: "provider-tool-response" },
		),
		{
			responseModel: "provider-model-version",
			rawStopReason: "tool_use",
			endTurn: false,
			diagnostics: [
				{
					type: "provider-warning",
					timestamp: 123,
					error: {
						message:
							"Retry https://example.test/result?token=query-private Authorization: Bearer header-private",
						stack: "STACK_PRIVATE",
					},
					details: { headers: { authorization: "DETAIL_HEADER_PRIVATE" } },
				},
			],
		},
	);
	const providerHistory: any[] = [];
	provider.setResponses([
		response,
		(context) => {
			providerHistory.push(structuredClone(context.messages));
			return fauxAssistantMessage(unchecked, {
				responseId: "provider-final-response",
			});
		},
	]);
	try {
		await sdk.session.prompt(
			"Research the bounded evidence in input.txt and explain the scientific result.",
		);
		const toolMessage: any = sdk.session.messages.find(
			(message) =>
				message.role === "assistant" && message.stopReason === "toolUse",
		);
		expect(toolMessage.content).toEqual(
			response.content.filter((block) => block.type === "toolCall"),
		);
		expect(providerHistory).toHaveLength(1);
		expect(
			providerHistory[0].find((message: any) => message.role === "assistant")
				.content,
		).toEqual(response.content);
		expect(toolMessage).toMatchObject({
			responseModel: "provider-model-version",
			rawStopReason: "tool_use",
			endTurn: false,
			responseId: "provider-tool-response",
			api: provider.getModel().api,
			provider: provider.provider.id,
			model: provider.getModel().id,
		});
		expect(toolMessage.usage).toBeDefined();
		expect(toolMessage.usage.input).toBeGreaterThan(0);
		expect(toolMessage.diagnostics).toMatchObject([
			{
				type: "provider-warning",
				timestamp: 123,
				error: {
					message: expect.stringContaining("https://example.test/result"),
				},
			},
		]);
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
		).not.toContainEqual(expect.objectContaining({ type: "toolCall" }));
		expect(
			observer.projectKnowledgeSnapshot([structuredClone(toolMessage)])[0]
				.content,
		).not.toContainEqual(expect.objectContaining({ type: "toolCall" }));
		expect(JSON.stringify(sdk.session.messages)).not.toContain(progress);
		expect(JSON.stringify(sdk.session.messages)).not.toContain(thinking);
		const persisted = await readFile(sdk.session.sessionFile!, "utf8");
		expect(persisted).not.toContain(progress);
		expect(persisted).not.toContain(thinking);
		expect(persisted).not.toContain(unchecked);
		for (const visible of [JSON.stringify(sdk.session.messages), persisted])
			expect(visible).not.toMatch(
				/query-private|header-private|STACK_PRIVATE|DETAIL_HEADER_PRIVATE/,
			);
		const final: any = sdk.session.messages
			.filter((message) => message.role === "assistant")
			.at(-1);
		expect(observedPublication).toEqual(["tool-only", "blocked"]);
		expect(final.knowledgePublication).toBeUndefined();
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

it("private protocol replay is isolated per owner and exact SDK identity/toolCall content, then cleared on invalidation", async () => {
	function publication() {
		const config = createKnowledgeConfigApi(
			undefined,
			"/tmp/knowledge-protocol-owner-test",
		);
		const ui = createKnowledgeUi(createKnowledgeRuntimeHost(), config);
		const api = createKnowledgePublication(
			ui,
			{ readReviewMode: async () => "strict" },
			config,
			new AbortController().signal,
		);
		const hooks = new Map<string, (...args: any[]) => any>();
		const control = api.registerAnswerPublication(
			{
				on: (name: string, hook: (...args: any[]) => any) =>
					hooks.set(name, hook),
			},
			{ getCurrent: () => null },
		);
		return { hooks, control, ui };
	}
	const a = publication(),
		b = publication();
	const call = fauxToolCall("read", { path: "input.txt" });
	const original = fauxAssistantMessage(
		[
			{
				type: "thinking",
				thinking: "OWNER_A_PRIVATE",
				thinkingSignature: "signature-a",
			},
			call,
		],
		{ stopReason: "toolUse", responseId: "same-response", timestamp: 123 },
	);
	const ctx = { cwd: "/tmp", sessionId: "protocol-owner" };
	const { message } = await a.hooks.get("message_end")!(
		{ message: original },
		ctx,
	);
	delete message.knowledgePublication;
	const replay = async (owner: typeof a, current = message) =>
		(await owner.hooks.get("context")!({ messages: [current] })).messages[0]
			.content;
	expect(await replay(a)).toEqual(original.content);
	expect(await replay(b)).toEqual([call]);
	const other = {
		...original,
		content: [
			{
				type: "thinking",
				thinking: "OWNER_B_PRIVATE",
				thinkingSignature: "signature-b",
			},
			call,
		],
	};
	await b.hooks.get("message_end")!({ message: other }, ctx);
	expect(await replay(a)).toEqual(original.content);
	expect(await replay(b)).toEqual(other.content);
	expect(await replay(a, { ...message, timestamp: 124 })).toEqual([call]);
	const changedCall = { ...call, arguments: { path: "changed.txt" } };
	expect(await replay(a, { ...message, content: [changedCall] })).toEqual([
		changedCall,
	]);
	a.control.invalidate();
	expect(await replay(a)).toEqual([call]);
	b.control.invalidate();
	a.ui.dispose();
	b.ui.dispose();
});
