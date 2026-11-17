import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import {
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { PluginResourceInstance } from "@gyoungwe/plugin-api/resource";
import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { immutableWikiProposalHash } from "../src/core/wiki-policy.js";
import { createLocalWikiReviewPorts } from "../src/core/wiki-review-node.js";
import createDesktopRuntime from "../src/desktop/runtime.js";
import { reviewOwnerCapabilityCall } from "./helpers/review-owner-capabilities.js";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
it.each([false, true])(
	"one Desktop owner serves actual SDK search plus complete apply/history/undo (model=%s)",
	async (modelReview) => {
		const root = await realpath(await mkdtemp(join(tmpdir(), "desktop-review-owner-")));
		const vault = join(root, "Vault"),
			state = join(root, "state"),
			workspace = join(root, "workspace"),
			agentDir = join(root, "agent");
		await mkdir(join(vault, "Library/Methods"), { recursive: true });
		await mkdir(join(workspace, ".pi"), { recursive: true });
		await mkdir(agentDir);
		await writeFile(
			join(workspace, ".pi/research-workspace.json"),
			JSON.stringify({ knowledgeProjectId: "alpha" }),
		);
		const source = "Library/Methods/source.md",
			sourceText = "# Assay source\nControlled orchid assay evidence.\n";
		await writeFile(join(vault, source), sourceText);
		const config = createKnowledgeConfigApi(undefined, state);
		const binding = await config.saveKnowledgeBinding({
			vault,
			profile: "hybrid",
			depositMode: "verified",
			subagentPolicy: "read-local",
		});
		const io = createLocalWikiReviewPorts(config);
		const id = randomUUID(),
			after =
				"# Orchid finding\n\n<!-- pi-agent:managed:start -->\nOrchid evidence is bounded.\n<!-- pi-agent:managed:end -->\n";
		const proposal: any = {
			id,
			status: "pending",
			vaultId: binding.vaultId,
			bindingRevision: binding.revision,
			project: "alpha",
			path: "Wiki/Orchid.md",
			title: "Orchid",
			rationale: "Recorded sources",
			createdAt: Date.now(),
			before: null,
			beforeHash: null,
			after,
			afterHash: digest(after),
			sources: [
				{
					path: source,
					hash: digest(sourceText),
					startLine: 1,
					endLine: 2,
					excerptHash: digest(sourceText),
					paperDois: [],
				},
			],
		};
		proposal.proposalHash = immutableWikiProposalHash(proposal);
		await io.state.write(`${binding.vaultId}/wiki-review/pending/${id}.json`, proposal, null);
		const controller = new AbortController();
		let index: PluginResourceInstance | undefined,
			created = 0,
			exited = 0,
			changed = 0,
			revoked = false,
			failNextReviewRecord = !modelReview;
		let agentActive = false,
			modelCalls = 0,
			activeModelSignal = controller.signal;
		const names: string[] = [];
		const capabilities: PluginRuntimeCapabilities = {
			call: reviewOwnerCapabilityCall.bind({
				vault,
				workspace,
				state,
				io,
				binding,
				controller,
				names,
				get revoked() {
					return revoked;
				},
				get call() {
					return call;
				},
				get agentActive() {
					return agentActive;
				},
				get sdk() {
					return sdk;
				},
				get provider() {
					return provider;
				},
				get modelRuntime() {
					return modelRuntime;
				},
				get activeModelSignal() {
					return activeModelSignal;
				},
				recordModelCall: () => modelCalls++,
				get failNextReviewRecord() {
					return failNextReviewRecord;
				},
				set failNextReviewRecord(value) {
					failNextReviewRecord = value;
				},
				recordResourceCreated: () => created++,
				get index() {
					return index;
				},
				set index(value) {
					index = value;
				},
				get capabilities() {
					return capabilities;
				},
				recordChanged: () => changed++,
				recordResourceExited: () => exited++,
			}),
		};
		const runtime = await createDesktopRuntime({
			applicationId: "owner-test",
			resources: [
				{ kind: "state", handle: "state-root", access: "read-write" },
				{ kind: "files", handle: "vault-root", access: "read-write" },
			],
			resourcesLifecycle: {
				async dispose() {
					if (index) {
						await index.dispose();
						exited++;
					}
				},
			},
			capabilities,
			signal: controller.signal,
			events: {
				changed() {
					changed++;
				},
			},
		});
		const call = {
			scope: {
				kind: "session" as const,
				sessionId: "session-a",
				workspaceId: "workspace-id",
				workspaceDirectory: workspace,
			},
			capabilities,
			signal: controller.signal,
		};
		const invoke = async (operation: string, input: unknown, signal = controller.signal) => {
			activeModelSignal = signal;
			try {
				return await runtime.operations[operation].execute(input, { ...call, signal });
			} finally {
				activeModelSignal = controller.signal;
			}
		};
		const native = await runtime.createNativeSession!();
		const modelRuntime = await ModelRuntime.create({
			authPath: join(agentDir, "auth.json"),
			modelsPath: null,
			allowModelNetwork: false,
			refreshOnCreate: false,
		});
		const provider = fauxProvider({ provider: "review-owner", tokensPerSecond: 0 });
		modelRuntime.registerNativeProvider(provider.provider);
		await modelRuntime.setRuntimeApiKey("review-owner", "offline-test-only");
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
					tools: ["knowledge_search"],
				});
				return { ...result, services, diagnostics: services.diagnostics };
			},
			{ cwd: workspace, agentDir, sessionManager: SessionManager.inMemory(workspace) },
		);
		const errors: unknown[] = [];
		await sdk.session.bindExtensions({ onError: (error) => errors.push(error) });
		call.scope.sessionId = sdk.session.sessionId;
		try {
			provider.setResponses([
				fauxAssistantMessage(fauxToolCall("knowledge_search", { query: "orchid" })),
				fauxAssistantMessage("Search completed."),
			]);
			await sdk.session.prompt("Search current local orchid evidence.");
			expect(sdk.session.messages.filter((message) => message.role === "toolResult")).toEqual([
				expect.objectContaining({ toolName: "knowledge_search", isError: false }),
			]);
			expect(created).toBe(1);
			const preview = (await invoke("previewReview", {
				revision: binding.revision,
				id,
				expectedProposalHash: proposal.proposalHash,
			})) as any;
			expect(preview.canApply).toBe(true);
			if (modelReview) {
				const input = {
					revision: binding.revision,
					id,
					expectedProposalHash: proposal.proposalHash,
					acknowledged: true as const,
					autoApply: false,
				};
				const infoInput = {
					revision: input.revision,
					id: input.id,
					expectedProposalHash: input.expectedProposalHash,
				};
				expect(await invoke("modelReviewInfo", infoInput)).toMatchObject({
					selection: { provider: provider.provider.id },
					lastReview: null,
				});
				agentActive = true;
				await expect(invoke("modelReview", input)).rejects.toThrow("conversation to finish");
				agentActive = false;
				await expect(invoke("modelReview", { ...input, acknowledged: false })).rejects.toThrow(
					"Confirm model costs",
				);
				expect(modelCalls).toBe(0);
				const decision = {
					summary: "Exact local source supports this bounded change.",
					verdict: "approve",
					cautions: [],
					source_paths: [source],
					checks: {
						evidenceSupportsChanges: true,
						scopeAndUncertaintyPreserved: true,
						noUnresolvedContradictions: true,
						humanContentPreserved: true,
						noInstructionInjection: true,
					},
				};
				provider.setResponses([fauxAssistantMessage(fauxToolCall("structured_result", decision))]);
				await sdk.session.prompt(
					`/knowledge-review-model ${JSON.stringify({ id, expectedProposalHash: proposal.proposalHash, acknowledged: true, autoApply: false })}`,
				);
				expect(await invoke("modelReviewInfo", infoInput)).toMatchObject({
					lastReview: {
						verdict: "approve",
						applied: false,
						canAutoApply: true,
						scientificallyVerified: false,
						humanReviewed: false,
						usage: { cost: null },
					},
				});
				await expect(readFile(join(vault, proposal.path))).rejects.toHaveProperty("code", "ENOENT");
				const canceled = new AbortController();
				let entered!: () => void;
				const started = new Promise<void>((resolve) => {
					entered = resolve;
				});
				provider.setResponses([
					(_context, options) =>
						new Promise((_resolve, reject) => {
							entered();
							options!.signal!.addEventListener(
								"abort",
								() => reject(new Error("review provider canceled")),
								{ once: true },
							);
						}),
				]);
				const pending = invoke("modelReview", { ...input, autoApply: true }, canceled.signal);
				const rejected = expect(pending).rejects.toThrow();
				await started;
				canceled.abort(new Error("Cancel exact review"));
				await rejected;
				await expect(readFile(join(vault, proposal.path))).rejects.toHaveProperty("code", "ENOENT");
				provider.setResponses([
					() => {
						agentActive = true;
						return fauxAssistantMessage(fauxToolCall("structured_result", decision));
					},
				]);
				await expect(invoke("modelReview", { ...input, autoApply: true })).rejects.toThrow(
					"conversation to finish",
				);
				agentActive = false;
				await expect(readFile(join(vault, proposal.path))).rejects.toHaveProperty("code", "ENOENT");
				provider.setResponses([fauxAssistantMessage(fauxToolCall("structured_result", decision))]);
				const applied = await invoke("modelReview", { ...input, autoApply: true });
				expect(applied).toMatchObject({
					verdict: "approve",
					applied: true,
					partial: false,
					humanReviewed: false,
					scientificallyVerified: false,
					writeResult: { vaultWritten: true, reviewRecorded: true, indexed: true },
				});
				expect(await invoke("modelReviewInfo", infoInput)).toMatchObject({
					lastReview: { auditId: (applied as any).auditId, applied: true },
				});
				expect(modelCalls).toBe(4);
			} else {
				const partial = await invoke("applyReview", {
					revision: binding.revision,
					id,
					expectedProposalHash: proposal.proposalHash,
				});
				expect(partial).toMatchObject({
					vaultWritten: true,
					reviewRecorded: false,
					indexed: true,
					recordError: "Review record write denied",
				});
				expect(
					await invoke("previewReview", {
						revision: binding.revision,
						id,
						expectedProposalHash: proposal.proposalHash,
					}),
				).toMatchObject({ canApply: true, targetChanged: false });
				const result = await invoke("applyReview", {
					revision: binding.revision,
					id,
					expectedProposalHash: proposal.proposalHash,
				});
				expect(result).toMatchObject({
					vaultWritten: true,
					reviewRecorded: true,
					indexed: true,
					recovered: true,
				});
			}
			expect(await readFile(join(vault, proposal.path), "utf8")).toBe(after);
			expect(await invoke("reviewHistory", { revision: binding.revision })).toMatchObject({
				items: [{ id, afterHash: proposal.afterHash }],
			});
			await expect(
				invoke("undoReview", { revision: binding.revision, id, expectedHash: proposal.afterHash }),
			).resolves.toMatchObject({ status: "reverted" });
			await expect(readFile(join(vault, proposal.path), "utf8")).rejects.toHaveProperty("code", "ENOENT");
			expect(await invoke("reviewHistory", { revision: binding.revision })).toMatchObject({
				items: [],
			});
			expect(created).toBe(1);
			expect(names).toContain("files.remove");
			expect(names).toContain("state.writeJson");
			expect(changed).toBeGreaterThan(0);
			expect(errors).toEqual([]);
			await sdk.dispose();
			expect(exited).toBe(0);
			expect(await invoke("overview", null)).toMatchObject({ state: "bound" });
			revoked = true;
			await expect(invoke("reviewHistory", { revision: binding.revision })).rejects.toThrow("revoked");
			revoked = false;
		} finally {
			await sdk.dispose();
			await runtime.dispose();
			await rm(root, { recursive: true, force: true });
		}
		expect(exited).toBe(1);
	},
);
