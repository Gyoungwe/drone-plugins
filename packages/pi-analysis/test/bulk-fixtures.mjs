import { BulkRnaseqAdapter, normalizeBulkScientificPlan } from "../dist/host.mjs";

export const context = { version: 1, id: "scientific-bulk", question: "Compare supplied counts", assay: "bulk-rnaseq", mode: "inferential" };
export function scientificFixture() {
	const samples = ["c1", "c2", "t1", "t2"].map((sampleId, index) => ({ sampleId, matrixColumn: sampleId, biologicalUnit: sampleId, group: index < 2 ? "control" : "treated", covariates: {} }));
	const content = {
		inputKind: "raw-gene-counts", method: { id: "DESeq2", version: "1.48.2" },
		countMatrix: { path: "counts.tsv", sha256: "a".repeat(64), columns: samples.map((sample) => sample.matrixColumn) },
		samples, groupColumn: "condition", formula: "~ condition",
		contrast: { factor: "condition", numerator: "treated", denominator: "control" },
		reference: { kind: "not-applicable", reason: "Count-only test; no alignment is performed" },
		annotation: { kind: "not-applicable", reason: "Feature IDs are supplied verbatim" },
		test: { kind: "Wald", lfcThreshold: 0, altHypothesis: "greaterAbs" },
		filtering: { independentFiltering: true, cooksCutoff: true },
		alpha: 0.05, log2FoldChangeThreshold: 1,
		outputs: { results: "deseq2/results.tsv", receipt: "deseq2/execution-receipt.json" },
	};
	const spec = { workflow: { name: "drone/deseq2-counts", version: "1.0.0" }, outputs: Object.values(content.outputs),
		dataDesign: { rows: samples.map((sample) => ({ sample: sample.sampleId, unit: sample.biologicalUnit, condition: sample.group })),
			sampleSheet: { idColumn: "sample" }, analysisPlan: { alpha: 0.05, covariates: [] }, dataset: { files: [{ path: "counts.tsv", bytes: 10, sha256: "a".repeat(64) }] } } };
	const evidence = { method: content.method, groupColumn: "condition", biologicalUnitColumn: "unit", scientificPlan: content };
	spec.dataDesign.analysisPlan.methodPlan = normalizeBulkScientificPlan(spec, content, content.method, "condition", "unit");
	return { spec, evidence, content };
}
export function planned() {
	const fixture = scientificFixture();
	const plan = new BulkRnaseqAdapter().buildPlan(context, fixture.spec, fixture.evidence).scientificPlan;
	return { ...fixture, plan };
}
