import assert from "node:assert/strict";
import test from "node:test";
import createWorkbenchRuntime from "../dist/host.mjs";

function harness(access = "read-write", stored = { kind: "missing", version: null }) {
	const calls = [];
	let state = stored;
	const context = {
		applicationId: "test-app",
		signal: new AbortController().signal,
		resources: [{ handle: "state-root", kind: "state", access }],
		capabilities: {
			async call(name, input) {
				calls.push({ name, input });
				if (name === "state.readJson") return state;
				if (name === "state.writeJson") {
					state = { kind: "value", value: input.value, version: "v2" };
					return { version: "v2" };
				}
				throw new Error(`unexpected capability ${name}`);
			},
		},
		events: { changed() { calls.push({ name: "changed" }); } },
	};
	return { context, calls, getState: () => state };
}

test("loads and persists only through the host state capability", async () => {
	const fixture = harness();
	const runtime = await createWorkbenchRuntime(fixture.context);
	await runtime.operations.plan.execute({ items: ["Review sources"] }, fixture.context);
	const snapshot = await runtime.operations.status.execute({}, fixture.context);
	assert.equal(snapshot.tasks.length, 1);
	assert.deepEqual(await runtime.operations.persist.execute({}, fixture.context), { version: "v2" });
	assert.equal(fixture.calls.filter((call) => call.name === "state.writeJson").length, 1);
	assert.equal(fixture.calls.at(-1)?.name, "changed");
	assert.equal(fixture.getState().value.tasks[0].content, "Review sources");
	await runtime.dispose();
	await assert.rejects(() => runtime.operations.status.execute({}, fixture.context), /disposed/);
});

test("restores a persisted snapshot and rejects persistence without a write grant", async () => {
	const stored = {
		kind: "value",
		version: "v1",
		value: { tasks: [{ id: "task-1", content: "Existing", state: "completed", updatedAt: "2026-01-01T00:00:00.000Z" }], memory: [] },
	};
	const fixture = harness("read", stored);
	const runtime = await createWorkbenchRuntime(fixture.context);
	assert.equal((await runtime.operations.status.execute({}, fixture.context)).tasks[0].id, "task-1");
	await assert.rejects(() => runtime.operations.persist.execute({}, fixture.context), /read-write state grant/);
});

test("honors cancellation on an individual runtime call", async () => {
	const fixture = harness();
	const runtime = await createWorkbenchRuntime(fixture.context);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(() => runtime.operations.status.execute({}, { ...fixture.context, signal: controller.signal }), /disposed/);
});
