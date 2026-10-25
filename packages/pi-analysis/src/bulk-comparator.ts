import type { AnalysisNumericalComparator, AnalysisNumericalComparison, AnalysisNumericalComparisonInput, AnalysisReviewCheck } from "./analysis-contract.js";
import { artifactRef, scanDeseq2Results, validateBulkResults } from "./bulk-results.js";
import type { Deseq2NumericColumn, Deseq2ResultRow } from "./bulk-results.js";
import { DESEQ2_NUMERICAL_POLICY } from "./bulk-numerical-policy.js";
import { readBulkScientificPlan } from "./bulk-scientific-plan.js";
import type { BulkScientificPlanContent } from "./bulk-scientific-plan.js";

function significant(row: Deseq2ResultRow, plan: BulkScientificPlanContent): boolean {
	return row.values.padj !== null && row.values.log2FoldChange !== null
		&& row.values.padj < plan.alpha && Math.abs(row.values.log2FoldChange) >= plan.log2FoldChangeThreshold;
}

/** Numerical proof is separate from exact bytes, environment and scientific validity. */
export class BulkRnaseqNumericalComparator implements AnalysisNumericalComparator {
	readonly policy = DESEQ2_NUMERICAL_POLICY;
	async compare(input: AnalysisNumericalComparisonInput): Promise<AnalysisNumericalComparison> {
		const plan = readBulkScientificPlan(input.scientificPlan);
		const validations = await Promise.all([input.expected, input.actual].map((side) => validateBulkResults({
			context: input.context, method: input.method, scientificPlan: plan, ...side,
		})));
		const checks: AnalysisReviewCheck[] = validations.flatMap((value, index) => value.checks.map((check) => ({
			...check, id: `${index === 0 ? "expected" : "actual"}-${check.id}`,
		})));
		if (checks.some((check) => !check.passed)) return { policy: this.policy, equivalent: false, checks, statistics: { comparedRows: 0, mismatchedRows: 0 } };
		const expectedArtifact = input.expected.artifacts.find((artifact) => artifact.path === plan.content.outputs.results)!;
		const actualArtifact = input.actual.artifacts.find((artifact) => artifact.path === plan.content.outputs.results)!;
		const expectedRows = new Map<string, Deseq2ResultRow>();
		const expected = await scanDeseq2Results(input.expected.reader.lines(artifactRef(expectedArtifact)), (row) => expectedRows.set(row.featureId, row));
		let comparedRows = 0, mismatchedRows = 0;
		const actual = await scanDeseq2Results(input.actual.reader.lines(artifactRef(actualArtifact)), (row) => {
			const previous = expectedRows.get(row.featureId);
			if (!previous) { mismatchedRows += 1; return; }
			comparedRows += 1;
			expectedRows.delete(row.featureId);
			let mismatch = false;
			for (const column of this.policy.contract.columns) {
				const key = column.column as Deseq2NumericColumn;
				const left = previous.values[key], right = row.values[key];
				if (left === null || right === null) {
					if (left !== right) mismatch = true;
				} else if (Math.abs(left - right) > column.absoluteTolerance + column.relativeTolerance * Math.max(Math.abs(left), Math.abs(right))) mismatch = true;
			}
			const expectedHit = significant(previous, plan.content), actualHit = significant(row, plan.content);
			if (expectedHit !== actualHit || (expectedHit && Math.sign(previous.values.log2FoldChange!) !== Math.sign(row.values.log2FoldChange!))) mismatch = true;
			if (mismatch) mismatchedRows += 1;
		});
		mismatchedRows += expectedRows.size;
		checks.push({ id: "rnaseq-numerical-equivalence", passed: expected.errorCount === 0 && actual.errorCount === 0 && mismatchedRows === 0,
			detail: `${comparedRows} paired feature rows; ${mismatchedRows} rows differ in keys, NA, declared numerical tolerance or frozen significance endpoints` });
		return { policy: this.policy, equivalent: checks.every((check) => check.passed), checks,
			statistics: { comparedRows, mismatchedRows, expectedRows: expected.rows, actualRows: actual.rows } };
	}
}
