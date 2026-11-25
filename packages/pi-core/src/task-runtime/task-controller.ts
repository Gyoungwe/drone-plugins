import type { TaskApprovalInput } from "./approval-record.ts";

type TaskAction =
	| { kind: "plan" | "wait" | "command"; input: unknown }
	| { kind: "record-approval"; input: TaskApprovalInput }
	| { kind: "file"; input: unknown; cwd: string }
	| { kind: "reconcile"; cwd: string }
	| { kind: "evidence-restore"; input: unknown; cwd: string; binding: string | null };

type TaskObservation =
	| { kind: "call" | "identity"; value: unknown }
	| { kind: "result"; value: unknown; cwd: string }
	| { kind: "capture"; value: unknown; cwd: string; binding: string | null }
	| { kind: "evicted"; ids: readonly string[] };

type TaskTurn =
	| { kind: "pause" | "reserve-continuation"; reason: string }
	| { kind: "settle" | "reserve-handoff" | "advance-stage" | "request-report" | "take-report" };

interface TaskControllerSession {
	status(): {
		scope: string;
		view: unknown;
		snapshot: { id: string } | null;
		render: string;
		readRoots: readonly string[];
		authorization: unknown;
		writeAuthorization: unknown;
	};
	input(
		input: { query: string; capabilities: readonly string[]; binding: string | null },
		signal?: AbortSignal,
	): Promise<unknown>;
	action(event: TaskAction, signal?: AbortSignal): Promise<unknown>;
	observe(event: TaskObservation, signal?: AbortSignal): Promise<unknown>;
	turn(event: TaskTurn, signal?: AbortSignal): Promise<unknown>;
}

/** Adapter-independent view of the single canonical TaskSession.
 * Signals are read for each invocation; no SDK context or captured UI state is
 * reconstructed here. Callers await the same actor operations.
 */
export function createTaskController(
	session: TaskControllerSession,
	readSignal: () => AbortSignal | undefined,
) {
	const journal = {
		scope: () => session.status().scope,
		view: () => session.status().view,
		snapshot: () => session.status().snapshot,
		render: () => session.status().render,
		readRoots: () => session.status().readRoots,
		authorization: (forWrite?: boolean) =>
			session.status()[forWrite ? "writeAuthorization" : "authorization"],
		begin: (query: string, capabilities: readonly string[] = [], binding: string | null = null) =>
			session.input({ query, capabilities, binding }, readSignal()),
		plan: (input: unknown) => session.action({ kind: "plan", input }, readSignal()),
		wait: (input: unknown) => session.action({ kind: "wait", input }, readSignal()),
		command: (input: unknown) => session.action({ kind: "command", input }, readSignal()),
		recordApproval: (input: TaskApprovalInput) =>
			session.action({ kind: "record-approval", input }, readSignal()),
		acceptFile: (input: unknown, cwd: string) => session.action({ kind: "file", input, cwd }, readSignal()),
		reconcile: (cwd: string) => session.action({ kind: "reconcile", cwd }, readSignal()),
		guard: (value: unknown) => session.observe({ kind: "call", value }, readSignal()),
		observe: (value: unknown, cwd: string) => session.observe({ kind: "result", value, cwd }, readSignal()),
		identified: (value: unknown) => session.observe({ kind: "identity", value }, readSignal()),
		pause: (reason: string) => session.turn({ kind: "pause", reason }, readSignal()),
		settle: () => session.turn({ kind: "settle" }, readSignal()),
		reserveContinuation: (reason: string) =>
			session.turn({ kind: "reserve-continuation", reason }, readSignal()),
		reserveHandoff: () => session.turn({ kind: "reserve-handoff" }, readSignal()),
		advanceStage: () => session.turn({ kind: "advance-stage" }, readSignal()),
		requestReport: () => session.turn({ kind: "request-report" }, readSignal()),
		takeReport: () => session.turn({ kind: "take-report" }, readSignal()),
	};
	const evidence = {
		capture: (value: unknown, cwd: string, binding: string | null) =>
			session.observe({ kind: "capture", value, cwd, binding }, readSignal()),
		evict: (ids: readonly string[]) => session.observe({ kind: "evicted", ids }, readSignal()),
		restore: (input: unknown, cwd: string, binding: string | null) =>
			session.action({ kind: "evidence-restore", input, cwd, binding }, readSignal()),
	};
	return { journal, evidence };
}
