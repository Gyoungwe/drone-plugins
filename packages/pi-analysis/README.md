# @gyoungwe/pi-analysis

Portable, evidence-gated analysis adapter discovery and scientific readiness checks for native Pi.

The package exposes `analysis_list_adapters`, `analysis_assess_readiness` and `analysis_prepare_evidence`. They resolve a versioned adapter, evaluate an immutable plan and prepare a host-owned evidence handoff. Remote execution, authorization, persistence, artifact collection, review and delivery remain host responsibilities.

The first adapters cover bulk RNA-seq/DESeq2 and de novo assembly. A blocked readiness result is a real gate; it is never promoted to execution success by this package.

The published extension is a self-contained `dist/index.mjs` bundle. The package also ships `dist/host.mjs`, a versioned `AnalysisHostPort` registry/loader for Desktop composition roots. It uses the host-neutral `@gyoungwe/plugin-api` seam at type level and carries the analysis contract implementation in both bundles; the Pi coding-agent API remains a peer dependency supplied by the host.

```sh
npm install @gyoungwe/pi-analysis @earendil-works/pi-coding-agent
```

Pi discovers the extension through the package metadata:

```json
{"pi":{"extensions":["./dist/index.mjs"]}}
```
