import type { PluginNativeRuntimeFactory } from "@gyoungwe/plugin-api/native";
import type { PluginRuntimeCapabilities, PluginRuntimeFactoryContext } from "@gyoungwe/plugin-api/runtime";
import { expect, vi } from "vitest";
import type { InquiryWasmEngine } from "../src/ledger-owner.js";
import type { ArtifactRecord, ArtifactRerunResult, AttemptRecord } from "../src/models.js";
import { createInquiryRuntimeWithEngine } from "../src/runtime.js";
import type { RerunExecutorPort } from "../src/runtime-rerun.js";
import type { ReadInput, WriteInput } from "../src/runtime-schema.js";
import { it as base, projectId, workspaceId } from "./helpers/ledger-owner-fixture.js";

const at = "2026-10-28T00:00:00.000Z";
const source: ArtifactRecord = {
	id: "source-artifact",
	schemaVersion: 2,
	projectId,
	location: "local",
	path: "runs/source.tsv",
	bytes: 1,
	sha256: "a".repeat(64),
	source: { kind: "run", id: "source-run" },
	purpose: "evidence",
	status: "valid",
	parentIds: [],
	runProvenance: { workflow: "synthetic" },
	createdAt: at,
	updatedAt: at,
};
const attempt: AttemptRecord = {
	id: "source-attempt",
	schemaVersion: 2,
	projectId,
	hypothesisIds: [],
	codeFingerprint: "source-code",
	parameters: {},
	artifactIds: [source.id],
	outcome: "succeeded",
	enteredReport: false,
	startedAt: at,
};
type HostCall = (input: unknown, signal?: AbortSignal) => Promise<unknown>;

async function startRuntime(
	engine: InquiryWasmEngine,
	ports: PluginRuntimeCapabilities,
	directory: string,
	signal: AbortSignal,
	options: { hostRerunCapability?: boolean; rerunExecutor?: RerunExecutorPort; hostCall?: HostCall } = {},
) {
	let databaseWrites = 0;
	const capabilities = {
		call: vi.fn(async (name: string, input: unknown, callSignal?: AbortSignal) => {
			if (name === "inquiry.rerun") return options.hostCall?.(input, callSignal);
			if (name === "state.writeJson" || name === "state.writeBinary") databaseWrites++;
			return ports.call(name, input, callSignal);
		}),
	};
	const changed = vi.fn(),
		factoryContext = {
			applicationId: "app",
			signal,
			resources: [],
			capabilities,
			events: { changed },
			...(options.hostRerunCapability === undefined
				? {}
				: { hostRerunCapability: options.hostRerunCapability }),
			...(options.rerunExecutor ? { rerunExecutor: options.rerunExecutor } : {}),
		},
		runtime = await createInquiryRuntimeWithEngine(factoryContext, engine),
		callContext = {
			scope: {
				kind: "session" as const,
				workspaceId,
				workspaceDirectory: directory,
				sessionId: "fixture-sdk",
			},
			capabilities,
			signal,
		};
	return {
		read: (input: ReadInput) => runtime.operations["inquiry.read"].execute(input, callContext),
		write: (input: WriteInput, callSignal = signal) =>
			runtime.operations["inquiry.write"].execute(input, { ...callContext, signal: callSignal }),
		dispose: runtime.dispose,
		capabilities,
		changed,
		get databaseWrites() {
			return databaseWrites;
		},
	};
}

type Runtime = Awaited<ReturnType<typeof startRuntime>>;
const test = base.extend<{ start: (options?: Parameters<typeof startRuntime>[4]) => Promise<Runtime> }>({
	start: async ({ ledger }, use) => {
		const runtimes: Runtime[] = [];
		try {
			await use(async (options) => {
				const runtime = await startRuntime(
					ledger.engine,
					ledger.ports,
					ledger.directory,
					ledger.controller.signal,
					options,
				);
				runtimes.push(runtime);
				return runtime;
			});
		} finally {
			for (const runtime of runtimes.reverse()) await runtime.dispose();
		}
	},
});

test("the standard Desktop factory enables its declared host rerun capability", async ({ ledger }) => {
	const { default: factory } = (await import(new URL("../dist/runtime.mjs", import.meta.url).href)) as {
		default: PluginNativeRuntimeFactory;
	};
	const context: PluginRuntimeFactoryContext = {
		applicationId: "app",
		signal: ledger.controller.signal,
		resources: [],
		capabilities: ledger.ports,
		events: { changed: vi.fn() },
	};
	const runtime = await factory(context);
	const callContext = {
		scope: {
			kind: "session" as const,
			workspaceId,
			workspaceDirectory: ledger.directory,
			sessionId: "fixture-sdk",
		},
		capabilities: ledger.ports,
		signal: ledger.controller.signal,
	};
	try {
		await expect(
			runtime.operations["inquiry.read"].execute({ action: "status" }, callContext),
		).resolves.toMatchObject({
			unavailable: ["workspace-promotion-file-port"],
		});
	} finally {
		await runtime.dispose();
	}
});

async function recordSource(runtime: Runtime) {
	await runtime.write({ action: "recordArtifact", record: recordValue(source) });
	await runtime.write({ action: "recordAttempt", record: recordValue(attempt) });
}

function recordValue(value: object): Record<string, unknown> {
	const record: Record<string, unknown> = {};
	for (const [key, field] of Object.entries(value)) record[key] = field;
	return record;
}

function hostResult(status: ArtifactRerunResult["status"]): ArtifactRerunResult {
	return {
		status,
		jobId: `job-${status}`,
		previousArtifactId: source.id,
		previousSha256: source.sha256,
		...(status === "reproduced" ? { artifactId: "replacement", sha256: "b".repeat(64) } : {}),
	};
}

test("status distinguishes the managed host capability from native CLI", async ({ start }) => {
	const managed = await start({ hostRerunCapability: true });
	const native = await start({ hostRerunCapability: false });
	await expect(managed.read({ action: "status" })).resolves.toMatchObject({
		unavailable: ["workspace-promotion-file-port"],
	});
	await expect(native.read({ action: "status" })).resolves.toMatchObject({
		unavailable: ["rerun-executor", "workspace-promotion-file-port"],
	});
});

test("preflight rejects missing and non-reproducible artifacts before host approval", async ({ start }) => {
	const hostCall = vi.fn<HostCall>().mockResolvedValue(hostResult("submitted"));
	const runtime = await start({ hostRerunCapability: true, hostCall });
	await expect(runtime.write({ action: "rerunArtifact", id: "missing" })).rejects.toThrow(
		"Artifact not found: missing",
	);
	await runtime.write({ action: "recordArtifact", record: recordValue(source) });
	await expect(runtime.write({ action: "rerunArtifact", id: source.id })).rejects.toThrow(
		"Artifact is not reproducible",
	);
	expect(hostCall).not.toHaveBeenCalled();
});

for (const status of ["submitted", "reproduced", "superseded", "failed"] as const)
	test(`stores a host rerun result with status ${status} after external approval`, async ({ start }) => {
		let writesAtCall = -1;
		let runtime: Runtime;
		const hostCall = vi.fn<HostCall>(async () => {
			writesAtCall = runtime.databaseWrites;
			return hostResult(status);
		});
		runtime = await start({ hostRerunCapability: true, hostCall });
		await recordSource(runtime);
		const before = runtime.databaseWrites;
		await expect(runtime.write({ action: "rerunArtifact", id: source.id })).resolves.toMatchObject({
			value: hostResult(status),
		});
		expect(writesAtCall).toBe(before);
		expect(runtime.databaseWrites).toBeGreaterThan(before);
		expect(hostCall).toHaveBeenCalledOnce();
		expect(hostCall).toHaveBeenCalledWith(
			expect.objectContaining({
				artifactId: source.id,
				provenance: expect.objectContaining({ artifact: source }),
			}),
			expect.any(AbortSignal),
		);
		if (status === "superseded")
			await expect(runtime.read({ action: "artifactProvenance", id: source.id })).resolves.toMatchObject({
				value: { artifact: { status: "superseded" }, rerun: { status: "superseded" } },
			});
	});

test("returns an active rerun without a second host call", async ({ start }) => {
	const hostCall = vi.fn<HostCall>().mockResolvedValue(hostResult("submitted"));
	const runtime = await start({ hostRerunCapability: true, hostCall });
	await recordSource(runtime);
	const first = await runtime.write({ action: "rerunArtifact", id: source.id });
	await expect(runtime.write({ action: "rerunArtifact", id: source.id })).resolves.toEqual(first);
	expect(hostCall).toHaveBeenCalledOnce();
});

test("host denial remains retryable without ledger writes", async ({ start }) => {
	let deny = true;
	const hostCall = vi.fn<HostCall>(async () => {
		if (deny) throw new Error("Plugin capability denied: inquiry.rerun");
		return hostResult("submitted");
	});
	const runtime = await start({ hostRerunCapability: true, hostCall });
	await recordSource(runtime);
	const before = runtime.databaseWrites;
	await expect(runtime.write({ action: "rerunArtifact", id: source.id })).rejects.toThrow(
		"Plugin capability denied: inquiry.rerun",
	);
	expect(runtime.databaseWrites).toBe(before);
	await expect(runtime.read({ action: "status" })).resolves.not.toMatchObject({
		unavailable: expect.arrayContaining(["rerun-executor"]),
	});
	deny = false;
	await expect(runtime.write({ action: "rerunArtifact", id: source.id })).resolves.toMatchObject({
		value: { status: "submitted" },
	});
	expect(hostCall).toHaveBeenCalledTimes(2);
});

test("a missing host capability changes status without ledger writes", async ({ start }) => {
	const absent = await start({
		hostRerunCapability: true,
		hostCall: vi
			.fn<HostCall>()
			.mockRejectedValue(new Error("Plugin capability is not registered: inquiry.rerun")),
	});
	await recordSource(absent);
	const before = absent.databaseWrites;
	await expect(absent.write({ action: "rerunArtifact", id: source.id })).rejects.toThrow(
		"Native Inquiry capability is unavailable: rerun-executor",
	);
	expect(absent.databaseWrites).toBe(before);
	await expect(absent.read({ action: "status" })).resolves.toMatchObject({
		unavailable: expect.arrayContaining(["rerun-executor"]),
	});
	expect(absent.changed).toHaveBeenCalled();
});

test("rejects malformed host results without writing and keeps collectRerun executor-only", async ({
	start,
}) => {
	const invalid = { ...hostResult("submitted"), previousSha256: "wrong" };
	const hostCall = vi.fn<HostCall>().mockResolvedValue(invalid);
	const runtime = await start({ hostRerunCapability: true, hostCall });
	await recordSource(runtime);
	const before = runtime.databaseWrites;
	await expect(runtime.write({ action: "rerunArtifact", id: source.id })).rejects.toThrow();
	expect(runtime.databaseWrites).toBe(before);
	await expect(runtime.write({ action: "collectRerun", id: "missing" })).rejects.toThrow(
		"Native Inquiry capability is unavailable: rerun-executor",
	);
	expect(hostCall).toHaveBeenCalledOnce();
});
