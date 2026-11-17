export interface EvaluationCase {
	readonly id: string;
	readonly expectedFindingIds: readonly string[];
	readonly observedFindingIds: readonly string[];
	readonly verificationTimeMs?: number;
}
export interface EvaluationMetric {
	readonly name:
		| "bixbench"
		| "bixbench-regression"
		| "rediscovery-rate"
		| "inconsistency-rejection-rate"
		| "inconsistency-interception-rate"
		| "confounding-detection-rate"
		| "confounder-detection-rate"
		| "clue-hit-rate"
		| "verification-time-ms"
		| "repeated-failure-count";
	readonly value: number;
	readonly denominator?: number;
	readonly measuredAt: string;
	readonly baseline?: number;
}
export function rate(numerator: number, denominator: number): number {
	if (
		!Number.isFinite(numerator) ||
		!Number.isFinite(denominator) ||
		numerator < 0 ||
		denominator <= 0 ||
		numerator > denominator
	)
		throw new Error("invalid rate inputs");
	return numerator / denominator;
}
export function evaluateRediscovery(
	cases: readonly EvaluationCase[],
	now = new Date().toISOString(),
): EvaluationMetric {
	const hits = cases.filter((item) =>
		item.expectedFindingIds.every((id) => item.observedFindingIds.includes(id)),
	).length;
	return {
		name: "rediscovery-rate",
		value: cases.length ? rate(hits, cases.length) : 0,
		denominator: cases.length,
		measuredAt: now,
	};
}
export function evaluateConfoundingDetection(
	cases: readonly EvaluationCase[],
	now = new Date().toISOString(),
): EvaluationMetric {
	const hits = cases.filter((item) =>
		item.expectedFindingIds.some((id) => item.observedFindingIds.includes(id)),
	).length;
	return {
		name: "confounding-detection-rate",
		value: cases.length ? rate(hits, cases.length) : 0,
		denominator: cases.length,
		measuredAt: now,
	};
}
export function evaluateInconsistencyRejection(
	rejected: number,
	total: number,
	now = new Date().toISOString(),
): EvaluationMetric {
	return {
		name: "inconsistency-rejection-rate",
		value: total ? rate(rejected, total) : 0,
		denominator: total,
		measuredAt: now,
	};
}
export function evaluateClueHitRate(
	hit: number,
	total: number,
	now = new Date().toISOString(),
): EvaluationMetric {
	return {
		name: "clue-hit-rate",
		value: total ? rate(hit, total) : 0,
		denominator: total,
		measuredAt: now,
	};
}
export function evaluateVerificationTime(
	cases: readonly EvaluationCase[],
	now = new Date().toISOString(),
): EvaluationMetric {
	const values = cases
		.map((item) => item.verificationTimeMs)
		.filter((value): value is number => value !== undefined && Number.isFinite(value) && value >= 0);
	return {
		name: "verification-time-ms",
		value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
		denominator: values.length,
		measuredAt: now,
	};
}
export function evaluationBaselines(): readonly EvaluationMetric[] {
	return [
		"bixbench",
		"rediscovery-rate",
		"inconsistency-rejection-rate",
		"confounding-detection-rate",
		"clue-hit-rate",
		"verification-time-ms",
		"repeated-failure-count",
	].map((name) => ({
		name: name as EvaluationMetric["name"],
		value: 0,
		measuredAt: "baseline-not-run",
	}));
}
