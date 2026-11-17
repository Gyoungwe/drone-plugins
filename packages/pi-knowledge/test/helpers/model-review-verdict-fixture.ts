import { createHash } from "node:crypto";
import { fauxAssistantMessage, fauxToolCall, validateToolArguments } from "@earendil-works/pi-ai";
import type { PluginModelGenerateInput, PluginRuntimeContext } from "@gyoungwe/plugin-api/runtime";
import { expect, vi } from "vitest";
import type { KnowledgeBinding } from "../../src/core/config.js";
import { immutableWikiProposalHash } from "../../src/core/wiki-policy.js";
import createDesktopRuntime from "../../src/desktop/runtime.js";

export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export const sourcePath = "Library/Methods/source.md";
const sourceText = "# Synthetic source\nBounded assay evidence.\n";
export const binding: KnowledgeBinding = {
	version: 1,
	vault: "/synthetic-vault",
	vaultId: "a".repeat(24),
	revision: 7,
	profile: "hybrid",
	depositMode: "verified",
	subagentPolicy: "read-local",
	updatedAt: "2026-11-17T00:00:00.000Z",
};
export const selection = { provider: "fixture", model: "reviewer", thinkingLevel: "off" };

export function cleanReview() {
	return {
		summary: "The synthetic source supports this bounded candidate.",
		verdict: "approve" as "approve" | "needs-human" | "reject",
		cautions: [] as string[],
		source_paths: [sourcePath],
		checks: {
			evidenceSupportsChanges: true,
			scopeAndUncertaintyPreserved: true,
			noUnresolvedContradictions: true,
			humanContentPreserved: true,
			noInstructionInjection: true,
		},
	};
}

function proposal(index: number) {
	const after =
		"# Finding\n\n<!-- pi-agent:managed:start -->\nBounded assay evidence.\n<!-- pi-agent:managed:end -->\n";
	const candidate = {
		id: `${String(index).padStart(8, "0")}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
		status: "pending",
		vaultId: binding.vaultId,
		bindingRevision: binding.revision,
		project: "alpha",
		path: `Wiki/Finding-${index}.md`,
		title: "Finding",
		rationale: "Recorded synthetic source",
		createdAt: Date.now(),
		before: null,
		beforeHash: null,
		after,
		afterHash: digest(after),
		sources: [{ path: sourcePath, hash: digest(sourceText), startLine: 1, endLine: 2, paperDois: [] }],
	};
	return { ...candidate, proposalHash: immutableWikiProposalHash(candidate) };
}

export const reviewPath = (kind: string, id: string) => `${binding.vaultId}/wiki-review/${kind}/${id}.json`;

function stateBroker(candidates: ReturnType<typeof proposal>[]) {
	const documents = new Map([["binding.json", JSON.stringify(binding)]]);
	for (const candidate of candidates)
		documents.set(reviewPath("pending", candidate.id), JSON.stringify(candidate));
	const read = (path: string) => {
		const bytes = documents.get(path);
		return bytes === undefined
			? { kind: "missing", version: null }
			: { kind: "value", value: JSON.parse(bytes), version: digest(bytes) };
	};
	async function call(name: string, input: unknown) {
		const args = input as { root: string; path: string; value: unknown; expectedVersion: string | null };
		expect(args.root).toBe("approved-state");
		if (name === "state.readJson") return read(args.path);
		if (name === "state.ensureDirectory") return { created: true };
		expect(args.expectedVersion).toBe(read(args.path).version);
		if (name === "state.writeJson") {
			documents.set(args.path, JSON.stringify(args.value));
			return read(args.path);
		}
		if (name === "state.removeJson") {
			documents.delete(args.path);
			return read(args.path);
		}
		throw new Error(`Unexpected state capability ${name}`);
	}
	return { documents, read, call };
}

function fileBroker() {
	const notes = new Map([[sourcePath, sourceText]]);
	const access = { project: "alpha", trusted: true, writeApproved: true };
	const writeApproval = vi.fn(() => {
		if (!access.writeApproved) throw new Error("Synthetic Vault write approval denied");
	});
	const write = vi.fn((path: string, text: string) => notes.set(path, text));
	async function call(name: string, input: unknown): Promise<unknown> {
		const args = input as { root: string; path: string; text: string; expectedHash: string | null };
		// Trust is a host boundary; this fake proves owner propagation of its refusal.
		if (!access.trusted) throw new Error("Synthetic host rejected an untrusted caller");
		if (name === "roots.resolve") {
			expect([binding.vault, "/synthetic-workspace"]).toContain(args.path);
			return { handle: args.path === binding.vault ? "approved-vault" : "approved-workspace" };
		}
		if (name === "files.readText" && args.root === "approved-workspace")
			return { text: JSON.stringify({ knowledgeProjectId: access.project }) };
		expect(args.root).toBe("approved-vault");
		if (name === "files.ensureDirectory") return { created: true };
		if (name === "files.writeText") {
			writeApproval();
			const current = notes.get(args.path);
			expect(args.expectedHash).toBe(current === undefined ? null : digest(current));
			write(args.path, args.text);
		}
		if (name === "files.readText" || name === "files.writeText") {
			const text = notes.get(args.path);
			if (text === undefined) throw Object.assign(new Error("Synthetic missing note"), { code: "ENOENT" });
			return {
				text,
				sha256: digest(text),
				bytes: Buffer.byteLength(text),
				version: { mtimeMs: 1, ctimeMs: 1, size: Buffer.byteLength(text), ino: 1 },
			};
		}
		throw new Error(`Unexpected file capability ${name}`);
	}
	return { notes, access, writeApproval, write, call };
}

function modelBroker() {
	const decision = cleanReview();
	const approval = { allowed: true };
	const generate = vi.fn(async (input: PluginModelGenerateInput) => {
		const tool = { name: "structured_result", description: "Return JSON", parameters: input.resultSchema };
		expect(input.systemPrompt).toContain("Return only through structured_result");
		const reply = fauxAssistantMessage(fauxToolCall(tool.name, decision));
		const output = reply.content.find((block) => block.type === "toolCall");
		if (!output || output.name !== tool.name) throw new Error("Expected structured_result");
		return {
			selection: input.selection,
			value: validateToolArguments(tool, output),
			usage: { inputTokens: 40, outputTokens: 20, cost: null },
		};
	});
	const approve = vi.fn(() => {
		if (!approval.allowed) throw new Error("Synthetic model approval denied");
	});
	async function call(name: string, input: unknown): Promise<unknown> {
		if (name === "session.inspect") return { agentActive: false };
		if (name === "model.selection") return selection;
		if (name === "model.generate") {
			approve();
			return generate(input as PluginModelGenerateInput);
		}
		throw new Error(`Unexpected model capability ${name}`);
	}
	return { decision, approval, approve, generate, call };
}

async function resourceCall(name: string, input: unknown): Promise<unknown> {
	if (name === "resource.create") return { handle: "synthetic-index" };
	const args = input as { handle: string; operation: string };
	expect(args.handle).toBe("synthetic-index");
	if (name === "resource.invoke" && ["status", "changed"].includes(args.operation)) return { revision: 1 };
	throw new Error(`Unexpected resource capability ${name}`);
}

async function startRuntime(capabilities: PluginRuntimeContext["capabilities"], readOnly: boolean) {
	const signal = new AbortController().signal;
	const runtime = await createDesktopRuntime({
		applicationId: "model-review-verdict-test",
		signal,
		resources: [
			{ kind: "state", handle: "approved-state", access: readOnly ? "read" : "read-write" },
			{ kind: "files", handle: "approved-vault", access: "read-write" },
		],
		capabilities,
		events: { changed: vi.fn() },
		resourcesLifecycle: { dispose: async () => undefined },
	});
	const caller: PluginRuntimeContext = {
		scope: {
			kind: "session",
			sessionId: "synthetic-session",
			workspaceId: "synthetic-project",
			workspaceDirectory: "/synthetic-workspace",
		},
		signal,
		capabilities,
	};
	return { runtime, caller };
}

export async function verdictFixture(readOnly = false) {
	const candidates = [0, 1].map(proposal);
	const [candidate, other] = candidates;
	const state = stateBroker(candidates);
	const files = fileBroker();
	const model = modelBroker();
	async function call(name: string, input: unknown): Promise<unknown> {
		if (name === "agent.slot.acquire") return { lease: "synthetic-agent-slot" };
		if (name === "agent.slot.release") return { released: true };
		if (name.startsWith("state.")) return state.call(name, input);
		if (name.startsWith("model.") || name === "session.inspect") return model.call(name, input);
		if (name.startsWith("resource.")) return resourceCall(name, input);
		return files.call(name, input);
	}
	const { runtime, caller } = await startRuntime({ call }, readOnly);
	const input = {
		revision: binding.revision,
		id: candidate.id,
		expectedProposalHash: candidate.proposalHash,
		acknowledged: true,
		autoApply: true,
	};
	return {
		candidate,
		other,
		state,
		files,
		model,
		input,
		caller,
		review: (request: unknown = input, signal = caller.signal) =>
			runtime.operations.modelReview.execute(request, { ...caller, signal }),
		info: () => runtime.operations.modelReviewInfo.execute(input, caller),
		dispose: () => runtime.dispose(),
	};
}
