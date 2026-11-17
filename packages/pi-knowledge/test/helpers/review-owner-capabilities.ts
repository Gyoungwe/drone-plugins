import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type fauxProvider, validateToolArguments } from "@earendil-works/pi-ai";
import type { AgentSessionRuntime, ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { PluginResourceInstance } from "@gyoungwe/plugin-api/resource";
import type { PluginRuntimeCapabilities, PluginRuntimeContext } from "@gyoungwe/plugin-api/runtime";
import { expect } from "vitest";
import type { KnowledgeBinding } from "../../src/core/config.js";
import { inspectNote, readNoteFile } from "../../src/core/files.js";
import type { createLocalWikiReviewPorts } from "../../src/core/wiki-review-node.js";
import createIndexResource from "../../src/desktop/index-resource.js";

interface ReviewOwnerCapabilityContext {
	vault: string;
	workspace: string;
	state: string;
	io: ReturnType<typeof createLocalWikiReviewPorts>;
	binding: KnowledgeBinding;
	controller: AbortController;
	names: string[];
	revoked: boolean;
	call: Pick<PluginRuntimeContext, "scope">;
	agentActive: boolean;
	sdk: AgentSessionRuntime;
	provider: ReturnType<typeof fauxProvider>;
	modelRuntime: ModelRuntime;
	activeModelSignal: AbortSignal;
	recordModelCall(): void;
	failNextReviewRecord: boolean;
	recordResourceCreated(): void;
	index: PluginResourceInstance | undefined;
	capabilities: PluginRuntimeCapabilities;
	recordChanged(): void;
	recordResourceExited(): void;
}

// Real file/state and SQLite adapter fixture. OS sandbox and host authorization
// remain separate packed-host gates; no permission result is simulated as PASS.
export async function reviewOwnerCapabilityCall(
	this: ReviewOwnerCapabilityContext,
	name: string,
	raw: unknown,
): Promise<unknown> {
	if (this.revoked) throw new Error("Host grant revoked");
	this.names.push(name);
	if (name === "agent.slot.acquire") return { lease: "synthetic-agent-slot" };
	if (name === "agent.slot.release") return { released: true };
	const input = raw as any;
	if (name === "caller.scope") return this.call.scope;
	if (name === "session.inspect")
		return {
			agentActive: this.agentActive,
			projectTrusted: this.sdk.session.settingsManager.isProjectTrusted(),
			readOnly: false,
		};
	// This fixture declares no task service. Production installed-source routing is covered by host gates.
	if (name === "provider.inspect")
		return { state: "absent", service: "task.runtime", requestedVersion: 1, provider: null };
	if (name === "model.selection")
		return {
			provider: this.provider.provider.id,
			model: this.provider.getModel().id,
			thinkingLevel: "off",
		};
	if (name === "model.generate") {
		this.recordModelCall();
		const tool = {
			name: "structured_result",
			description: "Return JSON",
			parameters: input.resultSchema,
		};
		const response = await this.modelRuntime.completeSimple(
			this.provider.getModel(),
			{
				systemPrompt: input.systemPrompt,
				messages: [{ role: "user", content: input.prompt, timestamp: Date.now() }],
				tools: [tool],
			},
			{ signal: this.activeModelSignal, maxTokens: input.maxTokens },
		);
		this.activeModelSignal.throwIfAborted();
		const output = response.content.find((block) => block.type === "toolCall");
		if (!output || output.name !== tool.name) throw new Error("Expected structured result");
		return {
			selection: input.selection,
			value: validateToolArguments(tool, output),
			usage: { inputTokens: null, outputTokens: null, cost: null },
		};
	}
	if (name === "roots.resolve") {
		if (input.path === this.vault) return { handle: "vault-root" };
		if (input.path === this.workspace) return { handle: "workspace-root" };
		throw new Error("Root not granted");
	}
	if (name === "state.readJson") {
		const doc = await this.io.state.read(input.path);
		return doc ? { kind: "value", ...doc } : { kind: "missing", version: null };
	}
	if (name === "state.list")
		return (await readdir(join(this.state, input.path), { withFileTypes: true })).map((entry) => ({
			name: entry.name,
			kind: entry.isFile() ? "file" : "directory",
		}));
	if (name === "state.ensureDirectory") {
		await mkdir(join(this.state, input.path), { recursive: true });
		return { created: true };
	}
	if (name === "state.writeJson") {
		if (this.failNextReviewRecord && input.path.includes("/reviewed/")) {
			this.failNextReviewRecord = false;
			throw new Error("Review record write denied");
		}
		await this.io.state.write(input.path, input.value, input.expectedVersion);
		return { kind: "value", ...(await this.io.state.read(input.path)) };
	}
	if (name === "state.removeJson") {
		await this.io.state.remove(input.path, input.expectedVersion);
		return { kind: "missing", version: null };
	}
	if (name === "files.readText") {
		if (input.root === "workspace-root") {
			const text = await readFile(join(this.workspace, input.path), "utf8");
			return { text };
		}
		expect(input.root).toBe("vault-root");
		const note = await readNoteFile(this.vault, input.path);
		return {
			text: note.text,
			sha256: note.hash,
			bytes: note.bytes,
			version: (await inspectNote(this.vault, input.path)).stat,
		};
	}
	if (name === "files.stat")
		return { kind: "file", version: (await inspectNote(this.vault, input.path)).stat };
	if (name === "files.list")
		return (await readdir(join(this.vault, input.path), { withFileTypes: true })).map((entry) => ({
			name: entry.name,
			kind: entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "file",
		}));
	if (name === "files.ensureDirectory") {
		await mkdir(join(this.vault, input.path), { recursive: true });
		return { created: true };
	}
	if (name === "files.writeText") {
		await this.io.files.write(this.binding, input.path, input.text, input.expectedHash, async () => {});
		const note = (await this.io.files.read(this.binding, input.path))!;
		return { text: note.text, sha256: note.hash, bytes: note.bytes };
	}
	if (name === "files.remove") {
		await this.io.files.remove(this.binding, input.path, input.expectedHash, async () => {});
		return { removed: true };
	}
	if (name === "resource.create") {
		this.recordResourceCreated();
		const storage = join(this.state, this.binding.vaultId);
		await mkdir(storage, { recursive: true });
		const context = this;
		this.index = await createIndexResource({
			parameters: input.parameters,
			storageDirectory: storage,
			signal: this.controller.signal,
			capabilities: this.capabilities,
			events: {
				changed() {
					context.recordChanged();
				},
			},
		});
		return { handle: "index" };
	}
	if (name === "resource.invoke") return this.index!.invoke(input.operation, input.input);
	if (name === "resource.dispose") {
		await this.index!.dispose();
		this.recordResourceExited();
		return null;
	}
	throw new Error(`Unknown capability ${name}`);
}
