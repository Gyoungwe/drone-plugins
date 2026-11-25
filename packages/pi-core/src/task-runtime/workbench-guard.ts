import { createHash } from "node:crypto";
import { hasTaskConsent } from "./consent.js";
import { bilingual } from "./host-language.js";
import {
	clean,
	LIMITS,
	type TaskBook,
	type TaskOperation,
	type TaskRecord,
	type TaskToolCall,
	taskError,
	terminal,
} from "./workbench-state.js";

export const controls = /* @__PURE__ */ new Set([
	"set_status",
	"todo",
	"capability_load",
	"task_status",
	"task_plan",
	"task_wait",
	"task_reconcile",
	"task_evidence_restore",
]);
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const stable = (value: unknown) =>
	JSON.stringify(value, (_key, item) =>
		item && typeof item === "object" && !Array.isArray(item)
			? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
			: item,
	);

const block = (reason: string) => ({ block: true, reason });
const permittedBeforePlan = (name: string, readOnly: (name: string) => boolean) =>
	controls.has(name) || readOnly(name) || /^research_/.test(name) || name === "ask_user";

function checkTaskGuard(
	task: TaskRecord,
	name: string,
	readOnly: (name: string) => boolean,
	save: () => void,
) {
	if (
		task.authorizationRequired &&
		!hasTaskConsent(task, LIMITS.totalCalls) &&
		!permittedBeforePlan(name, readOnly)
	) {
		task.state = "waiting_user";
		task.reason = "task-authorization-required";
		save();
		return block(
			"First prepare the inputs without side effects, then call task_plan once with the goal, scope, write directories and deliverables. The application will ask you to approve that plan; the card alone never authorizes execution. Do not start commands or writes, and do not ask for separate stage approvals.",
		);
	}
	if (task.budget.calls >= LIMITS.totalCalls || task.budget.stageCalls >= LIMITS.stageCalls) {
		task.state = "blocked";
		task.reason = task.budget.calls >= LIMITS.totalCalls ? "total-budget" : "stage-budget";
		save();
		return block(
			hasTaskConsent(task, LIMITS.totalCalls)
				? "The approved task reached a hard limit or made no new progress. Deliver observed results, remaining work and the specific blocker. Do not request routine stage approval or silently reset the total budget."
				: "The host kept the checkpoint. Propose one task_plan covering execution and acceptance for the user to authorize. Do not repeatedly request stage budgets.",
		);
	}
	return task.reason === "binding-changed"
		? block("Binding changed: start a newly scoped task; old evidence/permissions cannot be reused.")
		: null;
}

function checkEffect(operations: TaskOperation[], key: string) {
	if (operations.some((operation) => operation.state === "unknown"))
		return block(
			"Unknown side effect: read-only reconciliation or explicit human outcome review required before new writes.",
		);
	if (
		operations.some(
			(operation) => operation.key === key && !["failed", "not-found"].includes(operation.state),
		)
	)
		return block(
			"idempotency-check: this effect already returned or has an unknown outcome. Query the saved receipt/read-only state before retrying; do not replay writes.",
		);
	if (
		operations.filter((operation) => operation.key === key && operation.state === "failed").length >=
		LIMITS.retries
	)
		return block(
			"no-progress: identical effect failed three times. Repair the input or deliver the checkpoint.",
		);
	return operations.length >= LIMITS.operations
		? block("Bounded operation ledger full. Deliver/export checkpoint; no entries silently removed.")
		: null;
}

function startEffect(
	task: TaskRecord,
	event: TaskToolCall,
	key: string,
	resourceKey: string,
	now: () => string,
) {
	const operation: TaskOperation = {
		id: clean(event.toolCallId, 100),
		key,
		tool: clean(event.toolName, 80),
		state: "started",
		at: now(),
		stage: task.stage,
		resourceKey,
	};
	if (
		event.toolName === "write" &&
		typeof event.input?.path === "string" &&
		typeof event.input.content === "string"
	)
		operation.artifact = {
			path: clean(event.input.path, 512),
			sha256: hash(event.input.content),
			bytes: Buffer.byteLength(event.input.content),
			intentOnly: true,
		};
	task.operations.push(operation);
	if (event.toolName === "ask_user") {
		task.state = "waiting_user";
		task.waitStartedAt ||= now();
	}
}

interface GuardOptions {
	readOnly(name: string): boolean;
	advanceStage(): boolean;
	save(): void;
	now(): string;
}

export function guardTask(
	book: TaskBook,
	task: TaskRecord | null,
	event: TaskToolCall,
	{ readOnly, advanceStage, save, now }: GuardOptions,
) {
	if (book.selectionRequired) throw taskError("task-selection-required", "Select a task first.");
	const name = event.toolName;
	if (name === "task_plan") return null;
	if (!task || terminal(task.state))
		return permittedBeforePlan(name, readOnly)
			? null
			: block(
					bilingual(
						"还没有获批的任务方案：Agent 需先做只读准备，再用 task_plan 提交目标、范围、写入目录和交付物，由你在弹窗中批准；批准前命令和写入都会被拦截。",
						"No approved task plan exists yet. First prepare the inputs without side effects, then call task_plan once with the goal, scope, write directories and deliverables; the application will ask you to approve that plan. Commands and writes stay blocked until approval.",
					),
				);
	if (task.budget.stageCalls >= LIMITS.stageCalls) advanceStage();
	if (name === "task_status") return null;
	if (terminal(task.state) || book.selectionRequired)
		return block("Select an unfinished task before starting tools.");
	const blocked = checkTaskGuard(task, name, readOnly, save);
	if (blocked) return blocked;
	const resourceKey = hash(`${book.scope}\0${name}\0${stable(event.input || {})}`);
	if (
		book.tasks.some(
			(other) =>
				other.id !== task.id &&
				other.operations.some(
					(operation) =>
						operation.resourceKey === resourceKey && ["unknown", "started"].includes(operation.state),
				),
		)
	)
		return block("Another task has this unknown effect; reconcile its outcome before repeating it.");
	const effect = !controls.has(name) && !readOnly(name);
	const key = hash(`${book.scope}\0${task.id}\0${name}\0${stable(event.input || {})}`);
	const blockedEffect = effect && checkEffect(task.operations, key);
	if (blockedEffect) return blockedEffect;
	task.budget.calls++;
	task.budget.stageCalls++;
	if (!controls.has(name) && event.toolCallId) {
		task.pendingObservations ||= [];
		task.pendingObservations.push(clean(event.toolCallId, 100));
		task.pendingObservations = task.pendingObservations.slice(-LIMITS.totalCalls);
	}
	if (effect) startEffect(task, event, key, resourceKey, now);
	save();
	return null;
}
