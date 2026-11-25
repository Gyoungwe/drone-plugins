import { CLAIM_BINDING_SCHEMA } from "./core/claim-bindings.js";
import type { createResearchReceiptJournal } from "./core/receipt-journal.js";
import { FAST_PATH_ESCALATION_REASONS, type ResearchExecutionMode } from "./core/research-fast-path.js";
import type { createResearchLoop } from "./core/research-loop.js";
import { recordOf } from "./core/research-loop-state.js";
import type { ResearchExtensionPorts } from "./extension.js";

export type Context = {
	cwd: string;
	sessionId?: string;
	sessionManager?: { getSessionId?(): string; getBranch?(): unknown; getEntries?(): unknown };
};
type Loop = ReturnType<typeof createResearchLoop>;
type Journal = ReturnType<typeof createResearchReceiptJournal>;

type Args = Record<string, unknown>;
export type Tool = {
	name: string;
	label: string;
	description: string;
	parameters: Args;
	drone: Args;
	executionMode: "sequential";
	execute(id: string, params: Args, signal: AbortSignal, update: unknown, ctx: Context): Promise<unknown>;
};

const TOOL_PARAMETERS = {
	type: "object",
	additionalProperties: false,
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
				"escalate",
				"status",
			],
		},
		mode: {
			type: "string",
			enum: ["fast_readonly", "deep_research"],
			description:
				"Execution mode at start. Fast mode uses local evidence and needs explicit escalation before external tools or writes.",
		},
		reason: { type: "string", enum: [...FAST_PATH_ESCALATION_REASONS] },
		run_dir: { type: "string" },
		project: {
			type: "string",
			description: "Optional. The host resolves the project from the workspace or session.",
		},
		result_slug: { type: "string" },
		query: { type: "string" },
		requires_provenance: {
			type: "boolean",
			description:
				'Deep research only. Before completion, call research_record_run_manifest with actual source paths in files with role="input". This records file snapshots.',
		},
		source_refs: { type: "array", items: { type: "string" } },
		claim_refs: { type: "array", items: { type: "string" } },
		claim_bindings: CLAIM_BINDING_SCHEMA,
		outcome: { type: "string" },
		notes: { type: "string" },
	},
	required: ["action"],
};

type LoopParams = {
	action: string;
	run_dir?: string;
	project?: string;
	result_slug?: string;
	query?: string;
	mode?: ResearchExecutionMode;
	requires_provenance?: boolean;
	source_refs?: string[];
	claim_refs?: string[];
	claim_bindings?: unknown;
	outcome?: string;
	notes?: string;
	reason?: string;
};

function resultOf<T>(details: T, visible: unknown = details) {
	return { content: [{ type: "text", text: JSON.stringify(visible, null, 2) }], details };
}

export function researchLoopTool(
	ports: ResearchExtensionPorts,
	loop: Loop,
	journalFor: (ctx: Context) => Journal,
): Tool {
	return {
		name: "research_loop",
		label: "Research evidence loop",
		executionMode: "sequential",
		drone: {
			libraryMode: true,
			recoverySafe: true,
			capabilities: ["research"],
			activity: { text: "正在检查研究证据链…", phase: "verification" },
		},
		description:
			"Start, inspect or complete a tracked research run. Fast mode uses local search, read and identity verification followed by complete with structured claim_bindings. Escalate explicitly when needed. The host advances evidence from observed tools and supplies source hashes and read receipt IDs. result_slug determines the topic ID.",
		parameters: TOOL_PARAMETERS,
		execute: (_id, params, _signal, _update, ctx) =>
			ports.run(() => executeLoopTool(ports, loop, journalFor(ctx), params as LoopParams, ctx)),
	};
}

async function executeLoopTool(
	ports: ResearchExtensionPorts,
	loop: Loop,
	journal: Journal,
	params: LoopParams,
	ctx: Context,
) {
	const { action } = params;
	const runDir = action === "start" ? undefined : params.run_dir || journal.currentRun();
	if (action === "status" && !runDir)
		return resultOf({
			run_dir: null,
			evidence_gate: { stage: "not-started", answerable: false },
			next_action: "start",
			guidance: "Call research_loop(action=start,query=the research question).",
		});
	const project = action === "start" ? await ports.resolveSessionProject(ctx, params.project) : undefined;
	const result = await journal.execute(runDir, () =>
		action === "start"
			? loop.startResearchRun({
					cwd: ctx.cwd,
					project: project?.project,
					resultSlug: params.result_slug,
					query: params.query,
					requiresProvenance: params.requires_provenance === true,
					mode: params.mode,
				})
			: loop.updateResearchLoop({
					cwd: ctx.cwd,
					runDir,
					action,
					query: params.query,
					sourceRefs: params.source_refs,
					claimRefs: params.claim_refs,
					claimBindings: params.claim_bindings,
					outcome: params.outcome,
					notes: params.notes,
					reason: params.reason,
				}),
	);
	if (action === "status") return resultOf(result);
	return resultOf(result, visibleResult(result, project ? ports.describeProject(project) : undefined));
}

function visibleResult(
	result: Awaited<ReturnType<Loop["updateResearchLoop"]>> & { receipt_journal: unknown },
	project: unknown,
) {
	const gate = result.evidence_gate;
	return {
		run_dir: result.run_dir,
		topic_id: result.metadata.topic_id,
		mode: result.metadata.mode,
		fast_path: result.metadata.fast_path,
		escalationRequired: result.escalationRequired,
		breaker_receipt: result.metadata.breaker_receipt,
		evidence_gate: {
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
		receipt_journal: result.receipt_journal,
		project,
	};
}

export function startCallId(content: unknown) {
	if (!Array.isArray(content)) return undefined;
	for (const block of content) {
		const call = recordOf(block);
		if (
			call.type === "toolCall" &&
			call.name === "research_loop" &&
			recordOf(call.arguments).action === "start" &&
			typeof call.id === "string"
		)
			return call.id;
	}
	return undefined;
}
