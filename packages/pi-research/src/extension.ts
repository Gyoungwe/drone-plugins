import { createResearchReceiptJournal } from "./core/receipt-journal.js";
import { createResearchLoop, type ResearchLoopPorts } from "./core/research-loop.js";
import { observeExecutionReceipt } from "./core/run-provenance.js";

export interface ResearchExtensionPorts extends ResearchLoopPorts {
 resolveSessionProject(ctx: any, requested?: string): Promise<{ project: string; [key: string]: unknown }>;
 describeProject(resolution: any): unknown;
 registerTool(pi: any, tool: any): void;
 run<T>(operation: () => T | Promise<T>): Promise<T>;
}

const CLAIM_BINDING_SCHEMA = {
	type: "array",
	maxItems: 24,
	items: { type: "object", additionalProperties: true },
};
const USER_QUESTION_FOCUS =
	"Answer the user's current question. Use evidence for factual research claims, not unrelated citations for ordinary chat. For a simple factual question that can be answered from existing local knowledge, take the light path: retrieve, answer, and auto-deposit a bounded note when appropriate; do not create a task_plan or ask for write authorization just to answer. For substantive tasks, do bounded read-only preparation and consolidate scope, assumptions, needed permissions and deliverables into one task_plan for one user authorization. After authorization, carry out routine steps and recoverable checks within that scope without repeatedly asking whether to continue. Respect prior decisions, especially declined installs. New risks or scope, missing credentials and genuinely unavailable user data still require a specific request; never infer consent. At completion, explain what changed, link actual outputs or show key figures, separate execution from validation, and give one next step only if needed. Keep internal counters and tool logs out of the main answer.";

type Tool = {
	name: string;
	label: string;
	description: string;
	parameters: Record<string, unknown>;
	drone?: Record<string, unknown>;
	execute: (...args: any[]) => Promise<unknown>;
};
type Pi = {
	events?: {
		on?: (event: string, listener: (...args: any[]) => any) => unknown;
		emit?: (...args: any[]) => unknown;
	};
	registerTool(definition: Tool): void;
	on?: (event: string, listener: (...args: any[]) => any) => unknown;
};
type Loop = ReturnType<typeof createResearchLoop>;

type SessionState = {
	journals: Map<string, ReturnType<typeof createResearchReceiptJournal>>;
	pending: Map<
		string,
		{ args: Record<string, unknown>; journal: ReturnType<typeof createResearchReceiptJournal>; key: string }
	>;
	awaitingUserStart: Set<string>;
};

function sessionKey(ctx: any): string {
	return ctx?.sessionManager?.getSessionId?.() || ctx?.sessionId || ctx?.cwd || "";
}

export function registerResearchExtension(pi: Pi, ports: ResearchExtensionPorts): void {
	if (process.env.PI_SUBAGENT_CHILD === "1") return;
 const state: SessionState = { journals: new Map(), pending: new Map(), awaitingUserStart: new Set() };
 const owners = new Map<string, symbol>();
 const loop: Loop = createResearchLoop(ports);
 const run = ports.run;
 const journalPorts = {
  workspace: ports.workspace,
  status: async (cwd: string, runDir: string) => loop.updateResearchLoop({ cwd, runDir, action: "status" }),
  flush: async (cwd: string, runDir: string) => loop.flushResearchReceipts({ cwd, runDir }),
  reset: (cwd: string, runDir: string) => loop.resetResearchReceipts({ cwd, runDir }),
  observeExecution: (event: any) => observeExecutionReceipt(event),
  observeResearch: (event: any) => loop.observeResearchReceipt(event),
  owners,
 };
	const journalFor = (ctx: any) => {
		const key = sessionKey(ctx);
		let journal = state.journals.get(key);
		if (!journal) {
			journal = createResearchReceiptJournal(ctx.cwd, {
				sessionId: key,
    ports: journalPorts,
			});
			state.journals.set(key, journal);
		}
		return journal;
	};
	ports.registerTool(pi, {
		name: "research_loop",
		label: "Research evidence loop",
		drone: {
			libraryMode: true,
			recoverySafe: true,
			capabilities: ["research"],
			activity: { text: "正在检查研究证据链…", phase: "verification" },
		},
		description:
			"Create or inspect a scientific evidence gate. Prefer start and status; the host advances search, inspection, archive, claims and finalize from successful tools. Structured claim_bindings with observed source excerpts are required before complete/finalize; claim_refs alone do not establish support.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					enum: [
						"start",
						"record_local",
						"record_external",
						"inspect_sources",
						"verify_archive",
						"bind_claims",
						"finalize",
						"complete",
						"status",
					],
				},
				run_dir: { type: "string" },
				project: {
					type: "string",
					description:
						"Optional. The host resolves the project from the workspace (or the daily-space session choice); a different value is ignored.",
				},
				result_slug: { type: "string" },
				query: { type: "string" },
				requires_provenance: { type: "boolean" },
				source_refs: { type: "array", items: { type: "string" } },
				claim_refs: { type: "array", items: { type: "string" } },
				claim_bindings: CLAIM_BINDING_SCHEMA,
				outcome: { type: "string" },
				notes: { type: "string" },
			},
			required: ["action"],
		},
		async execute(_id: string, params: any, _signal: AbortSignal, _update: unknown, ctx: any) {
			return run(async () => {
				const journal = journalFor(ctx);
				const runDir = params.run_dir || journal.currentRun();
				if (params.action === "status" && !runDir) {
					const value = {
						run_dir: null,
						evidence_gate: { stage: "not-started", answerable: false },
						next_action: "start",
						guidance: "Call research_loop(action=start,query=the research question).",
					};
					return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
				}
				// One project identity per workspace (or per daily-space session); a different
				// model-supplied project is ignored and reported back.
				const projectResolution =
					params.action === "start"
						? await ports.resolveSessionProject(ctx, params.project)
						: null;
				const result: any = await journal.execute(runDir, async () =>
					params.action === "start"
						? loop.startResearchRun({
								cwd: ctx.cwd,
								project: projectResolution?.project,
								resultSlug: params.result_slug,
								query: params.query,
								requiresProvenance: params.requires_provenance === true,
							})
						: loop.updateResearchLoop({
								cwd: ctx.cwd,
								runDir,
								action: params.action,
								query: params.query,
								sourceRefs: params.source_refs || [],
								claimRefs: params.claim_refs || [],
								claimBindings: params.claim_bindings || [],
								outcome: params.outcome,
								notes: params.notes,
							}),
				);
				const gate = result?.evidence_gate;
				const visible =
					params.action === "status"
						? result
						: {
								run_dir: result?.run_dir,
								topic_id: result?.metadata?.topic_id,
								evidence_gate: gate && {
									stage: gate.stage,
									answerable: gate.answerable,
									archive_count: gate.archive_count,
									reuse_count: gate.reuse_count,
									source_refs: gate.source_refs,
									claim_count: gate.claim_refs.length,
									structured_claim_count: gate.claim_bindings.length,
									warnings: gate.warnings,
									scientificallyVerified: false,
								},
								receipt_journal: result?.receipt_journal,
								...(projectResolution ? { project: ports.describeProject(projectResolution) } : {}),
							};
				return { content: [{ type: "text", text: JSON.stringify(visible, null, 2) }], details: result };
			});
		},
	});
	const on = pi.on?.bind(pi);
	on?.("tool_execution_start", (event: any, ctx: any) =>
		run(() => {
			if (state.pending.size > 256) state.pending.delete(state.pending.keys().next().value as string);
			state.pending.set(`${sessionKey(ctx)}:${event.toolCallId}`, {
				args: event.args || {},
				journal: journalFor(ctx),
				key: sessionKey(ctx),
			});
		}),
	);
	on?.("tool_execution_end", (event: any, ctx: any) =>
		run(async () => {
			const started = state.pending.get(`${sessionKey(ctx)}:${event.toolCallId}`);
			state.pending.delete(`${sessionKey(ctx)}:${event.toolCallId}`);
			if (
				!started ||
				started.key !== sessionKey(ctx) ||
				started.journal !== state.journals.get(started.key) ||
				event.toolName === "research_loop"
			)
				return;
			await started.journal.record({
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: started.args,
				details: event.result?.details || {},
				...(event.toolName === "read" ? { content: event.result?.content || [] } : {}),
				isError: !!event.isError,
			});
		}),
	);
	on?.("before_agent_start", (event: any, ctx: any) =>
		run(async () => {
			const key = sessionKey(ctx);
			state.awaitingUserStart.add(key);
			const previous = state.journals.get(key);
			state.journals.set(
				key,
				createResearchReceiptJournal(ctx.cwd, {
					sessionId: key,
     ports: journalPorts,
				}),
			);
			state.pending.forEach((item, id) => {
				if (item.key === key) state.pending.delete(id);
			});
			await previous?.close();
			return {
				systemPrompt: `${event.systemPrompt}\n\nFor substantive research, use research_loop(action=start) when a tracked run is needed. The host checks provenance, not scientific truth. ${USER_QUESTION_FOCUS}`,
			};
		}),
	);
	on?.("message_start", (event: any, ctx: any) => {
		if (event.message?.role !== "user") return;
		return run(async () => {
			const key = sessionKey(ctx);
			if (state.awaitingUserStart.delete(key)) return;
			await state.journals.get(key)?.close();
			state.journals.delete(key);
		});
	});
	on?.("session_shutdown", (_event: any, ctx: any) =>
		run(async () => {
			const key = sessionKey(ctx);
			await state.journals.get(key)?.close();
			state.journals.delete(key);
			state.pending.forEach((item, id) => {
				if (item.key === key) state.pending.delete(id);
			});
			if (state.journals.size === 0) loop.dispose();
		}),
	);
}
