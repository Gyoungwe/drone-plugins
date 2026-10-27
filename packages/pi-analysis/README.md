# @gyoungwe/pi-analysis

Portable, evidence-gated analysis adapter discovery and scientific readiness checks for native Pi.

The package exposes `analysis_list_adapters`, `analysis_assess_readiness` and `analysis_prepare_evidence`. They resolve a versioned adapter, evaluate an immutable plan and prepare a host-owned evidence handoff. Remote execution, authorization, persistence, artifact collection, review and delivery remain host responsibilities.

The first adapters cover bulk RNA-seq/DESeq2 and de novo assembly. A blocked readiness result is a real gate; it is never promoted to execution success by this package.

The bulk adapter's standard DESeq2 path requires a scientific plan frozen in the authorized analysis plan. It binds raw count-file hashes, explicit sample-to-matrix columns, biological units, categorical additive design, contrast, filtering, alpha and a separate log2 fold-change threshold. Technical lanes must be aggregated before this method; repeated/paired units and unsupported formulas require another explicit method. The fixed-dispersion diagnostic path remains exploratory and cannot substitute for a replicated standard analysis.

Hosts provide `AnalysisArtifactReader` for full, checksummed UTF-8 files. `validateArtifacts` checks the complete fixed `feature_id/baseMean/log2FoldChange/lfcSE/stat/pvalue/padj` result schema, numeric ranges, unique feature identifiers and versioned NA semantics. Reviewer text remains bounded and carries `textCoverage`; complete validation is a separate receipt. Standard delivery also compares an observed execution receipt with the frozen design and recomputes row, NA and thresholded result counts. Missing or mismatched evidence prevents delivery even if a model approves.

The method's numerical comparator is frozen with the scientific plan before execution. It compares feature keys, NA positions, declared numerical tolerances, significance membership and direction. Numerical equivalence remains separate from byte equality, environment equality and scientific review. Counts-only `drone/deseq2-counts@1.0.0` may explicitly state that reference/annotation use is not applicable; this limits interpretation to the supplied feature identifiers and does not establish upstream alignment or annotation correctness.

Assembly BUSCO evidence records tool/lineage versions, exact complete/single/duplicated/fragmented/missing counts and their one-decimal percentages. Complete includes duplicated: `C=S+D`, while `C+F+M=total`. Missing identity, inconsistent counts or percentages fail the QC gate.

The published extension is a self-contained `dist/index.mjs` bundle. The package also ships `dist/host.mjs`, a versioned `AnalysisHostPort` registry/loader for Desktop composition roots. It uses the host-neutral `@gyoungwe/plugin-api` seam at type level and carries the analysis contract implementation in both bundles; the Pi coding-agent API remains a peer dependency supplied by the host.

```sh
npm install @gyoungwe/pi-analysis @earendil-works/pi-coding-agent
```

Pi discovers the extension through the package metadata:

```json
{"pi":{"extensions":["./dist/index.mjs"]}}
```
