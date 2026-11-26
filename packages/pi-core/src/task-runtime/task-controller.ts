import type { TaskApprovalInput } from "./approval-record.ts";
import type { TaskInteractionInput } from "./ask-authorization.ts";
import type { createEvidenceRecovery } from "./evidence.ts";
import type { createTaskSession } from "./task-session.js";
import type { PlanInput } from "./workbench.js";
import type { TaskFileInput, WaitInput } from "./workbench-command.js";
import type { TaskToolCall, TaskToolResult } from "./workbench-state.js";
import type { IdentityObservation } from "./workbench-verifiers.js";

type Evidence = ReturnType<typeof createEvidenceRecovery>;

/** Adapter-independent view of the single canonical TaskSession.
 * Signals are read for each invocation; no SDK context or captured UI state is
 * reconstructed here. Callers await the same actor operations.
 */
export function createTaskController(
	session: ReturnType<typeof createTaskSession>,
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
		plan: (input: PlanInput) => session.action({ kind: "plan", input }, readSignal()),
		wait: (input: WaitInput) => session.action({ kind: "wait", input }, readSignal()),
		command: (input: TaskInteractionInput) => session.action({ kind: "command", input }, readSignal()),
		recordApproval: (input: TaskApprovalInput) =>
			session.action({ kind: "record-approval", input }, readSignal()),
		acceptFile: (input: TaskFileInput, cwd: string) =>
			session.action({ kind: "file", input, cwd }, readSignal()),
		reconcile: (cwd: string) => session.action({ kind: "reconcile", cwd }, readSignal()),
		guard: (value: TaskToolCall) => session.observe({ kind: "call", value }, readSignal()),
		observe: (value: TaskToolResult, cwd: string) =>
			session.observe({ kind: "result", value, cwd }, readSignal()),
		identified: (value: IdentityObservation) => session.observe({ kind: "identity", value }, readSignal()),
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
		capture: (value: Parameters<Evidence["capture"]>[0], cwd: string, binding: string | null) =>
			session.observe({ kind: "capture", value, cwd, binding }, readSignal()),
		evict: (ids: readonly string[]) => session.observe({ kind: "evicted", ids }, readSignal()),
		restore: (
			input: Parameters<Evidence["restore"]>[0],
			cwd: string,
			binding: Parameters<Evidence["restore"]>[2],
		) => session.action({ kind: "evidence-restore", input, cwd, binding }, readSignal()),
	};
	return { journal, evidence };
}
