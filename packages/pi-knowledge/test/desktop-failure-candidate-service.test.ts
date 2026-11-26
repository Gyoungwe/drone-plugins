import { createHash } from "node:crypto";
import type { PluginRuntimeContext } from "@gyoungwe/plugin-api/runtime";
import { afterEach, expect, it, vi } from "vitest";
import createDesktopRuntime from "../src/desktop/runtime.js";

const vaultId = "0123456789abcdef01234567";
const path = `failure-candidates/${vaultId}/project-a.json`;
const experiencePath = `experience/${vaultId}/project-a.json`;
const binding = {
	version: 1,
	revision: 1,
	vaultId,
	vault: "/synthetic-vault",
	profile: "hybrid",
	depositMode: "verified",
	subagentPolicy: "none",
	updatedAt: "2026-11-26T00:00:00.000Z",
};
const input = {
	failureCode: "source-changed-mid-read",
	subject: "Source lookup",
	scopeKind: "project",
	summary: "The local source changed while it was being read.",
	provenance: { sourcePlugin: "drone-pi-research", producer: "evidence-loop", receiptId: "receipt-1" },
};
const navigation = {
	navigationOnly: true,
	evidenceEligible: false,
	instructionEligible: false,
	authorityEligible: false,
	status: "candidate",
};
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of closers.splice(0)) await close();
});

function versionOf(value: unknown, padding = ""): string {
	return createHash("sha256")
		.update(`${JSON.stringify(value, null, 2)}\n${padding}`)
		.digest("hex");
}

function mockBroker() {
	const entries = new Map<string, unknown>([
		["binding.json", binding],
		[experiencePath, { untouched: true }],
	]);
	const options = { padding: "", brokenJson: false, staleWriteReadback: false };
	const directories = new Set<string>();
	const call = vi.fn(async (name: string, raw: unknown): Promise<unknown> => {
		const request = raw as { root: string; path: string; value?: unknown; expectedVersion?: string | null };
		if (name === "roots.resolve") return { handle: "workspace" };
		if (
			name === "files.readText" &&
			request.root === "workspace" &&
			request.path === ".pi/research-workspace.json"
		)
			return { text: '{"knowledgeProjectId":"project-a"}' };
		if (request.root !== "state") throw new Error("State handle was not granted");
		if (name === "state.readJson") {
			if (request.path === path && options.brokenJson)
				throw Object.assign(new Error("Host JSON parser encountered broken state"), {
					code: "ESTATECORRUPTED",
				});
			const value = entries.get(request.path);
			return value === undefined
				? { kind: "missing", version: null }
				: { kind: "value", value: structuredClone(value), version: versionOf(value, options.padding) };
		}
		if (name === "state.ensureDirectory") {
			directories.add(request.path);
			return { created: true };
		}
		if (name === "state.writeJson") {
			const parent = request.path.split("/").slice(0, -1).join("/");
			if (!directories.has(parent)) throw new Error("State write parent is missing");
			const current = entries.get(request.path);
			if ((current === undefined ? null : versionOf(current)) !== request.expectedVersion)
				throw Object.assign(new Error("State version conflict"), { code: "ESTATECONFLICT" });
			entries.set(request.path, structuredClone(request.value));
			return {
				kind: "value",
				value: options.staleWriteReadback ? current : request.value,
				version: versionOf(request.value),
			};
		}
		throw new Error(`Capability not provided: ${name}`);
	});
	return { capabilities: { call }, call, entries, options };
}

async function fixture(broker = mockBroker()) {
	const { capabilities } = broker;
	const signal = new AbortController().signal;
	const runtime = await createDesktopRuntime({
		applicationId: "failure-candidate-test",
		resourcesLifecycle: { dispose: async () => undefined },
		resources: [{ kind: "state", handle: "state", access: "read-write" }],
		signal,
		capabilities,
		events: { changed: () => undefined },
	});
	closers.push(() => runtime.dispose());
	const context: PluginRuntimeContext = {
		scope: {
			kind: "session",
			workspaceId: "workspace-id",
			workspaceDirectory: "/workspace",
			sessionId: "session",
		},
		capabilities,
		signal,
	};
	const { recordFailureCandidate, queryFailureCandidates } = runtime.operations;
	return {
		...broker,
		context,
		record: (value: unknown, call = context) => recordFailureCandidate.execute(value, call),
		query: (value: unknown = {}, call = context) => queryFailureCandidates.execute(value, call),
		effects: [recordFailureCandidate.effect, queryFailureCandidates.effect],
	};
}

it("registers read and write operations and persists the candidate through scoped broker state", async () => {
	const service = await fixture();
	expect(service.effects).toEqual(["write", "read"]);
	expect(await service.query()).toEqual({ revision: 0, candidates: [] });
	expect(await service.record(input)).toMatchObject({
		classification: "created",
		revision: 1,
		candidate: navigation,
	});
	const reopened = await fixture(service);
	expect(await reopened.query({ limit: 1 })).toMatchObject({
		revision: 1,
		candidates: [{ subject: input.subject, ...navigation }],
	});
	expect(await service.record(input)).toMatchObject({ classification: "duplicate", revision: 1 });
	expect(service.call.mock.calls.filter(([name]) => name === "state.ensureDirectory")).toEqual([
		["state.ensureDirectory", { root: "state", path: "failure-candidates" }],
		["state.ensureDirectory", { root: "state", path: `failure-candidates/${vaultId}` }],
	]);
	expect(service.call.mock.calls.filter(([name]) => name === "state.writeJson")).toEqual([
		["state.writeJson", { root: "state", path, expectedVersion: null, value: service.entries.get(path) }],
	]);
	expect(service.entries.get(experiencePath)).toEqual({ untouched: true });
	expect(service.call.mock.calls.map(([, value]) => value)).not.toContainEqual({
		root: "state",
		path: experiencePath,
	});
});

it("rejects extra payload fields, path claims and malformed provenance before calling the broker", async () => {
	const service = await fixture();
	for (const value of [
		{ ...input, stdout: "raw process output" },
		{ ...input, vaultId },
		{ ...input, project: "project-b" },
		{ ...input, authorityEligible: true },
		{ ...input, provenance: { ...input.provenance, receiptId: "" } },
		{ ...input, provenance: { ...input.provenance, sourcePlugin: "drone-pi-core" } },
	]) {
		await expect(service.record(value)).rejects.toThrow("Invalid failure-candidate input");
	}
	for (const value of [{ limit: 17 }, { limit: 1.5 }, { limit: 0 }, { project: "project-b" }, null]) {
		await expect(service.query(value)).rejects.toThrow("Invalid failure-candidate query");
	}
	expect(service.call).not.toHaveBeenCalled();
});

it("rejects calls without a workspace project or active Vault binding", async () => {
	const service = await fixture();
	await expect(service.record(input, { ...service.context, scope: { kind: "application" } })).rejects.toThrow(
		"Failure candidates require a workspace project",
	);
	service.entries.delete("binding.json");
	await expect(service.query()).rejects.toThrow("Failure candidates require a bound Vault");
	expect(service.entries.has(path)).toBe(false);
});

it("fails closed on corrupt JSON and byte versions that do not match the bounded encoding", async () => {
	const service = await fixture();
	await service.record(input);
	service.options.padding = " ".repeat(256 * 1024);
	await expect(service.query()).rejects.toThrow("Corrupt failure-candidate document");
	service.options.padding = "";
	service.options.brokenJson = true;
	await expect(service.record(input)).rejects.toThrow("Corrupt failure-candidate document");
});

it("refuses to acknowledge a write with mismatched readback", async () => {
	const service = await fixture();
	service.options.staleWriteReadback = true;
	await expect(service.record(input)).rejects.toThrow("Knowledge state write could not be read back");
	expect(service.call.mock.calls.filter(([name]) => name === "state.writeJson")).toHaveLength(1);
});
