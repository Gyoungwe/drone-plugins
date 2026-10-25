import type { AnalysisComputePlanInput, AnalysisIdentity, AnalysisScientificPlan, AnalysisNumericalComparatorPolicy } from "./analysis-contract.js";
import { recordEvidence } from "./registry.js";
import { canonicalPlanJson, scientificPlanHash } from "./canonical.js";
import { DESEQ2_NUMERICAL_POLICY } from "./bulk-numerical-policy.js";
export { canonicalPlanJson, scientificPlanHash } from "./canonical.js";

export type BulkReference =
	| { readonly kind: "observed-file"; readonly id: string; readonly version: string; readonly path: string; readonly sha256: string }
	| { readonly kind: "not-applicable"; readonly reason: string };
export interface BulkSample {
	readonly sampleId: string;
	readonly matrixColumn: string;
	readonly biologicalUnit: string;
	readonly group: string;
	readonly covariates: Readonly<Record<string, string>>;
}
export interface BulkScientificPlanContent extends Readonly<Record<string, unknown>> {
	readonly inputKind: "raw-gene-counts";
	readonly method: AnalysisIdentity;
	readonly countMatrix: { readonly path: string; readonly sha256: string; readonly columns: readonly string[] };
	readonly samples: readonly BulkSample[];
	readonly groupColumn: string;
	readonly biologicalUnitColumn: string;
	readonly formula: string;
	readonly contrast: { readonly factor: string; readonly numerator: string; readonly denominator: string };
	readonly reference: BulkReference;
	readonly annotation: BulkReference;
	readonly test: { readonly kind: "Wald"; readonly lfcThreshold: 0; readonly altHypothesis: "greaterAbs" };
	readonly filtering: { readonly independentFiltering: boolean; readonly cooksCutoff: boolean };
	readonly alpha: number;
	readonly log2FoldChangeThreshold: number;
	readonly outputs: { readonly results: string; readonly receipt: string };
	readonly comparator: AnalysisNumericalComparatorPolicy;
}
export interface BulkScientificPlan extends AnalysisScientificPlan {
	readonly kind: "bulk-rnaseq-deseq2-wald";
	readonly content: BulkScientificPlanContent;
}

function text(value: unknown, label: string): string {
	if (typeof value !== "string" || !value.trim() || value.trim() !== value || value.length > 1024)
		throw new Error(`${label} requires a nonempty bounded string`);
	return value;
}
function variable(value: unknown, label: string): string {
	const name = text(value, label);
	if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) throw new Error(`${label} must be a plain design-column name`);
	return name;
}
function path(value: unknown, label: string): string {
	const name = text(value, label);
	if (name.startsWith("/") || name.includes("\\") || name.split("/").some((part) => !part || part === "." || part === ".."))
		throw new Error(`${label} must stay inside the analysis workspace`);
	return name;
}
function sha256(value: unknown, label: string): string {
	const hash = text(value, label);
	if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`${label} requires a SHA-256 identity`);
	return hash;
}
function reference(value: unknown, label: string, files: AnalysisComputePlanInput["dataDesign"], countsOnly: boolean): BulkReference {
	const row = recordEvidence(value);
	if (row.kind === "not-applicable") {
		if (!countsOnly) throw new Error(`${label} may be not-applicable only for drone/deseq2-counts@1.0.0`);
		return { kind: "not-applicable", reason: text(row.reason, `${label}.reason`) };
	}
	if (row.kind !== "observed-file") throw new Error(`${label} must identify an observed file or a method-scoped not-applicable reason`);
	const result = { kind: "observed-file" as const, id: text(row.id, `${label}.id`), version: text(row.version, `${label}.version`),
		path: path(row.path, `${label}.path`), sha256: sha256(row.sha256, `${label}.sha256`) };
	if (!files?.dataset?.files?.some((file) => file.path === result.path && file.sha256 === result.sha256))
		throw new Error(`${label} is not bound to a dataset file at the frozen hash`);
	return result;
}

/** Rank of the explicitly supported categorical, additive design. */
function designIsFullRank(samples: readonly BulkSample[], covariates: readonly string[], groupColumn: string): boolean {
	const variables = [...covariates, groupColumn];
	const levels = variables.map((name) => [...new Set(samples.map((sample) => name === groupColumn ? sample.group : sample.covariates[name]))].sort());
	if (levels.some((values) => values.length < 2)) return false;
	const matrix = samples.map((sample) => [1, ...variables.flatMap((name, index) => levels[index].slice(1)
		.map((level) => (name === groupColumn ? sample.group : sample.covariates[name]) === level ? 1 : 0))]);
	const columns = matrix[0].length;
	let rank = 0;
	for (let column = 0; column < columns && rank < matrix.length; column += 1) {
		const pivot = matrix.findIndex((row, index) => index >= rank && Math.abs(row[column]) > 1e-10);
		if (pivot < 0) continue;
		[matrix[rank], matrix[pivot]] = [matrix[pivot], matrix[rank]];
		const divisor = matrix[rank][column];
		for (let j = column; j < columns; j += 1) matrix[rank][j] /= divisor;
		for (let i = rank + 1; i < matrix.length; i += 1) {
			const multiplier = matrix[i][column];
			for (let j = column; j < columns; j += 1) matrix[i][j] -= multiplier * matrix[rank][j];
		}
		rank += 1;
	}
	return rank === columns && samples.length > columns;
}

/** Normalize scientific declarations once at the model/plan trust boundary. */
export function normalizeBulkScientificPlan(
	spec: AnalysisComputePlanInput,
	value: unknown,
	method: AnalysisIdentity,
	groupColumnValue: unknown,
	unitColumnValue: unknown,
): BulkScientificPlan {
	if (method.id !== "DESeq2") throw new Error("The frozen standard Wald plan requires DESeq2, not a diagnostic substitute");
	const row = recordEvidence(value);
	const workflow = recordEvidence(spec.workflow);
	const countsOnly = workflow.name === "drone/deseq2-counts" && workflow.version === "1.0.0";
	if (row.inputKind !== "raw-gene-counts") throw new Error("This scientific plan supports raw-gene-counts only");
	const declaredMethod = recordEvidence(row.method);
	if (declaredMethod.id !== method.id || declaredMethod.version !== method.version) throw new Error("Scientific-plan method differs from the selected method");
	const groupColumn = variable(row.groupColumn, "groupColumn");
	if (groupColumn !== groupColumnValue) throw new Error("Scientific-plan group column differs from readiness evidence");
	const unitColumn = variable(unitColumnValue, "biologicalUnitColumn");
	const idColumn = spec.dataDesign?.sampleSheet?.idColumn;
	if (!idColumn || !spec.dataDesign?.rows?.length || !spec.dataDesign.dataset?.files?.length || !spec.dataDesign.analysisPlan)
		throw new Error("A scientific plan requires the bound sample schema, rows, dataset files and analysis plan");
	const inputPaths = spec.dataDesign.dataset.files.map((file) => path(file.path, "dataset input").toLowerCase());
	if (inputPaths.some((name) => name === "evidence" || name.startsWith("evidence/"))) throw new Error("Dataset inputs cannot use the reserved evidence namespace");
	const covariates = [...(spec.dataDesign.analysisPlan.covariates ?? [])].map((name) => variable(name, "covariate"));
	if (new Set(covariates).size !== covariates.length || covariates.includes(groupColumn)) throw new Error("Design variables must be distinct");
	if (!Array.isArray(row.samples) || row.samples.length !== spec.dataDesign.rows.length) throw new Error("Scientific-plan samples must match the bound rows exactly");
	const boundRows = new Map(spec.dataDesign.rows.map((sample) => [sample[idColumn], sample]));
	if (boundRows.size !== spec.dataDesign.rows.length) throw new Error("Bound sample IDs must be unique");
	const seen = new Set<string>();
	const samples: BulkSample[] = row.samples.map((value, index) => {
		const sample = recordEvidence(value), sampleId = text(sample.sampleId, `samples[${index}].sampleId`);
		const bound = boundRows.get(sampleId);
		if (!bound || seen.has(sampleId)) throw new Error(`Scientific-plan sample is absent or duplicated: ${sampleId}`);
		seen.add(sampleId);
		const biologicalUnit = text(sample.biologicalUnit, "sample.biologicalUnit"), group = text(sample.group, "sample.group");
		if (bound[groupColumn] !== group || bound[unitColumn] !== biologicalUnit) throw new Error(`Scientific-plan group/unit differs from bound sample ${sampleId}`);
		const suppliedCovariates = recordEvidence(sample.covariates);
		if (Object.keys(suppliedCovariates).length !== covariates.length) throw new Error("Scientific-plan covariates differ from the bound analysis plan");
		const values: Record<string, string> = {};
		for (const name of covariates) {
			values[name] = text(suppliedCovariates[name], `sample.covariates.${name}`);
			if (values[name] !== bound[name]) throw new Error(`Scientific-plan covariate differs from bound sample ${sampleId}`);
		}
		return { sampleId, matrixColumn: text(sample.matrixColumn, "sample.matrixColumn"), biologicalUnit, group, covariates: values };
	});
	if (new Set(samples.map((sample) => sample.biologicalUnit)).size !== samples.length)
		throw new Error("Technical lanes require explicit count aggregation before this biological-sample workflow");
	const matrix = recordEvidence(row.countMatrix);
	if (!Array.isArray(matrix.columns) || matrix.columns.some((name) => typeof name !== "string")) throw new Error("countMatrix.columns requires the actual sample-column order");
	const columns = [...matrix.columns] as string[];
	if (columns.length !== samples.length || new Set(columns).size !== columns.length || samples.some((sample, i) => sample.matrixColumn !== columns[i]))
		throw new Error("Scientific-plan samples do not follow the declared count-matrix columns");
	const countMatrix = { path: path(matrix.path, "countMatrix.path"), sha256: sha256(matrix.sha256, "countMatrix.sha256"), columns };
	if (!spec.dataDesign.dataset?.files?.some((file) => file.path === countMatrix.path && file.sha256 === countMatrix.sha256))
		throw new Error("Count matrix differs from the bound input identity");
	const contrastRow = recordEvidence(row.contrast);
	const contrast = { factor: variable(contrastRow.factor, "contrast.factor"), numerator: text(contrastRow.numerator, "contrast.numerator"), denominator: text(contrastRow.denominator, "contrast.denominator") };
	const groups = new Set(samples.map((sample) => sample.group));
	if (contrast.factor !== groupColumn || contrast.numerator === contrast.denominator || !groups.has(contrast.numerator) || !groups.has(contrast.denominator))
		throw new Error("Contrast must explicitly identify two observed levels of the grouping factor");
	const formula = `~ ${[...covariates, groupColumn].join(" + ")}`;
	if (row.formula !== formula || !designIsFullRank(samples, covariates, groupColumn)) throw new Error("Scientific design is unsupported or rank deficient");
	const test = recordEvidence(row.test), filtering = recordEvidence(row.filtering), outputs = recordEvidence(row.outputs);
	if (test.kind !== "Wald" || test.lfcThreshold !== 0 || test.altHypothesis !== "greaterAbs") throw new Error("This method supports the explicitly frozen zero-null Wald test only");
	if (typeof filtering.independentFiltering !== "boolean" || typeof filtering.cooksCutoff !== "boolean") throw new Error("Filtering choices must be explicitly frozen");
	if (typeof row.alpha !== "number" || !Number.isFinite(row.alpha) || row.alpha <= 0 || row.alpha >= 1 || row.alpha !== spec.dataDesign.analysisPlan?.alpha)
		throw new Error("Alpha must match the bound analysis plan");
	if (typeof row.log2FoldChangeThreshold !== "number" || !Number.isFinite(row.log2FoldChangeThreshold) || row.log2FoldChangeThreshold < 0)
		throw new Error("An explicit nonnegative log2 fold-change threshold is required");
	const outputPaths = { results: path(outputs.results, "outputs.results"), receipt: path(outputs.receipt, "outputs.receipt") };
	const outputNames = Object.values(outputPaths).map((name) => name.toLowerCase());
	const conflict = (left: string, right: string) => left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
	if (conflict(outputNames[0], outputNames[1]) || outputNames.some((name) => name === "evidence" || name.startsWith("evidence/") || inputPaths.some((input) => conflict(name, input))))
		throw new Error("Scientific outputs must be distinct from each other, frozen inputs and the reserved evidence namespace");
	const declaredOutputs = spec.outputs?.map((item) => typeof item === "string" ? item : item.path);
	if (!/(^|\/)results\.tsv$/.test(outputPaths.results) || !declaredOutputs?.includes(outputPaths.results) || !declaredOutputs.includes(outputPaths.receipt)) throw new Error("Scientific outputs must be declared before execution");
	const content: BulkScientificPlanContent = {
		inputKind: "raw-gene-counts", method: { ...method }, countMatrix, samples, groupColumn, biologicalUnitColumn: unitColumn, formula, contrast,
		reference: reference(row.reference, "reference", spec.dataDesign, countsOnly),
		annotation: reference(row.annotation, "annotation", spec.dataDesign, countsOnly),
		test: { kind: "Wald", lfcThreshold: 0, altHypothesis: "greaterAbs" },
		filtering: { independentFiltering: filtering.independentFiltering, cooksCutoff: filtering.cooksCutoff },
		alpha: row.alpha, log2FoldChangeThreshold: row.log2FoldChangeThreshold, outputs: outputPaths,
		comparator: DESEQ2_NUMERICAL_POLICY,
	};
	return { schemaVersion: 1, kind: "bulk-rnaseq-deseq2-wald", sha256: scientificPlanHash(content), content };
}

/** Stored plans are checked at the persistence/capsule boundary before reuse. */
export function readBulkScientificPlan(plan: AnalysisScientificPlan): BulkScientificPlan {
	if (plan.schemaVersion !== 1 || plan.kind !== "bulk-rnaseq-deseq2-wald" || plan.sha256 !== scientificPlanHash(plan.content))
		throw new Error("Frozen scientific-plan identity changed");
	if (canonicalPlanJson(plan.content.comparator) !== canonicalPlanJson(DESEQ2_NUMERICAL_POLICY))
		throw new Error("Frozen numerical comparator differs from the pre-registered method policy");
	return plan as BulkScientificPlan;
}
