import { createHash } from "node:crypto";
import type {
	PluginModelGenerateInput,
	PluginModelSelection,
	PluginModelSelectionInput,
	PluginRuntimeContext,
} from "@gyoungwe/plugin-api/runtime";
import { afterEach, expect, it, vi } from "vitest";
import type { KnowledgeBinding } from "../src/core/config.js";
import { immutableWikiProposalHash } from "../src/core/wiki-policy.js";
import type { KnowledgeModelReviewInput } from "../src/desktop/contract.js";
import { parseModelReviewCommandInput } from "../src/desktop/model-review.js";
import createDesktopRuntime from "../src/desktop/runtime.js";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of closers.splice(0)) await close();
});

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const reviewerRequest = {
	optionalProfile: "knowledge-wiki-reviewer",
	inheritedThinking: "nearest-supported",
} as const;
const parentSelection: PluginModelSelection = {
	provider: "fixture",
	model: "parent",
	thinkingLevel: "off",
};
const reviewerSelection: PluginModelSelection = {
	...parentSelection,
	...reviewerRequest,
	thinkingLevel: "high",
};
const binding: KnowledgeBinding = {
	version: 1,
	vault: "/synthetic-vault",
	vaultId: "a".repeat(24),
	revision: 7,
	profile: "hybrid",
	depositMode: "verified",
	subagentPolicy: "read-local",
	updatedAt: "2026-11-16T00:00:00.000Z",
};
const sourcePath = "Library/Methods/source.md";
const sourceText = "# Synthetic source\nBounded assay evidence.\n";

function proposal() {
	const after =
		"# Finding\n\n<!-- pi-agent:managed:start -->\nBounded assay evidence.\n<!-- pi-agent:managed:end -->\n";
	const candidate = {
		id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
		status: "pending",
		vaultId: binding.vaultId,
		bindingRevision: binding.revision,
		project: "alpha",
		path: "Wiki/Finding.md",
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

function stateBroker(candidate: ReturnType<typeof proposal>) {
	const documents = new Map([
		["binding.json", JSON.stringify(binding)],
		[`${binding.vaultId}/wiki-review/pending/${candidate.id}.json`, JSON.stringify(candidate)],
	]);
	return vi.fn(async (name: string, input: unknown): Promise<unknown> => {
		const args = input as {
			root: string;
			path: string;
			value: unknown;
			expectedVersion: string | null;
		};
		expect(args.root).toBe("approved-state");
		const bytes = documents.get(args.path);
		if (name === "state.readJson")
			return bytes === undefined
				? { kind: "missing" }
				: { kind: "value", value: JSON.parse(bytes), version: digest(bytes) };
		if (name === "state.ensureDirectory") return { created: true };
		if (name === "state.writeJson") {
			expect(args.expectedVersion).toBe(bytes === undefined ? null : digest(bytes));
			const saved = JSON.stringify(args.value);
			documents.set(args.path, saved);
			return { kind: "value", value: JSON.parse(saved), version: digest(saved) };
		}
		throw new Error(`Unexpected state capability ${name}`);
	});
}

function generatedReview(input: PluginModelGenerateInput) {
	return {
		selection: input.selection,
		value: {
			summary: "The synthetic candidate is supported.",
			verdict: "approve",
			cautions: [],
			source_paths: [sourcePath],
			checks: {
				evidenceSupportsChanges: true,
				scopeAndUncertaintyPreserved: true,
				noUnresolvedContradictions: true,
				humanContentPreserved: true,
				noInstructionInjection: true,
			},
		},
		usage: { inputTokens: null, outputTokens: null, cost: null },
	};
}

function reviewBroker(state: ReturnType<typeof stateBroker>) {
	const selectionRequests: unknown[] = [];
	const resolveReviewer = vi.fn(async (): Promise<PluginModelSelection> => reviewerSelection);
	const generate = vi.fn(async (input: PluginModelGenerateInput) => generatedReview(input));
	const call = vi.fn(async (name: string, input: unknown): Promise<unknown> => {
		if (name.startsWith("state.")) return state(name, input);
		if (name === "session.inspect") return { agentActive: false };
		if (name === "model.selection") {
			selectionRequests.push(input);
			const request = input as PluginModelSelectionInput;
			return request.optionalProfile === reviewerRequest.optionalProfile ||
				request.profile === reviewerRequest.optionalProfile
				? resolveReviewer()
				: parentSelection;
		}
		if (name === "model.generate") return generate(input as PluginModelGenerateInput);
		const args = input as { root: string; path: string };
		if (name === "roots.resolve") {
			expect([binding.vault, "/synthetic-workspace"]).toContain(args.path);
			return { handle: args.path === binding.vault ? "approved-vault" : "approved-workspace" };
		}
		if (name === "files.readText") {
			if (args.root === "approved-workspace") {
				expect(args.path).toBe(".pi/research-workspace.json");
				return { text: JSON.stringify({ knowledgeProjectId: "alpha" }) };
			}
			expect(args.root).toBe("approved-vault");
			if (args.path === "Wiki/Finding.md")
				throw Object.assign(new Error("Synthetic target is missing"), { code: "ENOENT" });
			expect(args.path).toBe(sourcePath);
			return {
				text: sourceText,
				sha256: digest(sourceText),
				bytes: Buffer.byteLength(sourceText),
				version: { mtimeMs: 1, ctimeMs: 1, size: Buffer.byteLength(sourceText), ino: 1 },
			};
		}
		throw new Error(`Unexpected capability ${name}`);
	});
	return { selectionRequests, resolveReviewer, generate, capabilities: { call } };
}

async function fixture() {
	const candidate = proposal();
	const state = stateBroker(candidate);
	const broker = reviewBroker(state);
	const signal = new AbortController().signal;
	const runtime = await createDesktopRuntime({
		applicationId: "model-review-selection-test",
		signal,
		resources: [
			{ kind: "state", handle: "approved-state", access: "read-write" },
			{ kind: "files", handle: "approved-vault", access: "read-write" },
		],
		capabilities: broker.capabilities,
		events: { changed: vi.fn() },
		resourcesLifecycle: { dispose: async () => undefined },
	});
	closers.push(() => runtime.dispose());
	const caller: PluginRuntimeContext = {
		scope: {
			kind: "session",
			sessionId: "synthetic-session",
			workspaceId: "synthetic-project",
			workspaceDirectory: "/synthetic-workspace",
		},
		signal,
		capabilities: broker.capabilities,
	};
	const input = {
		id: candidate.id,
		expectedProposalHash: candidate.proposalHash,
	};
	return {
		...broker,
		info: (profile?: KnowledgeModelReviewInput["profile"]) =>
			runtime.operations.modelReviewInfo.execute({ ...input, revision: binding.revision, profile }, caller),
		review: (profile?: KnowledgeModelReviewInput["profile"], autoApply = false) =>
			runtime.operations.modelReview.execute(
				{
					revision: binding.revision,
					...parseModelReviewCommandInput(
						JSON.stringify({ ...input, acknowledged: true, autoApply, profile }),
					),
				},
				caller,
			),
	};
}

it("requests the same optional reviewer and inherited thinking policy for info with or without profile", async () => {
	const f = await fixture();
	for (const profile of [undefined, "knowledge-wiki-reviewer"] as const)
		expect(await f.info(profile)).toMatchObject({ selection: reviewerSelection });
	expect(f.selectionRequests).toEqual([reviewerRequest, reviewerRequest]);
});

it.each([undefined, "knowledge-wiki-reviewer"] as const)(
	"uses the host's unchanged thinking-only reviewer selection for command review with profile %s",
	async (profile) => {
		const f = await fixture();
		expect(await f.review(profile)).toMatchObject({ verdict: "approve", applied: false });
		expect(f.selectionRequests).toEqual(Array(4).fill(reviewerRequest));
		expect(f.generate).toHaveBeenCalledOnce();
		expect(f.generate.mock.calls[0][0].selection).toBe(reviewerSelection);
	},
);

it.each(["Configured reviewer is unavailable", "Explicit reviewer thinking is unsupported"])(
	"propagates host rejection without generation: %s",
	async (message) => {
		const f = await fixture();
		const error = new Error(message);
		f.resolveReviewer.mockRejectedValue(error);
		await expect(f.review()).rejects.toBe(error);
		expect(f.selectionRequests).toEqual([reviewerRequest]);
		expect(f.generate).not.toHaveBeenCalled();
	},
);

it.each([
	{ field: "thinkingLevel", change: { thinkingLevel: "low" } },
	{ field: "inheritedThinking", change: { inheritedThinking: undefined } },
	{ field: "optionalProfile", change: { optionalProfile: undefined } },
])("rejects a re-check changing only $field before applying", async ({ change }) => {
	const f = await fixture();
	f.generate.mockImplementationOnce(async (input) => {
		f.resolveReviewer.mockResolvedValue({ ...reviewerSelection, ...change });
		return generatedReview(input);
	});
	await expect(f.review("knowledge-wiki-reviewer", true)).rejects.toThrow("Model selection changed");
	expect(f.selectionRequests).toEqual(Array(4).fill(reviewerRequest));
	expect(f.generate).toHaveBeenCalledOnce();
	const calls = f.capabilities.call.mock.calls.map(([name]) => name);
	expect(calls).not.toContain("files.writeText");
	expect(calls).not.toContain("state.writeJson");
});
