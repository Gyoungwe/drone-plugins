import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { claimBindingRefs, validateClaimBindings } from "./claim-bindings.js";
import {
	breakerFailureCandidate,
	type FailureCandidateSink,
	recordFailureCandidate,
	recordResearchFailure,
	researchFailure,
} from "./failure-candidates.js";
import type { LiteratureReceipt, LiteratureReceiptOptions } from "./literature-receipt.js";
import type { ResearchReceiptEvent } from "./receipt-journal.js";
import {
	breakerReceipt,
	budgetTrip,
	newSlowPath,
	observeSlowPathStep,
	quotaTrip,
	type ResearchBreakerBudget,
	type ResearchContextEviction,
	type ResearchUsageSample,
	observeContextEviction as recordEviction,
	observeUsage as recordUsage,
	SLOW_PATH_LIMITS,
	type SlowPathState,
	type SlowPathTrip,
} from "./research-breaker.js";
import {
	type PreparedResearchDelivery,
	type ResearchDeliveryCopy,
	type ResearchDeliveryReceipt,
	type ResearchSummaryAssessment,
	summaryBody,
	summaryHash,
} from "./research-delivery.js";
import {
	completeFastPath,
	countFastPathStep,
	escalationGuidance,
	FAST_PATH_LIMITS,
	type FastPathEscalationReason,
	fastPathAllows,
	fastPathAtLimit,
	fastPathReceiptReason,
	newFastPath,
	parseEscalationReason,
	type ResearchExecutionMode,
	type ResearchToolStep,
	requireEscalation,
} from "./research-fast-path.js";
import {
	advance,
	gateOf,
	provenanceFor,
	RESEARCH_DOCUMENT_KIND,
	type ResearchGate,
	type ResearchRunMetadata,
	type ReusedSource,
	readResearchMetadata,
	recordOf,
	requireStage,
	researchNodes,
	revisionOf,
	safeSlug,
	stageIndex,
	topicIdFromResultSlug,
	writeResearchMetadata,
} from "./research-loop-state.js";
import {
	archivedRead,
	archivedSourceRecords,
	deliveryReads,
	ledgerFor,
	observeNote,
	type RunSources,
	rememberIdentity,
	reusableSources,
	validateReusedSourceSet,
	verifyArchive,
} from "./research-run-sources.js";
import { validateRunDir } from "./source-archive-policy.js";

export { RESEARCH_DOCUMENT_KIND, RESEARCH_STAGES } from "./research-loop-state.js";

export interface ResearchLoopWorkspace {
	resultsRoot: string;
	obsidianVault?: string | null;
	knowledgeBindingRevision?: number | null;
}
export interface ResearchLoopPorts {
	resolveProject(cwd: string): Promise<string>;
	workspace(cwd: string): Promise<ResearchLoopWorkspace>;
	verifyLiteratureReceipt(input: LiteratureReceiptOptions): Promise<LiteratureReceipt>;
	sourceStatus(input: { cwd: string; run_dir: string; verify?: boolean }): Promise<unknown>;
	exclusive?<T>(key: string, work: () => Promise<T>): Promise<T>;
	breakerBudget?: ResearchBreakerBudget;
	failureCandidateSink?: FailureCandidateSink;
}

type RunScope = { cwd?: string; runDir?: string };
type StartInput = {
	cwd?: string;
	project?: string;
	resultSlug?: string;
	query?: string;
	requiresProvenance?: boolean;
	mode?: ResearchExecutionMode;
};
type UpdateInput = RunScope & {
	action?: string;
	query?: string;
	notes?: string;
	outcome?: string;
	reason?: string;
	sourceRefs?: string[];
	claimRefs?: string[];
	claimBindings?: unknown;
	expectedRevision?: number | string;
};
type Receipt = RunScope & ResearchReceiptEvent;
type Loop = {
	ports: ResearchLoopPorts;
	ledgers: Map<string, RunSources["ledger"]>;
	queues: Map<string, Promise<void>>;
};
type Run = RunSources & {
	ports: ResearchLoopPorts;
	metadataPath: string;
	metadata: ResearchRunMetadata;
};
type ToolBlock = { block: true; reason: string; terminate?: true };

function now() {
	return new Date().toISOString();
}
function runKey(cwd = process.cwd(), runDir = "") {
	return resolve(cwd, runDir);
}
async function openRun(loop: Loop, cwd: string, runDir?: string): Promise<Run> {
	if (!runDir) throw new Error("run_dir is required for this action");
	const config = await loop.ports.workspace(cwd);
	const path = validateRunDir(config.resultsRoot, resolve(cwd, runDir));
	const root = await realpath(config.resultsRoot);
	const canonical = validateRunDir(root, await realpath(path));
	if (relative(root, canonical) !== relative(config.resultsRoot, path))
		throw new Error("Research run path changed");
	const metadataPath = join(canonical, "metadata.json");
	return {
		ports: loop.ports,
		cwd,
		path,
		config,
		metadataPath,
		metadata: await readResearchMetadata(metadataPath),
		ledger: ledgerFor(loop.ledgers, path),
	};
}

function withRun<T>(loop: Loop, { cwd = process.cwd(), runDir }: RunScope, work: (run: Run) => Promise<T>) {
	const key = runKey(cwd, runDir);
	const operation = async () => {
		const run = await openRun(loop, cwd, runDir);
		try {
			return await work(run);
		} catch (error) {
			await recordResearchFailure(loop.ports.failureCandidateSink, run.metadata, error);
			throw error;
		}
	};
	const result = (loop.queues.get(key) ?? Promise.resolve()).then(() =>
		loop.ports.exclusive ? loop.ports.exclusive(key, operation) : operation(),
	);
	const tail = result.then(
		() => undefined,
		() => undefined,
	);
	loop.queues.set(key, tail);
	void tail.then(() => {
		if (loop.queues.get(key) === tail) loop.queues.delete(key);
	});
	return result;
}

function statusOf(run: Run) {
	return {
		run_dir: run.path,
		metadata: run.metadata,
		evidence_gate: gateOf(run.metadata),
		revision: revisionOf(run.metadata),
		...(run.metadata.mode === "fast_readonly"
			? { escalationRequired: run.metadata.fast_path?.escalation_required === true }
			: {}),
	};
}
type RunStatus = ReturnType<typeof statusOf>;
async function save(run: Run, patch: Partial<ResearchRunMetadata>, gate?: ResearchGate): Promise<RunStatus> {
	const at = now();
	const metadata = {
		...run.metadata,
		...(gate && {
			evidence_gate: gate,
			research_nodes: researchNodes(gate),
			provenance: provenanceFor(gate, at),
			revision: revisionOf(run.metadata) + 1,
			updated_at: at,
			...(gate.answerable && { status: "completed" as const, finalized_at: run.metadata.finalized_at || at }),
		}),
		...patch,
	};
	await writeResearchMetadata(run.metadataPath, metadata);
	run.metadata = metadata;
	return statusOf(run);
}

async function startResearchRun(ports: ResearchLoopPorts, input: StartInput) {
	const { cwd = process.cwd(), query, mode = "deep_research", requiresProvenance = false } = input;
	if (mode !== "fast_readonly" && mode !== "deep_research")
		throw new Error("Unknown research execution mode");
	if (mode === "fast_readonly" && requiresProvenance) throw new Error("Provenance requires deep_research");
	if (typeof query !== "string" || !query.trim()) throw new Error("query is required");
	const project = safeSlug(input.project || (await ports.resolveProject(cwd)), "project");
	const slug = safeSlug(input.resultSlug || "research-question", "result_slug");
	const { resultsRoot } = await ports.workspace(cwd);
	const at = now();
	const runId = `run-${at.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
	const slugDir = join(resultsRoot, slug);
	await mkdir(slugDir, { recursive: true });
	const root = await realpath(resultsRoot);
	if ((await realpath(slugDir)) !== join(root, slug))
		throw new Error("Result slug must stay inside the results root");
	const path = join(slugDir, runId);
	await mkdir(join(root, slug, runId));
	const metadata: ResearchRunMetadata = {
		kind: RESEARCH_DOCUMENT_KIND,
		version: 1,
		run_id: runId,
		project,
		result_slug: slug,
		topic_id: topicIdFromResultSlug(slug),
		query: query.trim(),
		status: "running",
		revision: 0,
		mode,
		requires_provenance: requiresProvenance === true,
		started_at: at,
		...(mode === "fast_readonly" ? { fast_path: newFastPath() } : { slow_path: newSlowPath() }),
		evidence_gate: { events: [{ type: "created", at }] },
	};
	const gate = gateOf(metadata);
	metadata.evidence_gate = gate;
	metadata.research_nodes = researchNodes(gate);
	metadata.provenance = provenanceFor(gate, at);
	await writeResearchMetadata(join(root, slug, runId, "metadata.json"), metadata);
	return {
		run_dir: path,
		metadata,
		evidence_gate: gate,
		revision: 0,
		escalationRequired: mode === "fast_readonly" ? false : undefined,
	};
}

async function recheckClaims(run: Run, gate: ResearchGate, bindings: unknown, reused?: ReusedSource[]) {
	const fresh = reused ?? (await reusableSources(run));
	validateReusedSourceSet(gate, fresh);
	const archived = run.metadata.mode === "fast_readonly" ? [] : await archivedSourceRecords(run);
	return { archived, claims: validateClaimBindings(bindings, [...fresh, ...archived], run.ledger.reads) };
}

async function prepareDelivery(run: Run, markdown: string): Promise<PreparedResearchDelivery> {
	if (typeof markdown !== "string" || !markdown.trim() || Buffer.byteLength(markdown) > 128 * 1024)
		throw new Error("Summary must contain 1-131072 UTF-8 bytes");
	const gate = gateOf(run.metadata);
	if (gate.stage !== "answerable" || gate.status !== "ok" || !gate.answerable)
		throw new Error("Evidence gate is closed; complete the research loop before summarizing");
	const revision = run.metadata.revision;
	if (typeof revision !== "number" || !Number.isSafeInteger(revision))
		throw new Error("Legacy research run needs fresh completion before delivery");
	const reused = await reusableSources(run);
	const { archived, claims } = await recheckClaims(run, gate, gate.claim_bindings, reused);
	if (summaryHash(JSON.stringify(claims)) !== summaryHash(JSON.stringify(gate.claim_bindings)))
		throw new Error("Claim evidence changed; complete the research loop again before delivery");
	if (!reused.length && !archived.length)
		throw researchFailure("no-available-source", "No current verified source is available for this delivery");
	const body = summaryBody(markdown);
	return {
		runId: run.metadata.run_id,
		evidenceRevision: revision,
		gateSha256: summaryHash(JSON.stringify(gate)),
		claimsSha256: summaryHash(JSON.stringify(claims)),
		bodySha256: summaryHash(body),
		body,
		claims,
		readReceipts: deliveryReads(run, claims),
	};
}

type DeliveryInput = RunScope & {
	prepared: PreparedResearchDelivery;
	copies: readonly ResearchDeliveryCopy[];
	assessment?: ResearchSummaryAssessment;
	memoryClaims?: readonly Record<string, unknown>[];
};

async function commitDelivery(
	run: Run,
	{ prepared, copies, assessment, memoryClaims = [] }: DeliveryInput,
): Promise<ResearchDeliveryReceipt> {
	const current = await prepareDelivery(run, prepared.body);
	if (
		current.evidenceRevision !== prepared.evidenceRevision ||
		current.gateSha256 !== prepared.gateSha256 ||
		current.claimsSha256 !== prepared.claimsSha256
	)
		throw new Error("Research evidence changed during delivery; no delivery receipt was committed");
	const observed = [];
	for (const copy of copies) {
		const bytes = await readFile(copy.path);
		const body = copy.bodyRegion ? bytes.subarray(copy.bodyRegion.start, copy.bodyRegion.end) : bytes;
		const bodySha256 = summaryHash(body);
		if (bodySha256 !== prepared.bodySha256)
			throw new Error(`Summary readback differs from the prepared body: ${copy.path}`);
		observed.push({ role: copy.role, path: copy.path, artifactSha256: summaryHash(bytes), bodySha256 });
	}
	if (!observed.some((copy) => copy.role === "run"))
		throw new Error("Delivery requires a run SUMMARY readback");
	if ((await readResearchMetadata(run.metadataPath)).revision !== prepared.evidenceRevision)
		throw new Error("Research revision changed during readback");
	const receipt: ResearchDeliveryReceipt = {
		version: 1,
		receiptScope: "current-session-current-turn",
		id: randomUUID(),
		runId: prepared.runId,
		evidenceRevision: prepared.evidenceRevision,
		committedRevision: prepared.evidenceRevision + 1,
		gateSha256: prepared.gateSha256,
		claimsSha256: prepared.claimsSha256,
		bodySha256: prepared.bodySha256,
		copies: observed,
		semanticAssessment: assessment || { status: "not-reviewed" },
		scientificallyVerified: false,
		memoryClaimsSha256: summaryHash(JSON.stringify(memoryClaims)),
		sources: prepared.readReceipts.map((read) => ({
			path: read.path,
			sha256: read.sha256,
			readReceiptIds: [read.receiptId],
		})),
	};
	await save(run, {
		revision: receipt.committedRevision,
		summary_status: "written",
		summary_updated_at: now(),
		delivery_receipt: receipt,
	});
	return receipt;
}

function inspectSources(gate: ResearchGate, sources: string[], details = {}) {
	if (!sources.length) throw new Error("source_refs must list inspected original sources");
	return advance(
		{ ...gate, source_refs: [...new Set([...gate.source_refs, ...sources])] },
		"sources_inspected",
		now(),
		{ ...details, source_refs: sources },
	);
}

function hasBindings(bindings: unknown) {
	return bindings !== undefined && (!Array.isArray(bindings) || bindings.length > 0);
}

async function bindClaims(run: Run, gate: ResearchGate, input: UpdateInput) {
	if (gate.stage === "sources_inspected")
		gate = (await save(run, {}, await verifyArchive(run, gate))).evidence_gate;
	requireStage(gate, "sources_archived", "bind_claims");
	const bindings = hasBindings(input.claimBindings) ? input.claimBindings : gate.claim_bindings;
	if (!hasBindings(bindings)) {
		if (input.claimRefs?.length)
			throw new Error(
				"Structured claim_bindings are required; legacy claim_refs cannot make a run answerable",
			);
		throw new Error("Structured claim_bindings must contain at least one validated claim");
	}
	const { claims } = await recheckClaims(run, gate, bindings);
	const refs = claimBindingRefs(claims);
	return advance(
		{ ...gate, claim_bindings: claims, claim_refs: [...new Set(refs)], warnings: [] },
		"claims_bound",
		now(),
		{ claim_refs: refs },
	);
}

async function requireManifest(path: string) {
	try {
		const provenance: unknown = JSON.parse(
			await readFile(join(path, "reproducibility-manifest.json"), "utf8"),
		);
		if (recordOf(provenance).version === 1) return;
	} catch (error) {
		if (recordOf(error).code !== "ENOENT") throw error;
	}
	throw researchFailure(
		"missing-provenance-manifest",
		'This run requires a reproducibility manifest before it can become answerable. Next action: call research_record_run_manifest with this run_dir and files listing actual source paths with role="input", then complete the research loop again.',
	);
}

async function finalize(run: Run, gate: ResearchGate, details = {}) {
	requireStage(gate, "claims_bound", "finalize");
	if (!gate.claim_bindings.length)
		throw new Error("Structured claim_bindings are required before answerable");
	const { claims } = await recheckClaims(run, gate, gate.claim_bindings);
	const refs = claimBindingRefs(claims);
	if (gate.archive_count + gate.reuse_count < 1 || !refs.length)
		throw new Error("archive verification and structured claim bindings are required before answerable");
	if (run.metadata.requires_provenance === true) await requireManifest(run.path);
	return advance(
		{ ...gate, claim_bindings: claims, claim_refs: refs, warnings: [], status: "ok", answerable: true },
		"answerable",
		now(),
		details,
	);
}

async function completeDeep(run: Run, gate: ResearchGate, input: UpdateInput) {
	if (gate.reuse_count) validateReusedSourceSet(gate, await reusableSources(run));
	requireStage(gate, "sources_inspected", "complete");
	if (stageIndex(gate.stage) < stageIndex("sources_archived"))
		gate = (await save(run, {}, await verifyArchive(run, gate))).evidence_gate;
	if (!hasBindings(input.claimBindings) && !gate.claim_bindings.length)
		throw new Error(
			"Provide structured claim_bindings; legacy claim_refs cannot make a research run answerable",
		);
	if (hasBindings(input.claimBindings) || stageIndex(gate.stage) < stageIndex("claims_bound"))
		gate = (await save(run, {}, await bindClaims(run, gate, input))).evidence_gate;
	return finalize(run, gate);
}

async function changeDeepGate(run: Run, gate: ResearchGate, input: UpdateInput) {
	const { action, query, notes, outcome, sourceRefs = [] } = input;
	const detail = {
		...(query && { query: query.trim() }),
		...(outcome && { outcome }),
		...(notes && { notes }),
	};
	switch (action) {
		case "record_local":
			if (!query?.trim()) throw new Error("query is required");
			return advance(gate, "local_query_recorded", now(), detail);
		case "record_external":
			requireStage(gate, "local_query_recorded", action);
			if (!query?.trim() && !notes?.trim())
				throw new Error("record the external query or why external search was skipped");
			return advance(gate, "external_search_recorded", now(), detail);
		case "inspect_sources":
			requireStage(gate, "external_search_recorded", action);
			return inspectSources(gate, Array.isArray(sourceRefs) ? sourceRefs.map(String) : [], detail);
		case "verify_archive":
			return verifyArchive(run, gate);
		case "bind_claims":
			return bindClaims(run, gate, input);
		case "finalize":
			return finalize(run, gate, detail);
		case "complete":
			return completeDeep(run, gate, input);
		default:
			throw new Error(`unknown research_loop action: ${action}`);
	}
}

function fastProgress(run: Run) {
	if (!run.metadata.fast_path) throw new Error("Missing fast path progress");
	return run.metadata.fast_path;
}

async function markEscalation(run: Run, reason: FastPathEscalationReason) {
	const progress = fastProgress(run);
	const next = requireEscalation(progress, reason);
	if (next !== progress) await save(run, { fast_path: next });
	return escalationGuidance(next.reason ?? reason);
}

async function changeFastGate(run: Run, gate: ResearchGate, input: UpdateInput) {
	const progress = fastProgress(run);
	if (input.action === "escalate") {
		const reason = parseEscalationReason(input.reason);
		const next: ResearchGate = {
			...gate,
			answerable: false,
			stage: gate.answerable ? "claims_bound" : gate.stage,
			events: [
				...gate.events,
				{ type: "escalation", at: now(), reason, ...(progress.reason && { trigger: progress.reason }) },
			],
		};
		return save(
			run,
			{
				mode: "deep_research",
				slow_path: newSlowPath(stageIndex(next.stage)),
				status: "running",
				finalized_at: undefined,
			},
			next,
		);
	}
	if (!fastPathAllows({ toolName: "research_loop", args: { action: input.action } }))
		throw new Error(await markEscalation(run, "write_or_archive_required"));
	if (progress.escalation_required)
		throw new Error(escalationGuidance(progress.reason ?? "step_cap_reached"));
	if (input.action !== "complete")
		throw new Error('Use research_loop(action="complete") for fast path claim bindings');
	const sources = await reusableSources(run);
	if (!sources.length) throw new Error(await markEscalation(run, "source_stale_or_changed"));
	const local =
		stageIndex(gate.stage) < stageIndex("local_query_recorded")
			? advance(gate, "local_query_recorded", now())
			: gate;
	return save(
		run,
		{},
		completeFastPath(local, progress, sources, input.claimBindings, run.ledger.reads, now()),
	);
}

function breakerGuidance(metadata: ResearchRunMetadata) {
	const receipt = metadata.breaker_receipt;
	return receipt
		? `Research stopped (${receipt.reason}). ${receipt.nextAction}`
		: "Research run stopped by breaker.";
}

async function updateRun(run: Run, input: UpdateInput): Promise<RunStatus> {
	const revision = revisionOf(run.metadata);
	if (input.expectedRevision != null && Number(input.expectedRevision) !== revision)
		throw new Error(`research run changed; expected revision ${input.expectedRevision}, found ${revision}`);
	if (input.action === "status") return statusOf(run);
	if (run.metadata.status === "stopped_by_breaker") throw new Error(breakerGuidance(run.metadata));
	const gate = gateOf(run.metadata);
	if (run.metadata.mode === "fast_readonly") return changeFastGate(run, gate, input);
	return save(run, {}, await changeDeepGate(run, gate, input));
}

async function saveSlowPath(run: Run, state: SlowPathState, nextGate?: ResearchGate, trip?: SlowPathTrip) {
	const gate = nextGate ?? gateOf(run.metadata);
	const verifiedSources = gate.archive_count + gate.reuse_count;
	const reason = trip ?? budgetTrip(state, run.ports.breakerBudget, verifiedSources);
	if (!reason) return save(run, { slow_path: state }, nextGate);
	const receipt = breakerReceipt(
		reason,
		state,
		run.ports.breakerBudget,
		{ id: randomUUID(), runId: run.metadata.run_id, trippedAt: now() },
		{
			stage: gate.stage,
			inspectedSources: gate.source_refs.length,
			verifiedSources,
			boundClaims: gate.claim_bindings.length,
			revision: revisionOf(run.metadata) + 1,
		},
	);
	const saved = await save(
		run,
		{ slow_path: state, status: "stopped_by_breaker", breaker_receipt: receipt },
		{ ...gate, status: "failed", answerable: false },
	);
	if (run.ports.failureCandidateSink)
		await recordFailureCandidate(run.ports.failureCandidateSink, breakerFailureCandidate(receipt));
	return saved;
}

async function checkTool(
	run: Run,
	step: ResearchToolStep,
	pending: readonly ResearchToolStep[],
): Promise<ToolBlock | undefined> {
	const action = step.toolName === "research_loop" ? step.args?.action : undefined;
	const requested = step.args?.run_dir;
	if (typeof requested === "string" && resolve(run.cwd, requested) !== run.path)
		return { block: true, reason: "Use the current turn's attached research run." };
	if (action === "status") return;
	if (run.metadata.status === "stopped_by_breaker")
		return { block: true, reason: breakerGuidance(run.metadata), terminate: true };
	if (action === "start" && (run.metadata.status === "running" || run.metadata.mode === "fast_readonly"))
		return { block: true, reason: "Finish the active research run before starting another." };
	if (run.metadata.mode === "fast_readonly") {
		if (action === "escalate") return;
		if (!fastPathAllows(step))
			return { block: true, reason: await markEscalation(run, "write_or_archive_required") };
		const progress = fastProgress(run);
		if (progress.escalation_required || fastPathAtLimit(progress, step.toolName))
			return { block: true, reason: await markEscalation(run, "step_cap_reached") };
		const reserved = pending.reduce((total, item) => countFastPathStep(total, item.toolName), progress);
		if (fastPathAtLimit(reserved, step.toolName))
			return { block: true, reason: "Wait for active fast path tool receipts before taking another step." };
	}
	const slow = run.metadata.slow_path;
	if (slow) {
		const gate = gateOf(run.metadata);
		const trip =
			quotaTrip(run.ports.breakerBudget) ??
			budgetTrip(slow, run.ports.breakerBudget, gate.archive_count + gate.reuse_count);
		if (trip)
			return {
				block: true,
				reason: breakerGuidance((await saveSlowPath(run, slow, undefined, trip)).metadata),
				terminate: true,
			};
		if (slow.measured.steps + pending.length >= SLOW_PATH_LIMITS.maxSteps)
			return { block: true, reason: "Wait for active research tool receipts before taking another step." };
	}
}

function ensureLocal(gate: ResearchGate, query: string) {
	return stageIndex(gate.stage) >= stageIndex("local_query_recorded")
		? gate
		: advance(gate, "local_query_recorded", now(), { query });
}

function ensureExternal(gate: ResearchGate, notes: string, query?: string) {
	return stageIndex(gate.stage) >= stageIndex("external_search_recorded")
		? gate
		: advance(gate, "external_search_recorded", now(), { notes, ...(query && { query }) });
}

async function verifyAvailable(run: Run, gate: ResearchGate) {
	const reused = await reusableSources(run);
	return reused.length ? verifyArchive(run, gate, reused) : gate;
}

async function observedGate(run: Run, gate: ResearchGate, receipt: Receipt): Promise<ResearchGate> {
	const { toolName, args = {}, details = {}, readBinding, content } = receipt;
	const fast = run.metadata.mode === "fast_readonly";
	const query = String(args.query || details.query || "").trim();
	const path = String(args.path || details.path || "");
	const url = String(args.url || details.url || query).trim();
	switch (toolName) {
		case "research_search_knowledge":
			return query && details.complete !== false
				? advance(gate, "local_query_recorded", now(), { query })
				: gate;
		case "webfetch":
		case "fetch_content":
		case "web_search":
			return url
				? advance(ensureLocal(gate, url), "external_search_recorded", now(), {
						query: url,
						notes: String(details.title || ""),
					})
				: gate;
		case "research_read_knowledge": {
			if (!path || /(?:^|[\\/])Wiki[\\/]/i.test(path) || details.missing === true) return gate;
			await observeNote(run, path, details, readBinding);
			const local = ensureLocal(gate, path);
			const inspected = inspectSources(
				fast ? local : ensureExternal(local, "Host: no extra web search before inspecting current sources."),
				[path],
			);
			return fast ? inspected : verifyAvailable(run, inspected);
		}
		case "read":
			if (!path || details.missing === true || !(await archivedRead(run, path, args, details, content)))
				return gate;
			return inspectSources(
				ensureExternal(ensureLocal(gate, path), "Host recorded a read of the archived run source."),
				[path],
			);
		case "research_reconcile_literature":
		case "research_verify_literature": {
			const identity = toolName === "research_reconcile_literature" ? recordOf(details.receipt) : details;
			const observed = rememberIdentity(run, identity);
			return !fast && observed ? verifyAvailable(run, gate) : gate;
		}
		case "research_archive_source": {
			const ref = String(details.path || url);
			if (!ref || details.status !== "downloaded") return gate;
			const acquired = ensureExternal(
				ensureLocal(gate, ref),
				"Host recorded the archived source URL as the external lookup.",
				url || ref,
			);
			return verifyArchive(run, inspectSources(acquired, [ref]));
		}
		default:
			return gate;
	}
}

async function observeFast(run: Run, gate: ResearchGate, step: ResearchToolStep, receipt: Receipt) {
	const progress = fastProgress(run);
	if ((!receipt.countedStep && progress.escalation_required) || !fastPathAllows(step)) return null;
	const count =
		receipt.countedStep === true || Boolean(receipt.toolCallId && step.toolName !== "research_loop");
	if (count && fastPathAtLimit(progress, step.toolName)) {
		await markEscalation(run, "step_cap_reached");
		return null;
	}
	const next = receipt.isError ? gate : await observedGate(run, gate, receipt);
	const counted = count ? countFastPathStep(progress, step.toolName) : progress;
	const reason = receipt.isError ? undefined : fastPathReceiptReason(step.toolName, receipt.details ?? {});
	const escalation =
		reason ??
		(counted.stepsUsed >= FAST_PATH_LIMITS.maxSteps && !next.answerable ? "step_cap_reached" : undefined);
	if (!count && next === gate && !escalation) return null;
	return save(
		run,
		{ fast_path: escalation ? requireEscalation(counted, escalation) : counted },
		next === gate ? undefined : next,
	);
}

async function observeReceipt(run: Run, receipt: Receipt): Promise<RunStatus | null> {
	if (!receipt.toolName || run.metadata.status === "stopped_by_breaker") return null;
	const gate = gateOf(run.metadata);
	const step = { toolName: receipt.toolName, args: receipt.args };
	if (run.metadata.mode === "fast_readonly") return observeFast(run, gate, step, receipt);
	const { readCount, verified } = run.ledger;
	const verifiedCount = verified.size;
	const next = receipt.isError ? gate : await observedGate(run, gate, receipt);
	const changed = next === gate ? undefined : next;
	const slow = run.metadata.slow_path;
	if (!slow || !receipt.countedStep || !receipt.toolCallId) return changed ? save(run, {}, changed) : null;
	const stage = stageIndex(next.stage);
	const progressed =
		stage > slow.observedStage ||
		run.ledger.readCount > readCount ||
		verified.size > verifiedCount ||
		next.archive_count + next.reuse_count > gate.archive_count + gate.reuse_count ||
		(!receipt.isError && step.toolName === "research_loop" && step.args?.action === "start");
	const observation = observeSlowPathStep({ ...slow, observedStage: stage }, step, progressed);
	return saveSlowPath(run, observation.state, changed, observation.trip);
}

async function observeUsage(run: Run, sample: ResearchUsageSample) {
	const slow = run.metadata.slow_path;
	if (!slow || run.metadata.status === "stopped_by_breaker") return null;
	const observation = recordUsage(slow, run.ports.breakerBudget, sample);
	return saveSlowPath(run, observation.state, undefined, observation.trip);
}

async function observeContextEviction(run: Run, event: ResearchContextEviction) {
	const slow = run.metadata.slow_path;
	if (!slow || run.metadata.status === "stopped_by_breaker") return null;
	const state = recordEviction(slow, event);
	return state === slow ? null : save(run, { slow_path: state });
}

export function createResearchLoop(ports: ResearchLoopPorts) {
	const loop: Loop = { ports, ledgers: new Map(), queues: new Map() };
	return {
		startResearchRun: (input: StartInput = {}) => startResearchRun(ports, input),
		updateResearchLoop: (input: UpdateInput = {}) => withRun(loop, input, (run) => updateRun(run, input)),
		completeResearchGate: (input: Omit<UpdateInput, "action"> = {}) =>
			withRun(loop, input, (run) => updateRun(run, { ...input, action: "complete" })),
		prepareResearchDelivery: (input: RunScope & { markdown: string }) =>
			withRun(loop, input, (run) => prepareDelivery(run, input.markdown)),
		commitResearchDelivery: (input: DeliveryInput) =>
			withRun(loop, input, (run) => commitDelivery(run, input)),
		observeResearchReceipt: async (receipt: Receipt = {}) => {
			if (!receipt.runDir) return null;
			try {
				return await withRun(loop, receipt, (run) => observeReceipt(run, receipt));
			} catch (error) {
				if (!receipt.countedStep && recordOf(error).code === "ENOENT") return null;
				throw error;
			}
		},
		checkTool: (
			cwd: string,
			runDir: string,
			step: ResearchToolStep,
			pending: readonly ResearchToolStep[] = [],
		) => withRun(loop, { cwd, runDir }, (run) => checkTool(run, step, pending)),
		observeUsage: (cwd: string, runDir: string, sample: ResearchUsageSample) =>
			withRun(loop, { cwd, runDir }, (run) => observeUsage(run, sample)),
		observeContextEviction: (cwd: string, runDir: string, event: ResearchContextEviction) =>
			withRun(loop, { cwd, runDir }, (run) => observeContextEviction(run, event)),
		flushResearchReceipts: async ({ cwd, runDir }: RunScope = {}) => {
			await loop.queues.get(runKey(cwd, runDir));
		},
		resetResearchReceipts: ({ cwd, runDir }: RunScope = {}) => {
			if (runDir) loop.ledgers.delete(runKey(cwd, runDir));
		},
		topicIdFromResultSlug,
		dispose: () => loop.ledgers.clear(),
	};
}
