import { expect, it } from "vitest";
import { createKnowledgeConfigApi } from "../src/core/config.js";
import { createKnowledgeRuntimeHost } from "../src/core/runtime-host.js";
import { createKnowledgeUi } from "../src/core/ui-state.js";
import { createKnowledgeSpecialistHost } from "../src/core/specialist-host.js";

function latch() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => { release = resolve; });
	return { promise, release };
}
function owner() {
	const runtime = createKnowledgeRuntimeHost();
	const config = createKnowledgeConfigApi(undefined, null);
	const ui = createKnowledgeUi(runtime, config);
	return { runtime, ui, specialists: createKnowledgeSpecialistHost(runtime, config, ui) };
}

it("isolates callbacks, storage slots and exclusive queues between application owners", async () => {
	const a = owner();
	const b = owner();
	a.runtime.configureKnowledgeRuntime({ toolMeta: () => "a" });
	b.runtime.configureKnowledgeRuntime({ toolMeta: () => "b" });
	expect(a.runtime.toolMeta("same-tool")).toBe("a");
	expect(b.runtime.toolMeta("same-tool")).toBe("b");
	const aSlot = a.runtime.runtimeSlot("knowledge", "test", () => ({ value: 1 }));
	const bSlot = b.runtime.runtimeSlot("knowledge", "test", () => ({ value: 2 }));
	aSlot.value = 3;
	expect(bSlot.value).toBe(2);
	const held = latch();
	const started = latch();
	const running = a.runtime.runRuntimeExclusive("writes", "same-key", async () => {
		started.release();
		await held.promise;
	});
	await started.promise;
	try {
		await expect(b.runtime.runRuntimeExclusive("writes", "same-key", async () => "b advanced")).resolves.toBe("b advanced");
	} finally {
		held.release();
		await running;
	}
});

it("keeps matching session IDs and UI events separate without registering process listeners", () => {
	const eventNames = ["drone:knowledge-ui/v1", "drone:knowledge-specialist-host/v1"];
	const counts = eventNames.map((name) => process.listenerCount(name));
	const a = owner();
	const b = owner();
	expect(eventNames.map((name) => process.listenerCount(name))).toEqual(counts);
	const eventsA: unknown[] = [];
	const eventsB: unknown[] = [];
	const unsubscribeA = a.ui.subscribeKnowledgeUi((event: unknown) => eventsA.push(event));
	const unsubscribeB = b.ui.subscribeKnowledgeUi((event: unknown) => eventsB.push(event));
	try {
		const ctx = { sessionId: "same-session" };
		a.ui.beginKnowledgeFlow(ctx, null);
		b.ui.beginKnowledgeFlow(ctx, null);
		a.ui.updateKnowledgeFlow(ctx, { phase: "searching" });
		expect(a.ui.flowFor(ctx.sessionId).phase).toBe("searching");
		expect(b.ui.flowFor(ctx.sessionId).phase).toBe("unconfigured");
		expect(eventsA).toHaveLength(2);
		expect(eventsB).toHaveLength(1);
	} finally {
		unsubscribeA();
		unsubscribeB();
	}
});

it("isolates specialist registrations and occupied concurrency slots", async () => {
	const a = owner();
	const b = owner();
	const runA = () => "a";
	const runB = () => "b";
	const removeA = a.specialists.registerKnowledgeSpecialistHost("same-session", runA);
	const removeB = b.specialists.registerKnowledgeSpecialistHost("same-session", runB);
	const held = latch();
	const started = latch();
	const work = a.specialists.withSpecialistSlot(undefined, async () => {
		started.release();
		await held.promise;
	}, { concurrency: 1 });
	await started.promise;
	try {
		expect(a.specialists.knowledgeSpecialistHost({ sessionId: "same-session" })).toBe(runA);
		expect(b.specialists.knowledgeSpecialistHost({ sessionId: "same-session" })).toBe(runB);
		await expect(b.specialists.withSpecialistSlot(undefined, async () => "b completed", { concurrency: 1 })).resolves.toBe("b completed");
		expect(a.specialists.specialistQueueSnapshot()).toEqual({ active: 1, queueLength: 0 });
		expect(b.specialists.specialistQueueSnapshot()).toEqual({ active: 0, queueLength: 0 });
		removeA();
		expect(b.specialists.knowledgeSpecialistHost({ sessionId: "same-session" })).toBe(runB);
	} finally {
		held.release();
		await work;
		removeA();
		removeB();
	}
});
