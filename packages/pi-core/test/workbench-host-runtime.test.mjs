import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchRuntime } from "../dist/host.mjs";

function harness(access = "read-write", stored = { kind: "missing", version: null }) {
	const calls = [];
	let state = stored;
	const factoryContext = {
		applicationId: "test-app",
		signal: new AbortController().signal,
		resources: [{ handle: "state-root", kind: "state", access }],
		capabilities: {
			async call(name, input) {
				assert.equal(name, "state.readJson");
				calls.push({ name, input });
				return state;
			},
		},
		events: {
			changed() {
				calls.push({ name: "changed" });
			},
		},
	};
	const context = {
		signal: new AbortController().signal,
		scope: { kind: "application" },
		capabilities: {
			async call(name, input, signal) {
				assert.equal(name, "state.writeJson");
				assert.equal(signal, context.signal);
				calls.push({ name, input });
				if (input.expectedVersion !== state.version) throw new Error("State version conflict");
				state = { kind: "value", value: structuredClone(input.value), version: "v2" };
				return { version: state.version };
			},
		},
	};
	return { factoryContext, context, calls };
}

test("loads and persists only through the host state capability", async () => {
	const { factoryContext, context, calls } = harness();
	const runtime = await createWorkbenchRuntime(factoryContext);
	assert.deepEqual(calls[0], {
		name: "state.readJson",
		input: { root: "state-root", path: "workbench.json" },
	});
	await runtime.operations.plan.execute({ items: ["Review sources"] }, context);
	const snapshot = await runtime.operations.status.execute({}, context);
	assert.equal(snapshot.tasks.length, 1);
	assert.deepEqual(await runtime.operations.persist.execute({}, context), { version: "v2" });
	assert.deepEqual(calls[1], {
		name: "state.writeJson",
		input: { root: "state-root", path: "workbench.json", value: snapshot, expectedVersion: null },
	});
	assert.equal(calls.at(-1)?.name, "changed");
	const reopened = await createWorkbenchRuntime(factoryContext);
	assert.deepEqual(await reopened.operations.status.execute({}, context), snapshot);
	await runtime.dispose();
	await assert.rejects(() => runtime.operations.status.execute({}, context), /disposed/);
});

test("uses the returned version for subsequent writes and rejects stale snapshots", async () => {
	const { factoryContext, context, calls } = harness();
	const first = await createWorkbenchRuntime(factoryContext);
	const stale = await createWorkbenchRuntime(factoryContext);
	await first.operations.persist.execute({}, context);
	await first.operations.persist.execute({}, context);
	assert.equal(calls.at(-2)?.input.expectedVersion, "v2");
	await assert.rejects(() => stale.operations.persist.execute({}, context), /State version conflict/);
	assert.equal(calls.at(-1)?.name, "state.writeJson");
});

test("restores a persisted snapshot and rejects persistence without a write grant", async () => {
	const stored = {
		kind: "value",
		version: "v1",
		value: {
			tasks: [
				{ id: "task-1", content: "Existing", state: "completed", updatedAt: "2026-01-01T00:00:00.000Z" },
			],
			memory: [],
		},
	};
	const { factoryContext, context, calls } = harness("read", stored);
	const runtime = await createWorkbenchRuntime(factoryContext);
	assert.equal((await runtime.operations.status.execute({}, context)).tasks[0].id, "task-1");
	await assert.rejects(() => runtime.operations.persist.execute({}, context), /read-write state grant/);
	assert.equal(calls.length, 1);
});

test("honors cancellation on an individual runtime call", async () => {
	const { factoryContext, context, calls } = harness();
	const runtime = await createWorkbenchRuntime(factoryContext);
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		() => runtime.operations.persist.execute({}, { ...context, signal: controller.signal }),
		/disposed/,
	);
	assert.equal(calls.length, 1);
});
