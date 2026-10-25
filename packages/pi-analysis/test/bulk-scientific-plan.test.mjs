import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { BulkRnaseqAdapter, scientificPlanHash } from "../dist/host.mjs";

import { context, scientificFixture, planned } from "./bulk-fixtures.mjs";

const header = "feature_id\tbaseMean\tlog2FoldChange\tlfcSE\tstat\tpvalue\tpadj";
export async function reviewed(plan, mutateReceipt = (value) => value, table = `${header}\ngene\t12\t1\t0.5\t2\t0.01\t0.02\n`) {
	const hash = (text) => createHash("sha256").update(text).digest("hex");
	const receipt = mutateReceipt({ ...structuredClone(plan.content), schemaVersion: 1, planSha256: plan.sha256, resultSha256: hash(table), codeSha256: "c".repeat(64),
		RVersion: "R version 4.5.1", observedAt: "2026-10-25T00:00:00Z", usesReference: false, usesAnnotation: false, featureIds: "verbatim",
		statistics: { rows: 1, naCounts: { baseMean: 0, log2FoldChange: 0, lfcSE: 0, stat: 0, pvalue: 0, padj: 0 }, significantRows: 1, positiveRows: 1, negativeRows: 0 } });
	const bodies = new Map([[plan.content.outputs.results, table], [plan.content.outputs.receipt, JSON.stringify(receipt)]]);
	const artifacts = [...bodies].map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: hash(text) }));
	return new BulkRnaseqAdapter().validateArtifacts({ context, method: plan.content.method, scientificPlan: plan, artifacts,
		reader: { async *lines(ref) { yield* bodies.get(ref.path).trimEnd().split("\n"); } } });
}
test("scientific plan freezes an explicit sample mapping independent of metadata row order", () => {
	const { spec, evidence, content } = scientificFixture();
	spec.dataDesign.rows.reverse();
	const plan = new BulkRnaseqAdapter().buildPlan(context, spec, evidence);
	assert.equal(plan.assessment.ok, true);
	assert.equal(plan.scientificPlan.content.samples[0].sampleId, "c1");
	content.countMatrix.columns.reverse();
	assert.equal(plan.scientificPlan.content.countMatrix.columns[0], "c1");
});
test("scientific plan rejects matrix order, units, contrast, alpha and hash drift", () => {
	for (const change of [
		({ content }) => content.countMatrix.columns.reverse(),
		({ content }) => { content.samples[0].biologicalUnit = "different"; },
		({ content }) => { content.contrast.denominator = "absent"; },
		({ content }) => { content.alpha = 0.1; },
		({ content }) => { content.countMatrix.sha256 = "b".repeat(64); },
		({ content }) => { content.formula = "~ hidden + condition"; },
		({ content, spec }) => { content.outputs.receipt = content.outputs.results; spec.outputs = Object.values(content.outputs); },
		({ content, spec }) => { content.outputs.receipt = "counts.tsv"; spec.outputs = Object.values(content.outputs); },
		({ content, spec }) => { content.outputs.receipt = "Evidence/code.R"; spec.outputs = Object.values(content.outputs); },
	]) {
		const fixture = scientificFixture(); change(fixture);
		assert.throws(() => new BulkRnaseqAdapter().buildPlan(context, fixture.spec, fixture.evidence));
	}
});
test("categorical full confounding is rejected even without optional host confounding evidence", () => {
	const { spec, evidence, content } = scientificFixture();
	spec.dataDesign.analysisPlan.covariates = ["batch"];
	content.formula = "~ batch + condition";
	for (let i = 0; i < content.samples.length; i += 1) {
		const batch = i < 2 ? "one" : "two";
		content.samples[i].covariates = { batch };
		spec.dataDesign.rows[i].batch = batch;
	}
	assert.throws(() => new BulkRnaseqAdapter().buildPlan(context, spec, evidence), /rank deficient/);
});
test("method-scoped not-applicable cannot erase a reference requirement on another workflow", () => {
	const { spec, evidence } = scientificFixture();
	spec.workflow.name = "other/workflow";
	assert.throws(() => new BulkRnaseqAdapter().buildPlan(context, spec, evidence), /not-applicable/);
});
test("scientific method plan must already be bound in the authorized analysis plan", () => {
	const { spec, evidence } = scientificFixture();
	delete spec.dataDesign.analysisPlan.methodPlan;
	assert.throws(() => new BulkRnaseqAdapter().buildPlan(context, spec, evidence), /authorized analysisPlan/);
});
test("observed execution receipt and full-table counts are checked before review", async () => {
	const { plan } = planned();
	const result = await reviewed(plan);
	assert.equal(result.checks.every((check) => check.passed), true);
	assert.equal(result.executionEvidence.content.method.version, "1.48.2");
	assert.equal(result.summaries[0].statistics.significantRows, 1);
	for (const change of [
		(value) => { value.method.version = "different"; return value; },
		(value) => { [value.contrast.numerator, value.contrast.denominator] = [value.contrast.denominator, value.contrast.numerator]; return value; },
		(value) => { value.samples.reverse(); return value; },
		(value) => { value.statistics.significantRows = 2; return value; },
		(value) => { value.usesAnnotation = true; return value; },
		(value) => { value.resultSha256 = "f".repeat(64); return value; },
	]) assert.equal((await reviewed(plan, change)).checks.every((check) => check.passed), false);
});
test("a legitimate zero-hit result is deliverable with matching observed statistics", async () => {
	const { plan } = planned();
	const checked = await reviewed(plan, (value) => { value.statistics.significantRows = 0; value.statistics.positiveRows = 0; return value; },
		`${header}\ngene\t12\t1\t0.5\t2\t0.4\t0.8\n`);
	assert.equal(checked.checks.every((check) => check.passed), true);
});
test("a missing execution receipt cannot authorize scientific delivery", async () => {
	const { plan } = planned();
	const text = `${header}\ngene\t12\t1\t0.5\t2\t0.01\t0.02\n`;
	const artifact = { path: plan.content.outputs.results, bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") };
	const checked = await new BulkRnaseqAdapter().validateArtifacts({ context, method: plan.content.method, scientificPlan: plan, artifacts: [artifact],
		reader: { async *lines() { yield* text.trimEnd().split("\n"); } } });
	assert.equal(checked.checks.find((check) => check.id === "rnaseq-execution-receipt").passed, false);
});
test("NA patterns outside explicitly disabled filtering choices cannot pass", async () => {
	const { plan } = planned();
	const frozen = structuredClone(plan);
	frozen.content.filtering.independentFiltering = false;
	frozen.sha256 = scientificPlanHash(frozen.content);
	const checked = await reviewed(frozen, (value) => {
		value.statistics = { ...value.statistics, significantRows: 0, positiveRows: 0,
			naCounts: { ...value.statistics.naCounts, padj: 1 } };
		return value;
	}, `${header}\ngene\t12\t1\t0.5\t2\t0.01\tNA\n`);
	assert.equal(checked.checks.find((check) => check.id === "rnaseq-na-policy").passed, false);
});
