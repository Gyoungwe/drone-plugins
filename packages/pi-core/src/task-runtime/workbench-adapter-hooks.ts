import type { AgentEndEvent, BeforeAgentStartEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	FAILURE_EXPLANATION_POLICY,
	failureContext,
	failureObservation,
	TASK_HANDOFF_POLICY,
	toolResultFailed,
} from "./failure-feedback.js";
import { hostLanguage } from "./host-language.js";
import type { createTaskProgression } from "./progress-action.js";
import { isTaskStatusQuery } from "./status-query.js";
import { restoreTaskToolOrder } from "./tool-protocol.js";
import { shouldAskToContinue } from "./turn-end-prompt.js";
import type { WorkbenchAdapter } from "./workbench-adapter.js";
import { clean, type TaskToolResult } from "./workbench-state.js";

type Progress = ReturnType<typeof createTaskProgression>;
type AcceptanceKinds = ReturnType<NonNullable<WorkbenchAdapter["ports"]["acceptance"]>["kinds"]>;
type Publication = { knowledgePublication?: { status: string; reason: string } };

function taskContextMessage(
	event: BeforeAgentStartEvent,
	adapter: WorkbenchAdapter,
	remoteKinds: AcceptanceKinds,
) {
	const listed = remoteKinds
		.map(({ kind, fields }) => `${kind} (${fields.join(", ") || "no fields"})`)
		.join("; ");
	return {
		systemPrompt: `${event.systemPrompt || ""}\n\n${FAILURE_EXPLANATION_POLICY}\n\n${TASK_HANDOFF_POLICY}`,
		message: {
			customType: "drone-task-context",
			display: false,
			content: `${adapter.journal.render()}
${listed ? `Acceptance kinds from installed plugins (task_plan acceptance.kind and fields): ${listed}.\n` : ""}${hostLanguage() === "zh" ? "（以下为宿主约束，写给用户看的内容一律用简体中文。）\n" : ""}Host observations only. For substantial execution, first do read-only preparation, consolidate necessary choices/assumptions and call task_plan ONCE with the original user goal, a plain-language scope summary, existing write directories, and file-based deliverables. task_plan automatically opens the host ask_user form for task execution, directory writes, acceptance and automatic stage continuation. Task cards are status and request-entry UI, not consent. Do not duplicate the host question or treat free text as authorization. If declined, stop at the checkpoint. Additional authorization actions from task_wait also open ask_user. Within approved scope, perform routine steps and bounded recovery autonomously; only new risk/scope, credentials, genuinely unavailable user data or actual required human review need intervention. Never claim human/scientific review happened automatically. Prefer machine-checkable deliverables over unnecessary human-review milestones. Preserve prior refusals. File/command denies, sensitive files, unknown effects, total call budget and provenance checks remain binding. task_status delivers host-only results.`,
		},
	};
}

function registerInputHooks(adapter: WorkbenchAdapter) {
	const { on, attachment, attach, session, journal, ports, status, handoff, bindingKey } = adapter;
	const prepare = async (query: string, ctx: ExtensionContext) => {
		await attach(ctx);
		const caps = await ports.capabilities(ctx);
		const result = await journal.begin(query, caps, await bindingKey());
		attachment.halted = false;
		return result;
	};
	on("input", async (event, ctx) => {
		if (session.status().persistence) {
			attachment.halted = true;
			await ports.notifyError(ctx, session.status().render);
			return { action: "handled" };
		}
		if (!event.images?.length && isTaskStatusQuery(event.text)) {
			await attach(ctx);
			await status.send(undefined, "task-status");
			return { action: "handled" };
		}
		handoff.cancel();
		if (!(await ports.idle(ctx))) return { action: "continue" };
		try {
			const result = await prepare(event.text, ctx);
			if (result.selectionRequired || result.blocked) {
				await status.send();
				return { action: "handled" };
			}
			if (result.deferredReview && !result.stageReleased) await status.send();
			attachment.prepared = true;
		} catch (error) {
			attachment.halted = true;
			if (session.status().persistence) await ports.notifyError(ctx, session.status().render);
			else await status.send(`任务未开始：${clean((error as Error).message)}\n${journal.render()}`);
			return { action: "handled" };
		}
		return { action: "continue" };
	});
	registerModelHooks(adapter, prepare);
}

function registerModelHooks(
	adapter: WorkbenchAdapter,
	prepare: (query: string, ctx: ExtensionContext) => ReturnType<WorkbenchAdapter["journal"]["begin"]>,
) {
	const { on, status, ports, attachment, handoff, journal, bindingKey } = adapter;
	on("before_agent_start", async (event, ctx) => {
		status.start();
		await ports.acceptance?.load(ctx.signal);
		const remoteKinds = ports.acceptance?.kinds() || [];
		if (!attachment.prepared) {
			try {
				await prepare(event.prompt, ctx);
			} catch {
				attachment.halted = true;
			}
		}
		attachment.prepared = false;
		attachment.awaitingUser = !handoff.state.automaticTurn;
		handoff.state.automaticTurn = false;
		return taskContextMessage(event, adapter, remoteKinds);
	});
	on("message_start", async (event, ctx) => {
		if (journal.isAutoContinuation(event.message)) {
			attachment.prepared = handoff.state.automaticTurn = attachment.awaitingUser = false;
			const result = await journal.begin("继续", [], await bindingKey());
			attachment.halted = !!result.blocked;
			return;
		}
		if (event.message.role !== "user") return;
		if (attachment.awaitingUser) {
			attachment.awaitingUser = false;
			return;
		}
		const content = event.message.content;
		const query =
			typeof content === "string"
				? content
				: (content || [])
						.filter((block) => block.type === "text")
						.map((block) => block.text)
						.join("\n");
		try {
			const result = await prepare(query, ctx);
			if (result.selectionRequired || result.blocked) {
				attachment.halted = true;
				await status.send();
			}
		} catch {
			attachment.halted = true;
		}
	});
}

function registerToolHooks(adapter: WorkbenchAdapter) {
	const { on, status, session, ports, attachment, journal, evidence, bindingKey } = adapter;
	const refresh = async (ctx: ExtensionContext) =>
		session.turn({ kind: "storage", storage: await ports.storage(ctx) }, ctx.signal);
	on("context", async (event, ctx) => {
		await refresh(ctx);
		return { messages: restoreTaskToolOrder(event.messages) };
	});
	on("turn_start", status.start);
	on("turn_end", () => {
		if (!ports.statusAfterRun) status.flush();
	});
	on("tool_call", async (event, ctx) => {
		status.start();
		await refresh(ctx);
		if (attachment.halted && event.toolName !== "task_status")
			return {
				block: true,
				reason:
					"Task selection/recovery is required. Return the saved task status; do not perform queued effects.",
			};
		try {
			return (await journal.guard(event)) || undefined;
		} catch (error) {
			return { block: true, reason: clean((error as Error).message) };
		}
	});
	const acceptance = ports.acceptance;
	if (acceptance)
		on("tool_execution_end", async (event, ctx) => {
			const task = journal.snapshot();
			if (!task) return;
			for (const { kind, identity } of await acceptance.identify(task.milestones, ctx.signal))
				await journal.identified({ toolCallId: event.toolCallId, toolName: event.toolName, kind, identity });
		});
	on("tool_result", async (event, ctx) => {
		const result = event as TaskToolResult;
		await journal.observe(result, ctx.cwd);
		if (event.toolName === "read" && !event.isError)
			await evidence.capture(event, ctx.cwd, await bindingKey());
		if (toolResultFailed(result)) {
			const text = failureContext(
				journal.snapshot(),
				failureObservation(result, /* @__PURE__ */ new Date().toISOString()),
			);
			return { content: [...(event.content || []), { type: "text", text }] };
		}
	});
}

async function endTurn(
	event: AgentEndEvent,
	ctx: ExtensionContext,
	adapter: WorkbenchAdapter,
	progress: Progress,
) {
	const { attachment, ports, status, handoff, journal } = adapter;
	const turnContext = attachment.context,
		turnSessionId = attachment.sessionId;
	const sessionId =
		ctx?.sessionManager?.getSessionId?.() || (ctx as ExtensionContext & { sessionId?: string })?.sessionId;
	if (!turnContext || !turnSessionId || turnSessionId !== sessionId) return;
	const currentTurn = () => attachment.sessionId === turnSessionId && attachment.context === turnContext;
	const last = [...(event.messages || [])].reverse().find((message) => message.role === "assistant");
	if (!ports.statusAfterRun) status.flush();
	if (
		last?.stopReason === "aborted" ||
		ctx?.signal?.aborted ||
		/was aborted|request aborted/i.test(last?.errorMessage || "")
	) {
		handoff.cancel();
		await journal.pause("user-aborted");
		return void (await status.send());
	}
	await journal.settle();
	if (!journal.authorization()) return void (await status.send());
	await journal.reconcile(turnContext.cwd);
	if (last?.stopReason === "error") return void (await status.send());
	const publication = (last as Publication | undefined)?.knowledgePublication;
	if (publication?.status === "blocked" && (await journal.reserveContinuation(publication.reason))) {
		await status.send(
			"刚才停了一下，正在按你之前的授权接着做：先核对已有结果，再继续剩下的部分，不用你再确认。",
		);
		if (currentTurn()) await handoff.continueAuthorized(turnContext);
		return;
	}
	if (!ctx?.signal?.aborted && (await journal.reserveHandoff())) {
		await status.send();
		if (currentTurn()) await handoff.continueAuthorized(turnContext);
		return;
	}
	const snapshot = journal.snapshot();
	if (
		!ctx?.signal?.aborted &&
		snapshot &&
		shouldAskToContinue(journal.view().tasks.find((task) => task.id === snapshot.id))
	) {
		await status.send();
		if (ports.statusAfterRun) handoff.state.pendingAsk = snapshot.id;
		else if (currentTurn()) {
			try {
				await progress({ taskId: snapshot.id, revision: journal.view().revision }, turnContext);
			} catch {
				return;
			}
		}
		return;
	}
	await status.send();
}

export function registerWorkbenchHooks(adapter: WorkbenchAdapter, progress: Progress) {
	const { on, bind, attachment, attach, ports, status, handoff, journal, evidence } = adapter;
	on("session_shutdown", () => {
		handoff.cancel();
		attachment.sessionId = attachment.context = undefined;
	});
	ports.onHostEvent?.(
		"drone:task-write-consent",
		bind(
			(value: unknown, _ctx?: ExtensionContext) => {
				const request = value as { cwd: string; sessionId: string; respond?(authorization: unknown): void };
				const ctx = attachment.context;
				if (ctx && request.cwd === ctx.cwd && request.sessionId === ctx.sessionManager?.getSessionId?.())
					request.respond?.(journal.authorization(true));
			},
			(_event, ctx) => ctx,
		),
	);
	on("session_start", async (_event, ctx) => {
		handoff.cancel();
		status.reset();
		await ports.acceptance?.load(ctx.signal);
		await attach(ctx, true);
		attachment.prepared = attachment.awaitingUser = false;
	});
	on("session_tree", async (_event, ctx) => {
		handoff.cancel();
		status.reset();
		await attach(ctx, true);
		attachment.prepared = attachment.halted = false;
	});
	registerInputHooks(adapter);
	registerToolHooks(adapter);
	if (ports.statusAfterRun)
		on("agent_settled", async (_event, ctx) => {
			await status.flush();
			const taskId = handoff.state.pendingAsk;
			handoff.state.pendingAsk = null;
			if (taskId && journal.snapshot()?.id === taskId)
				await progress({ taskId, revision: journal.view().revision }, ctx);
		});
	ports.onHostEvent?.(
		"drone:context-evicted",
		bind(
			async (value: unknown, _ctx?: ExtensionContext) => {
				const event = value as { sessionId: string; toolCallIds: readonly string[] };
				if (event.sessionId === attachment.sessionId) await evidence.evict(event.toolCallIds);
			},
			(_event, ctx) => ctx,
		),
	);
	on("agent_end", (event, ctx) => endTurn(event, ctx, adapter, progress));
}
