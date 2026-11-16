import { createHash } from "node:crypto";
import type { PluginModelGenerateInput, PluginRuntimeContext } from "@gyoungwe/plugin-api/runtime";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { KnowledgeBinding } from "../src/core/config.js";
import { immutableWikiProposalHash } from "../src/core/wiki-policy.js";
import createDesktopRuntime from "../src/desktop/runtime.js";

const closers: (() => Promise<void>)[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
	try {
		for (const close of closers.splice(0)) await close();
	} finally {
		vi.useRealTimers();
	}
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

function deferred<T>() {
	let resolve: (value: T) => void;
	let reject: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve: (value: T) => resolve(value), reject: (reason: unknown) => reject(reason) };
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

function stateBroker(candidates: ReturnType<typeof proposal>[]) {
	const documents = new Map([["binding.json", JSON.stringify(binding)]]);
	for (const candidate of candidates)
		documents.set(`${binding.vaultId}/wiki-review/pending/${candidate.id}.json`, JSON.stringify(candidate));
	return async (name: string, input: unknown): Promise<unknown> => {
		const args = input as { root: string; path: string; value: unknown; expectedVersion: string | null };
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
	};
}

function fileBroker() {
	const project = vi.fn(async () => ({ text: JSON.stringify({ knowledgeProjectId: "alpha" }) }));
	async function call(name: string, input: unknown): Promise<unknown> {
		const args = input as { root: string; path: string };
		if (name === "roots.resolve") {
			expect([binding.vault, "/synthetic-workspace"]).toContain(args.path);
			return { handle: args.path === binding.vault ? "approved-vault" : "approved-workspace" };
		}
		if (name === "files.readText") {
			if (args.root === "approved-workspace") {
				expect(args.path).toBe(".pi/research-workspace.json");
				return project();
			}
			expect(args.root).toBe("approved-vault");
			if (args.path.startsWith("Wiki/Finding-"))
				throw Object.assign(new Error("Synthetic target is missing"), { code: "ENOENT" });
			expect(args.path).toBe(sourcePath);
			return {
				text: sourceText,
				sha256: digest(sourceText),
				bytes: Buffer.byteLength(sourceText),
				version: { mtimeMs: 1, ctimeMs: 1, size: Buffer.byteLength(sourceText), ino: 1 },
			};
		}
		throw new Error(`Unexpected file capability ${name}`);
	}
	return { project, call };
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

function pendingGeneration(input: PluginModelGenerateInput, signal?: AbortSignal) {
	const completion = deferred<ReturnType<typeof generatedReview>>();
	const abort = () => completion.reject(signal?.reason);
	if (signal?.aborted) abort();
	else signal?.addEventListener("abort", abort, { once: true });
	return {
		...completion,
		input,
		signal,
		promise: completion.promise.finally(() => signal?.removeEventListener("abort", abort)),
	};
}

function reviewBroker(candidates: ReturnType<typeof proposal>[]) {
	const state = stateBroker(candidates);
	const files = fileBroker();
	const generations: ReturnType<typeof pendingGeneration>[] = [];
	const call = vi.fn(async (name: string, input: unknown, signal?: AbortSignal): Promise<unknown> => {
		if (name.startsWith("state.")) return state(name, input);
		if (name === "session.inspect") return { agentActive: false };
		if (name === "model.selection") return selection;
		if (name === "model.generate") {
			const generation = pendingGeneration(input as PluginModelGenerateInput, signal);
			generations.push(generation);
			return generation.promise;
		}
		return files.call(name, input);
	});
	return { capabilities: { call }, generations, project: files.project };
}

async function fixture() {
	const candidates = [0, 1, 2].map(proposal);
	const broker = reviewBroker(candidates);
	const signal = new AbortController().signal;
	const runtime = await createDesktopRuntime({
		applicationId: "model-review-limits-test",
		signal,
		resources: [
			{ kind: "state", handle: "approved-state", access: "read-write" },
			{ kind: "files", handle: "approved-vault", access: "read-write" },
		],
		capabilities: broker.capabilities,
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
		capabilities: broker.capabilities,
	};
	const tasks: Promise<unknown>[] = [];
	const input = (index: number) => ({
		revision: binding.revision,
		id: candidates[index].id,
		expectedProposalHash: candidates[index].proposalHash,
		acknowledged: true,
		autoApply: false,
	});
	function review(index: number, cancellation = new AbortController()) {
		const result = runtime.operations.modelReview.execute(input(index), {
			...caller,
			signal: cancellation.signal,
		});
		tasks.push(result.catch(() => undefined));
		return result;
	}
	closers.push(async () => {
		for (const generation of broker.generations) generation.reject(new Error("Fixture closed"));
		await Promise.all(tasks);
		await runtime.dispose();
	});
	return {
		...broker,
		review,
		info: () => runtime.operations.modelReviewInfo.execute(input(0), caller),
		finish: (index: number) =>
			broker.generations[index].resolve(generatedReview(broker.generations[index].input)),
	};
}

it("rejects a third public review without any capability call and admits a replacement after success", async () => {
	const f = await fixture();
	const first = f.review(0);
	const second = f.review(1);
	await vi.advanceTimersByTimeAsync(0);
	expect(f.generations).toHaveLength(2);
	const callsBeforeThird = f.capabilities.call.mock.calls.length;
	const rejected = vi.fn();
	const third = f.review(2).catch(rejected);
	await vi.advanceTimersByTimeAsync(0);
	expect(rejected).toHaveBeenCalledExactlyOnceWith(
		new Error("Model review is already running; wait or cancel it"),
	);
	await third;
	expect(f.capabilities.call.mock.calls.slice(callsBeforeThird)).toEqual([]);
	expect(await f.info()).toMatchObject({ selection });
	f.finish(0);
	expect(await first).toMatchObject({ verdict: "approve", applied: false });
	const replacement = f.review(2);
	await vi.advanceTimersByTimeAsync(0);
	expect(f.generations).toHaveLength(3);
	f.finish(1);
	f.finish(2);
	await Promise.all([second, replacement]);
	expect(vi.getTimerCount()).toBe(0);
});

it("aborts host generation at 120 seconds without persisting or applying a review", async () => {
	const f = await fixture();
	const review = f.review(0);
	await vi.advanceTimersByTimeAsync(0);
	expect(f.generations).toHaveLength(1);
	const signal = f.generations[0].signal;
	await vi.advanceTimersByTimeAsync(119_999);
	expect(signal?.aborted).toBe(false);
	await vi.advanceTimersByTimeAsync(1);
	expect(signal?.aborted).toBe(true);
	await expect(review).rejects.toMatchObject({ name: "AbortError" });
	const calls = f.capabilities.call.mock.calls.map(([name]) => name);
	expect(calls).not.toContain("files.writeText");
	expect(calls).not.toContain("state.writeJson");
	expect(vi.getTimerCount()).toBe(0);
});

it.each(["generation rejection", "caller cancellation"])("releases a slot after %s", async (failure) => {
	const f = await fixture();
	const cancellation = new AbortController();
	const failed = f.review(0, cancellation);
	const peer = f.review(1);
	await vi.advanceTimersByTimeAsync(0);
	expect(f.generations).toHaveLength(2);
	const error = new Error("Synthetic review failure");
	if (failure === "caller cancellation") {
		cancellation.abort(error);
		expect(f.generations[0].signal?.aborted).toBe(true);
		expect(f.generations[0].signal?.reason).toBe(error);
	} else f.generations[0].reject(error);
	await expect(failed).rejects.toBe(error);
	expect(vi.getTimerCount()).toBe(1);
	const replacement = f.review(2);
	await vi.advanceTimersByTimeAsync(0);
	expect(f.generations).toHaveLength(3);
	f.finish(1);
	f.finish(2);
	await Promise.all([peer, replacement]);
	expect(vi.getTimerCount()).toBe(0);
});

it("releases the slot and timer when project resolution rejects", async () => {
	const f = await fixture();
	const peer = f.review(0);
	await vi.advanceTimersByTimeAsync(0);
	const error = new Error("Synthetic project read failure");
	f.project.mockRejectedValueOnce(error);
	await expect(f.review(1)).rejects.toBe(error);
	expect(vi.getTimerCount()).toBe(1);
	const replacement = f.review(2);
	await vi.advanceTimersByTimeAsync(0);
	expect(f.generations).toHaveLength(2);
	f.finish(0);
	f.finish(1);
	await Promise.all([peer, replacement]);
	expect(vi.getTimerCount()).toBe(0);
});

it.each(["deadline", "caller cancellation"])("covers pending project resolution with %s", async (cause) => {
	const f = await fixture();
	const project = deferred<{ text: string }>();
	f.project.mockImplementationOnce(() => project.promise);
	const cancellation = new AbortController();
	const rejected = vi.fn();
	const review = f.review(0, cancellation).catch(rejected);
	try {
		await vi.advanceTimersByTimeAsync(0);
		expect(f.project).toHaveBeenCalledOnce();
		if (cause === "deadline") await vi.advanceTimersByTimeAsync(120_000);
		else {
			cancellation.abort();
			await vi.advanceTimersByTimeAsync(0);
		}
		expect(rejected).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: "AbortError" }));
		await review;
		expect(vi.getTimerCount()).toBe(0);
		const callsBeforeResolution = f.capabilities.call.mock.calls.length;
		project.resolve({ text: JSON.stringify({ knowledgeProjectId: "alpha" }) });
		await vi.advanceTimersByTimeAsync(0);
		expect(f.capabilities.call.mock.calls.slice(callsBeforeResolution)).toEqual([]);
		expect(f.generations).toHaveLength(0);
	} finally {
		project.resolve({ text: JSON.stringify({ knowledgeProjectId: "alpha" }) });
		await vi.advanceTimersByTimeAsync(0);
	}
});

it("includes project resolution time in the generation deadline", async () => {
	const f = await fixture();
	const project = deferred<{ text: string }>();
	f.project.mockImplementationOnce(() => project.promise);
	const review = f.review(0);
	try {
		await vi.advanceTimersByTimeAsync(60_000);
		expect(f.generations).toHaveLength(0);
		project.resolve({ text: JSON.stringify({ knowledgeProjectId: "alpha" }) });
		await vi.advanceTimersByTimeAsync(0);
		expect(f.generations).toHaveLength(1);
		const signal = f.generations[0].signal;
		await vi.advanceTimersByTimeAsync(59_999);
		expect(signal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(signal?.aborted).toBe(true);
		await expect(review).rejects.toMatchObject({ name: "AbortError" });
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		project.resolve({ text: JSON.stringify({ knowledgeProjectId: "alpha" }) });
		await vi.advanceTimersByTimeAsync(0);
	}
});
