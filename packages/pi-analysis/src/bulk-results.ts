import type {
	AnalysisArtifactRef,
	AnalysisArtifactValidation,
	AnalysisArtifactValidationInput,
	AnalysisReviewCheck,
} from "./analysis-contract.js";
import { canonicalPlanJson, readBulkScientificPlan } from "./bulk-scientific-plan.js";
import type { BulkScientificPlan } from "./bulk-scientific-plan.js";
import { recordEvidence } from "./registry.js";

export const DESEQ2_RESULT_POLICY = { id: "deseq2-wald-tsv", version: "1.0.0" } as const;
export const DESEQ2_RESULT_COLUMNS = [
	"feature_id", "baseMean", "log2FoldChange", "lfcSE", "stat", "pvalue", "padj",
] as const;
export type Deseq2NumericColumn = Exclude<typeof DESEQ2_RESULT_COLUMNS[number], "feature_id">;
export interface Deseq2ResultRow {
	readonly featureId: string;
	readonly values: Readonly<Record<Deseq2NumericColumn, number | null>>;
}
export interface Deseq2Scan {
	readonly rows: number;
	readonly validRows: number;
	readonly errors: readonly string[];
	readonly errorCount: number;
	readonly naCounts: Readonly<Record<string, number>>;
}
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const numericColumns = DESEQ2_RESULT_COLUMNS.slice(1) as readonly Deseq2NumericColumn[];

/** Parses the selected Wald-table schema, retaining legitimate DESeq2 NA patterns. */
export async function scanDeseq2Results(
	lines: AsyncIterable<string>,
	onRow?: (row: Deseq2ResultRow) => void,
): Promise<Deseq2Scan> {
	let header: string[] | undefined;
	let rows = 0, validRows = 0, errorCount = 0;
	const errors: string[] = [];
	const identifiers = new Set<string>();
	const naCounts: Record<string, number> = Object.fromEntries(numericColumns.map((key) => [key, 0]));
	const fail = (detail: string) => {
		errorCount += 1;
		if (errors.length < 20) errors.push(detail);
	};
	for await (const line of lines) {
		if (!header) {
			header = line.split("\t");
			if (header.length !== DESEQ2_RESULT_COLUMNS.length || header.some((key, i) => key !== DESEQ2_RESULT_COLUMNS[i]))
				fail("Header must be feature_id, baseMean, log2FoldChange, lfcSE, stat, pvalue, padj in that order");
			continue;
		}
		rows += 1;
		const before = errorCount;
		const fields = line.split("\t");
		if (fields.length !== DESEQ2_RESULT_COLUMNS.length) {
			fail(`Row ${rows}: field count differs from the fixed DESeq2 schema`);
			continue;
		}
		const featureId = fields[0];
		if (!featureId || featureId.trim() !== featureId || /[\u0000-\u001f]/.test(featureId))
			fail(`Row ${rows}: feature_id must be a nonempty identifier`);
		if (identifiers.has(featureId)) fail(`Row ${rows}: duplicate feature_id ${featureId}`);
		identifiers.add(featureId);
		const values = {} as Record<Deseq2NumericColumn, number | null>;
		for (let i = 0; i < numericColumns.length; i += 1) {
			const key = numericColumns[i], text = fields[i + 1];
			if (text === "NA") {
				values[key] = null;
				naCounts[key] += 1;
			} else if (!NUMBER.test(text) || !Number.isFinite(Number(text))) {
				fail(`Row ${rows}: ${key} must be a finite number or explicit NA`);
			} else {
				values[key] = Number(text);
			}
		}
		if (errorCount !== before) continue;
		if (values.baseMean === null || values.baseMean < 0) fail(`Row ${rows}: baseMean must be nonnegative`);
		if (values.lfcSE !== null && values.lfcSE < 0) fail(`Row ${rows}: lfcSE must be nonnegative`);
		for (const key of ["pvalue", "padj"] as const) {
			const value = values[key];
			if (value !== null && (value < 0 || value > 1)) fail(`Row ${rows}: ${key} must be in [0, 1]`);
		}
		if (values.baseMean === 0) {
			if (numericColumns.some((key) => key !== "baseMean" && values[key] !== null))
				fail(`Row ${rows}: all-zero rows require NA estimates and p-values`);
		} else if (values.log2FoldChange === null || values.lfcSE === null) {
			fail(`Row ${rows}: nonzero rows require finite effect and standard error`);
		}
		if (values.pvalue === null && values.padj !== null)
			fail(`Row ${rows}: padj cannot be present when pvalue is NA`);
		if (values.stat === null && values.pvalue !== null)
			fail(`Row ${rows}: a tested row requires a finite Wald statistic`);
		if (errorCount === before) {
			validRows += 1;
			onRow?.({ featureId, values });
		}
	}
	if (!header) fail("DESeq2 result table is empty");
	if (rows === 0) fail("DESeq2 result table has no observed rows");
	return { rows, validRows, errors, errorCount, naCounts };
}

export function artifactRef(artifact: { path: string; bytes?: number; sha256?: string }): AnalysisArtifactRef {
	if (!Number.isSafeInteger(artifact.bytes) || Number(artifact.bytes) < 0
		|| typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256))
		throw new Error("Full-file validation requires a checksum-verified artifact identity");
	return { path: artifact.path, bytes: Number(artifact.bytes), sha256: artifact.sha256 };
}

export async function validateBulkResults(input: AnalysisArtifactValidationInput): Promise<AnalysisArtifactValidation> {
	if (!["DESeq2", "DESeq2/fixed-dispersion-diagnostic"].includes(input.method.id) || !input.method.version.trim())
		throw new Error("Full-file DESeq2 validation requires the selected method and version");
	const results = input.artifacts.filter((artifact) => /(^|\/)results\.tsv$/.test(artifact.path));
	if (results.length !== 1) return {
		checks: [{ id: "rnaseq-full-result-table", passed: false, detail: "Exactly one declared results.tsv is required" }],
		summaries: [],
	};
	const ref = artifactRef(results[0]);
	const scientificPlan = input.scientificPlan ? readBulkScientificPlan(input.scientificPlan) : undefined;
	if (scientificPlan && (canonicalPlanJson(input.method) !== canonicalPlanJson(scientificPlan.content.method)
		|| ref.path !== scientificPlan.content.outputs.results)) throw new Error("Results or method differ from the frozen scientific plan");
	const statistics: Record<string, number> = { significantRows: 0, positiveRows: 0, negativeRows: 0 };
	let invalidNa = 0;
	const result = await scanDeseq2Results(input.reader.lines(ref), ({ values }) => {
		if (!scientificPlan) return;
		const plan = scientificPlan.content;
		if (values.baseMean !== 0 && values.pvalue === null && !plan.filtering.cooksCutoff) invalidNa += 1;
		if (values.pvalue !== null && values.padj === null && !plan.filtering.independentFiltering) invalidNa += 1;
		if (values.padj !== null && values.log2FoldChange !== null && values.padj < plan.alpha && Math.abs(values.log2FoldChange) >= plan.log2FoldChangeThreshold) {
			statistics.significantRows += 1;
			if (values.log2FoldChange > 0) statistics.positiveRows += 1;
			if (values.log2FoldChange < 0) statistics.negativeRows += 1;
		}
	});
	const execution = scientificPlan ? await validateExecutionReceipt(input, scientificPlan, ref, result, statistics) : undefined;
	return {
		checks: [{
			id: "rnaseq-full-result-table",
			passed: result.errorCount === 0,
			detail: result.errorCount === 0
				? `Full-file ${DESEQ2_RESULT_POLICY.id}@${DESEQ2_RESULT_POLICY.version}: ${result.rows} rows; explicit NA values retained. NA causes and scientific design require execution-evidence review.`
				: `${result.errorCount} full-file errors: ${result.errors.join("; ")}`,
		}, ...(scientificPlan ? [{ id: "rnaseq-na-policy", passed: invalidNa === 0, detail: `${invalidNa} rows have NA patterns outside the frozen filtering policy` }] : []),
		...(execution?.checks ?? [])],
		...(execution?.evidence ? { executionEvidence: execution.evidence } : {}),
		summaries: [{
			path: ref.path, sha256: ref.sha256, policy: DESEQ2_RESULT_POLICY, coverage: "full-file",
			rows: result.rows, validRows: result.validRows, naCounts: result.naCounts,
			statistics: { invalidRows: result.rows - result.validRows, errors: result.errorCount,
				...(scientificPlan ? statistics : {}) },
		}],
	};
}

async function validateExecutionReceipt(
	input: AnalysisArtifactValidationInput,
	plan: BulkScientificPlan,
	results: AnalysisArtifactRef,
	scan: Deseq2Scan,
	statistics: Readonly<Record<string, number>>,
) {
	const artifact = input.artifacts.find((item) => item.path === plan.content.outputs.receipt);
	if (!artifact) return { checks: [{ id: "rnaseq-execution-receipt", passed: false, detail: "No observed execution receipt was collected" }] };
	const ref = artifactRef(artifact);
	let source = "";
	for await (const line of input.reader.lines(ref)) {
		source += line;
		if (source.length > 1024 * 1024) throw new Error("Execution receipt exceeds 1 MiB");
	}
	const receipt = recordEvidence(JSON.parse(source));
	const checks: AnalysisReviewCheck[] = [];
	const check = (id: string, passed: boolean, detail: string) => checks.push({ id, passed, detail });
	check("rnaseq-execution-receipt", receipt.schemaVersion === 1 && receipt.planSha256 === plan.sha256 && receipt.resultSha256 === results.sha256
		&& typeof receipt.codeSha256 === "string" && /^[a-f0-9]{64}$/.test(receipt.codeSha256)
		&& typeof receipt.RVersion === "string" && Boolean(receipt.RVersion.trim())
		&& typeof receipt.observedAt === "string" && Number.isFinite(Date.parse(receipt.observedAt)),
		"Receipt must bind this plan, actual output bytes, code hash and observed R runtime/time");
	for (const key of ["inputKind", "method", "countMatrix", "samples", "groupColumn", "biologicalUnitColumn", "formula", "contrast", "reference", "annotation", "test", "filtering", "alpha", "log2FoldChangeThreshold", "outputs"] as const) {
		check(`rnaseq-observed-${key}`, canonicalPlanJson(receipt[key]) === canonicalPlanJson(plan.content[key]),
			`Observed ${key} must match the frozen scientific plan; a declaration is not an observation`);
	}
	check("rnaseq-input-scope", receipt.usesReference === (plan.content.reference.kind !== "not-applicable")
		&& receipt.usesAnnotation === (plan.content.annotation.kind !== "not-applicable") && receipt.featureIds === "verbatim",
		"Reference/annotation use must match the method scope; supplied feature identifiers are retained verbatim");
	const observedStatistics = recordEvidence(receipt.statistics);
	check("rnaseq-result-statistics", observedStatistics.rows === scan.rows
		&& canonicalPlanJson(observedStatistics.naCounts) === canonicalPlanJson(scan.naCounts)
		&& Object.entries(statistics).every(([key, value]) => observedStatistics[key] === value),
		"Observed row/NA counts and thresholded positive/negative/hit counts must match the full table");
	return { checks, evidence: { path: ref.path, sha256: ref.sha256, content: receipt } };
}
