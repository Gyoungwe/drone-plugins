import { expect, vi } from "vitest";
import { registerAcceptanceVerifier } from "../../src/task-runtime/acceptance.mjs";
import { createTaskAuthorization } from "../../src/task-runtime/ask-authorization.mjs";
import { contractHash } from "../../src/task-runtime/consent.mjs";
import { createTaskController } from "../../src/task-runtime/task-controller.mjs";
import { createTaskSession } from "../../src/task-runtime/task-session.mjs";
import { createTaskWorkbench, WORKBENCH_ENTRY } from "./fixture.mjs";
import { it } from "./scoped-test.mjs";

function deferred() {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function seedTask() {
	registerAcceptanceVerifier("paper", { fields: ["doi"], evidenceKind: "paper-identity" });
	const records = [];
	const workbench = createTaskWorkbench({
		requireAuthorization: true,
		persist: (data) => records.push({ customType: WORKBENCH_ENTRY, data }),
	});
	workbench.attach("approval-session");
	workbench.begin("Save the reviewed paper");
	workbench.plan({
		summary: "Save the named paper",
		milestones: [
			{ id: "paper", title: "Saved paper", acceptance: { kind: "paper", doi: "10.1000/original" } },
		],
	});
	return { workbench, records };
}

function approvalInput(workbench) {
	return {
		scope: workbench.scope(),
		taskId: workbench.snapshot().id,
		contractHash: contractHash(workbench.snapshot()),
		binding: null,
		action: "authorize-task",
	};
}

async function queuedTask(seed) {
	const entered = deferred();
	const released = deferred();
	const records = [];
	let held = false;
	const storage = { mode: "persistent", state: "durable" };
	const session = createTaskSession({
		persist: async (record) => {
			if (held) {
				held = false;
				entered.resolve();
				await released.promise;
			}
			records.push(record);
			return storage;
		},
		readOnly: (name) => name === "task_status",
		onChanged: () => undefined,
		readFailure: () => null,
		onPersistenceFailed: () => undefined,
	});
	const ctx = { signal: new AbortController().signal };
	const { journal } = createTaskController(session, () => ctx.signal);
	await session.turn({ kind: "attach", scope: seed.workbench.scope(), entries: seed.records, storage });
	return {
		session,
		journal,
		ctx,
		records,
		entered: entered.promise,
		release: released.resolve,
		hold: () => {
			held = true;
		},
		close: () => {
			released.resolve();
			return session.close();
		},
	};
}

function heldRebind(journal) {
	const shown = deferred();
	const answer = deferred();
	const queued = deferred();
	const record = journal.recordApproval;
	vi.spyOn(journal, "recordApproval").mockImplementation((input) => {
		const result = record(input);
		queued.resolve();
		return result;
	});
	return {
		shown: shown.promise,
		approve: () => answer.resolve(true),
		queued: queued.promise,
		ask: createTaskAuthorization(journal, async () => null, {
			amendAllowance: async (_ctx, _task, _milestone, next) => {
				shown.resolve(next);
				return answer.promise;
			},
		}),
	};
}

function seedRebind() {
	const seed = seedTask();
	seed.workbench.command({
		taskId: seed.workbench.snapshot().id,
		revision: seed.workbench.view().revision,
		action: "authorize-task",
	});
	const action = seed.workbench.wait({
		kind: "rebind",
		title: "Replace the paper",
		reason: "The original DOI names the wrong paper",
		milestoneId: "paper",
		doi: "10.1000/replacement",
	});
	return { ...seed, action };
}

it("rejects a contract edited inside the queue before approval recording runs", async () => {
	const seed = seedTask();
	const t = await queuedTask(seed);
	try {
		const input = approvalInput(t.journal);
		t.hold();
		const observing = t.journal.observe({ toolName: "task_status", content: [] }, "/unused");
		await t.entered;
		const edited = structuredClone(seed.records.at(-1));
		edited.data.revision += 2;
		edited.data.tasks[0].authorizationSummary = "Save a different paper";
		const editing = t.session.turn({
			kind: "attach",
			scope: input.scope,
			entries: [edited],
			storage: { mode: "persistent", state: "durable" },
			force: true,
		});
		const recording = t.journal.recordApproval(input);
		const rejected = expect(recording).rejects.toThrow("Task changed. Refresh before acting.");
		t.release();
		await observing;
		await editing;
		await rejected;
		expect(t.journal.snapshot().id).toBe(input.taskId);
		expect(contractHash(t.journal.snapshot())).not.toBe(input.contractHash);
		expect(t.journal.snapshot().executionConsent).toBeUndefined();
		expect(t.records).toHaveLength(1);
		expect(
			await t.journal.guard({ toolName: "write", toolCallId: "w1", input: { path: "report.md" } }),
		).toMatchObject({ block: true });
	} finally {
		await t.close();
	}
});

it("acknowledges a rebind behind a held parallel task_status observation", async () => {
	const seed = seedRebind();
	const t = await queuedTask(seed);
	const dialog = heldRebind(t.journal);
	try {
		const pending = dialog.ask(
			{
				taskId: t.journal.snapshot().id,
				revision: t.journal.view().revision,
				action: "ask-authorization",
				actionId: seed.action.id,
			},
			t.ctx,
		);
		expect((await dialog.shown).doi).toBe("10.1000/replacement");
		t.hold();
		const observing = t.journal.observe({ toolName: "task_status", content: [] }, "/unused");
		await t.entered;
		dialog.approve();
		await dialog.queued;
		t.release();
		await observing;
		expect(await pending).toBe(true);
		expect(t.journal.snapshot().actions.find((action) => action.id === seed.action.id)).toMatchObject({
			state: "acknowledged",
		});
		expect(t.journal.snapshot().milestones[0].bound).toMatchObject({
			fields: { doi: "10.1000/replacement" },
			via: "rebind",
			actionId: seed.action.id,
		});
	} finally {
		dialog.approve();
		await t.close();
	}
});

it("rejects a rebind dismissed in the queue before its approval is recorded", async () => {
	const seed = seedRebind();
	const t = await queuedTask(seed);
	const dialog = heldRebind(t.journal);
	try {
		const input = {
			taskId: t.journal.snapshot().id,
			revision: t.journal.view().revision,
			actionId: seed.action.id,
		};
		const pending = dialog.ask({ ...input, action: "ask-authorization" }, t.ctx);
		await dialog.shown;
		t.hold();
		const dismissing = t.journal.command({ ...input, action: "dismiss" });
		await t.entered;
		dialog.approve();
		await dialog.queued;
		const rejected = expect(pending).rejects.toThrow("Task changed. Refresh before acting.");
		t.release();
		await dismissing;
		await rejected;
		expect(t.journal.snapshot().actions.find((action) => action.id === seed.action.id)).toMatchObject({
			state: "cancelled",
		});
		expect(t.journal.snapshot().milestones[0].bound).toBeUndefined();
		expect(t.records).toHaveLength(1);
	} finally {
		dialog.approve();
		await t.close();
	}
});

it("records matching consent once without advancing the revision on repeated approval", () => {
	const { workbench, records } = seedTask();
	const input = approvalInput(workbench);
	workbench.recordApproval(input);
	const revision = workbench.view().revision;
	const count = records.length;
	const consent = workbench.snapshot().executionConsent;
	expect(consent.contractHash).toBe(input.contractHash);
	workbench.recordApproval(input);
	expect(workbench.view().revision).toBe(revision);
	expect(records).toHaveLength(count);
	expect(workbench.snapshot().executionConsent).toEqual(consent);
});

it.each([
	["session", { scope: "previous-session" }],
	["task", { taskId: "previous-task" }],
	["contract", { contractHash: "previous-contract" }],
	["binding", { binding: "previous-binding" }],
])("refuses approval captured for a different %s and records nothing", (_identity, previous) => {
	const { workbench, records } = seedTask();
	const input = { ...approvalInput(workbench), ...previous };
	const count = records.length;
	expect(() => workbench.recordApproval(input)).toThrow("Task changed. Refresh before acting.");
	expect(workbench.snapshot().executionConsent).toBeUndefined();
	expect(records).toHaveLength(count);
});

it.each(["completed", "cancelled", "archived"])(
	"refuses approval after a task becomes %s and records nothing",
	(state) => {
		const { workbench, records } = seedTask();
		const input = approvalInput(workbench);
		const replay = structuredClone(records.at(-1));
		replay.data.tasks[0].state = state;
		workbench.attach(input.scope, [replay], true);
		const count = records.length;
		expect(() => workbench.recordApproval(input)).toThrow("Task changed. Refresh before acting.");
		expect(workbench.view().tasks[0].executionConsent).toBeUndefined();
		expect(records).toHaveLength(count);
	},
);

it.each([
	["DOI", (action) => (action.expected.doi = "10.1000/different")],
	["kind", (action) => (action.kind = "authorization")],
	["id", (action) => (action.id = "different-action")],
])("refuses a rebind whose %s changed after the dialog", (_identity, edit) => {
	const seed = seedRebind();
	const input = {
		...approvalInput(seed.workbench),
		action: "acknowledge",
		actionId: seed.action.id,
		expectedDoi: "10.1000/replacement",
	};
	const replay = structuredClone(seed.records.at(-1));
	edit(replay.data.tasks[0].actions.find((action) => action.id === seed.action.id));
	seed.workbench.attach(input.scope, [replay], true);
	const count = seed.records.length;
	expect(() => seed.workbench.recordApproval(input)).toThrow("Task changed. Refresh before acting.");
	expect(seed.workbench.snapshot().milestones[0].bound).toBeUndefined();
	expect(seed.records).toHaveLength(count);
});
