import { randomUUID } from "node:crypto";

const STAGES = [
	"created",
	"local_query_recorded",
	"external_search_recorded",
	"sources_inspected",
	"sources_archived",
	"claims_bound",
	"answerable",
] as const;

type Stage = (typeof STAGES)[number];
type Event = { type: Stage; at: string; [key: string]: unknown };
type Run = {
	run_dir: string;
	stage: Stage;
	events: Event[];
	query?: string;
	result_slug?: string;
};

function sessionKey(ctx: any): string {
	return String(ctx?.sessionManager?.getSessionId?.() || ctx?.sessionId || ctx?.cwd || "default");
}

function result(details: unknown) {
	return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
}

function advance(run: Run, stage: Stage, details: Record<string, unknown> = {}): void {
	const current = STAGES.indexOf(run.stage);
	const next = STAGES.indexOf(stage);
	if (next < current) throw new Error(`research run cannot move backwards: ${run.stage} -> ${stage}`);
	run.stage = stage;
	run.events.push({ type: stage, at: new Date().toISOString(), ...details });
}

function snapshot(run: Run) {
	return {
		run_dir: run.run_dir,
		stage: run.stage,
		answerable: run.stage === "answerable",
		query: run.query,
		result_slug: run.result_slug,
		events: [...run.events],
	};
}

/**
 * Host-neutral run-level evidence lifecycle. Source retrieval, archive writes,
 * and Zotero operations remain host ports; this package only owns the receipt
 * state machine and session ledger.
 */
export function registerResearchLoop(pi: any): void {
	if (process.env.PI_SUBAGENT_CHILD === "1") return;
	const sessions = new Map<string, Map<string, Run>>();
	const counters = new Map<string, number>();
	const runsFor = (ctx: any) => {
		const key = sessionKey(ctx);
		let runs = sessions.get(key);
		if (!runs) {
			runs = new Map();
			sessions.set(key, runs);
		}
		return runs;
	};
	const nextRunDir = (ctx: any) => {
		const key = sessionKey(ctx);
		const next = (counters.get(key) || 0) + 1;
		counters.set(key, next);
		return `.pi/research-runs/${new Date().toISOString().replace(/[:.]/gu, "-")}-${next}-${randomUUID().slice(0, 8)}`;
	};

	pi.registerTool({
		name: "research_loop",
		label: "Research evidence loop",
		description:
			"Create or inspect a host-neutral research evidence receipt. Host adapters provide source retrieval and persistence; this lifecycle records the monotonic stages and current-session run ledger.",
		drone: { libraryMode: true, recoverySafe: true, capabilities: ["research"] },
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
				query: { type: "string" },
				result_slug: { type: "string" },
				outcome: { type: "string" },
			},
			required: ["action"],
		},
		async execute(_id: string, params: any, _signal: AbortSignal, _update: unknown, ctx: any) {
			const action = String(params?.action || "");
			const runs = runsFor(ctx);
			if (action === "status" && !params?.run_dir) {
				const current = [...runs.values()].at(-1);
				return result(current ? snapshot(current) : { run_dir: null, stage: "not-started", answerable: false });
			}
			if (action === "start") {
				const run: Run = {
					run_dir: String(params?.run_dir || nextRunDir(ctx)),
					stage: "created",
					events: [],
					query: String(params?.query || "").trim() || undefined,
					result_slug: String(params?.result_slug || "").trim() || undefined,
				};
				if (!run.query) throw new Error("query is required when starting a research run");
				runs.set(run.run_dir, run);
				return result(snapshot(run));
			}
			const runDir = String(params?.run_dir || "");
			const run = runs.get(runDir);
			if (!run) throw new Error("run_dir must come from research_loop(action=start) in this session");
			if (action === "status") return result(snapshot(run));
			const transitions: Record<string, Stage> = {
				record_local: "local_query_recorded",
				record_external: "external_search_recorded",
				inspect_sources: "sources_inspected",
				verify_archive: "sources_archived",
				bind_claims: "claims_bound",
				finalize: "answerable",
				complete: "answerable",
			};
			const stage = transitions[action];
			if (!stage) throw new Error(`unsupported research_loop action: ${action}`);
			if ((action === "finalize" || action === "complete") && run.stage !== "claims_bound" && run.stage !== "answerable")
				throw new Error("research run cannot finalize before claims are bound");
			advance(run, stage, params?.outcome ? { outcome: String(params.outcome) } : {});
			return result(snapshot(run));
		},
	});
}
