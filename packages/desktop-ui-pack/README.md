# @gyoungwe/desktop-ui-pack

An optional research status panel for Drone Desktop. **0.3.0 is an unpublished migration candidate**, contributing only `ResearchStatusPanel` to `panel.tab`.

The knowledge page, embedded surfaces, review overlay, graph dependencies and scoped CSS moved with Git history into pi-knowledge 0.3.0. This companion deliberately exports and registers none of them, so the two new packages can coexist without duplicate knowledge contributions. `npm run check` verifies the reduced bundle, types, behavior and clean tarball installation.

The already published desktop-ui-pack 0.2.0 is unchanged and still contains the old knowledge UI. When migrating to pi-knowledge 0.3.0, disable/remove that older UI package before enabling the new knowledge UI. To roll back, disable the new knowledge UI and restore desktop-ui-pack 0.2.0; do not delete the Vault or binding. Installed-app migration, rollback and the remaining knowledge backend extraction are not validated by this package-only change.

See [migration scope and evidence](../../docs/knowledge-ui-co-package-2026-10-26.md). The host supplies React and UI language; this read-only panel requests no filesystem, network, subprocess or external-write permissions.
