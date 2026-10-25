import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { BulkRnaseqNumericalComparator, scientificPlanHash } from "../dist/host.mjs";
import { context, planned } from "./bulk-fixtures.mjs";

const header = "feature_id\tbaseMean\tlog2FoldChange\tlfcSE\tstat\tpvalue\tpadj";
const rowA = "a\t12\t1\t0.5\t2\t0.01\t0.02";
const rowB = "b\t12\t-0.5\t0.5\t-1\t0.4\t0.8";
const normalStats = { rows: 2, naCounts: { baseMean: 0, log2FoldChange: 0, lfcSE: 0, stat: 0, pvalue: 0, padj: 0 }, significantRows: 1, positiveRows: 1, negativeRows: 0 };
function side(plan, rows, statistics = normalStats, mutateReceipt = (value) => value) {
	const table = `${header}\n${rows.join("\n")}\n`;
	const sha = (value) => createHash("sha256").update(value).digest("hex");
	const receipt = mutateReceipt({ ...structuredClone(plan.content), schemaVersion: 1, planSha256: plan.sha256, resultSha256: sha(table), codeSha256: "c".repeat(64), RVersion: "4.5.1",
		observedAt: "2026-10-25T00:00:00Z", usesReference: false, usesAnnotation: false, featureIds: "verbatim", statistics });
	const bodies = new Map([[plan.content.outputs.results, table], [plan.content.outputs.receipt, JSON.stringify(receipt)]]);
	return { artifacts: [...bodies].map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: sha(text) })),
		reader: { async *lines(ref) { yield* bodies.get(ref.path).trimEnd().split("\n"); } } };
}
async function compare(plan, expected, actual) {
	return new BulkRnaseqNumericalComparator().compare({ context, method: plan.content.method, scientificPlan: plan, expected, actual });
}
test("method comparator permits row reorder and predeclared floating error without claiming byte equality", async () => {
	const { plan } = planned();
	const expected = side(plan, [rowA, rowB]);
	const actual = side(plan, [rowB.replace("-0.5", "-0.50000001"), rowA.replace("12", "12.000000001")]);
	assert.notEqual(expected.artifacts[0].sha256, actual.artifacts[0].sha256);
	assert.equal((await compare(plan, expected, actual)).equivalent, true);
});
test("method comparator rejects key, numerical, NA, contrast and sample drift", async () => {
	const { plan } = planned();
	const expected = side(plan, [rowA, rowB]);
	for (const actual of [
		side(plan, [rowA, rowB.replace("b\t", "other\t")]),
		side(plan, [rowA.replace("\t1\t0.5", "\t-1\t0.5"), rowB], { ...normalStats, positiveRows: 0, negativeRows: 1 }),
		side(plan, [rowA, rowB.replace("0.8", "NA")], { ...normalStats, naCounts: { ...normalStats.naCounts, padj: 1 } }),
		side(plan, [rowA, rowB], normalStats, (value) => { [value.contrast.numerator, value.contrast.denominator] = [value.contrast.denominator, value.contrast.numerator]; return value; }),
		side(plan, [rowA, rowB], normalStats, (value) => { value.samples.pop(); return value; }),
	]) assert.equal((await compare(plan, expected, actual)).equivalent, false);
});
test("floating tolerance cannot erase a frozen FDR or effect-threshold crossing", async () => {
	const { plan } = planned();
	const expectedFdr = side(plan, [rowA.replace("0.02", "0.049999999"), rowB]);
	const actualFdr = side(plan, [rowA.replace("0.02", "0.050000001"), rowB], { ...normalStats, significantRows: 0, positiveRows: 0 });
	assert.equal((await compare(plan, expectedFdr, actualFdr)).equivalent, false);
	const expectedEffect = side(plan, [rowA.replace("\t1\t0.5", "\t1.000000001\t0.5"), rowB]);
	const actualEffect = side(plan, [rowA.replace("\t1\t0.5", "\t0.999999999\t0.5"), rowB], { ...normalStats, significantRows: 0, positiveRows: 0 });
	assert.equal((await compare(plan, expectedEffect, actualEffect)).equivalent, false);
});
test("post-result comparator edits cannot reclassify the same run", async () => {
	const { plan } = planned();
	const changed = structuredClone(plan);
	changed.content.comparator.contract.columns[0].absoluteTolerance = 100;
	changed.sha256 = scientificPlanHash(changed.content);
	await assert.rejects(compare(changed, side(plan, [rowA, rowB]), side(plan, [rowA, rowB])), /pre-registered/);
});
