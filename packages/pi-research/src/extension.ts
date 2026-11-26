import { createResearchReceiptJournal, type ResearchJournalPorts } from "./core/receipt-journal.js";
import type { ResearchUsageSample } from "./core/research-breaker.js";
import {
	deliveryMemoryClaims,
	type PreparedResearchDelivery,
	type ResearchDeliveryCopy,
	type ResearchDeliveryReceipt,
	type ResearchSummaryReviewPacket,
	summaryReviewPacket,
	validateSummaryAssessment,
} from "./core/research-delivery.js";
import type { ResearchToolStep } from "./core/research-fast-path.js";
import { createResearchLoop, type ResearchLoopPorts } from "./core/research-loop.js";
import { recordOf } from "./core/research-loop-state.js";
import { observeExecutionReceipt } from "./core/run-provenance.js";
import { type Context, researchLoopTool, startCallId, type Tool } from "./research-loop-tool.js";

export type { FailureCandidateInput, FailureCandidateSink } from "./core/failure-candidates.js";

type Listener = (event: unknown, ctx: Context) => unknown;
type Pi = {
	events?: {
		on?(name: string, listener: (payload: unknown) => unknown): unknown;
		emit?(...args: unknown[]): unknown;
	};
	registerTool(definition: Tool): void;
	on?(event: string, listener: Listener): unknown;
};
type Loop = ReturnType<typeof createResearchLoop>;
type Journal = ReturnType<typeof createResearchReceiptJournal>;
type Project = { project: string };
type Pending = ResearchToolStep & {
	args: Record<string, unknown>;
	admission?: "allowed" | "blocked";
	activeRun?: string;
};
type Session = {
	cwd: string;
	journal: Journal;
	pending: Map<string, Pending>;
	awaitingUserStart: boolean;
	startUsage?: { callId: string; sample: ResearchUsageSample };
};

export interface ResearchExtensionPorts extends ResearchLoopPorts {
	resolveSessionProject(ctx: Context, requested?: string): Promise<Project>;
	describeProject(resolution: Project): unknown;
	registerTool(pi: Pi, tool: Tool): void;
	run<T>(operation: () => T | Promise<T>): Promise<T>;
	reviewSummary?(ctx: Context, packet: ResearchSummaryReviewPacket): Promise<unknown>;
}

export interface ResearchDeliveryWriterResult<T> {
	value: T;
	copies: readonly ResearchDeliveryCopy[];
	rollback(): Promise<void>;
}
export interface ResearchExtensionHandle {
	deliver<T>(
		ctx: Context,
		input: { runDir: string; markdown: string; claims?: unknown },
		writer: (prepared: PreparedResearchDelivery) => Promise<ResearchDeliveryWriterResult<T>>,
	): Promise<{ value: T; receipt: ResearchDeliveryReceipt; claims: readonly Record<string, unknown>[] }>;
}

const USER_QUESTION_FOCUS =
	"Answer the current question. Use evidence for factual research claims. For simple questions with local literature tools, start a fast_readonly run and complete from verified local excerpts. If evidence is insufficient or a write is required, explicitly escalate before using deep research tools. For substantive tasks, do bounded read-only preparation and consolidate scope, permissions and deliverables into one task_plan for user approval. Carry out authorized steps within that scope and respect prior decisions. Request approval for new risks or scope. Link actual outputs, distinguish execution from validation, and keep internal counters out of the answer.";

function sessionKey(ctx: Context): string {
	return ctx.sessionManager?.getSessionId?.() || ctx.sessionId || ctx.cwd;
}

function controlStep(step: ResearchToolStep) {
	return (
		step.toolName === "research_loop" && (step.args?.action === "status" || step.args?.action === "escalate")
	);
}

function toolEvent(raw: unknown) {
	const event = recordOf(raw);
	if (typeof event.toolCallId !== "string" || typeof event.toolName !== "string") return;
	return { event, id: event.toolCallId, toolName: event.toolName };
}

async function admitTool(loop: Loop, session: Session, call: NonNullable<ReturnType<typeof toolEvent>>) {
	const activeRun = session.journal.currentRun();
	const step = { toolName: call.toolName, args: recordOf(call.event.input) };
	const reserved = [...session.pending.values()].filter(
		(item) => item.admission === "allowed" && item.activeRun === activeRun && !controlStep(item),
	);
	const block = activeRun ? await loop.checkTool(session.cwd, activeRun, step, reserved) : undefined;
	session.pending.set(call.id, { ...step, activeRun, admission: block ? "blocked" : "allowed" });
	return block;
}

async function recordToolEnd(loop: Loop, session: Session, ended: NonNullable<ReturnType<typeof toolEvent>>) {
	const started = session.pending.get(ended.id);
	session.pending.delete(ended.id);
	if (
		!started ||
		started.toolName !== ended.toolName ||
		started.admission === "blocked" ||
		controlStep(started)
	)
		return;
	const runDir = session.journal.currentRun();
	const startsRun = started.toolName === "research_loop" && started.args.action === "start";
	if (started.activeRun && started.activeRun !== runDir && !startsRun) return;
	const result = recordOf(ended.event.result);
	const isError = ended.event.isError === true;
	const executed = !isError || typeof ended.event.durationMs === "number";
	await session.journal.record({
		toolCallId: ended.id,
		toolName: ended.toolName,
		args: started.args,
		details: recordOf(result.details),
		isError,
		countedStep: executed && started.admission === "allowed" && Boolean(started.activeRun || startsRun),
		...(ended.toolName === "read" && { content: result.content }),
	});
	if (session.startUsage?.callId === ended.id) {
		const { sample } = session.startUsage;
		session.startUsage = undefined;
		if (startsRun && !isError && runDir) await loop.observeUsage(session.cwd, runDir, sample);
	}
}

function subscribeTools(
	pi: Pi,
	ports: ResearchExtensionPorts,
	loop: Loop,
	sessions: Map<string, Session>,
	sessionFor: (ctx: Context) => Session,
) {
	pi.on?.("tool_execution_start", (raw, ctx) =>
		ports.run(() => {
			const started = toolEvent(raw);
			if (!started) return;
			const pending = sessionFor(ctx).pending;
			const oldest = pending.keys().next();
			if (pending.size >= 256 && !oldest.done) pending.delete(oldest.value);
			pending.set(started.id, { toolName: started.toolName, args: recordOf(started.event.args) });
		}),
	);
	pi.on?.("tool_call", (raw, ctx) =>
		ports.run(() => {
			const call = toolEvent(raw);
			return call && admitTool(loop, sessionFor(ctx), call);
		}),
	);
	pi.on?.("tool_execution_end", (raw, ctx) =>
		ports.run(() => {
			const ended = toolEvent(raw);
			const session = sessions.get(sessionKey(ctx));
			return ended && session ? recordToolEnd(loop, session, ended) : undefined;
		}),
	);
}

function sdkUsageSample(raw: unknown): ResearchUsageSample {
	const usage = recordOf(raw) as {
		reported?: boolean;
		input?: number;
		output?: number;
		cacheWrite?: number;
		cacheRead?: number;
		cost?: { total?: number };
	};
	const { input, output, cacheRead, cacheWrite } = usage;
	const hasCounts = [input, output, cacheRead, cacheWrite].some(
		(count) => typeof count === "number" && Number.isSafeInteger(count) && count > 0,
	);
	return {
		reported: usage.reported === true || (usage.reported === undefined && hasCounts),
		inputTokens: input,
		outputTokens: output,
		cacheReadTokens: cacheRead,
		cacheWriteTokens: cacheWrite,
		cost: usage.cost?.total || (usage.reported === true ? usage.cost?.total : undefined),
	};
}

function subscribeTelemetry(
	pi: Pi,
	ports: ResearchExtensionPorts,
	loop: Loop,
	sessions: Map<string, Session>,
) {
	pi.on?.("message_end", (raw, ctx) =>
		ports.run(async () => {
			const message = recordOf(recordOf(raw).message);
			const session = sessions.get(sessionKey(ctx));
			if (!session || message.role !== "assistant") return;
			const sample = sdkUsageSample(message.usage);
			const runDir = session.journal.currentRun();
			const callId = startCallId(message.content);
			session.startUsage = !runDir && callId ? { callId, sample } : undefined;
			if (runDir) await loop.observeUsage(ctx.cwd, runDir, sample);
		}),
	);
	const eviction = (raw: unknown) =>
		ports.run(async () => {
			const event = recordOf(raw);
			if (typeof event.sessionId !== "string" || !Array.isArray(event.toolCallIds)) return;
			const session = sessions.get(event.sessionId);
			const runDir = session?.journal.currentRun();
			if (session && runDir)
				await loop.observeContextEviction(session.cwd, runDir, {
					toolCallIds: event.toolCallIds,
					observedAt: new Date().toISOString(),
				});
		});
	if (pi.events?.on) pi.events.on("drone:context-evicted", eviction);
	else
		pi.on?.("drone:context-evicted", (raw, ctx) =>
			recordOf(raw).sessionId === sessionKey(ctx) ? eviction(raw) : undefined,
		);
}

function subscribeTurns(
	pi: Pi,
	ports: ResearchExtensionPorts,
	loop: Loop,
	sessions: Map<string, Session>,
	fresh: (ctx: Context) => Session,
) {
	pi.on?.("before_agent_start", (raw, ctx) =>
		ports.run(async () => {
			const previous = sessions.get(sessionKey(ctx));
			fresh(ctx).awaitingUserStart = true;
			await previous?.journal.close();
			return { systemPrompt: `${recordOf(raw).systemPrompt}\n\n${USER_QUESTION_FOCUS}` };
		}),
	);
	pi.on?.("message_start", (raw, ctx) => {
		if (recordOf(recordOf(raw).message).role !== "user") return;
		return ports.run(async () => {
			const key = sessionKey(ctx);
			const session = sessions.get(key);
			if (session?.awaitingUserStart) session.awaitingUserStart = false;
			else {
				await session?.journal.close();
				sessions.delete(key);
			}
		});
	});
	pi.on?.("session_shutdown", (_event, ctx) =>
		ports.run(async () => {
			const key = sessionKey(ctx);
			await sessions.get(key)?.journal.close();
			sessions.delete(key);
			if (!sessions.size) loop.dispose();
		}),
	);
}

function deliveryHandle(
	ports: ResearchExtensionPorts,
	loop: Loop,
	sessionFor: (ctx: Context) => Session,
): ResearchExtensionHandle {
	return {
		deliver: (ctx, input, writer) =>
			ports.run(() =>
				sessionFor(ctx).journal.execute(input.runDir, async () => {
					const prepared = await loop.prepareResearchDelivery({ cwd: ctx.cwd, ...input });
					const claims = deliveryMemoryClaims(input.claims, prepared);
					const packet = summaryReviewPacket(prepared, claims);
					if (!ports.reviewSummary)
						throw new Error(
							"Summary semantic reviewer is unavailable; keep this summary as an unreviewed draft",
						);
					const assessment = validateSummaryAssessment(await ports.reviewSummary(ctx, packet), packet);
					const current = await loop.prepareResearchDelivery({ cwd: ctx.cwd, ...input });
					if (
						current.evidenceRevision !== prepared.evidenceRevision ||
						current.gateSha256 !== prepared.gateSha256 ||
						current.claimsSha256 !== prepared.claimsSha256
					)
						throw new Error("Research evidence changed during semantic review; no summary was written");
					const written = await writer(prepared);
					try {
						const receipt = await loop.commitResearchDelivery({
							cwd: ctx.cwd,
							runDir: input.runDir,
							prepared,
							copies: written.copies,
							assessment,
							memoryClaims: claims,
						});
						return { run_dir: input.runDir, value: written.value, receipt, claims };
					} catch (error) {
						await written.rollback();
						throw error;
					}
				}),
			),
	};
}

export function registerResearchExtension(
	pi: Pi,
	ports: ResearchExtensionPorts,
): ResearchExtensionHandle | undefined {
	if (process.env.PI_SUBAGENT_CHILD === "1") return;
	const loop = createResearchLoop({
		...ports,
		breakerBudget: ports.breakerBudget ?? { maxBilledTokens: 24_000 },
	});
	const sessions = new Map<string, Session>();
	const journalPorts: ResearchJournalPorts = {
		workspace: ports.workspace,
		owners: new Map<string, symbol>(),
		observeExecution: async ({ toolCallId, toolName, ...event }) =>
			toolCallId && toolName
				? observeExecutionReceipt({ ...event, toolCallId, toolName, loadWorkspaceConfig: ports.workspace })
				: null,
		status: (cwd: string, runDir: string) => loop.updateResearchLoop({ cwd, runDir, action: "status" }),
		flush: (cwd: string, runDir: string) => loop.flushResearchReceipts({ cwd, runDir }),
		reset: (cwd: string, runDir: string) => loop.resetResearchReceipts({ cwd, runDir }),
		observeResearch: loop.observeResearchReceipt,
	};
	const fresh = (ctx: Context) => {
		const sessionId = sessionKey(ctx);
		const journal = createResearchReceiptJournal(ctx.cwd, { sessionId, ports: journalPorts });
		const session: Session = { cwd: ctx.cwd, journal, pending: new Map(), awaitingUserStart: false };
		sessions.set(sessionId, session);
		return session;
	};
	const sessionFor = (ctx: Context) => sessions.get(sessionKey(ctx)) ?? fresh(ctx);
	ports.registerTool(
		pi,
		researchLoopTool(ports, loop, (ctx) => sessionFor(ctx).journal),
	);
	subscribeTools(pi, ports, loop, sessions, sessionFor);
	subscribeTelemetry(pi, ports, loop, sessions);
	subscribeTurns(pi, ports, loop, sessions, fresh);
	return deliveryHandle(ports, loop, sessionFor);
}
