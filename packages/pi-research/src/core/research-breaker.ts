import type { ResearchToolStep } from "./research-fast-path.js";
import { fileHash } from "./research-loop-state.js";

export const SLOW_PATH_LIMITS = Object.freeze({
	maxSteps: 20,
	maxStalledSteps: 3,
	maxRepeats: 2,
	maxSpecialists: 4,
	maxEvidenceSources: 12,
	requireConfirmedQuota: true,
});

export interface ResearchBreakerBudget {
	maxBilledTokens?: number;
	maxCost?: number;
}

export interface ResearchUsageSample {
	reported: boolean;
	inputTokens?: number;
	outputTokens?: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	cost?: number;
	specialistRuns?: number;
}

export type ResearchContextEviction = { toolCallIds: readonly string[]; observedAt: string };

export interface ResearchContextPressure {
	evictionCount: number;
	evictedToolCallIds: number;
	lastEvictedAt: string | null;
}

type BreakerMeasurement = {
	steps: number;
	stalledSteps: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	billedTokens: number;
	cost: number;
	usageReported: boolean;
	unknownUsageSteps: number;
};

export interface SlowPathState {
	measured: BreakerMeasurement;
	repeats: Record<string, number>;
	observedStage: number;
	specialistRuns: number;
	contextPressure: ResearchContextPressure;
}

export type SlowPathTrip =
	| { reason: "quota-unconfirmable"; limitKind: "unknown-quota" }
	| { reason: "budget-exceeded"; limitKind: "steps" | "tokens" | "cost" | "specialists" | "evidence" }
	| { reason: "stalled"; limitKind: "stall" }
	| { reason: "repeated-tool-loop"; limitKind: "repeats" };

export type SlowPathBreakerReceipt = SlowPathTrip & {
	version: 1;
	kind: "drone.research.breaker-receipt";
	id: string;
	runId: string;
	mode: "deep_research";
	trippedAt: string;
	measured: BreakerMeasurement & { remainingTokens: number | null; remainingCost: number | null };
	limits: ReturnType<typeof breakerLimits>;
	contextPressure: ResearchContextPressure;
	preservedProgress: {
		stage: string;
		inspectedSources: number;
		verifiedSources: number;
		boundClaims: number;
		revision: number;
	};
	nextAction: string;
	scientificallyVerified: false;
};

export function newSlowPath(observedStage = 0): SlowPathState {
	return {
		measured: {
			steps: 0,
			stalledSteps: 0,
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			billedTokens: 0,
			cost: 0,
			usageReported: false,
			unknownUsageSteps: 0,
		},
		repeats: {},
		observedStage,
		specialistRuns: 0,
		contextPressure: { evictionCount: 0, evictedToolCallIds: 0, lastEvictedAt: null },
	};
}

function tokens(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function costValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function breakerLimits(budget: ResearchBreakerBudget = {}) {
	return {
		...SLOW_PATH_LIMITS,
		maxBilledTokens: tokens(budget.maxBilledTokens) || null,
		maxCost: costValue(budget.maxCost) || null,
	};
}

const UNKNOWN_QUOTA = { reason: "quota-unconfirmable", limitKind: "unknown-quota" } as const;

export function quotaTrip(budget: ResearchBreakerBudget | undefined): SlowPathTrip | undefined {
	const limits = breakerLimits(budget);
	return limits.maxBilledTokens === null || (budget?.maxCost !== undefined && limits.maxCost === null)
		? UNKNOWN_QUOTA
		: undefined;
}

export function budgetTrip(
	state: SlowPathState,
	budget: ResearchBreakerBudget | undefined,
	evidenceSources: number,
): SlowPathTrip | undefined {
	const limits = breakerLimits(budget);
	const { steps, billedTokens, cost } = state.measured;
	if (limits.maxBilledTokens !== null && billedTokens >= limits.maxBilledTokens)
		return { reason: "budget-exceeded", limitKind: "tokens" };
	if (limits.maxCost !== null && cost >= limits.maxCost)
		return { reason: "budget-exceeded", limitKind: "cost" };
	if (steps >= limits.maxSteps) return { reason: "budget-exceeded", limitKind: "steps" };
	if (state.specialistRuns >= limits.maxSpecialists)
		return { reason: "budget-exceeded", limitKind: "specialists" };
	if (evidenceSources >= limits.maxEvidenceSources)
		return { reason: "budget-exceeded", limitKind: "evidence" };
	return undefined;
}

export function observeUsage(
	state: SlowPathState,
	budget: ResearchBreakerBudget | undefined,
	sample: ResearchUsageSample,
): { state: SlowPathState; trip?: SlowPathTrip } {
	const input = tokens(sample.inputTokens);
	const output = tokens(sample.outputTokens);
	const cacheWrite = tokens(sample.cacheWriteTokens);
	const cost = costValue(sample.cost);
	if (sample.reported !== true || input === undefined || output === undefined || cacheWrite === undefined) {
		return {
			state: {
				...state,
				measured: {
					...state.measured,
					usageReported: false,
					unknownUsageSteps: state.measured.unknownUsageSteps + 1,
				},
			},
			trip: UNKNOWN_QUOTA,
		};
	}
	const prior = state.measured;
	const measured = {
		...prior,
		inputTokens: prior.inputTokens + input,
		outputTokens: prior.outputTokens + output,
		cacheReadTokens: prior.cacheReadTokens + (tokens(sample.cacheReadTokens) ?? 0),
		cacheWriteTokens: prior.cacheWriteTokens + cacheWrite,
		billedTokens: prior.billedTokens + input + output + cacheWrite,
		cost: prior.cost + (cost ?? 0),
		usageReported: true,
		unknownUsageSteps: prior.unknownUsageSteps + Number(budget?.maxCost !== undefined && cost === undefined),
	};
	const next = {
		...state,
		measured,
		specialistRuns: state.specialistRuns + (tokens(sample.specialistRuns) ?? 0),
	};
	const trip = budget?.maxCost !== undefined && cost === undefined ? UNKNOWN_QUOTA : quotaTrip(budget);
	return { state: next, trip };
}

function targetKey({ toolName, args = {} }: ResearchToolStep) {
	const target = [
		"action",
		"path",
		"note_path",
		"url",
		"query",
		"doi",
		"zotero_key",
		"command",
		"source_id",
	].flatMap((field) => {
		const value = args[field];
		if (typeof value !== "string") return [];
		const stripped = value.normalize("NFKC").trim();
		return [
			field,
			field === "query" || field === "doi" ? stripped.toLowerCase().replace(/\s+/g, " ") : stripped,
		];
	});
	return fileHash(JSON.stringify([toolName, target]));
}

export function observeSlowPathStep(
	state: SlowPathState,
	step: ResearchToolStep,
	progressed: boolean,
): { state: SlowPathState; trip?: SlowPathTrip } {
	const key = targetKey(step);
	const repeats = (state.repeats[key] ?? 0) + 1;
	const stalledSteps = progressed ? 0 : state.measured.stalledSteps + 1;
	const next = {
		...state,
		measured: { ...state.measured, steps: state.measured.steps + 1, stalledSteps },
		repeats: { ...state.repeats, [key]: repeats },
	};
	if (repeats > SLOW_PATH_LIMITS.maxRepeats)
		return { state: next, trip: { reason: "repeated-tool-loop", limitKind: "repeats" } };
	if (stalledSteps >= SLOW_PATH_LIMITS.maxStalledSteps)
		return { state: next, trip: { reason: "stalled", limitKind: "stall" } };
	return { state: next };
}

export function observeContextEviction(state: SlowPathState, event: ResearchContextEviction): SlowPathState {
	const count = new Set(event.toolCallIds.filter((id) => typeof id === "string" && id).slice(0, 64)).size;
	if (!count) return state;
	return {
		...state,
		contextPressure: {
			evictionCount: state.contextPressure.evictionCount + 1,
			evictedToolCallIds: state.contextPressure.evictedToolCallIds + count,
			lastEvictedAt: event.observedAt,
		},
	};
}

export function breakerReceipt(
	trip: SlowPathTrip,
	state: SlowPathState,
	budget: ResearchBreakerBudget | undefined,
	identity: { id: string; runId: string; trippedAt: string },
	preservedProgress: SlowPathBreakerReceipt["preservedProgress"],
): SlowPathBreakerReceipt {
	const limits = breakerLimits(budget);
	const known = trip.reason !== "quota-unconfirmable";
	return {
		...trip,
		...identity,
		version: 1,
		kind: "drone.research.breaker-receipt",
		mode: "deep_research",
		limits,
		measured: {
			...state.measured,
			remainingTokens:
				known && limits.maxBilledTokens !== null
					? Math.max(0, limits.maxBilledTokens - state.measured.billedTokens)
					: null,
			remainingCost:
				known && limits.maxCost !== null ? Math.max(0, limits.maxCost - state.measured.cost) : null,
		},
		contextPressure: { ...state.contextPressure },
		preservedProgress,
		nextAction:
			"Stop research tools and review the preserved evidence and budget before starting another run.",
		scientificallyVerified: false,
	};
}
