# Native UI, core and discovery integration

This follow-up joins the verified [UI history merge](native-ui-scientific-integration-2026-10-27.md) `ea932171` with scientific `2378bc1`, including core `27f1980` and the preserved discovery history. It retains both parents, the complete UI lineage and all scientific knowledge host operations.

## Current source candidate

- pi-core 0.2.0 owns milestone normalization, carries self-contained public declarations and verifies them through a clean TypeScript consumer. The suite 0.2.2 pins that exact core alongside knowledge 0.3.0, research 0.3.2 and workbench 0.1.0.
- pi-discovery 0.1.0 owns the actual algorithms, orchestration and state through host-owned services. It is a host-only Desktop candidate; there are no Pi extension/tools or UI entries. Native Pi support and B5 installed-app GUI remain pending.
- Discovery declares existing `workspace` permission for project-local services instead of unsupported `project-read`/`project-write` filesystem terms. The smoke verifies installed host-only metadata and labels its in-memory host services explicitly.
- API 1.3 input is independently built/packed from committed Drone `3328a151`, with SHA-256 `35b7fbaf772d11a1bae00332ba56084f74402968afe32bb15f422c69cac2dfa3`. The earlier input remains immutable under its historical filename.
- Source builds regenerate core declarations, all bundles/build manifests, suite staging and the core 0.2 tarball. npm regenerates the lock; no declaration, bundle or tarball is hand-patched.

## Validation and limits

The [receipt](native-ui-core-discovery-integration-2026-10-27.json) records final local commands, package installation, SDK sessions and fixture scope. The previous UI receipt remains historical evidence for its original parents and API input.

Remaining: production host/backend gates with the final installed package inputs; shared-owner migration of full research/publication/background hooks; native Desktop undo with production hash/CAS semantics; complete knowledge surfaces; formal same-tarball installed-app GUI including B5, permissions, writes/rollback, disable/re-enable and close cleanup; native discovery adapter; authorized API/package publication and clean registry verification. Package/service tests do not mark these complete. B8 cloud collaboration and the user's deferred account/platform acceptances remain untouched.
