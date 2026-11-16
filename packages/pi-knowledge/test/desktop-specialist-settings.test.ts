import { createHash } from "node:crypto";
import type { PluginRuntimeContext } from "@gyoungwe/plugin-api/runtime";
import { Compile } from "typebox/compile";
import { afterEach, expect, it, vi } from "vitest";
import type { KnowledgeBinding } from "../src/core/config.js";
import createDesktopRuntime from "../src/desktop/runtime.js";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of closers.splice(0)) await close();
});

const binding: KnowledgeBinding = {
	version: 1,
	vault: "/synthetic-vault",
	vaultId: "a".repeat(24),
	revision: 7,
	profile: "hybrid",
	depositMode: "verified",
	subagentPolicy: "none",
	updatedAt: "2026-11-16T00:00:00.000Z",
};
const defaults = {
	mode: "automatic",
	revision: 0,
	maxRunsPerTurn: 4,
	maxRunsPerSession: 20,
	maxToolOperations: 80,
	concurrency: 2,
	maxConcurrency: 4,
	queueLimit: 8,
	queueWaitMs: 15000,
	timeoutMs: 120000,
	maxTokensPerTurn: 24000,
	maxTokensPerSession: 120000,
	maxCostPerTurn: 1,
	maxCostPerSession: 5,
};

function stateBroker(bound: boolean) {
	// Serialized synthetic documents exercise the broker's raw-byte CAS contract.
	const documents = new Map<string, string>();
	if (bound) documents.set("binding.json", JSON.stringify(binding));
	const version = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
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
				: { kind: "value", value: JSON.parse(bytes), version: version(bytes) };
		if (name === "state.writeJson") {
			expect(args.path).toBe("specialists.json");
			if (args.expectedVersion !== (bytes === undefined ? null : version(bytes)))
				throw new Error("State version changed");
			const saved = JSON.stringify(args.value);
			documents.set(args.path, saved);
			return { kind: "value", value: JSON.parse(saved), version: version(saved) };
		}
		throw new Error(`Unexpected capability ${name}`);
	});
	return { documents, capabilities: { call } };
}

async function fixture(canWriteState = true, bound = true) {
	const broker = stateBroker(bound);
	const changed = vi.fn();
	const signal = new AbortController().signal;
	const runtime = await createDesktopRuntime({
		applicationId: "specialist-settings-test",
		signal,
		resources: [{ kind: "state", handle: "approved-state", access: canWriteState ? "read-write" : "read" }],
		capabilities: broker.capabilities,
		events: { changed },
		resourcesLifecycle: { dispose: async () => undefined },
	});
	closers.push(() => runtime.dispose());
	const caller: PluginRuntimeContext = {
		scope: { kind: "application" },
		signal,
		capabilities: broker.capabilities,
	};
	async function invoke(name: string, input: unknown): Promise<unknown> {
		const operation = runtime.operations[name];
		if (!Compile(operation.inputSchema).Check(input)) throw new Error("Invalid operation input");
		const result = await operation.execute(input, caller);
		expect(Compile(operation.resultSchema).Check(result)).toBe(true);
		return result;
	}
	return {
		...broker,
		changed,
		runtime,
		read: () => invoke("specialistSettings", null),
		write: (input: unknown) => invoke("setSpecialistSettings", input),
		bytes: () => broker.documents.get("specialists.json"),
	};
}

const request = { mode: "manual", revision: 0, bindingRevision: binding.revision };

it("reads bounded defaults without creating a missing settings file", async () => {
	const f = await fixture();
	expect(f.runtime.operations.specialistSettings.effect).toBe("read");
	expect(f.runtime.operations.setSpecialistSettings.effect).toBe("write");
	expect(await f.read()).toEqual({ ...defaults, bindingRevision: 7, canWriteState: true });
	expect(f.bytes()).toBeUndefined();
	expect(f.changed).not.toHaveBeenCalled();
});

it("writes through the owner and returns the stored revision plus one on read-back", async () => {
	const f = await fixture();
	const saved = await f.write({ ...request, maxRunsPerTurn: 2, maxCostPerTurn: 0.25 });
	expect(saved).toEqual({
		...defaults,
		mode: "manual",
		revision: 1,
		maxRunsPerTurn: 2,
		maxCostPerTurn: 0.25,
		bindingRevision: 7,
		canWriteState: true,
	});
	expect(await f.read()).toEqual(saved);
	expect(JSON.parse(f.bytes() as string)).toEqual({
		...defaults,
		mode: "manual",
		revision: 1,
		maxRunsPerTurn: 2,
		maxCostPerTurn: 0.25,
	});
	expect(f.changed).toHaveBeenCalled();
});

it("serializes two writers with one revision and preserves the winner's bytes after refusal", async () => {
	const f = await fixture();
	const first = f.write({ ...request, maxRunsPerTurn: 2 });
	const second = f.write({ ...request, mode: "off" });
	const settled = Promise.allSettled([first, second]);
	await first;
	const bytes = f.bytes();
	const results = await settled;
	expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	expect(results[1]).toMatchObject({
		status: "rejected",
		reason: new Error("Specialist settings changed; refresh first"),
	});
	expect(f.bytes()).toBe(bytes);
	expect(await f.read()).toMatchObject({ mode: "manual", revision: 1, maxRunsPerTurn: 2 });
	expect(f.capabilities.call.mock.calls.filter(([name]) => name === "state.writeJson")).toHaveLength(1);
});

it("refuses a stale binding revision without changing stored bytes", async () => {
	const f = await fixture();
	f.documents.set("specialists.json", JSON.stringify(defaults));
	const bytes = f.bytes();
	await expect(f.write({ ...request, bindingRevision: 6 })).rejects.toThrow(
		"Knowledge binding changed; refresh settings",
	);
	expect(f.bytes()).toBe(bytes);
	expect(f.changed).not.toHaveBeenCalled();
});

it("reports read-only state and refuses writes without changing stored bytes", async () => {
	const f = await fixture(false);
	f.documents.set("specialists.json", JSON.stringify(defaults));
	const bytes = f.bytes();
	expect(await f.read()).toMatchObject({ canWriteState: false });
	await expect(f.write(request)).rejects.toThrow("Application-state write permission is required");
	expect(f.bytes()).toBe(bytes);
	expect(f.changed).not.toHaveBeenCalled();
});

it("refuses out-of-bounds values and unknown keys without changing stored bytes", async () => {
	const f = await fixture();
	f.documents.set("specialists.json", JSON.stringify(defaults));
	const bytes = f.bytes();
	for (const limits of [
		{ maxRunsPerTurn: 0 },
		{ maxRunsPerTurn: 5 },
		{ concurrency: 1.5 },
		{ queueWaitMs: 49 },
		{ maxCostPerSession: -1 },
		{ maxCostPerSession: 6 },
		{ maxConcurrency: 3 },
		{ unknown: true },
	]) {
		await expect(f.write({ ...request, ...limits })).rejects.toThrow("Invalid operation input");
		expect(f.bytes()).toBe(bytes);
	}
	expect(f.changed).not.toHaveBeenCalled();
});

it("propagates corrupt stored settings instead of returning defaults", async () => {
	const f = await fixture();
	f.documents.set("specialists.json", '{"mode":"invalid","revision":0}');
	const bytes = f.bytes();
	await expect(f.read()).rejects.toThrow("Invalid knowledge specialist settings");
	expect(f.bytes()).toBe(bytes);
	f.documents.set("specialists.json", "{");
	await expect(f.read()).rejects.toThrow(SyntaxError);
	expect(f.bytes()).toBe("{");
});

it("preserves the existing storage behavior that treats JSON null as missing settings", async () => {
	const f = await fixture();
	f.documents.set("specialists.json", "null");
	expect(await f.read()).toEqual({ ...defaults, bindingRevision: 7, canWriteState: true });
	expect(f.bytes()).toBe("null");
	expect(f.changed).not.toHaveBeenCalled();
});

it("reports null binding revision while unbound and refuses a write", async () => {
	const f = await fixture(true, false);
	expect(await f.read()).toEqual({ ...defaults, bindingRevision: null, canWriteState: true });
	await expect(f.write(request)).rejects.toThrow("Knowledge binding changed; refresh settings");
	expect(f.bytes()).toBeUndefined();
});

it("returns the owner's bounded view of existing settings without rewriting them", async () => {
	const f = await fixture();
	f.documents.set(
		"specialists.json",
		JSON.stringify({ mode: "off", revision: 3, maxRunsPerTurn: 99, maxCostPerSession: 99 }),
	);
	const bytes = f.bytes();
	expect(await f.read()).toEqual({
		...defaults,
		mode: "off",
		revision: 3,
		bindingRevision: 7,
		canWriteState: true,
	});
	expect(f.bytes()).toBe(bytes);
});
