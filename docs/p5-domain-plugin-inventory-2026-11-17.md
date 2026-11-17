# P5 domain plugin source inventory — 2026-11-17

Snapshot: plugins commit `57428876bad6db2bb3a65338d38e30054064cb83` (the ticket base). Offline source inspection of `packages/pi-evidence`, `packages/pi-discovery`, `packages/pi-inquiry` and `packages/pi-analysis`; no package installation, build, model call, GUI or execution acceptance was performed. Versions below identify this checkout, not a verified registry tarball or the artifact installed by Drone.

The host-side reference is Drone `docs/pluginization/inventory-analysis-services.md`, especially “Backend files and every exported symbol”, “Feature existence and P5/P6 resource edges”, proposed tickets 8–16 and “Open questions”. Host observations here are attributed to that reference; no other Drone source was inspected. This closes its missing **source inventory**, not its installed-owner parity or provenance gates.

“Registered” below means reachable from a declared source entrypoint, not observed in a live host. “Library-only” means exported code without a registered managed operation; it is not automatically dead code. “None found” is scoped to these four packages. Proposed changes are implementation-ticket inputs, not changes made by this inventory. Approval categories, ownership and adoption remain decisions (§5).

## 1. Package contracts and registration

All four manifests declare Plugin API 1, `drone-result/v3`, native Pi and Drone Desktop, and Pi minimum 1.1.0. Evidence/Analysis/Discovery list tested hosts `1.1.0`/`latest`; Inquiry lists only `1.1.0`. These are declarations, not runtime test results. Public cross-plugin types belong in plugin-api; direct plugin imports are forbidden (`docs/PLUGIN-SPEC.md:186`, `docs/PLUGIN-SPEC.md:192`).

### pi-evidence 0.1.1

`packages/pi-evidence/package.json` exports `.` (`dist/index.mjs`, types `src/index.ts`) and `/host` (`dist/host.mjs`, types `src/host.ts`); dependency `@gyoungwe/plugin-api ^1.1.0`, Pi peer `>=1.1.0 <2.0.0`. Manifest extension/host entries, capabilities `evidence`, `provenance`, `replay`, `files`, and empty filesystem/network/subprocess permissions with `externalWrites:false` are at `packages/pi-evidence/plugin.manifest.json:14`. No desktopRuntime, provider operations or UI contributions are declared.

All four manifest tools are registered by `registerPiEvidence` (`packages/pi-evidence/src/index.ts:25`): `evidence_validate_analysis_plan`, `evidence_validate_manifest`, `evidence_validate_capsule`, `evidence_verify_replay`. They return text plus JSON and do no file IO, execution or persistence. The README's “three” tools omits the analysis-plan tool; the source/manifest/registration test agree on four (`packages/pi-evidence/test/registration.test.mjs:15`). `/host` exposes `createEvidenceHost`/`evidenceHostLoader`, contractVersion 1, with only `evidence_validate_manifest` and `evidence_verify_replay` (`packages/pi-evidence/src/host.ts:12`); it does not expose the plan/capsule tools or a durable owner.

Root exports all seven policy modules (`packages/pi-evidence/src/index.ts:1`): artifact/manifest/access/verification types and validators, digest helpers, `EvidenceProvenance` and identity/digest helpers, `AnalysisEvidencePlan`/validator, `EvidenceAnalysisSnapshot`, `FrozenEvidenceFile`/`FrozenFile`, `EvidenceLineage`, `EvidenceCheckpoint`, `EvidenceBranch` plus creation/validation/projection helpers, `EvidenceAudience`, `EvidenceCapsulePublication`, `EvidenceCapsule` plus create/serialize/parse/import/digest/bytes helpers, `ReplayOutput`, `ReplayOutputCheck`, `ReplayVerification`, `EvidenceReplayReceipt` plus verification/receipt helpers and `replayProof`. These are public library contracts; checkpoint/branch creation, capsule export and replay receipt construction are not registered actions. No disconnected/dead source module was found; absence of a service registration is the important gap.

### pi-analysis 0.2.0

`packages/pi-analysis/package.json` exports `.` and `/host` with `dist` declarations; dependency `@gyoungwe/plugin-api ^1.2.0`, Pi peer `>=1.1.0 <2.0.0`. Manifest extension/host entries, capabilities `analysis`, `planning`, `evidence-context`, `files`, filesystem `workspace-read`, empty network/subprocess and `externalWrites:false` are at `packages/pi-analysis/plugin.manifest.json:14`. No desktopRuntime, provider operations or UI contributions are declared.

Registered tools: `analysis_list_adapters`, `analysis_assess_readiness`, `analysis_prepare_evidence` (`packages/pi-analysis/src/index.ts:47`). The last produces only a versioned plan (`packages/pi-analysis/src/index.ts:121` → `packages/pi-analysis/src/evidence-plan.ts:25`), explicitly `execution:"host-required"` and `evidence:"host-supplied"`. `/host` exposes `createAnalysisHost`/`analysisHostLoader`, contractVersion 1, whose only service is the adapter registry (`packages/pi-analysis/src/host.ts:11`); no preparation/validation composition or durable analysis/evidence owner exists.

Root exports analysis contract/context/readiness/gates, adapter contracts/plans, `AssemblyAdapter`, `BulkRnaseqAdapter`, evidence plan and registry (`packages/pi-analysis/src/index.ts:7`). `/host` additionally exports full-file artifact reader/validation and numerical comparator types, `BulkRnaseqNumericalComparator`, DESeq2 result/numerical policies, scientific-plan normalization/hash helpers and registry validation (`packages/pi-analysis/src/host.ts:23`). Full-file validation/comparison are reachable adapter/library methods, not native tools or automatically active host review behavior. No dead source module was found. The reference's backend 0.1.2 versus vendored 0.2.0 target/provenance discrepancy remains unresolved.

### pi-inquiry 0.1.0 (private, unpublished candidate)

The manifest provides `inquiry.runtime@1` operations `inquiry.read` and `inquiry.write`, tools `inquiry_read`/`inquiry_write`, Desktop `dist/runtime.mjs`, native `dist/index.mjs` and `ui/plugin.json` entries (`packages/pi-inquiry/plugin.manifest.json:8`). Capabilities: research/provenance/UI; permissions: application-state, application-state-write, binary-state-read, binary-state-write; no network/subprocess/externalWrites. `droneUi:2` contributes `inquiry`, `panel.tab`, `InquiryPanel` (`packages/pi-inquiry/ui/plugin.json:5`). Package dependencies include plugin-api `^1.3.0`, sql.js `1.15.2`, typebox `1.3.27`, with Pi peer `>=1.1.0 <2.0.0`; private/unpublished status is explicit (`packages/pi-inquiry/package.json:4`, `packages/pi-inquiry/package.json:64`). Its `check:domain` is not the standard complete `check`/smoke gate (`packages/pi-inquiry/package.json:45`).

Public package subpaths: models, storage, sqlite-storage (both storage paths resolve to `src/storage.ts`), lineage, provenance, reproducibility, workspace, wasm-storage, host, domain, ledger-owner, runtime, native (`packages/pi-inquiry/package.json:8`). `/host` exports event projector/contracts, models, lineage/provenance/reproducibility, `InquiryService`, Node storage and workspace contracts (`packages/pi-inquiry/src/index.ts:1`); `/domain` substitutes abstract storage contracts (`packages/pi-inquiry/src/domain.ts:1`). Important contracts include `InquiryComputeEvent`, `InquiryTaskTerminalEvent`, `InquiryLocalExecutionEvent`, `InquiryEventSource`, `InquiryDecisionEvent` (`packages/pi-inquiry/src/event-projection.ts:38`); `ArtifactLedger`, `FindingLedger`, `QuestionLedger`, `AttemptLedger`, `DecisionLedger`, `ArtifactRerunLedger`, `InquiryStorage`/registry/entry (`packages/pi-inquiry/src/storage-contract.ts:17`); `ArtifactRecord`, `FindingRecord`, `QuestionRecord`, `AttemptRecord`, `DecisionRecord`, `InquirySnapshot`, `ArtifactProvenance`, `ArtifactRerunStatus`/`ArtifactRerunRecord`/`ArtifactRerunResult` (`packages/pi-inquiry/src/models.ts:29`, `packages/pi-inquiry/src/models.ts:202`).

Registered read actions: status, inspect, snapshot, listDecisions, cleanupDryRun, pendingReruns, artifactProvenance (`packages/pi-inquiry/src/runtime.ts:44`). Write actions: bind, recordArtifact, recordFinding, recordQuestion, recordAttempt, recordDecision, recordComputeEvent, recordTaskTerminal, recordLocalExecution, revokeDecision, confirmDecision, reviewDecisionArtifacts, associateDecisionArtifacts, markRerunRunning, completeRerun, reconcile, restoreOriginal (`packages/pi-inquiry/src/runtime.ts:66`). Native tools and provider operations are wired at `packages/pi-inquiry/src/runtime.ts:435` and `packages/pi-inquiry/src/runtime.ts:482`. Explicit JSON event projection runs under `owner.write`, but returns authority `plugin-asserted-or-imported` (`packages/pi-inquiry/src/runtime.ts:368`, `packages/pi-inquiry/src/runtime.ts:432`). Trusted automatic producer hookup: **none found**; native subscription is only session shutdown (`packages/pi-inquiry/src/native-runtime.ts:350`).

`rerunArtifact`/`setRerunHandler` and workspace promotion are public tested library behavior, not runtime submission actions (`packages/pi-inquiry/src/service.ts:46`, `packages/pi-inquiry/src/service.ts:267`, `packages/pi-inquiry/src/workspace.ts:130`). Runtime status expressly lists rerun-executor and workspace-promotion-file-port as unavailable (`packages/pi-inquiry/src/runtime.ts:271`). Managed/native uses WASM storage through the ledger owner; Node/file/memory adapters remain public/tested libraries. No definitely dead source file was found. The UI lists artifacts/provenance and subscribes to runtime changes; it has no rerun control or artifact-card contribution.

### pi-discovery 0.2.0 (unpublished candidate)

The README identifies an unpublished candidate needing unpublished API 1.3; plugin-api is a `^1.3.0` peer (`packages/pi-discovery/README.md:3`). Package exports `.`, `/host`, `/native` (`packages/pi-discovery/package.json:20`). Manifest entries: extension `dist/index.mjs`, host `dist/host.mjs`, desktopRuntime `dist/runtime.mjs`, UI `ui/plugin.json`; capability `discovery`; filesystem workspace/application-state/application-state-write, subprocess container, no network/externalWrites (`packages/pi-discovery/plugin.manifest.json:20`). It requires alias `inquiry` → `inquiry.runtime@1` but declares **no provides service** (`packages/pi-discovery/plugin.manifest.json:13`). `discovery-workspace` is `droneUi:2`, contribution `discovery`, `panel.tab`, export `DiscoveryPanel` (`packages/pi-discovery/ui/plugin.json:7`).

Fourteen manifest/native tools: `discovery_status`, `discovery_list_records`, `discovery_search_records`, `discovery_bind_workspace`, `discovery_create_plan`, `discovery_execution_environment`, `discovery_execution_receipt`, `discovery_cancel_execution`, `discovery_list_kernels`, `discovery_create_kernel`, `discovery_execute_kernel`, `discovery_close_kernel`, `discovery_reconcile_executions`, `discovery_record_inquiry` (`packages/pi-discovery/src/runtime.ts:901`). Runtime read operations: overview, listRecords, listKernelSessions, executionDescription, executionReceipt. Writes: recordInquiry, bindCurrentWorkspace, createKernelSession, executeKernel, closeKernelSession, reconcileExecutions, cancelExecution, createExplorationPlan (`packages/pi-discovery/src/runtime.ts:781`).

`/host` exports `discoveryHostLoader` and the `ports.ts` contract family: `DiscoveryHostInput`, services/port/loader, journals, authorization, execution runner/request/result/receipt, critic provider and asserted Inquiry records (`packages/pi-discovery/src/host.ts:5`, `packages/pi-discovery/src/host.ts:67`). Its contractVersion 1 remains in-process and function-valued. `/native` exports `nativeDiscoveryExtension` and `NativeDiscoveryOptions` (`packages/pi-discovery/src/native-runtime.ts:34`). Internal domain barrels are not declared package subpaths.

The legacy host actively exposes export, critic, multipath and evaluation (`packages/pi-discovery/src/host.ts:37`, `packages/pi-discovery/src/host.ts:47`, `packages/pi-discovery/src/host.ts:55`); these are not dead code. The managed runtime registers none of those four operations, supplies no critic provider and its export writer throws (`packages/pi-discovery/src/runtime.ts:344`, `packages/pi-discovery/src/runtime.ts:445`). Existing kernel execution receipts do not establish multipath/evaluation parity. Stale unregistered readers `nativeDiscoveryStatus`/`nativeDiscoveryRecords` have no source/test callers (`packages/pi-discovery/src/native-records.ts:46`, `packages/pi-discovery/src/native-records.ts:67`); runtime imports only journal names from that module (`packages/pi-discovery/src/runtime.ts:15`). Other unused internal exports include `findingRobustness`, `assertFindingLabel`, `criticQuestionsForFinding` (`packages/pi-discovery/src/domain/critic.ts:276`); `createExplorationMilestone`, `generateCompetitiveExplanations`, `rankDiscriminatingTests`, `criticClueId` (`packages/pi-discovery/src/domain/exploration.ts:58`); kernel `prepareKernel`/`SubprocessFixtureRunner` (`packages/pi-discovery/src/domain/kernel.ts:458`); basic evaluation metric helpers plus `evaluationBaselines`, `metricDescription`, `MemoryBaselineStore` (`packages/pi-discovery/src/domain/evaluation.ts:36`). Active `rankExplorationCandidates` and `createBaseline` are separate functions. These unused exports are not runtime capabilities; no deletion is proposed.

## 2. Complete source and test inventory

Counts are physical lines at the snapshot; each path is repository-relative. UI is listed separately because it is outside `src`. Test files were inspected, not executed.

### pi-evidence

| Source path | Lines | Responsibility |
| --- | ---: | --- |
| `packages/pi-evidence/src/analysis-plan.ts` | 99 | Validate the portable analysis evidence handoff. |
| `packages/pi-evidence/src/artifacts.ts` | 240 | Validate content-addressed artifact manifests and portable labels. |
| `packages/pi-evidence/src/capsule.ts` | 147 | Encode and validate audience-filtered evidence capsules. |
| `packages/pi-evidence/src/checkpoints.ts` | 248 | Define checkpoint identity and branch metadata. |
| `packages/pi-evidence/src/digest.ts` | 33 | Produce canonical JSON and SHA-256 digests. |
| `packages/pi-evidence/src/host.ts` | 42 | Expose the read-only host validation loader. |
| `packages/pi-evidence/src/index.ts` | 103 | Register four native tools and export policy contracts. |
| `packages/pi-evidence/src/provenance.ts` | 94 | Validate portable provenance and its digests. |
| `packages/pi-evidence/src/replay.ts` | 120 | Compare observed output metadata against frozen evidence. |

| Test path | Lines | Existing coverage |
| --- | ---: | --- |
| `packages/pi-evidence/test/registration.test.mjs` | 65 | Manifest/native tool equality, read-only metadata, analysis plan validation and bundle boundary scan. |
| `packages/pi-evidence/test/contracts.test.mjs` | 115 | Deterministic digests, public capsule roundtrip, private-path rejection, branch identity, matching replay, provenance digest. |
| `packages/pi-evidence/test/host.test.mjs` | 24 | Host loader contract and manifest validation; replay host tool is declared but not invoked. |

### pi-analysis

| Source path | Lines | Responsibility |
| --- | ---: | --- |
| `packages/pi-analysis/src/analysis-contract.ts` | 351 | Define portable analysis, adapter, artifact and comparison contracts. |
| `packages/pi-analysis/src/assembly.ts` | 197 | Implement assembly readiness and BUSCO review policy. |
| `packages/pi-analysis/src/bulk-comparator.ts` | 106 | Compare complete DESeq2 tables using frozen numerical policy. |
| `packages/pi-analysis/src/bulk-numerical-policy.ts` | 39 | Declare the versioned DESeq2 comparison policy. |
| `packages/pi-analysis/src/bulk-results.ts` | 299 | Validate complete DESeq2 result tables and observed receipts. |
| `packages/pi-analysis/src/bulk-rnaseq.ts` | 230 | Implement bulk RNA-seq adapter planning and review. |
| `packages/pi-analysis/src/bulk-scientific-plan.ts` | 340 | Normalize and freeze the explicit bulk scientific design. |
| `packages/pi-analysis/src/canonical.ts` | 14 | Hash canonical scientific-plan content. |
| `packages/pi-analysis/src/evidence-plan.ts` | 48 | Project an adapter plan into a host-owned evidence handoff. |
| `packages/pi-analysis/src/host.ts` | 65 | Expose the versioned host adapter registry loader. |
| `packages/pi-analysis/src/index.ts` | 170 | Register three native analysis tools. |
| `packages/pi-analysis/src/registry.ts` | 122 | Resolve exact adapter versions and validate contracts. |

| Test/support path | Lines | Existing coverage |
| --- | ---: | --- |
| `packages/pi-analysis/test/registration.test.mjs` | 250 | Native registration, readiness, evidence plan, host registry, assembly review and full-file validation. |
| `packages/pi-analysis/test/bulk-scientific-plan.test.mjs` | 220 | Scientific design freezing, confounding, observed receipt/count gates and NA semantics. |
| `packages/pi-analysis/test/bulk-comparator.test.mjs` | 120 | Numerical equivalence, drift, threshold crossing and frozen comparator policy. |
| `packages/pi-analysis/test/bulk-fixtures.mjs` | 71 | Shared frozen-plan and artifact-reader fixtures; not a test suite. |

### pi-inquiry

| Source path | Lines | Responsibility |
| --- | ---: | --- |
| `packages/pi-inquiry/src/domain.ts` | 8 | Export managed domain APIs using abstract storage ports. |
| `packages/pi-inquiry/src/event-projection.ts` | 421 | Project execution/task/decision events into ledger records. |
| `packages/pi-inquiry/src/event-schema.ts` | 124 | Validate asserted JSON event requests. |
| `packages/pi-inquiry/src/index.ts` | 8 | Export host domain APIs including Node storage adapters. |
| `packages/pi-inquiry/src/ledger-owner.ts` | 347 | Coordinate original SQLite bytes through leases, CAS and recovery. |
| `packages/pi-inquiry/src/lineage.ts` | 173 | Validate lineage and derive non-destructive cleanup candidates. |
| `packages/pi-inquiry/src/models.ts` | 242 | Define Inquiry records, provenance and rerun states. |
| `packages/pi-inquiry/src/native-entry.ts` | 7 | Supply the official native Pi extension entry. |
| `packages/pi-inquiry/src/native-runtime.ts` | 364 | Adapt native SDK authorization and storage capabilities. |
| `packages/pi-inquiry/src/provenance.ts` | 73 | Project bounded artifact lineage and reproducibility. |
| `packages/pi-inquiry/src/reproducibility.ts` | 14 | Classify reproducibility from recorded run metadata. |
| `packages/pi-inquiry/src/runtime.ts` | 515 | Register scoped runtime operations over shared ledger ownership. |
| `packages/pi-inquiry/src/service.ts` | 426 | Implement ledger decisions and rerun lifecycle policy. |
| `packages/pi-inquiry/src/sqlite-connection.ts` | 13 | Define the SQL engine connection interface. |
| `packages/pi-inquiry/src/sqlite-storage.ts` | 316 | Implement canonical SQLite schema and transactions. |
| `packages/pi-inquiry/src/storage-contract.ts` | 87 | Define ledger storage and registration ports. |
| `packages/pi-inquiry/src/storage.ts` | 403 | Provide Node SQLite, file JSON and memory adapters. |
| `packages/pi-inquiry/src/wasm-storage.ts` | 110 | Adapt sql.js to canonical SQLite byte storage. |
| `packages/pi-inquiry/src/workspace.ts` | 170 | Plan workspace promotion through an injected file port. |
| `packages/pi-inquiry/ui/index.tsx` | 434 | Render ledger binding, recovery, questions, artifacts and decisions. |

| Test path | Lines | Existing coverage |
| --- | ---: | --- |
| `packages/pi-inquiry/test/event-projection.test.ts` | 121 | Memory/SQLite compute parity, task/local projection, decision association and project rejection. |
| `packages/pi-inquiry/test/inquiry.test.ts` | 564 | Lineage/provenance, rerun outcomes, asynchronous pending state, JSON restart, SQLite migration, decisions and promotion. |
| `packages/pi-inquiry/test/ledger-owner.test.ts` | 527 | Original bytes, backups, CAS/recovery, denied writes, cancellation, sidecars, provider binding and workspace isolation. |
| `packages/pi-inquiry/test/wasm-storage.test.ts` | 273 | Node/WASM six-ledger parity, same-hash rerun, rollback, SQLite reopen/migration and bounded multi-megabyte fixture. |

### pi-discovery

| Source path | Lines | Responsibility |
| --- | ---: | --- |
| `packages/pi-discovery/src/index.ts` | 9 | Supply the standard native Pi extension entry. |
| `packages/pi-discovery/src/host.ts` | 73 | Adapt service methods to the legacy host loader. |
| `packages/pi-discovery/src/ports.ts` | 272 | Define injected persistence, execution, authorization and Inquiry contracts. |
| `packages/pi-discovery/src/projections.ts` | 45 | Define displayable domain projections. |
| `packages/pi-discovery/src/inquiry-provider.ts` | 33 | Adapt the optional versioned Inquiry provider. |
| `packages/pi-discovery/src/native-records.ts` | 81 | Define journal names and older unregistered bounded readers. |
| `packages/pi-discovery/src/native-runtime.ts` | 436 | Adapt native authorization, atomic JSON, writer leases and execution. |
| `packages/pi-discovery/src/runtime.ts` | 1108 | Own canonical workspaces and register managed/native operations. |
| `packages/pi-discovery/src/service.ts` | 669 | Orchestrate Discovery behavior over injected host services. |
| `packages/pi-discovery/src/domain/critic.ts` | 300 | Implement independent critic policy and multipath assessment. |
| `packages/pi-discovery/src/domain/deadline.ts` | 14 | Supply a releasable operation deadline. |
| `packages/pi-discovery/src/domain/evaluation.ts` | 426 | Evaluate metrics and compare versioned baselines. |
| `packages/pi-discovery/src/domain/exploration.ts` | 317 | Plan bounded exploration and asserted Inquiry projections. |
| `packages/pi-discovery/src/domain/index.ts` | 6 | Export internal domain modules. |
| `packages/pi-discovery/src/domain/inquiry-port.ts` | 20 | Define narrow structural Inquiry ports. |
| `packages/pi-discovery/src/domain/kernel.ts` | 573 | Implement controlled kernels and export content generation. |
| `packages/pi-discovery/src/domain/validation.ts` | 52 | Validate domain inputs. |
| `packages/pi-discovery/ui/index.tsx` | 263 | Render root binding, journals, exploration plans and kernel mount. |
| `packages/pi-discovery/ui/KernelPanel.tsx` | 357 | Render logical kernel creation, execution and cleanup controls. |

| Test/support path | Lines | Existing coverage |
| --- | ---: | --- |
| `packages/pi-discovery/test/host.test.mjs` | 204 | Journals/isolation, authorization, independent critic, five-path attempts, baseline/needs-data/blocked evaluation. |
| `packages/pi-discovery/test/lifecycle.test.mjs` | 240 | Runner close/cancel, retained cleanup failure, timeout, disposal drain and failed creation cleanup. |
| `packages/pi-discovery/test/native.test.mjs` | 288 | Exact tools, unconfigured state, journal bounds/symlinks, exclusive writer/readback and legacy/corrupt journals. |
| `packages/pi-discovery/test/memory-services.mjs` | 28 | In-memory host-services fixture; not a test suite. |

## 3. Exact local surfaces for Drone proposed tickets 8–16

These are existing plugin paths to revise or extend, conditional adapter changes are labeled. New owner/provider/UI/test modules have **none found** where stated; their filenames and operation names must be named by the implementation design rather than represented as existing files. Each package behavior change also updates its existing `README.md`. When adding an entrypoint/export, the corresponding existing `package.json` and `scripts/build.mjs` must be included; Evidence/Analysis also have `scripts/smoke.mjs`. Generated artifacts belong in a separate change under repository rules. Shared-contract changes in Drone/plugin-api remain as listed by the host reference, outside this inventory's write scope.

### 8. Portable evidence contract/policy

**Existing paths:** `packages/pi-evidence/src/artifacts.ts`, `packages/pi-evidence/src/checkpoints.ts`, `packages/pi-evidence/src/capsule.ts`, `packages/pi-evidence/src/provenance.ts`, `packages/pi-evidence/src/replay.ts`, `packages/pi-evidence/src/digest.ts`, `packages/pi-evidence/src/analysis-plan.ts`, `packages/pi-evidence/src/index.ts`, `packages/pi-evidence/src/host.ts`, `packages/pi-evidence/plugin.manifest.json`, `packages/pi-evidence/test/contracts.test.mjs`, `packages/pi-evidence/test/host.test.mjs`, `packages/pi-evidence/test/registration.test.mjs`.

**Counterparts:** checkpoint identity excludes lineage (`packages/pi-evidence/src/checkpoints.ts:81`, `packages/pi-evidence/src/checkpoints.ts:111`); snapshot strips host workspace (`packages/pi-evidence/src/checkpoints.ts:222`); branch metadata/validation (`packages/pi-evidence/src/checkpoints.ts:178`); 64 MiB cap (`packages/pi-evidence/src/artifacts.ts:3`); capsule audience omission/old version-1 format (`packages/pi-evidence/src/capsule.ts:74`); import digest/omission validation (`packages/pi-evidence/src/capsule.ts:44`); exact output/environment matching (`packages/pi-evidence/src/replay.ts:44`). **None found:** portable durable-owner operation contract/registration, host legacy ledger adoption, freezeRecorded/overview/capability-evidence projection, or an execution authorization protocol. Pure branch creation is not workspace materialization.

**Missing tests:** exact host version-1 checkpoint/capsule fixtures and IDs; lineage-invariant IDs; mixed public/restricted/private blobs and complete metadata disclosure; omitted/shared-hash blobs, cap boundaries, import corruption, replay mismatch/unexpected output/environment, branch no-approval inheritance, legacy adoption and missing-capability degradation. Current contract tests cover basic roundtrip/matching replay, not that parity matrix. Waits on decisions 1–6; no structure blocker in this package.

### 9. Evidence owner and analysis preparation composition

**Existing paths:** Evidence `packages/pi-evidence/src/host.ts`, `packages/pi-evidence/src/index.ts`, `packages/pi-evidence/src/analysis-plan.ts`, `packages/pi-evidence/src/checkpoints.ts`, `packages/pi-evidence/src/capsule.ts`, `packages/pi-evidence/src/replay.ts`, `packages/pi-evidence/plugin.manifest.json`, `packages/pi-evidence/test/host.test.mjs`, `packages/pi-evidence/test/contracts.test.mjs`; Analysis `packages/pi-analysis/src/evidence-plan.ts`, `packages/pi-analysis/src/index.ts`, `packages/pi-analysis/src/host.ts`, `packages/pi-analysis/plugin.manifest.json`, `packages/pi-analysis/test/registration.test.mjs`. New managed owner/provider/composition-test files: **none found**.

**Counterparts:** analysis preparation plan (`packages/pi-analysis/src/evidence-plan.ts:25`), native preparation fixture (`packages/pi-analysis/test/registration.test.mjs:57`), evidence handoff validator (`packages/pi-evidence/src/analysis-plan.ts:51`), host manifest/replay tools (`packages/pi-evidence/src/host.ts:12`). **None found:** declared analysis→evidence service composition, durable preparation receipt, metadata/causality owner, approved bytes/JsonStore integration, freeze/import/export/fork/replay orchestration or installed owner lifecycle. The host evidence adapter's two tools are not a complete capsule service.

**Missing tests:** real preparation→canonical validation via shared service; absent/disabled/incompatible/ambiguous provider; denied writes, readback and cancellation; legacy ledger/root handoff; installed freeze/import/export/fork/replay; owner disable/re-enable and deterministic durable receipts/causality. Native plan tests do not demonstrate composition. Waits on 8 and decisions 1–6; no current Evidence/Analysis size blocker.

### 10. Evidence UI contribution

**Existing paths:** `packages/pi-evidence/plugin.manifest.json`, `packages/pi-evidence/src/host.ts`, `packages/pi-evidence/src/index.ts`, `packages/pi-evidence/package.json`, `packages/pi-evidence/scripts/build.mjs`, `packages/pi-evidence/test/registration.test.mjs`. **None found:** any Evidence UI directory/manifest/runtime/UI test or overview/capability-card contract. Thus no exact existing Evidence component can be named as the mount replacement.

**Counterpart:** portable checkpoint/capsule/replay models only (ticket 8); the package entrypoint declaration has no UI or desktopRuntime (`packages/pi-evidence/plugin.manifest.json:14`). **Missing tests:** installed overview plus freeze/fork/export/import/replay actions; both languages; empty/unavailable/disabled state; cancellation, unmount, disable/re-enable and fallback. Choose the generic contribution surface under decision 11; if it cannot express both host mounts, first use the reference's separate generic UI-contract ticket. Waits on 9 and decisions 1–6/11; no present source size blocker.

### 11. Discovery critic parity

**Existing paths:** `packages/pi-discovery/src/domain/critic.ts`, `packages/pi-discovery/src/service.ts`, `packages/pi-discovery/src/ports.ts`, `packages/pi-discovery/src/host.ts`, `packages/pi-discovery/src/runtime.ts`, `packages/pi-discovery/plugin.manifest.json`, `packages/pi-discovery/test/host.test.mjs`, `packages/pi-discovery/test/native.test.mjs`; `packages/pi-discovery/src/native-runtime.ts` if the chosen critic transport needs adapter changes. Dedicated managed critic/provider tests: **none found**.

**Counterparts:** independent provider rejection and read-only critic role (`packages/pi-discovery/src/domain/critic.ts:19`, `packages/pi-discovery/src/domain/critic.ts:59`); persisted reviews and injected Inquiry questions (`packages/pi-discovery/src/service.ts:527`); callable legacy host method (`packages/pi-discovery/src/host.ts:47`). **None found:** managed critic operation, declared Discovery provider, actual independent model transport or enforcement of read-only effects through that transport. Role flags in a fixture are not that enforcement.

**Missing tests:** installed critic dispatch; same-provider rejection before invocation; denied model spend/no writes; timeout/blocked result; actual read-only enforcement; journal/Inquiry readback under one owner; absent/disabled provider. Waits on 10 and decisions 1/2/5/7; split the Discovery files listed in §4 first. No new product UI is implied.

### 12. Multipath/evaluation shared execution requests

**Existing paths:** `packages/pi-discovery/src/domain/critic.ts`, `packages/pi-discovery/src/domain/evaluation.ts`, `packages/pi-discovery/src/service.ts`, `packages/pi-discovery/src/ports.ts`, `packages/pi-discovery/src/host.ts`, `packages/pi-discovery/src/runtime.ts`, `packages/pi-discovery/plugin.manifest.json`, `packages/pi-discovery/test/host.test.mjs`, `packages/pi-discovery/test/lifecycle.test.mjs`, `packages/pi-discovery/test/native.test.mjs`; `packages/pi-discovery/src/domain/exploration.ts` if exploration budget policy changes, `packages/pi-discovery/src/native-runtime.ts` if request routing needs it.

**Counterparts:** 5–10 paths/confirmatory prior and robust/sensitive/unstable/unknown grading around an executor callback (`packages/pi-discovery/src/domain/critic.ts:173`, `packages/pi-discovery/src/domain/critic.ts:193`); legacy authorization (`packages/pi-discovery/src/service.ts:552`); evaluation callback/baseline revision and needs-data/blocked behavior (`packages/pi-discovery/src/domain/evaluation.ts:329`, `packages/pi-discovery/src/service.ts:585`). Kernel request/receipt plumbing exists (`packages/pi-discovery/src/runtime.ts:396`) but is not this integration. **None found:** JSON multipath/evaluation request/receipt routes, managed/native actions, callback cancellation with proven worker cleanup, or external benchmark acceptance.

**Missing tests:** caller/source/image/budget binding, per-path/case receipts, denial without execution, cancel/cleanup/disable/restart, all grade thresholds and confirmatory rules, baseline revisions, fixture versus external benchmark distinction. Existing five-path/evaluation fixtures do not prove these (`packages/pi-discovery/test/host.test.mjs:109`, `packages/pi-discovery/test/host.test.mjs:161`). Waits on 11 and decisions 1/2/5/8; structure splits in §4 precede behavior.

### 13. Discovery export shared file port

**Existing paths:** `packages/pi-discovery/src/domain/kernel.ts`, `packages/pi-discovery/src/service.ts`, `packages/pi-discovery/src/ports.ts`, `packages/pi-discovery/src/host.ts`, `packages/pi-discovery/src/runtime.ts`, `packages/pi-discovery/src/native-runtime.ts`, `packages/pi-discovery/plugin.manifest.json`, `packages/pi-discovery/test/host.test.mjs`, `packages/pi-discovery/test/lifecycle.test.mjs`, `packages/pi-discovery/test/native.test.mjs`. No export UI/IPC is implied.

**Counterparts:** script/notebook content and `runs/.../exports/<session>` construction (`packages/pi-discovery/src/domain/kernel.ts:407`, notebook serializer `packages/pi-discovery/src/domain/kernel.ts:218`); runs-only session directory check (`packages/pi-discovery/src/service.ts:138`); export authorization before injected writer (`packages/pi-discovery/src/service.ts:457`); legacy host export method (`packages/pi-discovery/src/host.ts:37`). **None found:** managed export action, usable managed writer (explicit throw at `packages/pi-discovery/src/runtime.ts:445`), approved shared file adapter with write readback/symlink enforcement, or local plugin export tests. Host-owned path and symlink protection cannot be inferred from the `RunFileWriter` interface.

**Missing tests:** exact Python/R/notebook content, denial, partial write/readback failure, runs-only/symlink escape, real authorized container export followed by cancel/close, disabled/restarted owner. Existing runner cleanup tests do not cover export. Waits on 12 and decisions 1/2/5/9; structure splits in §4 precede behavior.

### 14. Inquiry automatic event projector

**Existing paths:** `packages/pi-inquiry/src/event-projection.ts`, `packages/pi-inquiry/src/event-schema.ts`, `packages/pi-inquiry/src/runtime.ts`, `packages/pi-inquiry/src/domain.ts`, `packages/pi-inquiry/src/index.ts`, `packages/pi-inquiry/plugin.manifest.json`, `packages/pi-inquiry/test/event-projection.test.ts`, `packages/pi-inquiry/test/ledger-owner.test.ts`. Preserve/integration-test `packages/pi-inquiry/src/ledger-owner.ts`; change that boundary only if transport composition requires it.

**Counterparts:** compute submission/terminal/collection projection (`packages/pi-inquiry/src/event-projection.ts:149`), task terminal (`packages/pi-inquiry/src/event-projection.ts:212`), local execution (`packages/pi-inquiry/src/event-projection.ts:257`), decision association (`packages/pi-inquiry/src/event-projection.ts:295`); runtime explicit projection inside a single staged owner write (`packages/pi-inquiry/src/runtime.ts:368`); original bytes/backup/reservation/CAS/readback (`packages/pi-inquiry/src/ledger-owner.ts:127`, `packages/pi-inquiry/src/ledger-owner.ts:197`). **None found:** private-origin automatic producer/provider hookup, selected real task-terminal producer, automatic subscription/drain lifecycle. Public JSON projection is explicitly asserted/imported, not trusted host provenance.

**Missing tests:** trusted origin versus forged JSON; actual compute/local/decision/task dispatch through installed source; dedupe/order/cross-session scope; automatic-event disable/re-enable/in-flight cleanup and old writer lease handoff. Projector fixtures prove algorithms only. Waits on 13 and decisions 1/2/5/10; structure splits in §4 precede behavior.

### 15. Inquiry rerun owner

**Existing paths:** `packages/pi-inquiry/src/service.ts`, `packages/pi-inquiry/src/models.ts`, `packages/pi-inquiry/src/runtime.ts`, `packages/pi-inquiry/src/provenance.ts`, `packages/pi-inquiry/src/reproducibility.ts`, `packages/pi-inquiry/plugin.manifest.json`, `packages/pi-inquiry/test/inquiry.test.ts`, `packages/pi-inquiry/test/wasm-storage.test.ts`, `packages/pi-inquiry/test/ledger-owner.test.ts`. Retain `packages/pi-inquiry/src/ledger-owner.ts`, `packages/pi-inquiry/src/sqlite-storage.ts`, `packages/pi-inquiry/src/storage-contract.ts` as persistence boundaries; a worker-safe submission contract/module has **none found**.

**Counterparts:** reproducibility gate, pending deduplication, callback submission and durable submitted record (`packages/pi-inquiry/src/service.ts:267`); pending/running/reproduced/superseded/failed decisions and byte-hash comparison (`packages/pi-inquiry/src/service.ts:313`, `packages/pi-inquiry/src/service.ts:327`, `packages/pi-inquiry/src/service.ts:347`); rerun record/status (`packages/pi-inquiry/src/models.ts:214`), latest-rerun provenance (`packages/pi-inquiry/src/provenance.ts:55`). **None found:** registered rerun submission, installed handler, authorized host resubmit/status/collect receipt contract, restart polling/recovery orchestration, budget/cancel protocol. Runtime explicitly reports no executor (`packages/pi-inquiry/src/runtime.ts:271`). Existing completeRerun/markRerunRunning writes are not a submission flow.

**Missing tests:** actual approved provider rerun, SQLite CAS restart across submitted/running, submission-versus-persistence recovery, verified status/collect, cancel/disable/late completion/duplicate resume and every terminal distinction. Existing file-JSON restart (`packages/pi-inquiry/test/inquiry.test.ts:351`) and WASM same-hash tests do not prove this. Waits on 14 and decisions 1/2/5/12; structure splits in §4 precede behavior.

### 16. Inquiry artifact contribution

**Existing paths:** `packages/pi-inquiry/ui/index.tsx`, `packages/pi-inquiry/ui/plugin.json`, `packages/pi-inquiry/src/runtime.ts`, `packages/pi-inquiry/plugin.manifest.json`; `packages/pi-inquiry/src/provenance.ts`, `packages/pi-inquiry/src/service.ts`, `packages/pi-inquiry/src/models.ts` only if UI projection contracts need changes. Package UI test file: **none found**.

**Counterparts:** generic `panel.tab` contribution (`packages/pi-inquiry/ui/plugin.json:7`), runtime read/refresh/subscription/unmount abort (`packages/pi-inquiry/ui/index.tsx:111`, `packages/pi-inquiry/ui/index.tsx:123`), artifact list (`packages/pi-inquiry/ui/index.tsx:329`), provenance request (`packages/pi-inquiry/ui/index.tsx:175`), Chinese/English copy (`packages/pi-inquiry/ui/index.tsx:22`, `packages/pi-inquiry/ui/index.tsx:60`), active-session remount (`packages/pi-inquiry/ui/index.tsx:431`). **None found:** artifact-card contribution, rerun button/progress/cancel, migrated artifact-pane domain section/event subscription or rendered UI tests. Count-only rerun display and unavailable copy are not rerun interaction (`packages/pi-inquiry/ui/index.tsx:397`, `packages/pi-inquiry/ui/index.tsx:427`).

**Missing tests:** installed artifact/provenance/rerun interaction, languages, empty/absent/disabled provider, session switching, pending restart, unmount unsubscribe/cancel, disable/re-enable and stale-output rejection. Keep generic host deliveries intact. Waits on 15 and decisions 1/5/11/12; split UI/runtime before adding behavior.

## 4. Structure prerequisites in this repository

These existing files exceed 400 lines and are all recorded under `file-lines` in `scripts/fixtures/structure-baseline.json:9`. Split them before adding the mapped behavior; baseline status is not permission to grow them. Counts include tests and UI, not just `src`. Evidence and Analysis have no over-400 files in the inventoried source/tests and no baseline entries.

| Existing path | Lines | Ticket waiting on a split |
| --- | ---: | --- |
| `packages/pi-discovery/src/service.ts` | 669 | 11–13 |
| `packages/pi-discovery/src/runtime.ts` | 1108 | 11–13 |
| `packages/pi-discovery/src/native-runtime.ts` | 436 | 11–12 if transport changes; 13 |
| `packages/pi-discovery/src/domain/evaluation.ts` | 426 | 12 |
| `packages/pi-discovery/src/domain/kernel.ts` | 573 | 13 |
| `packages/pi-inquiry/src/event-projection.ts` | 421 | 14 |
| `packages/pi-inquiry/src/runtime.ts` | 515 | 14–16 |
| `packages/pi-inquiry/src/service.ts` | 426 | 15; 16 only if projection changes |
| `packages/pi-inquiry/test/inquiry.test.ts` | 564 | 15 |
| `packages/pi-inquiry/test/ledger-owner.test.ts` | 527 | 14–15 |
| `packages/pi-inquiry/ui/index.tsx` | 434 | 16 |
| `packages/pi-inquiry/src/storage.ts` | 403 | 14–15 only if the retained Node adapter needs changes |

Other registered structural debt on potentially touched boundaries: `class-extends` in `packages/pi-inquiry/src/storage.ts` (1) and `packages/pi-inquiry/src/wasm-storage.ts` (1; 110 lines), at `scripts/fixtures/structure-baseline.json:2`; module-level `let` in `packages/pi-inquiry/test/event-projection.test.ts` (1), `packages/pi-inquiry/test/ledger-owner.test.ts` (3), `packages/pi-inquiry/test/wasm-storage.test.ts` (1), at `scripts/fixtures/structure-baseline.json:55`. Plan structural separation before extending these responsibilities; do not copy or grow the registered patterns. Discovery's SDK probe has one module-let baseline (`scripts/fixtures/structure-baseline.json:54`), but tickets 11–13 need not touch that script. No baseline edits are authorized here.

## 5. Decisions needed before implementation dispatch

All recommendations below are proposals. No approval category, published compatibility promise, data adoption, deletion, new dependency or execution permission is decided by this document.

1. **Candidate/version and publication target.** Options: use fingerprinted offline candidates from this exact source snapshot, or supply different explicitly versioned artifacts. Recommendation: manager selects/verifies exact package and API artifacts before installed-owner claims; retain private/unpublished labels meanwhile. Analysis 0.2.0 versus the reference's backend 0.1.2 and fetched-commit discrepancy needs explicit resolution; full-file validation/comparison adoption remains a separate behavior ticket. Inquiry lacks standard check/smoke scripts, and Discovery's declared `discovery` capability is absent from the fixed vocabulary in `docs/PLUGIN-SPEC.md:158`; resolve candidate conformance before release. **Waits:** 8–16.

2. **Shared service contracts and new module names.** Options: keep temporary in-process host loaders, or add declared managed JSON operations with shared plugin-api contracts. Recommendation: define the intended evidence owner, analysis preparation and Discovery services explicitly before worker cutover; preserve old owners until equivalent installed behavior is proved. Choose provider aliases/operation schemas and new runtime/UI/test filenames in the implementation plan; none exists to cite for missing modules. Never import another plugin or pass callbacks/authority via JSON. **Waits:** 8–9, 11–15.

3. **Evidence write approvals.** Options: separate approval per freeze/import/fork/export action, or an explicitly bounded multi-action grant. Recommendation: review the exact paths, byte effects and scope in the host; distinguish branch materialization and failed-retry cleanup from metadata validation, retain readback, and never inherit approval from checkpoint JSON. Category names and grant lifetime remain undecided. Existing retry deletion is behavior to review, not authorization to delete data. **Waits:** 8–10.

4. **Audience disclosure and access classification.** Options: preserve version-1 full checkpoint metadata with higher-classification blob omissions, or introduce an explicitly versioned redacted format. Recommendation: preserve current format/64 MiB cap for parity and obtain an explicit metadata-disclosure decision before public/restricted export; decide who assigns artifact access levels. **Waits:** 8–10.

5. **Storage adoption and owner lifecycle.** Options: explicitly hand existing roots to one plugin writer, or retain host ownership until a later approved migration. Recommendation: require actual lease handoff and byte/identity readback, preserving analysis runs, evidence ledger/blobs/branches/capsules, Discovery's six journals/workspace binding and original Inquiry SQLite plus pending reruns. Decide disable/uninstall/reinstall retention; keep backups, never silently adopt/relocate/delete. Native and Desktop default directories are not implicitly the same. **Waits:** 8–16.

6. **Evidence replay execution.** Options: choose a supported authorized host executor with verified outputs/environment and cleanup receipts, or keep replay explicitly unavailable. Recommendation: specify and validate that host port before exposing executable replay; portable `verifyReplay` is comparison only. Decide spending, cancellation, restart and cleanup approval scope; no executor or category is selected here. **Waits:** 8–10.

7. **Critic independence and model authority.** Options: an injected independent provider or a versioned JSON provider/model request. Recommendation: host enforces the independent actual provider identity, read-only role and separately approved model spend, with denial/no-invocation evidence; plugin role flags alone are insufficient. **Waits:** 11.

8. **Multipath/evaluation approval and receipts.** Options: per-path/per-case approval or one explicitly bounded batch. Recommendation: a reviewable batch with path/case budgets and individual host execution receipts, after the approval model is chosen; retain confirmatory prior/grade/baseline semantics. Explicitly distinguish fixture evaluation from real benchmark acceptance. Category name, budget/cancel/restart policy remain undecided. **Waits:** 12.

9. **Export file approval.** Options: approval per output or one reviewed script+notebook bundle. Recommendation: authorize the exact two-file bundle under the runs root with symlink protection, individual write readbacks and owned resource cleanup. Choose the shared file port and approval category before managed routing. **Waits:** 13.

10. **Trusted automatic Inquiry origin and task terminal event.** Options: host-origin scoped transport from actual producers or asserted JSON only. Recommendation: add private-origin delivery for compute/local/decision/task facts while retaining explicit asserted labeling; choose the actual accepted/terminal task event instead of assuming `agent_end` is acceptance. Decide dedupe/order and subscription lifetime. **Waits:** 14.

11. **Contribution surfaces and product scope.** Options: use existing generic artifact/panel contributions, or separately add a generic mount contract if current ones cannot express the host behavior. Recommendation: migrate Evidence/Inquiry domain sections through generic surfaces, verify both Evidence mounts, and decide whether Inquiry's independent ledger panel remains. Preserve both languages and generic host deliveries; no new critic/multipath/evaluation UI belongs in 11–13. **Waits:** 10, 16; extra Discovery UI waits on a separately scoped ticket.

12. **Inquiry rerun execution/recovery contract.** Options: retain the in-process callback temporarily, or define host-authorized submission/status/collect requests and receipts with plugin-owned durable decisions. Recommendation: the latter before worker routing; explicitly settle budget, cancellation, restart, submission-versus-persistence failure, duplicate/late completion and disable behavior. Preserve submitted/running/reproduced/superseded/failed distinctions. Approval category is undecided. **Waits:** 15–16.

## 6. Evidence limits and remaining questions

The source inventory is complete for the four requested packages. Packed artifact integrity, clean installation, real SDK/model/execution, actual UI lifecycle and exact host/plugin behavioral equivalence remain unverified. Local fixtures and declared manifests cannot close those gates. No approval/deletion or owner removal is authorized. The numbered decisions are the implementation blockers; broader router/preset ownership and P6 public 1.x transport/dependency cleanup remain with the host reference's later tickets, outside 8–16.
