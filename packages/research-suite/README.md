# @gyoungwe/research-suite

The suite composes the standalone pi-core, pi-knowledge and pi-research packages. Its tarball bundles exact dependencies so official Pi can discover native extensions and skills without a second package resolution. The suite contains no second domain implementation.

## Unpublished 0.2.2 candidate

This candidate pins `pi-core@0.2.0`, `pi-knowledge@0.3.0` and `pi-research@0.3.2`. The previously published suite 0.1.11 remains immutable. Knowledge and research packages contain their own optional Desktop UI manifests and browser bundles; the suite's native Pi extensions remain separate from those UI entries.

The existing suite did not depend on desktop-ui-pack, so this candidate does not introduce that dependency. desktop-ui-pack 0.3.0 remains a separately installable research-status panel; knowledge contributions live only in pi-knowledge 0.3.0. The suite carries the nested knowledge UI resource, but this package change does not assert that every Desktop host discovers nested UI automatically. Host package discovery and formal GUI acceptance remain separate P2 work.

Before enabling the new knowledge UI, disable or remove desktop-ui-pack 0.2.0, which still includes the historical knowledge page and overlays. Rollback disables the new UI and restores the old package without deleting Vault or binding data. See [co-packaging scope and evidence](../../docs/knowledge-ui-co-package-2026-10-26.md).

`npm run build` stages complete dependencies and validates their versions, native entries, distinct skill ownership and knowledge UI resources. `build:check` verifies the staged result, and `npm test` checks registrations and research evidence behavior. External writes and installations still require host authorization. This is the P2 co-packaging slice, not completed extraction of host domain services or a publication claim.

The candidate also declares `application-state` to cover its bundled knowledge package's configured state/index directory and fixed local writer-lease root. This declaration does not automatically grant sandbox access. Knowledge's legacy native/Desktop owner still has leases disabled until complete shared-owner shutdown is connected; the suite does not claim cross-process writer protection yet.

The candidate also bundles pi-workbench 0.1.0 alongside the package-owned pi-core task runtime. Scientific connector host seams and body-bound claim delivery remain part of pi-research 0.3.2; the merge preserves both native owner lifetimes and those host adapters.

The integrated candidate pins pi-core 0.2.0 with self-contained public declarations and task milestone planning. Discovery now delegates to plugin-owned algorithms and state through host-owned services; the former read-only loader is superseded. These source changes are not npm publication or installed-app GUI evidence.
