import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { TodoItem } from "../contracts.js";
import { isReadOnlyTool } from "./tool-manifest.js";
import { clean as safe, type TaskEntry, type TaskToolResult } from "./workbench-state.js";

const TASK_ENTRY = "drone-task-checkpoint-v1";
const TASK_DOCUMENT_KIND = "drone.task.workbench";
const CONTROL = /* @__PURE__ */ new Set([
	"set_status",
	"todo",
	"capability_load",
	"task_status",
	"research_task_status",
]);
function continuesTask(text: string) {
	return /^(?:继续(?:吧|执行|处理|完成|上一任务)?|接着(?:做|处理)?|下好了|下载好了|我下载了(?:，?手动的那几篇)?|完成到哪了|进度(?:如何|怎么样)?|查看(?:任务)?进度|任务状态|continue|resume|done|status|what(?:'s| is) the status)[\s,.!？，。！?]*$/i.test(
		String(text).trim(),
	);
}
function isTaskStatusQuery(text: string) {
	return /^(?:完成到哪了|进度(?:如何|怎么样)?|查看(?:任务)?进度|任务状态|task status|what(?:'s| is) the status)[\s.!？，。！?]*$/i.test(
		String(text).trim(),
	);
}
interface LegacyReceipt {
	id: string;
	tool: string;
	at: string;
	state?: string;
	artifact?: { path: string; bytes: number; sha256: string };
}
interface LegacyTask {
	version: 1;
	kind: string;
	scope: string | null;
	id: string;
	goal: string;
	state: string;
	receipts: LegacyReceipt[];
	pending: LegacyReceipt[];
	startedAt: string;
	updatedAt?: string;
	proposedNext?: string | null;
	reason?: string | null;
}
const valid = (value: LegacyTask | null, scope: string | null): value is LegacyTask =>
	value?.version === 1 &&
	(!value.kind || value.kind === TASK_DOCUMENT_KIND) &&
	value.scope === scope &&
	typeof value.id === "string" &&
	typeof value.goal === "string" &&
	value.goal.length <= 180 &&
	Array.isArray(value.receipts) &&
	value.receipts.length <= 24 &&
	Array.isArray(value.pending) &&
	value.pending.length <= 32 &&
	JSON.stringify(value).length <= 24e3;
async function observeLegacyFile(cwd: string, path: string) {
	try {
		const base = await realpath(cwd),
			full = await realpath(resolve(cwd, path));
		const rel = relative(base, full);
		if (
			!rel ||
			isAbsolute(rel) ||
			rel === ".." ||
			rel.startsWith(`..${sep}`) ||
			rel
				.split(sep)
				.some((part) => part.startsWith(".") || /^(?:auth|credentials|secrets?)(?:\.|$)/i.test(part))
		)
			return;
		const stat = await lstat(full);
		if (!stat.isFile() || stat.size > 8 * 1024 * 1024) return;
		const bytes = await readFile(full);
		return {
			path: safe(rel, 512),
			bytes: bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
		};
	} catch {
		return;
	}
}
function restoreTask(entries: readonly TaskEntry[], scope: string) {
	let task: LegacyTask | null = null;
	for (const entry of entries) {
		const data = entry.data as LegacyTask | null;
		if (entry.customType === TASK_ENTRY && valid(data, scope)) task = structuredClone(data);
	}
	if (task?.pending.length) {
		task.state = "interrupted";
		task.reason = "execution-result-unknown";
	}
	return task;
}

const newTask = (scope: string | null, query: string, startedAt: string): LegacyTask => ({
	kind: TASK_DOCUMENT_KIND,
	version: 1,
	scope,
	id: randomUUID(),
	goal: safe(query),
	state: "running",
	receipts: [],
	pending: [],
	startedAt,
});

function startLegacyTool(task: LegacyTask | null, id: string, tool: string, now: () => string) {
	if (!task || CONTROL.has(tool) || isReadOnlyTool(tool)) return false;
	if (task.pending.some((pending) => pending.id === id) || task.pending.length >= 32) return false;
	task.pending.push({ id: safe(id, 100), tool: safe(tool, 80), at: now() });
	if (tool === "ask_user") task.state = "waiting_user";
	return true;
}

type JournalOptions = { persist?(task: LegacyTask): void; now?(): string };

function createTaskJournal({
	persist = () => undefined,
	now = () => /* @__PURE__ */ new Date().toISOString(),
}: JournalOptions = {}) {
	let task: LegacyTask | null = null;
	let scope: string | null = null;
	let requested = false;
	const save = () => {
		if (!task) return;
		task.updatedAt = now();
		persist(structuredClone(task));
	};
	function attach(nextScope: string, entries: readonly TaskEntry[] = [], force = false) {
		if (scope === nextScope && !force) return;
		scope = nextScope;
		task = null;
		requested = false;
		task = restoreTask(entries, scope);
	}
	function begin(query: string) {
		if (!task || !continuesTask(query)) task = newTask(scope, query, now());
		else {
			task.state = "running";
			task.reason = null;
		}
		requested = false;
		save();
	}
	const render = () => renderLegacyTask(task);
	return {
		attach,
		begin,
		start(id: string, tool: string) {
			if (startLegacyTool(task, id, tool, now)) save();
		},
		observe: (event: TaskToolResult, cwd: string) => observeLegacyTask(() => task, event, cwd, now, save),
		pause(reason: string) {
			if (!task) return;
			task.state = "paused";
			task.reason = safe(reason, 80);
			save();
		},
		settle() {
			if (task?.state !== "running") return;
			task.state = task.pending.length ? "interrupted" : "checkpoint";
			save();
		},
		render,
		snapshot: () => (task ? structuredClone(task) : null),
		requestReport: () => {
			requested = true;
		},
		takeReport() {
			const pending = requested;
			requested = false;
			return pending ? render() : null;
		},
	};
}

async function observeLegacyTask(
	getTask: () => LegacyTask | null,
	event: TaskToolResult,
	cwd: string,
	now: () => string,
	save: () => void,
) {
	const task = getTask();
	if (!task) return;
	if (event.toolName === "todo" && Array.isArray(event.details?.todos)) {
		const todos = event.details.todos as TodoItem[];
		const next =
			todos.find((item) => item.status === "in_progress") || todos.find((item) => item.status === "pending");
		task.proposedNext = next ? safe(next.content, 180) : null;
		save();
		return;
	}
	if (CONTROL.has(event.toolName) || isReadOnlyTool(event.toolName)) return;
	const id = safe(event.toolCallId, 100),
		tool = safe(event.toolName, 80);
	if (!id || task.receipts.some((r) => r.id === id)) return;
	task.pending = task.pending.filter((p) => p.id !== id);
	const details = event.details || {};
	const failed = event.isError || details.status === "failed" || (details.error && details.successful === 0);
	const text = (event.content || [])
		.filter((b) => b.type === "text")
		.map((b) => b.text)
		.join(" ");
	const cancelled = tool === "ask_user" && (details.cancelled || /cancelled|canceled/i.test(text));
	const receipt: LegacyReceipt = {
		id,
		tool,
		at: now(),
		state: failed ? "failed" : cancelled ? "cancelled" : "returned",
	};
	if (!failed && ["write", "edit"].includes(tool) && typeof event.input?.path === "string") {
		const artifact = await observeLegacyFile(cwd, event.input.path);
		if (artifact) {
			receipt.artifact = artifact;
			receipt.state = "file-observed";
		}
	}
	const current = getTask();
	if (!current) throw new Error("Task was detached while observing its result.");
	if (!failed && tool === "research_propose_wiki_update" && typeof details.id === "string")
		receipt.state = "awaiting_review";
	current.receipts.push(receipt);
	current.receipts = current.receipts.slice(-24);
	if (cancelled) current.state = "waiting_user";
	else if (failed) current.state = "partial";
	else if (tool === "ask_user" && current.state === "waiting_user") current.state = "running";
	else if (!["waiting_user", "partial", "paused", "interrupted"].includes(current.state))
		current.state = "running";
	save();
}

function renderLegacyTask(task: LegacyTask | null) {
	if (!task) return "\u8FD9\u4E2A\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u4EFB\u52A1\u8BB0\u5F55\u3002";
	const states: Record<string, string> = {
		running: "执行中",
		waiting_user: "等你决定",
		partial: "部分受阻",
		paused: "已暂停",
		interrupted: "结果待核对",
		checkpoint: "进度已保存",
	};
	const lines = [
		"### \u4EFB\u52A1\u8FDB\u5C55",
		`\u4EFB\u52A1\uFF1A${safe(task.goal)}`,
		`状态：${states[task.state] || "待核对"}；更新于 ${safe(task.updatedAt, 60)}`,
	];
	const labels: Record<string, string> = {
		returned: "\u5DF2\u6267\u884C\uFF0C\u7ED3\u679C\u5F85\u6838\u5BF9",
		failed: "\u5DE5\u5177\u62A5\u544A\u5931\u8D25",
		cancelled: "\u7528\u6237\u53D6\u6D88\u4E86\u9009\u62E9\uFF0C\u672A\u6388\u4E88\u65B0\u6743\u9650",
		"file-observed": "\u6587\u4EF6\u5DF2\u751F\u6210\u5E76\u8BFB\u5230\u5185\u5BB9",
		awaiting_review: "\u5DF2\u63D0\u4EA4\uFF0C\u7B49\u4F60\u5BA1\u9605",
	};
	for (const r of task.receipts.slice(-8))
		lines.push(
			`- ${safe(r.tool, 80)}：${labels[r.state ?? ""] || "状态待核对"}${r.artifact ? `；${safe(r.artifact.path, 512)}（${Number(r.artifact.bytes) || 0} 字节）` : ""}`,
		);
	if (task.proposedNext)
		lines.push(
			`\u6A21\u578B\u8BA1\u5212\u7684\u4E0B\u4E00\u6B65\uFF08\u4E0D\u662F\u5B8C\u6210\u8BC1\u660E\uFF09\uFF1A${safe(task.proposedNext)}`,
		);
	if (task.reason) lines.push(`\u6682\u505C\u539F\u56E0\uFF1A${safe(task.reason, 80)}\u3002`);
	if (task.pending.length)
		lines.push(
			"\u6709\u64CD\u4F5C\u4E0A\u6B21\u6CA1\u7B49\u5230\u7ED3\u679C\uFF1B\u7EE7\u7EED\u524D\u5148\u67E5\u4E00\u4E0B\u5B83\u505A\u6CA1\u505A\u6210\uFF0C\u4E0D\u5F97\u76F4\u63A5\u91CD\u590D\u5199\u5165\u3001\u5B89\u88C5\u6216\u4E0A\u4F20\u3002",
		);
	return lines.join("\n");
}

export { continuesTask, createTaskJournal, isTaskStatusQuery, TASK_DOCUMENT_KIND, TASK_ENTRY };
