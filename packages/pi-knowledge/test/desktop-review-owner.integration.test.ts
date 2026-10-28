import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	validateToolArguments,
} from "@earendil-works/pi-ai";
import {
	createAgentSessionFromServices,
	createAgentSessionServices,
	createAgentSessionRuntime,
	ModelRuntime,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { PluginResourceInstance } from "@gyoungwe/plugin-api/resource";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createLocalWikiReviewPorts } from "../src/core/wiki-review-node.js";
import { immutableWikiProposalHash } from "../src/core/wiki-policy.js";
import { inspectNote, readNoteFile } from "../src/core/files.js";
import createDesktopRuntime from "../src/desktop/runtime.js";
import createIndexResource from "../src/desktop/index-resource.js";

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
		// Real file/state and SQLite adapter fixture. OS sandbox and host authorization
		// remain separate packed-host gates; no permission result is simulated as PASS.
		const capabilities = {
			async call(name: string, raw: unknown): Promise<unknown> {
				if (revoked) throw new Error("Host grant revoked");
				names.push(name);
				const input = raw as any;
				if (name === "caller.scope") return call.scope;
				if (name === "session.inspect") return { agentActive };
				if (name === "model.selection")
					return {
						provider: provider.provider.id,
						model: provider.getModel().id,
						thinkingLevel: "off",
					};
				if (name === "model.generate") {
					modelCalls++;
					const tool = {
						name: "structured_result",
						description: "Return JSON",
						parameters: input.resultSchema,
					};
					const response = await modelRuntime.completeSimple(
						provider.getModel(),
						{
							systemPrompt: input.systemPrompt,
							messages: [{ role: "user", content: input.prompt, timestamp: Date.now() }],
							tools: [tool],
						},
						{ signal: activeModelSignal, maxTokens: input.maxTokens },
					);
					activeModelSignal.throwIfAborted();
					const output = response.content.find((block) => block.type === "toolCall");
					if (!output || output.name !== tool.name) throw new Error("Expected structured result");
					return {
						selection: input.selection,
						value: validateToolArguments(tool, output),
						usage: { inputTokens: null, outputTokens: null, cost: null },
					};
				}
				if (name === "roots.resolve") {
					if (input.path === vault) return { handle: "vault-root" };
					if (input.path === workspace) return { handle: "workspace-root" };
					throw new Error("Root not granted");
				}
				if (name === "state.readJson") {
					const doc = await io.state.read(input.path);
					return doc ? { kind: "value", ...doc } : { kind: "missing", version: null };
				}
				if (name === "state.list")
					return (await readdir(join(state, input.path), { withFileTypes: true })).map((entry) => ({
						name: entry.name,
						kind: entry.isFile() ? "file" : "directory",
					}));
				if (name === "state.ensureDirectory") {
					await mkdir(join(state, input.path), { recursive: true });
					return { created: true };
				}
				if (name === "state.writeJson") {
					if (failNextReviewRecord && input.path.includes("/reviewed/")) {
						failNextReviewRecord = false;
						throw new Error("Review record write denied");
					}
					await io.state.write(input.path, input.value, input.expectedVersion);
					return { kind: "value", ...(await io.state.read(input.path)) };
				}
				if (name === "state.removeJson") {
					await io.state.remove(input.path, input.expectedVersion);
					return { kind: "missing", version: null };
				}
				if (name === "files.readText") {
					if (input.root === "workspace-root") {
						const text = await readFile(join(workspace, input.path), "utf8");
						return { text };
					}
					expect(input.root).toBe("vault-root");
					const note = await readNoteFile(vault, input.path);
					return {
						text: note.text,
						sha256: note.hash,
						bytes: note.bytes,
						version: (await inspectNote(vault, input.path)).stat,
					};
				}
				if (name === "files.stat")
					return { kind: "file", version: (await inspectNote(vault, input.path)).stat };
				if (name === "files.list")
					return (await readdir(join(vault, input.path), { withFileTypes: true })).map((entry) => ({
						name: entry.name,
						kind: entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "file",
					}));
				if (name === "files.ensureDirectory") {
					await mkdir(join(vault, input.path), { recursive: true });
					return { created: true };
				}
				if (name === "files.writeText") {
					await io.files.write(binding, input.path, input.text, input.expectedHash, async () => {});
					const note = (await io.files.read(binding, input.path))!;
					return { text: note.text, sha256: note.hash, bytes: note.bytes };
				}
				if (name === "files.remove") {
					await io.files.remove(binding, input.path, input.expectedHash, async () => {});
					return { removed: true };
				}
				if (name === "resource.create") {
					created++;
					const storage = join(state, binding.vaultId);
					await mkdir(storage, { recursive: true });
					index = await createIndexResource({
						parameters: input.parameters,
						storageDirectory: storage,
						signal: controller.signal,
						capabilities,
						events: {
							changed() {
								changed++;
							},
						},
					});
					return { handle: "index" };
				}
				if (name === "resource.invoke") return index!.invoke(input.operation, input.input);
				if (name === "resource.dispose") {
					await index!.dispose();
					exited++;
					return null;
				}
				throw new Error(`Unknown capability ${name}`);
			},
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
			await expect(readFile(join(vault, proposal.path), "utf8")).rejects.toHaveProperty(
				"code",
				"ENOENT",
			);
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
			await expect(invoke("reviewHistory", { revision: binding.revision })).rejects.toThrow(
				"revoked",
			);
			revoked = false;
		} finally {
			await sdk.dispose();
			await runtime.dispose();
			await rm(root, { recursive: true, force: true });
		}
		expect(exited).toBe(1);
	},
);
