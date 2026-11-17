import type { PluginRuntimeCapabilities } from "@gyoungwe/plugin-api/runtime";
import { Type } from "typebox";
import { afterEach, expect, it, vi } from "vitest";
import { createBrokerKnowledgeSpecialist } from "../src/desktop/specialist-model.js";
import { verdictFixture } from "./helpers/model-review-verdict-fixture.js";
import { answer, deferred, reply, selection } from "./helpers/specialist-model-fixture.js";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const close of closers.splice(0)) await close();
});

function recordingPort(delegate: PluginRuntimeCapabilities["call"]) {
	const lease = "synthetic-agent-slot";
	const acquiring = deferred<void>();
	const working = deferred<void>();
	const acquire = vi.fn(async (_signal?: AbortSignal) => ({ lease }));
	const work = vi.fn(delegate);
	const call = vi.fn<PluginRuntimeCapabilities["call"]>(async (name, input, signal) => {
		if (name === "agent.slot.acquire") {
			acquiring.resolve();
			return acquire(signal);
		}
		if (name === "agent.slot.release") return { released: true };
		if (name === "model.toolStep" || name === "model.generate") {
			working.resolve();
			return work(name, input, signal);
		}
		return delegate(name, input, signal);
	});
	return {
		lease,
		acquiring,
		working,
		acquire,
		work,
		call,
		modelCalls: () => call.mock.calls.filter(([name]) => name.startsWith("model.")),
	};
}

async function fixture(kind: "specialist" | "model review") {
	if (kind === "model review") {
		const review = await verdictFixture();
		closers.push(review.dispose);
		const port = recordingPort(review.caller.capabilities.call);
		review.caller.capabilities.call = port.call;
		return {
			port,
			run: (signal: AbortSignal) => review.review(review.input, signal),
			info: review.info,
		};
	}
	const step = vi
		.fn()
		.mockResolvedValueOnce(reply("knowledge_read", { path: "synthetic.md" }))
		.mockResolvedValueOnce(reply("knowledge_submit", answer));
	const port = recordingPort(async (name) => {
		if (name === "model.selection") return selection;
		if (name === "model.toolStep") return step();
		throw new Error(`Unexpected specialist capability ${name}`);
	});
	return {
		port,
		run: (signal: AbortSignal) =>
			createBrokerKnowledgeSpecialist(port)({
				role: "navigator",
				task: "Read synthetic evidence",
				packet: "Synthetic packet",
				capabilities: [
					{
						name: "knowledge_read",
						description: "Read synthetic evidence",
						parameters: Type.Object({ path: Type.String() }),
						execute: async () => {
							expect(port.call.mock.calls.map(([name]) => name)).not.toContain("agent.slot.release");
							return { text: "Synthetic evidence" };
						},
					},
				],
				signal,
				check: async () => undefined,
				progress: () => undefined,
			}),
		info: async () => undefined,
	};
}

function expectReleased(port: ReturnType<typeof recordingPort>) {
	const calls = port.call.mock.calls;
	expect(calls.filter(([name]) => name === "agent.slot.acquire")).toEqual([
		["agent.slot.acquire", {}, expect.any(AbortSignal)],
	]);
	expect(calls.filter(([name]) => name === "agent.slot.release")).toEqual([
		["agent.slot.release", { lease: port.lease }],
	]);
	const names = calls.map(([name]) => name);
	expect(names.indexOf("agent.slot.acquire")).toBeLessThan(
		names.findIndex((name) => name.startsWith("model.")),
	);
	expect(names.at(-1)).toBe("agent.slot.release");
}

it.each(["specialist", "model review"] as const)(
	"%s holds exactly one lease across the entire successful run",
	async (kind) => {
		const f = await fixture(kind);
		const result = await f.run(new AbortController().signal);
		expectReleased(f.port);
		if (kind === "specialist") {
			expect(result).toMatchObject({ data: answer });
			expect(f.port.work).toHaveBeenCalledTimes(2);
		} else {
			expect(result).toMatchObject({ verdict: "approve", applied: true });
			expect(f.port.call.mock.calls.map(([name]) => name)).toContain("files.writeText");
		}
	},
);

function untilAborted(signal?: AbortSignal): Promise<never> {
	if (!signal) throw new Error("Expected a cancellable capability call");
	return new Promise((_resolve, reject) => {
		signal.addEventListener("abort", () => reject(signal.reason), { once: true });
	});
}

it.each(["specialist", "model review"] as const)(
	"%s releases its lease and preserves the original model failure",
	async (kind) => {
		const f = await fixture(kind);
		const failure = new Error("Synthetic model failure");
		f.port.work.mockRejectedValueOnce(failure);
		await expect(f.run(new AbortController().signal)).rejects.toBe(failure);
		expectReleased(f.port);
	},
);

it.each(["specialist", "model review"] as const)(
	"%s releases its lease after caller abort and surfaces the original AbortError",
	async (kind) => {
		const f = await fixture(kind);
		const controller = new AbortController();
		f.port.work.mockImplementationOnce((_name, _input, signal) => untilAborted(signal));
		const result = f.run(controller.signal);
		const aborted = expect(result).rejects.toMatchObject({ name: "AbortError" });
		await f.port.working.promise;
		controller.abort();
		await expect(result).rejects.toBe(controller.signal.reason);
		await aborted;
		expect(controller.signal.reason).toMatchObject({ name: "AbortError" });
		expectReleased(f.port);
	},
);

it.each(["specialist", "model review"] as const)(
	"%s makes no model call until its pending lease is granted",
	async (kind) => {
		const f = await fixture(kind);
		const grant = deferred<{ lease: string }>();
		f.port.acquire.mockImplementationOnce(() => grant.promise);
		const result = f.run(new AbortController().signal);
		await f.port.acquiring.promise;
		expect(f.port.modelCalls()).toEqual([]);
		grant.resolve({ lease: f.port.lease });
		await result;
		expectReleased(f.port);
	},
);

it.each(["specialist", "model review"] as const)(
	"%s aborts pending acquisition without any model call or unowned release",
	async (kind) => {
		const f = await fixture(kind);
		const controller = new AbortController();
		f.port.acquire.mockImplementationOnce(untilAborted);
		const result = f.run(controller.signal);
		const aborted = expect(result).rejects.toMatchObject({ name: "AbortError" });
		await f.port.acquiring.promise;
		controller.abort();
		await aborted;
		await expect(result).rejects.toBe(controller.signal.reason);
		expect(f.port.modelCalls()).toEqual([]);
		expect(f.port.call.mock.calls.filter(([name]) => name === "agent.slot.acquire")).toHaveLength(1);
		expect(f.port.call.mock.calls.filter(([name]) => name === "agent.slot.release")).toEqual([]);
	},
);

it("model review info never acquires a slot", async () => {
	const f = await fixture("model review");
	await f.info();
	const names = f.port.call.mock.calls.map(([name]) => name);
	expect(names).toContain("model.selection");
	expect(names.filter((name) => name.startsWith("agent.slot."))).toEqual([]);
});

it("model review's 120 second deadline includes waiting for a slot", async () => {
	vi.useFakeTimers();
	try {
		const f = await fixture("model review");
		f.port.acquire.mockImplementationOnce(untilAborted);
		const result = f.run(new AbortController().signal);
		const aborted = expect(result).rejects.toMatchObject({ name: "AbortError" });
		await f.port.acquiring.promise;
		await vi.advanceTimersByTimeAsync(119_999);
		expect(f.port.acquire.mock.calls[0][0]?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await aborted;
		expect(f.port.modelCalls()).toEqual([]);
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});
