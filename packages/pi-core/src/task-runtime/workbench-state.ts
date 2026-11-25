import type { TaskMilestoneInput } from "@gyoungwe/plugin-api/tasks";
import type { ConsentTask } from "./consent.js";
import type { FailureObservation, ToolResult } from "./failure-feedback.js";
import type { TaskFileDescriptor, TaskFileExpectation, TaskFileInspection } from "./file-inspection.js";
import type { WorkbenchAction, WorkbenchMilestone, WorkbenchOperation } from "./remaining.js";

export const WORKBENCH_ENTRY = "drone-task-workbench-v2";
export const LIMITS = Object.freeze({
	tasks: 12,
	operations: 64,
	milestones: 24,
	actions: 16,
	stageCalls: 48,
	totalCalls: 192,
	autoHandoffs: 16,
	retries: 3,
	fileBytes: 8 * 1024 * 1024,
});

export const clean = (value: unknown, max = 180) =>
	String(value ?? "")
		.replace(/(?:bearer\s+|(?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi, "[redacted]")
		.split("")
		.map((character) =>
			character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || "<>".includes(character)
				? " "
				: character,
		)
		.join("")
		.slice(0, max);
export const taskError = (code: string, message: string) => Object.assign(new Error(message), { code });
export const terminal = (state: string) => ["completed", "cancelled", "archived"].includes(state);

export type FileExpectation = TaskFileExpectation & { rootKind?: TaskFileDescriptor["rootKind"] };
export type InspectFile = (
	cwd: string,
	path: string,
	expected?: FileExpectation,
) => Promise<TaskFileInspection>;
type TaskArtifact = Pick<TaskFileInspection, "path" | "sha256" | "bytes"> &
	Partial<TaskFileInspection> & { intentOnly?: boolean };

export interface TaskOperation extends WorkbenchOperation {
	key: string;
	resourceKey: string;
	stage: number;
	verifier?: string;
	candidateId?: string;
	identityMilestoneId?: string;
	artifact?: TaskArtifact;
	review?: { kind: string; id: string; path: string | null };
}

export interface TaskMilestone extends WorkbenchMilestone {
	acceptance: TaskMilestoneInput["acceptance"] & { path?: string; sha256?: string | null } & Pick<
			FileExpectation,
			"rootKind"
		>;
	bound?: {
		fields: Record<string, string>;
		via: string;
		at: string;
		actionId?: string;
		operationId?: string | null;
	};
	evidence?:
		| (Partial<Omit<TaskArtifact, "kind">> & {
				kind?: string;
				at?: string;
				scope?: string;
				code?: string;
				candidateId?: string;
		  })
		| null;
}

export interface TaskAction extends WorkbenchAction {
	url: string | null;
	expected: FileExpectation;
	createdAt: string;
	file: TaskFileInspection | null;
	fileCheckedAt?: string;
	resolvedAt?: string;
}

export interface TaskRecord extends ConsentTask {
	goal: string;
	state: string;
	createdAt: string;
	updatedAt: string;
	reason: string | null;
	stage: number;
	stageProgress: number;
	authorizationRequired: boolean;
	progressCount: number;
	stageStartProgress: number;
	progressKeys: string[];
	pendingObservations: string[];
	budget: {
		calls: number;
		stageCalls: number;
		recoveries: number;
		bytes: number;
		autoResumes: number;
		autoHandoffs?: number;
	};
	milestones: readonly TaskMilestone[];
	actions: TaskAction[];
	operations: TaskOperation[];
	receipts: Pick<TaskOperation, "id" | "tool" | "state" | "at" | "artifact">[];
	capabilities: string[];
	waitMs: number;
	waitStartedAt: string | null;
	lastDefer?: { reviews: number; releasedStage: boolean } | null;
	lastResumeProgress?: number;
	lastReconciledAt?: string;
	planApprovedAt?: string;
	archivedFrom?: string;
	archivedAt?: string;
	unboundIdentities?: (Record<string, unknown> & { kind: string; doi?: string })[];
	failures?: FailureObservation[];
}

export interface TaskBook {
	version: 2;
	scope: string | null;
	revision: number;
	activeTaskId: string | null;
	selectionRequired: boolean;
	tasks: TaskRecord[];
}

export interface WorkbenchState {
	book: TaskBook;
	requested: boolean;
	pinned: boolean;
	turnCapabilities: string[];
	turnBinding: string | null;
}

export interface TaskEntry {
	type?: string;
	customType?: string;
	data?: unknown;
}

export interface TaskToolCall {
	toolName: string;
	toolCallId?: string;
	input?: Record<string, unknown> | null;
}

export type TaskToolResult = TaskToolCall &
	Omit<ToolResult, "toolName" | "toolCallId" | "input"> & {
		details?: (NonNullable<ToolResult["details"]> & Record<string, unknown>) | null;
	};

export const activeTask = (book: TaskBook) =>
	book.tasks.find((task) => task.id === book.activeTaskId) || null;
export const depsDone = (task: TaskRecord, milestone: TaskMilestone) =>
	milestone.dependsOn.every(
		(id) => task.milestones.find((candidate) => candidate.id === id)?.state === "completed",
	);

export function deriveTask(task: TaskRecord) {
	if (terminal(task.state) && task.state !== "completed") return;
	if (task.operations.some((operation) => ["unknown", "started", "changed"].includes(operation.state))) {
		task.state = "blocked";
		task.reason = "reconcile-before-retry";
	} else if (task.actions.some((action) => action.state === "pending")) task.state = "waiting_user";
	else if (
		task.planApproved &&
		task.milestones.length &&
		task.milestones.every((milestone) => milestone.state === "completed")
	) {
		task.state = "completed";
		task.reason = null;
	} else task.state = "partial";
}

export function settleWait(task: TaskRecord, now: () => string) {
	if (!task.actions.some((action) => action.state === "pending") && task.waitStartedAt) {
		task.waitMs += Math.max(0, Date.parse(now()) - Date.parse(task.waitStartedAt));
		task.waitStartedAt = null;
		if (task.state === "waiting_user") task.state = "partial";
	}
}
