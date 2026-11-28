import type { PluginHostEvent, PluginHostEventSource } from "@gyoungwe/plugin-api/host-events";
import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { expect, vi } from "vitest";
import { InquiryEventProjector } from "../src/event-projection.js";
import { createInquiryRuntimeWithEngine } from "../src/runtime.js";
import type { ReadInput } from "../src/runtime-schema.js";
import { InquiryService } from "../src/service.js";
import { it as base, projectId, question, workspaceId } from "./helpers/ledger-owner-fixture.js";

const topics = [
	"inquiry.compute",
	"inquiry.task-terminal",
	"inquiry.local-execution",
	"inquiry.decision",
] as const;
const at = "2026-10-28T00:00:00.000Z";
const digest = "a".repeat(64);

function hostSource() {
	const listeners = new Map<string, (event: PluginHostEvent) => void>(),
		subscribed: string[] = [],
		unsubscribed: string[] = [];
	const source: PluginHostEventSource = {
		subscribe(topic, listener) {
			subscribed.push(topic);
			listeners.set(topic, listener);
			return () => unsubscribed.push(topic);
		},
	};
	return {
		source,
		subscribed,
		unsubscribed,
		emit(topic: string, sequence: number, payload: unknown) {
			listeners.get(topic)?.({ topic, sequence, payload });
		},
		listener(topic: string) {
			return listeners.get(topic);
		},
	};
}

const compute = {
	id: "host-compute",
	jobId: "compute-job",
	type: "collected" as const,
	at,
	status: "succeeded",
	projectId: ` ${projectId}/ `,
	lineage: { run: "transport-only" },
	artifacts: [
		{
			id: "compute-artifact",
			path: "runs/compute.tsv",
			bytes: 3,
			sha256: digest,
			kind: "output",
			symlink: false,
		},
	],
};
const task = {
	id: "host-task",
	taskId: "task-1",
	status: "succeeded" as const,
	at,
	projectId,
	manifest: {
		entries: [{ id: "task-artifact", path: "runs/task.tsv", size: 4, sha256: digest, kind: "task-output" }],
	},
};
const local = {
	id: "host-local",
	projectId,
	toolName: "node",
	startedAt: at,
	finishedAt: at,
	codeFingerprint: "fingerprint",
	parameters: {},
	runProvenance: {},
	outcome: "succeeded" as const,
	at,
};
const decision = {
	id: "host-decision",
	kind: "workflow-repair" as const,
	summary: "Repair workflow inputs",
	basis: ["run:compute-job"],
	at,
	projectId,
};

async function startRuntime(
	engine: Parameters<typeof createInquiryRuntimeWithEngine>[1],
	ports: PluginRuntimeCapabilities,
	directory: string,
	signal: AbortSignal,
	hostEvents?: ReturnType<typeof hostSource>,
) {
	const capabilities = { call: vi.fn(ports.call) },
		changed = vi.fn(),
		factoryContext = {
			applicationId: "app",
			signal,
			resources: [],
			capabilities,
			events: { changed },
			...(hostEvents ? { hostEvents: hostEvents.source } : {}),
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
		write: (input: unknown, callSignal = signal) =>
			runtime.operations["inquiry.write"].execute(input, { ...callContext, signal: callSignal }),
		dispose: runtime.dispose,
		capabilities,
		changed,
	};
}

type Runtime = Awaited<ReturnType<typeof startRuntime>>;
const test = base.extend<{ start: (source?: ReturnType<typeof hostSource>) => Promise<Runtime> }>({
	start: async ({ ledger }, use) => {
		const runtimes: Runtime[] = [];
		try {
			await use(async (source) => {
				const runtime = await startRuntime(
					ledger.engine,
					ledger.ports,
					ledger.directory,
					ledger.controller.signal,
					source,
				);
				runtimes.push(runtime);
				return runtime;
			});
		} finally {
			for (const runtime of runtimes.reverse()) await runtime.dispose();
		}
	},
});

function hostStatus(value: unknown) {
	return (
		value as {
			hostEvents: { subscribed: boolean; pending: number; overflowed: boolean; droppedMalformed: number };
		}
	).hostEvents;
}

test("subscribes to all four topics and keeps callbacks passive", async ({ ledger, start }) => {
	const host = hostSource();
	const runtime = await start(host);
	expect(host.subscribed).toEqual(topics);
	const beforeEvents = runtime.capabilities.call.mock.calls.length;
	for (const [index, topic] of topics.entries())
		host.emit(topic, index + 1, [compute, task, local, decision][index]);
	expect(runtime.capabilities.call).toHaveBeenCalledTimes(beforeEvents);
	expect(hostStatus(await runtime.read({ action: "status" }))).toMatchObject({
		subscribed: true,
		pending: 4,
	});
	expect(runtime.capabilities.call.mock.calls.map(([name]) => name)).not.toContain("inquiry.rerun");
	await runtime.write({ action: "drainHostEvents" });
	const actual = ((await runtime.read({ action: "snapshot" })) as { value: unknown }).value;
	const storage = ledger.engine.open(projectId),
		service = new InquiryService(storage),
		projector = new InquiryEventProjector(storage, service, (value) => normalizeProjectId(value ?? ""));
	try {
		await service.recordQuestion(question("original"));
		await projector.recordComputeEvent(compute);
		await projector.recordTaskTerminal(task);
		await projector.recordLocalExecution(local);
		await projector.recordDecision(decision);
		expect(actual).toEqual({
			...(await service.readOnlyState()),
			attempts: (await service.snapshot()).attempts,
		});
	} finally {
		await storage.close();
	}
});

function normalizeProjectId(value: string | undefined) {
	const trimmed = (value ?? "").trim();
	return trimmed === "/" ? trimmed : trimmed.replace(/[\\/]+$/u, "");
}

test("ignores unbound host sources and does not require hostEvents", async ({ start }) => {
	const runtime = await start();
	await expect(runtime.read({ action: "status" })).resolves.toMatchObject({
		state: "bound",
		hostEvents: { subscribed: false, pending: 0, overflowed: false, droppedMalformed: 0 },
	});
	await expect(runtime.write({ action: "drainHostEvents" })).resolves.toMatchObject({
		value: { drained: 0, remaining: 0, lastSequence: null, overflowed: false },
	});
});

test("isolates projects, rejects malformed payloads, and deduplicates committed sequences", async ({
	start,
}) => {
	const host = hostSource();
	const runtime = await start(host);
	host.emit("inquiry.compute", 1, compute);
	host.emit("inquiry.compute", 2, {
		...compute,
		id: "other-project",
		jobId: "other-job",
		projectId: "another-project",
	});
	host.emit("inquiry.compute", 3, { ...compute, projectId: undefined });
	const diagnostics = hostStatus(await runtime.read({ action: "status" }));
	expect(diagnostics).toMatchObject({ pending: 1, droppedMalformed: 1 });
	await expect(runtime.write({ action: "drainHostEvents" })).resolves.toMatchObject({
		value: { drained: 1, remaining: 1, lastSequence: 1 },
	});
	host.emit("inquiry.compute", 1, compute);
	expect(hostStatus(await runtime.read({ action: "status" })).pending).toBe(0);
});

test("retains queued events when an owner write fails and retries in order", async ({ ledger }) => {
	const host = hostSource();
	let failReserve = true;
	const ports: PluginRuntimeCapabilities = {
		async call(name, input, signal) {
			if (name === "state.reserve" && failReserve) {
				failReserve = false;
				throw new Error("CAS conflict");
			}
			return ledger.ports.call(name, input, signal);
		},
	};
	const runtime = await startRuntime(ledger.engine, ports, ledger.directory, ledger.controller.signal, host);
	host.emit("inquiry.compute", 2, compute);
	host.emit("inquiry.decision", 1, decision);
	await expect(runtime.write({ action: "drainHostEvents" })).rejects.toThrow("CAS conflict");
	expect(hostStatus(await runtime.read({ action: "status" })).pending).toBe(2);
	await expect(runtime.write({ action: "drainHostEvents" })).resolves.toMatchObject({
		value: { drained: 2, remaining: 0, lastSequence: 2 },
	});
	await runtime.dispose();
});

test("bounds the buffer, survives malformed callbacks, and unsubscribes on abort", async ({ ledger }) => {
	const host = hostSource(),
		controller = new AbortController(),
		runtime = await startRuntime(ledger.engine, ledger.ports, ledger.directory, controller.signal, host);
	for (let sequence = 1; sequence <= 257; sequence++)
		host.emit("inquiry.compute", sequence, { ...compute, id: `compute-${sequence}` });
	host.emit("inquiry.compute", 258, { ...compute, type: "unknown" });
	expect(hostStatus(await runtime.read({ action: "status" })).pending).toBe(256);
	expect(hostStatus(await runtime.read({ action: "status" }))).toMatchObject({
		overflowed: true,
		droppedMalformed: 1,
	});
	expect(host.unsubscribed).toEqual([]);
	const late = host.listener("inquiry.compute");
	controller.abort();
	expect(host.unsubscribed.sort()).toEqual([...topics].sort());
	const changed = runtime.changed.mock.calls.length;
	late?.({ topic: "inquiry.compute", sequence: 300, payload: compute });
	expect(runtime.changed).toHaveBeenCalledTimes(changed);
	await runtime.dispose();
});

test("rejects a payload that would exceed the serialized byte budget", async ({ start }) => {
	const host = hostSource();
	const runtime = await start(host);
	const oversized = {
		...compute,
		artifacts: Array.from({ length: 256 }, (_, index) => ({
			id: `large-${index}`,
			path: "x".repeat(4096),
			bytes: 1,
			sha256: digest,
		})),
	};
	host.emit("inquiry.compute", 1, oversized);
	expect(hostStatus(await runtime.read({ action: "status" }))).toMatchObject({
		pending: 0,
		overflowed: true,
		droppedMalformed: 0,
	});
});

test("dispose unsubscribes every host event listener", async ({ start }) => {
	const host = hostSource();
	const runtime = await start(host);
	await runtime.dispose();
	expect(host.unsubscribed.sort()).toEqual([...topics].sort());
	const late = host.listener("inquiry.decision");
	late?.({ topic: "inquiry.decision", sequence: 1, payload: decision });
	expect(runtime.changed).not.toHaveBeenCalled();
});
