import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const extension = await import(pathToFileURL(join(root, "dist/index.mjs")).href);
const host = await import(pathToFileURL(join(root, "dist/host.mjs")).href);
const manifest = JSON.parse(await readFile(join(root, "plugin.manifest.json"), "utf8"));

assert.equal(host.analysisHostLoader.contractVersion, 1);
assert.equal(host.analysisHostLoader.load().contractVersion, 1);
assert.deepEqual(
	host.analysisHostLoader.load().registry.list().map((adapter) => adapter.identity.id),
	["assembly", "bulk-rnaseq"],
);

const tools = new Map();
const registered = extension.default({
	registerTool(tool) {
		tools.set(tool.name, tool);
	},
});
assert.deepEqual(registered.tools, manifest.tools);
assert.deepEqual([...tools.keys()], registered.tools);

const listed = await tools.get("analysis_list_adapters").execute("list", {});
assert.equal(listed.details.adapters.length, 2);
assert.deepEqual(
	listed.details.adapters.map((item) => item.identity.id),
	["assembly", "bulk-rnaseq"],
);

const ready = await tools.get("analysis_assess_readiness").execute("ready", {
	id: "assembly-ready",
	question: "Assemble reads",
	assay: "assembly",
	mode: "exploratory",
	spec: {
		outputs: [
			"assembly/contigs.fasta",
			"assembly/assembly-metrics.json",
			"assembly/busco.json",
			"assembly/contamination.json",
		],
		dataDesign: { dataset: { files: ["reads-1.fastq.gz"] }, rows: [{ sample: "reads-1" }] },
	},
	evidence: { readsValidated: true, assemblyGoalResolved: true, method: { id: "spades", version: "4.0.0" } },
});
assert.equal(ready.details.status, "ready");
assert.equal(ready.details.execution, "host-required");

const blocked = await tools.get("analysis_assess_readiness").execute("blocked", {
	id: "assembly-blocked",
	question: "Assemble reads",
	assay: "assembly",
	mode: "exploratory",
	spec: { outputs: ["assembly/contigs.fasta"], dataDesign: { dataset: { files: [] }, rows: [] } },
	evidence: {
		readsValidated: false,
		assemblyGoalResolved: false,
		method: { id: "spades", version: "4.0.0" },
	},
});
assert.equal(blocked.details.status, "blocked");
assert.equal(blocked.details.assessment.ok, false);

const bulkReady = await tools.get("analysis_assess_readiness").execute("bulk-ready", {
	id: "bulk-ready",
	question: "Compare treatment groups",
	assay: "bulk-rnaseq",
	mode: "inferential",
	spec: {
		outputs: ["results.tsv"],
		dataDesign: {
			dataset: { files: [{ path: "counts.tsv" }] },
			rows: [
				{ group: "control", unit: "c1" },
				{ group: "control", unit: "c2" },
				{ group: "treated", unit: "t1" },
				{ group: "treated", unit: "t2" },
			],
		},
	},
	evidence: {
		method: { id: "DESeq2", version: "1.0.0" },
		groupColumn: "group",
		biologicalUnitColumn: "unit",
		contrastResolved: true,
		referenceResolved: true,
	},
});
assert.equal(bulkReady.details.status, "ready");

const review = new extension.AssemblyAdapter().reviewResults(
	{ version: 1, id: "assembly-review", question: "Review", assay: "assembly", mode: "exploratory" },
	[
		{ path: "assembly/contigs.fasta", text: ">contig-1\nACGT" },
		{
			path: "assembly/assembly-metrics.json",
			text: JSON.stringify({ totalLength: 100, contigs: 1, n50: 100 }),
		},
		{
			path: "assembly/busco.json",
			text: JSON.stringify({
				tool: { id: "BUSCO", version: "6.1.0" }, lineage: { id: "eukaryota_odb12", version: "2025-07-01" },
				complete: 90, single: 88, duplicated: 2, fragmented: 5, missing: 5,
				counts: { complete: 90, single: 88, duplicated: 2, fragmented: 5, missing: 5, total: 100 },
			}),
		},
		{ path: "assembly/contamination.json", text: JSON.stringify({ contaminationRate: 0.01 }) },
	],
);
assert.ok(review.every((check) => check.passed));

const busco = {
	tool: { id: "BUSCO", version: "6.1.0" }, lineage: { id: "eukaryota_odb12", version: "2025-07-01" },
	complete: 95, single: 94, duplicated: 1, fragmented: 2, missing: 3,
	counts: { complete: 95, single: 94, duplicated: 1, fragmented: 2, missing: 3, total: 100 },
};
assert.equal(extension.validateBuscoEvidence(busco), true);
assert.equal(extension.validateBuscoEvidence({ ...busco, missing: 2 }), false);
assert.equal(extension.validateBuscoEvidence({ ...busco, duplicated: 96 }), false);
assert.equal(extension.validateBuscoEvidence({ ...busco, tool: undefined }), false);
assert.equal(extension.validateBuscoEvidence({ ...busco, lineage: undefined }), false);
assert.equal(extension.validateBuscoEvidence({ ...busco, counts: { ...busco.counts, complete: 94 } }), false);
const rounded = {
	...busco, complete: 98.6, single: 97.2, duplicated: 1.4, fragmented: 0.7, missing: 0.7,
	counts: { complete: 142, single: 140, duplicated: 2, fragmented: 1, missing: 1, total: 144 },
};
assert.equal(extension.validateBuscoEvidence(rounded), true);

const bundle = await readFile(join(root, "dist/index.mjs"), "utf8");
assert(!bundle.includes("@drone/backend"));
assert(!bundle.includes("electron"));
console.log("pi-analysis registration and readiness smoke passed");
