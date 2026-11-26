import { randomUUID } from "node:crypto";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SendStatus, TaskJournal, WorkbenchMessage, WorkbenchPorts } from "./workbench-adapter.js";
import { clean, terminal } from "./workbench-state.js";

export interface HandoffState {
	generation: number;
	timer?: ReturnType<typeof setTimeout>;
	automaticTurn: boolean;
	continuationToken: string | null;
	continuationPending: boolean;
	pendingAsk: string | null;
}

type Attachment = { context?: ExtensionContext; prepared: boolean };

async function sendContinuation(
	state: HandoffState,
	attachment: Attachment,
	ports: WorkbenchPorts,
	ctx: ExtensionContext,
	task: NonNullable<ReturnType<TaskJournal["snapshot"]>>,
	taskId: string,
) {
	attachment.prepared = state.automaticTurn = true;
	state.continuationToken = randomUUID();
	state.continuationPending = true;
	try {
		state.continuationToken = await ports.continueTask(ctx, {
			taskId,
			nonce: state.continuationToken,
			prompt: `Continue the user-authorized task: ${task.goal}. Scope: ${task.authorizationSummary}. Use saved results, verify uncertain effects before any retry, and complete the remaining deliverables. Do not request routine stage approval. Respect declined installs and all permission/validation gates. If blocked, explain each remaining deliverable: actual evidence, confirmed blocker (or explicitly unknown cause), next action, and whether the user must decide. Use task_status for the latest remaining summary. Resolve routine gaps autonomously; create a specific task_wait only for genuinely needed input/approval. Never change acceptance criteria or mark an item complete to fill the progress bar.`,
		});
	} finally {
		state.continuationPending = false;
	}
}

interface HandoffPorts {
	journal: TaskJournal;
	ports: WorkbenchPorts;
	attachment: Attachment;
	bindingKey(): Promise<string | null>;
	send: SendStatus;
}

function continueTask(
	{ journal, ports, attachment, bindingKey, send }: HandoffPorts,
	state: HandoffState,
	cancel: () => void,
	ctx: ExtensionContext,
) {
	const taskId = journal.snapshot()?.id;
	const generation = ++state.generation;
	let idleChecks = 0;
	const isCurrent = () =>
		generation === state.generation && attachment.context === ctx && journal.snapshot()?.id === taskId;
	const handoff = async () => {
		if (!taskId || !isCurrent() || !journal.authorization()) return;
		let idle: boolean;
		try {
			idle = ports.inlineHandoff || (await ports.idle(ctx));
		} catch {
			cancel();
			return;
		}
		if (!idle) {
			if (++idleChecks < 40) state.timer = setTimeout(() => void handoff().catch(cancel), 25);
			else {
				await journal.pause("auto-handoff-not-idle");
				await send();
			}
			return;
		}
		try {
			const binding = await bindingKey();
			if (!isCurrent()) return;
			const result = await journal.begin("继续", [], binding);
			const task = journal.snapshot();
			if (
				result.blocked ||
				!task ||
				["blocked", "waiting_user"].includes(task.state) ||
				!journal.authorization()
			) {
				await send();
				return;
			}
			await sendContinuation(state, attachment, ports, ctx, task, taskId);
		} catch (error) {
			if (!isCurrent() || terminal(journal.snapshot()?.state ?? "")) return;
			await journal.pause("auto-handoff-failed");
			await send(
				`没能自动接着做：${clean((error as Error).message)}。已有的结果都在，没有重复执行任何操作。`,
			);
		}
	};
	if (ports.inlineHandoff) return handoff().catch(cancel);
	state.timer = setTimeout(() => void handoff().catch(cancel), 0);
}

export function createHandoff(scope: HandoffPorts) {
	const { journal, ports } = scope;
	const state: HandoffState = {
		generation: 0,
		automaticTurn: false,
		continuationToken: null,
		continuationPending: false,
		pendingAsk: null,
	};
	const cancel = () => {
		state.generation++;
		clearTimeout(state.timer);
		state.automaticTurn = false;
		state.continuationToken = null;
		state.continuationPending = false;
		state.pendingAsk = null;
	};
	return {
		state,
		cancel,
		continueAuthorized: (ctx: ExtensionContext) => continueTask(scope, state, cancel, ctx),
		generation: () => state.generation,
		isAutoContinuation(message: WorkbenchMessage) {
			const id = ports.continuationId(message);
			const details = (message as { details?: { taskId?: string } }).details;
			return !!(
				id &&
				(id === state.continuationToken || state.continuationPending) &&
				details?.taskId === journal.snapshot()?.id &&
				journal.authorization()
			);
		},
	};
}
