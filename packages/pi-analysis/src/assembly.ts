import type { AnalysisComputePlanInput, AnalysisContext, AnalysisReviewCheck } from "./analysis-contract.js";
import {
	type AnalysisAdapter,
	type AnalysisAdapterPlan,
	type AnalysisArtifactEvidence,
	adapterSnapshotSha256,
	methodIdentity,
	recordEvidence,
	requiredOutputs,
} from "./registry.js";

/** BUSCO short-summary percentages have one decimal place; counts remain exact. */
export function validateBuscoEvidence(value: unknown): boolean {
	const row = qcRecord(value);
	if (!row) return false;
	const tool = qcRecord(row.tool);
	const lineage = qcRecord(row.lineage);
	const counts = qcRecord(row.counts);
	if (!tool || !lineage || !counts) return false;
	if (tool.id !== "BUSCO" || typeof tool.version !== "string" || !tool.version.trim()) return false;
	if (typeof lineage.id !== "string" || !lineage.id.trim() || typeof lineage.version !== "string" || !lineage.version.trim()) return false;
	const keys = ["complete", "single", "duplicated", "fragmented", "missing"] as const;
	const total = counts.total;
	if (typeof total !== "number" || !Number.isSafeInteger(total) || total <= 0) return false;
	for (const key of keys) {
		const count = counts[key];
		const percentage = row[key];
		if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > total) return false;
		if (typeof percentage !== "number" || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) return false;
		if (Math.abs(percentage - 100 * count / total) > 0.0500000001) return false;
	}
	return counts.complete === Number(counts.single) + Number(counts.duplicated)
		&& Number(counts.complete) + Number(counts.fragmented) + Number(counts.missing) === total
		&& Number(counts.duplicated) <= Number(counts.complete);
}

function qcRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined;
}

function readQcObject(artifact: AnalysisArtifactEvidence | undefined): Record<string, unknown> | undefined {
	if (!artifact?.text) return undefined;
	let value: unknown;
	try {
		value = JSON.parse(artifact.text);
	} catch (error) {
		if (error instanceof SyntaxError) return undefined;
		throw error;
	}
	return qcRecord(value);
}

/** Minimal de novo assembly contract; no treatment groups or contrasts. */
export class AssemblyAdapter implements AnalysisAdapter {
	readonly identity = { id: "assembly", version: "1.0.0" };
	readonly contract = {
		schemaVersion: 1 as const,
		assay: "assembly",
		domain: "genomics" as const,
		researchStages: ["design", "readiness", "execution", "review", "delivery"] as const,
		inputs: [
			{
				id: "assembly-reads",
				type: "file" as const,
				required: true,
				formats: ["fastq", "fastq.gz", "fasta", "fasta.gz"],
			},
			{ id: "reference-or-goal", type: "metadata" as const, required: true },
		],
		outputs: [
			{ id: "assembly", type: "file" as const, required: true, formats: ["fasta", "fa", "fna"] },
			{ id: "assembly-metrics", type: "metric" as const, required: true, formats: ["json"] },
			{ id: "busco", type: "metric" as const, required: true, formats: ["json"] },
			{ id: "contamination", type: "metric" as const, required: true, formats: ["json"] },
		],
		capabilities: ["analysis", "files", "coding"],
		sideEffects: ["read-only", "code-execution", "project-write"],
		evidenceTypes: ["assembly-fasta", "assembly-metrics", "busco", "contamination", "hi-c-contact-map"],
		workflow: { id: "drone/assembly", version: "1.0.0" },
	} as const;
	readonly reviewInstructions =
		"Review de novo assembly outputs and supplied QC evidence. A nonempty FASTA and positive assembly length are only structural checks. Do not claim completeness, absence of contamination, chromosome correctness or reference agreement without corresponding validated evidence. Preserve supplied limitations.";
	supports(assay: string): boolean {
		return assay === "assembly";
	}
	buildPlan(_context: AnalysisContext, spec: AnalysisComputePlanInput, value: unknown): AnalysisAdapterPlan {
		const evidence = recordEvidence(value);
		const method = methodIdentity(evidence.method);
		const outputs = requiredOutputs(spec);
		const requiredQcOutputs = [
			"assembly/contigs.fasta",
			"assembly/assembly-metrics.json",
			"assembly/busco.json",
			"assembly/contamination.json",
		];
		const missingOutputs = requiredQcOutputs.filter((path) => !outputs.includes(path));
		const ready =
			evidence.readsValidated === true &&
			evidence.assemblyGoalResolved === true &&
			Boolean(spec.dataDesign?.dataset?.files?.length) &&
			missingOutputs.length === 0;
		return {
			method,
			requiredOutputs: outputs,
			adapterSnapshotSha256: adapterSnapshotSha256(this),
			assessment: {
				ok: ready,
				inferentialClaimsAllowed: false,
				gates: ready
					? []
					: [
							{
								code: "missing-data",
								severity: "pause",
								message:
									missingOutputs.length > 0
										? `Assembly contract is missing QC outputs: ${missingOutputs.join(", ")}`
										: "Assembly requires validated input reads and a resolved assembly goal.",
								evidenceKey: "assembly-inputs",
							},
						],
				warnings: [
					"Assembly structure checks do not establish completeness, contamination status or chromosome correctness; these require separate QC evidence.",
				],
			},
		};
	}
	reviewResults(
		_context: AnalysisContext,
		artifacts: readonly AnalysisArtifactEvidence[],
	): readonly AnalysisReviewCheck[] {
		const fasta = artifacts.find((item) => /\.(fasta|fa|fna)$/i.test(item.path));
		const metrics = artifacts.find((item) => /(^|\/)assembly-metrics\.json$/.test(item.path));
		const busco = artifacts.find((item) => /(^|\/)(busco|assembly\/busco)\.json$/.test(item.path));
		const contamination = artifacts.find((item) =>
			/(^|\/)(contamination|assembly\/contamination)\.json$/.test(item.path),
		);
		let positiveLength = false;
		let validBusco = false;
		let validContamination = false;
		const metricsRow = readQcObject(metrics);
		if (metricsRow) {
			const row = metricsRow;
			positiveLength =
				typeof row.totalLength === "number" &&
				Number.isFinite(row.totalLength) &&
				row.totalLength > 0 &&
				typeof row.contigs === "number" &&
				Number.isInteger(row.contigs) &&
				row.contigs > 0;
			positiveLength =
				positiveLength && typeof row.n50 === "number" && Number.isFinite(row.n50) && row.n50 > 0;
		}
		const buscoRow = readQcObject(busco);
		if (buscoRow) validBusco = validateBuscoEvidence(buscoRow);
		const contaminationRow = readQcObject(contamination);
		if (contaminationRow) {
			const row = contaminationRow;
			const rate = row.contaminationRate;
			validContamination = typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate <= 0.1;
		}
		return [
			{
				id: "assembly-fasta",
				passed: /^>[^\r\n]+\r?\n[ACGTNacgtn]+/.test(fasta?.text ?? ""),
				detail: "Assembly FASTA requires a header and nucleotide sequence.",
			},
			{
				id: "assembly-metrics",
				passed: positiveLength,
				detail: "Assembly metrics require positive totalLength, contigs and N50.",
			},
			{
				id: "assembly-busco",
				passed: validBusco,
				detail:
					"BUSCO requires observed tool/lineage versions and exact counts: C=S+D, C+F+M=total; one-decimal percentages must match those counts.",
			},
			{
				id: "assembly-contamination",
				passed: validContamination,
				detail: "Contamination evidence requires contaminationRate between 0 and 0.1.",
			},
		];
	}
}
