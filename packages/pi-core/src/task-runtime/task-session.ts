import { recordApproval, type TaskApprovalInput } from "./approval-record.js";
import type { TaskInteractionInput } from "./ask-authorization.js";
import { createEvidenceRecovery } from "./evidence.js";
import {
	projection,
	sessionRecord,
	type TaskSessionRecord,
	type TaskSessionStatus,
	type TaskStorage,
	type TaskStorageFailure,
	type TaskStorageRead,
	taskEntries,
	taskSessionStatus,
} from "./task-session-storage.js";
import { createTaskWorkbench, type PlanInput } from "./workbench.js";
import type { TaskFileInput, WaitInput } from "./workbench-command.js";
import type { TaskAction, TaskEntry, TaskRecord, TaskToolCall, TaskToolResult } from "./workbench-state.js";
import type { IdentityObservation } from "./workbench-verifiers.js";

export { TASK_SESSION_ENTRY } from "./task-session-storage.js";

type Journal = ReturnType<typeof createTaskWorkbench>;
type Evidence = ReturnType<typeof createEvidenceRecovery>;
type WorkbenchOptions = NonNullable<Parameters<typeof createTaskWorkbench>[0]>;
type EvidenceOptions = Parameters<typeof createEvidenceRecovery>[0];
type RestoreInput = Parameters<Evidence["restore"]>[0];
type RestoreBinding = Parameters<Evidence["restore"]>[2];

interface SessionPorts extends Pick<WorkbenchOptions, "inspect"> {
	evidenceFiles: EvidenceOptions["files"];
	authorize: EvidenceOptions["authorize"];
	readOnly(name: string): boolean;
	persist(record: TaskSessionRecord, signal: AbortSignal): Promise<TaskStorage>;
	onChanged(state: TaskSessionStatus): unknown;
	readFailure(): TaskStorageFailure | null | undefined;
	onPersistenceFailed(failure: TaskStorageFailure): void;
	prepare?(tasks: readonly TaskRecord[], signal: AbortSignal): Promise<void>;
}

interface SessionState {
	tail: Promise<void>;
	closed: boolean;
	dirty: boolean;
	checkpointRequested: boolean;
	records: readonly TaskEntry[];
	storage: TaskStorage | null;
	live: TaskSessionStatus;
	lastDurable?: TaskSessionStatus;
	persistenceFailure?: TaskStorageFailure;
}

function persistenceFailed(state: SessionState, ports: SessionPorts, message: string | null) {
	state.persistenceFailure = {
		state: "needs-reopen",
		message,
		lastCommitted: structuredClone(state.lastDurable || state.live),
	};
	ports.onPersistenceFailed(state.persistenceFailure);
}

type Execute = <Result>(
	signal: AbortSignal | undefined,
	operation: () => Result | Promise<Result>,
) => Promise<Result>;

function sessionExecutor(
	state: SessionState,
	journal: Journal,
	evidence: Evidence,
	ports: SessionPorts,
	lifetime: AbortSignal,
): Execute {
	return <Result>(signal: AbortSignal | undefined, operation: () => Result | Promise<Result>) => {
		const queued = state.tail;
		let release: (() => void) | undefined;
		state.tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		const combined = signal ? AbortSignal.any([signal, lifetime]) : lifetime;
		return queued.then(async () => {
			try {
				if (state.closed) throw new Error("Task session is closed");
				const failure = state.persistenceFailure || ports.readFailure();
				if (failure)
					throw new Error(
						"Task storage failed; reopen the application from disk before changing this session. " +
							failure.message,
					);
				combined.throwIfAborted();
				const before = journal.checkpoint(),
					beforeEvidence = evidence.checkpoint(),
					beforeRecords = state.records;
				state.dirty = false;
				state.checkpointRequested = false;
				let result: Result;
				try {
					result = await operation();
					if (ports.prepare) await ports.prepare(journal.checkpoint().book.tasks, combined);
					evidence.attach(journal.scope(), journal.snapshot()?.id ?? undefined, state.records);
					combined.throwIfAborted();
					if (state.dirty) {
						try {
							state.storage = await ports.persist(sessionRecord(journal, evidence), combined);
						} catch (error) {
							persistenceFailed(state, ports, (error as Error).message);
							throw error;
						}
					}
					state.live = projection(journal, state.storage);
					if (state.storage?.state === "durable") state.lastDurable = structuredClone(state.live);
				} catch (error) {
					journal.rollback(before);
					evidence.rollback(beforeEvidence);
					state.records = beforeRecords;
					throw error;
				}
				combined.throwIfAborted();
				if (state.checkpointRequested) await ports.onChanged(state.live);
				return result;
			} finally {
				release?.();
			}
		});
	};
}

type Turn =
	| { kind: "attach"; scope: string; entries: readonly TaskEntry[]; storage: TaskStorage; force?: boolean }
	| { kind: "storage"; storage: TaskStorageRead }
	| { kind: "pause" | "reserve-continuation"; reason: string }
	| { kind: "settle" | "reserve-handoff" | "advance-stage" | "request-report" | "take-report" };

type Action =
	| { kind: "plan"; input: PlanInput }
	| { kind: "wait"; input: WaitInput }
	| { kind: "command"; input: TaskInteractionInput }
	| { kind: "record-approval"; input: TaskApprovalInput }
	| { kind: "file"; input: TaskFileInput; cwd: string }
	| { kind: "reconcile"; cwd: string }
	| { kind: "evidence-restore"; input: RestoreInput; cwd: string; binding: RestoreBinding };

type Observation =
	| { kind: "call"; value: TaskToolCall }
	| { kind: "result"; value: TaskToolResult; cwd: string }
	| { kind: "identity"; value: IdentityObservation }
	| { kind: "capture"; value: Parameters<Evidence["capture"]>[0]; cwd: string; binding: string | null }
	| { kind: "evicted"; ids: readonly string[] };

function sessionActions(execute: Execute, journal: Journal, evidence: Evidence) {
	function action(event: { kind: "wait"; input: WaitInput }, signal?: AbortSignal): Promise<TaskAction>;
	function action(event: Action, signal?: AbortSignal): Promise<unknown>;
	function action(event: Action, signal?: AbortSignal) {
		return execute<unknown>(signal, () => {
			const kind = event.kind;
			switch (kind) {
				case "plan":
					return journal.plan(event.input);
				case "wait":
					return journal.wait(event.input);
				case "command":
					return journal.command(event.input);
				case "record-approval":
					return recordApproval(journal, event.input);
				case "file":
					return journal.acceptFile(event.input, event.cwd);
				case "reconcile":
					return journal.reconcile(event.cwd);
				case "evidence-restore":
					return evidence.restore(event.input, event.cwd, event.binding);
				default:
					throw new Error(`Unknown task action: ${kind}`);
			}
		});
	}
	return action;
}

function sessionObservations(
	execute: Execute,
	state: SessionState,
	journal: Journal,
	evidence: Evidence,
	readOnly: SessionPorts["readOnly"],
) {
	function observe(
		event: { kind: "call"; value: TaskToolCall },
		signal?: AbortSignal,
	): Promise<ReturnType<Journal["guard"]>>;
	function observe(event: Observation, signal?: AbortSignal): Promise<unknown>;
	function observe(event: Observation, signal?: AbortSignal) {
		return execute(signal, () => {
			const kind = event.kind;
			if (kind === "call") {
				if (
					state.storage?.mode !== "memory" &&
					state.storage?.state !== "durable" &&
					!readOnly(event.value.toolName)
				)
					throw new Error(
						"Task checkpoint is not durable; wait for actual session persistence before external effects.",
					);
				return journal.guard(event.value);
			}
			if (kind === "result") return journal.observe(event.value, event.cwd);
			if (kind === "identity") return journal.identified(event.value);
			if (kind === "capture") return evidence.capture(event.value, event.cwd, event.binding);
			if (kind === "evicted") return evidence.evict(event.ids);
			throw new Error(`Unknown task observation: ${kind}`);
		});
	}
	return observe;
}

function sessionTurns(
	execute: Execute,
	state: SessionState,
	journal: Journal,
	evidence: Evidence,
	ports: SessionPorts,
) {
	function turn(
		event: { kind: "advance-stage" | "reserve-handoff" } | { kind: "reserve-continuation"; reason: string },
		signal?: AbortSignal,
	): Promise<boolean>;
	function turn(event: { kind: "take-report" }, signal?: AbortSignal): Promise<string | null>;
	function turn(event: Turn, signal?: AbortSignal): Promise<unknown>;
	function turn(event: Turn, signal?: AbortSignal) {
		return execute(signal, () => {
			const kind = event.kind;
			switch (kind) {
				case "attach":
					state.storage = { mode: event.storage.mode, state: event.storage.state };
					state.records = taskEntries(event.entries);
					journal.attach(event.scope, state.records, event.force);
					evidence.attach(event.scope, journal.snapshot()?.id, state.records, event.force);
					return;
				case "storage":
					state.storage = { mode: event.storage.mode, state: event.storage.state };
					if (state.storage.state === "needs-reopen") {
						persistenceFailed(state, ports, event.storage.code);
						throw new Error(`Task storage needs-reopen: ${event.storage.code}`);
					}
					return;
				case "pause":
					return journal.pause(event.reason);
				case "settle":
					return journal.settle();
				case "reserve-continuation":
					return journal.reserveContinuation(event.reason);
				case "reserve-handoff":
					return journal.reserveHandoff();
				case "advance-stage":
					return journal.advanceStage();
				case "request-report":
					return journal.requestReport();
				case "take-report":
					return journal.takeReport();
				default:
					throw new Error(`Unknown task turn: ${kind}`);
			}
		});
	}
	return turn;
}

/** One serial task module. Reads expose accepted live state with a storage receipt. */
export function createTaskSession(ports: SessionPorts) {
	const lifetime = new AbortController();
	const dirty = () => {
		state.dirty = true;
	};
	const journal = createTaskWorkbench({
		requireAuthorization: true,
		readOnly: ports.readOnly,
		inspect: ports.inspect,
		persist: dirty,
		onCheckpoint: () => {
			state.checkpointRequested = true;
		},
	});
	const evidence = createEvidenceRecovery({
		authorize: ports.authorize,
		files: ports.evidenceFiles,
		persist: dirty,
	});
	const state: SessionState = {
		tail: Promise.resolve(),
		closed: false,
		dirty: false,
		checkpointRequested: false,
		records: [],
		storage: null,
		live: projection(journal, null),
	};
	const execute = sessionExecutor(state, journal, evidence, ports, lifetime.signal);
	return {
		status: () => {
			if (state.closed) throw new Error("Task session is closed");
			return taskSessionStatus(state.live, state.persistenceFailure || ports.readFailure());
		},
		input: (
			{
				query,
				capabilities,
				binding,
			}: { query: string; capabilities: readonly string[]; binding: string | null },
			signal?: AbortSignal,
		) => execute(signal, () => journal.begin(query, capabilities, binding)),
		turn: sessionTurns(execute, state, journal, evidence, ports),
		observe: sessionObservations(execute, state, journal, evidence, ports.readOnly),
		action: sessionActions(execute, journal, evidence),
		close: () => {
			state.closed = true;
			lifetime.abort(new Error("Task session closed"));
			return state.tail;
		},
	};
}
