import { createHash } from "node:crypto";
import type { PluginRuntimeContext } from "@gyoungwe/plugin-api/runtime";
import { Compile } from "typebox/compile";
import { afterEach, expect, it, vi } from "vitest";
import type { KnowledgeBinding } from "../src/core/config.js";
import { immutableWikiProposalHash } from "../src/core/wiki-policy.js";
import createDesktopRuntime from "../src/desktop/runtime.js";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of closers.splice(0)) await close();
});

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
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
const selection = { provider: "fixture", model: "reviewer", thinkingLevel: "off" };

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
	// Match the specialist settings harness: preserve serialized bytes across broker calls.
	const documents = new Map([
		["binding.json", JSON.stringify(binding)],
		[`${binding.vaultId}/wiki-review/pending/${candidate.id}.json`, JSON.stringify(candidate)],
	]);
	const call = vi.fn(async (name: string, input: unknown): Promise<unknown> => {
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
			if (args.expectedVersion !== (bytes === undefined ? null : digest(bytes)))
				throw new Error("State version changed");
			const saved = JSON.stringify(args.value);
			documents.set(args.path, saved);
			return { kind: "value", value: JSON.parse(saved), version: digest(saved) };
		}
		throw new Error(`Unexpected state capability ${name}`);
	});
	return { documents, call };
}

function reviewBroker(state: ReturnType<typeof stateBroker>) {
	const generate = vi.fn(async () => ({
		selection,
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
	}));
	async function call(name: string, input: unknown): Promise<unknown> {
		if (name.startsWith("state.")) return state.call(name, input);
		if (name === "session.inspect") return { agentActive: false };
		if (name === "model.selection") return selection;
		if (name === "model.generate") return generate();
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
	}
	return { generate, capabilities: { call } };
}

async function fixture() {
	const candidate = proposal();
	const state = stateBroker(candidate);
	const broker = reviewBroker(state);
	const signal = new AbortController().signal;
	const runtime = await createDesktopRuntime({
		applicationId: "model-review-settings-test",
		signal,
		resources: [{ kind: "state", handle: "approved-state", access: "read-write" }],
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
	async function review() {
		const operation = runtime.operations.modelReview;
		const input = {
			revision: binding.revision,
			id: candidate.id,
			expectedProposalHash: candidate.proposalHash,
			acknowledged: true,
			autoApply: false,
		};
		expect(Compile(operation.inputSchema).Check(input)).toBe(true);
		const result = await operation.execute(input, caller);
		expect(Compile(operation.resultSchema).Check(result)).toBe(true);
		return result;
	}
	return { ...broker, ...state, review, bytes: () => state.documents.get("specialists.json") };
}

it("refuses a persisted negative revision before foreground review without changing stored bytes", async () => {
	const f = await fixture();
	const bytes = '{\n  "mode": "automatic", "revision": -1\n}\n';
	f.documents.set("specialists.json", bytes);
	await expect(f.review()).rejects.toThrow("Invalid knowledge specialist settings");
	expect(f.bytes()).toBe(bytes);
	expect(f.generate).not.toHaveBeenCalled();
});

it("runs foreground review with automatic defaults when settings are missing", async () => {
	const f = await fixture();
	expect(await f.review()).toMatchObject({ verdict: "approve", applied: false });
	expect(f.generate).toHaveBeenCalledOnce();
	expect(f.bytes()).toBeUndefined();
});

it("runs foreground review in manual mode with a valid revision", async () => {
	const f = await fixture();
	const bytes = '{ "mode": "manual", "revision": 3 }\n';
	f.documents.set("specialists.json", bytes);
	expect(await f.review()).toMatchObject({ verdict: "approve", applied: false });
	expect(f.generate).toHaveBeenCalledOnce();
	expect(f.bytes()).toBe(bytes);
});

it.each([
	{
		label: "off mode",
		settings: { mode: "off", revision: 1 },
		error: "Knowledge model workers are disabled in settings",
	},
	{
		label: "an invalid mode",
		settings: { mode: "invalid", revision: 1 },
		error: "Invalid knowledge specialist settings",
	},
	{
		label: "a string revision",
		settings: { mode: "automatic", revision: "x" },
		error: "Invalid knowledge specialist settings",
	},
	{
		label: "an out-of-range limit",
		settings: { mode: "manual", revision: 1, maxRunsPerTurn: 0 },
		error: "Invalid knowledge specialist settings",
	},
])("refuses foreground review with $label without changing stored bytes", async ({ settings, error }) => {
	const f = await fixture();
	const bytes = `${JSON.stringify(settings, null, 2)}\n`;
	f.documents.set("specialists.json", bytes);
	await expect(f.review()).rejects.toThrow(error);
	expect(f.bytes()).toBe(bytes);
	expect(f.generate).not.toHaveBeenCalled();
});
