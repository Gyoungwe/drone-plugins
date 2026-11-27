import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { expect, vi } from "vitest";
import type { InquiryWasmEngine } from "../src/ledger-owner.js";
import type { ArtifactRecord, ArtifactRerunRecord, AttemptRecord } from "../src/models.js";
import { createInquiryRuntimeWithEngine } from "../src/runtime.js";
import type { RerunExecutorPort } from "../src/runtime-rerun.js";
import type { ReadInput, WriteInput } from "../src/runtime-schema.js";
import { it, projectId, workspaceId } from "./helpers/ledger-owner-fixture.js";

const date = "2026-10-28T00:00:00.000Z";
const source: ArtifactRecord = {
	id: "source-artifact",
	schemaVersion: 2,
	projectId,
	location: "local",
	path: "runs/synthetic/source.tsv",
	bytes: 1,
	sha256: "a".repeat(64),
	source: { kind: "run", id: "synthetic-run" },
	purpose: "evidence",
	status: "valid",
	parentIds: [],
	runProvenance: { workflow: "synthetic" },
	createdAt: date,
	updatedAt: date,
};
const attempt: AttemptRecord = {
	id: "source-attempt",
	schemaVersion: 2,
	projectId,
	hypothesisIds: [],
	codeFingerprint: "synthetic-code",
	parameters: {},
	artifactIds: [source.id],
	outcome: "succeeded",
	enteredReport: false,
	startedAt: date,
};
const replacement: ArtifactRecord = {
	...source,
	id: "rerun-artifact",
	path: "runs/synthetic/rerun.tsv",
	sha256: "b".repeat(64),
	parentIds: [source.id],
};
const { sha256: _sha256, ...withoutDigest } = replacement;

async function startRuntime(
	engine: InquiryWasmEngine,
	ports: PluginRuntimeCapabilities,
	workspaceDirectory: string,
	signal: AbortSignal,
	rerunExecutor?: RerunExecutorPort,
) {
	const capabilities = { call: vi.fn(ports.call) };
	const changed = vi.fn();
	const context = {
		scope: {
			kind: "session" as const,
			workspaceId,
			workspaceDirectory,
			sessionId: "fixture-sdk",
		},
		capabilities,
		signal,
	};
	const runtime = await createInquiryRuntimeWithEngine(
		{ applicationId: "app", signal, resources: [], capabilities, events: { changed }, rerunExecutor },
		engine,
	);
	return {
		read: (input: ReadInput) => runtime.operations["inquiry.read"].execute(input, context),
		write: (input: WriteInput, callSignal = signal) =>
			runtime.operations["inquiry.write"].execute(input, { ...context, signal: callSignal }),
		dispose: runtime.dispose,
		capabilities,
		changed,
	};
}

type Runtime = Awaited<ReturnType<typeof startRuntime>>;
const test = it.extend<{ start: (port?: RerunExecutorPort) => Promise<Runtime> }>({
	start: async ({ ledger }, use) => {
		const runtimes: Runtime[] = [];
		try {
			await use(async (port) => {
				const runtime = await startRuntime(
					ledger.engine,
					ledger.ports,
					ledger.directory,
					ledger.controller.signal,
					port,
				);
				runtimes.push(runtime);
				return runtime;
			});
		} finally {
			for (const runtime of runtimes.reverse()) await runtime.dispose();
		}
	},
});

function executor() {
	return {
		submit: vi.fn<RerunExecutorPort["submit"]>().mockResolvedValue({ jobId: "test-job" }),
		collect: vi.fn<RerunExecutorPort["collect"]>().mockResolvedValue({ artifact: source }),
	};
}

function gate() {
	let open: () => void;
	const promise = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { promise, open: () => open() };
}

async function recordSource(runtime: Runtime): Promise<void> {
	await runtime.write({ action: "recordArtifact", record: { ...source } });
	await runtime.write({ action: "recordAttempt", record: { ...attempt } });
}

async function pendingRerun(runtime: Runtime): Promise<ArtifactRerunRecord> {
	const { value } = (await runtime.read({ action: "pendingReruns" })) as {
		value: readonly ArtifactRerunRecord[];
	};
	expect(value).toHaveLength(1);
	const [rerun] = value;
	if (!rerun) throw new Error("Expected a pending rerun");
	return rerun;
}

async function submitSource(runtime: Runtime): Promise<ArtifactRerunRecord> {
	await recordSource(runtime);
	await runtime.write({ action: "rerunArtifact", id: source.id });
	return pendingRerun(runtime);
}

test("rejects both rerun actions before accessing the ledger without an executor", async ({ start }) => {
	const port = executor();
	const runtime = await start();
	for (const action of ["rerunArtifact", "collectRerun"] as const) {
		await expect(runtime.write({ action, id: "missing" })).rejects.toThrow(
			"Native Inquiry capability is unavailable: rerun-executor",
		);
	}
	expect(runtime.capabilities.call).not.toHaveBeenCalled();
	expect(runtime.changed).not.toHaveBeenCalled();
	expect(port.submit).not.toHaveBeenCalled();
	await expect(runtime.read({ action: "pendingReruns" })).resolves.toMatchObject({ value: [] });
});

test("status lists the missing executor only when it is not injected", async ({ start }) => {
	const disabled = await start();
	const enabled = await start(executor());
	await expect(disabled.read({ action: "status" })).resolves.toMatchObject({
		unavailable: ["rerun-executor", "workspace-promotion-file-port"],
	});
	await expect(enabled.read({ action: "status" })).resolves.toMatchObject({
		unavailable: ["workspace-promotion-file-port"],
	});
});

test("submits once for repeated requests and leaves collection to a separate call", async ({ start }) => {
	const port = executor();
	const runtime = await start(port);
	await recordSource(runtime);
	runtime.changed.mockClear();
	const signal = new AbortController().signal;
	const request = { action: "rerunArtifact", id: source.id } as const;
	const first = await runtime.write(request, signal);
	expect(first).toMatchObject({
		value: { status: "submitted", jobId: "test-job", previousArtifactId: source.id },
		authority: "plugin-asserted-or-imported",
	});
	expect(runtime.changed).toHaveBeenCalledOnce();
	expect(await runtime.write(request)).toEqual(first);
	expect(port.submit).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ artifact: source, reproducibility: "reproducible" }),
		signal,
	);
	expect(port.collect).not.toHaveBeenCalled();
});

test("collects a submitted rerun and reads back a replacement through provenance", async ({ start }) => {
	const port = executor();
	port.collect.mockResolvedValue({ artifact: replacement });
	const runtime = await start(port);
	const rerun = await submitSource(runtime);
	const request = { action: "collectRerun", id: rerun.id } as const;
	const signal = new AbortController().signal;
	runtime.changed.mockClear();
	const result = await runtime.write(request, signal);
	expect(result).toMatchObject({
		value: { status: "superseded", artifactId: replacement.id, sha256: replacement.sha256 },
	});
	expect(runtime.changed).toHaveBeenCalledOnce();
	await expect(runtime.read({ action: "artifactProvenance", id: source.id })).resolves.toMatchObject({
		value: { rerun: { id: rerun.id, status: "superseded", resultArtifactId: replacement.id } },
	});
	await expect(runtime.read({ action: "artifactProvenance", id: replacement.id })).resolves.toMatchObject({
		value: { artifact: replacement },
	});
	await expect(runtime.read({ action: "pendingReruns" })).resolves.toMatchObject({ value: [] });
	expect(await runtime.write(request)).toEqual(result);
	expect(port.collect).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ id: rerun.id, status: "running" }),
		signal,
	);
});

const failures: readonly { name: string; collect: RerunExecutorPort["collect"]; error: string }[] = [
	{
		name: "an artifact without a digest",
		collect: async () => ({ artifact: withoutDigest as ArtifactRecord }),
		error: "Rerun artifact is missing a SHA-256 digest",
	},
	{
		name: "a malformed digest",
		collect: async () => ({ artifact: { ...replacement, sha256: "g".repeat(64) } }),
		error: "Rerun artifact is missing a SHA-256 digest",
	},
	{
		name: "invalid artifact lineage",
		collect: async () => ({ artifact: { ...replacement, parentIds: ["missing-parent"] } }),
		error: "Invalid artifact record: missing parent artifact: missing-parent",
	},
	{
		name: "an executor error result",
		collect: async () => ({ error: "Collection failed" }),
		error: "Collection failed",
	},
	{
		name: "an executor exception",
		collect: async () => {
			throw new Error("Collection rejected");
		},
		error: "Collection rejected",
	},
];

for (const failure of failures) {
	test(`records a terminal failure for ${failure.name}`, async ({ start }) => {
		const port = executor();
		port.collect.mockImplementation(failure.collect);
		const runtime = await start(port);
		const rerun = await submitSource(runtime);
		const request = { action: "collectRerun", id: rerun.id } as const;
		const result = await runtime.write(request);
		expect(result).toMatchObject({ value: { status: "failed", error: failure.error } });
		await expect(runtime.read({ action: "artifactProvenance", id: source.id })).resolves.toMatchObject({
			value: { artifact: { status: "valid" }, rerun: { status: "failed", error: failure.error } },
		});
		await expect(runtime.read({ action: "pendingReruns" })).resolves.toMatchObject({ value: [] });
		expect(await runtime.write(request)).toEqual(result);
		expect(port.collect).toHaveBeenCalledOnce();
	});
}

test("rejects an unknown rerun id without collecting", async ({ start }) => {
	const port = executor();
	const runtime = await start(port);
	await expect(runtime.write({ action: "collectRerun", id: "missing" })).rejects.toThrow(
		"Artifact rerun not found: missing",
	);
	expect(port.collect).not.toHaveBeenCalled();
});

test("returns the in-flight rerun without calling the port again", async ({ start }) => {
	const port = executor();
	const entered = gate();
	const release = gate();
	port.collect.mockImplementation(async () => {
		entered.open();
		await release.promise;
		return { artifact: source };
	});
	const runtime = await start(port);
	const rerun = await submitSource(runtime);
	const request = { action: "collectRerun", id: rerun.id } as const;
	runtime.changed.mockClear();
	const first = runtime.write(request);
	try {
		await Promise.race([entered.promise, first]);
		const second = runtime.write(request);
		const current = await Promise.race([second, new Promise((resolve) => setImmediate(resolve, "queued"))]);
		expect(current).toMatchObject({ value: { status: "running", jobId: rerun.jobId } });
		expect(port.collect).toHaveBeenCalledOnce();
		expect(runtime.changed).not.toHaveBeenCalled();
	} finally {
		release.open();
		await first;
	}
	await expect(first).resolves.toMatchObject({ value: { status: "reproduced" } });
	expect(runtime.changed).toHaveBeenCalledOnce();
	await expect(runtime.write(request)).resolves.toEqual(await first);
	expect(port.collect).toHaveBeenCalledOnce();
});

for (const status of ["submitted", "running"]) {
	test(`resumes a ${status} rerun after reopening only when explicitly asked`, async ({ start }) => {
		const initialPort = executor();
		const first = await start(initialPort);
		const submitted = await submitSource(first);
		if (status === "running") await first.write({ action: "markRerunRunning", id: submitted.id });
		await first.dispose();
		expect(initialPort.collect).not.toHaveBeenCalled();
		const recoveredPort = executor();
		const reopened = await start(recoveredPort);
		const pending = await pendingRerun(reopened);
		expect(pending).toMatchObject({ id: submitted.id, status });
		const methods = reopened.capabilities.call.mock.calls.map(([method]) => method);
		expect(methods).not.toContain("state.writeBinary");
		expect(methods).not.toContain("state.writeJson");
		expect(recoveredPort.submit).not.toHaveBeenCalled();
		expect(recoveredPort.collect).not.toHaveBeenCalled();
		await expect(reopened.write({ action: "collectRerun", id: pending.id })).resolves.toMatchObject({
			value: { status: "reproduced", jobId: submitted.jobId },
		});
		expect(recoveredPort.collect).toHaveBeenCalledOnce();
	});
}
