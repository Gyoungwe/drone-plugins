# @gyoungwe/research-suite

The suite aggregates the standalone `@gyoungwe/pi-core`,
`@gyoungwe/pi-knowledge`, and `@gyoungwe/pi-research` packages. The release
tarball bundles those dependencies so a Pi host can discover the extensions and
skills without a second network resolution step. `research-workflow` comes
from `@gyoungwe/pi-research`; `@gyoungwe/pi-knowledge` supplies the Vault and
Show Me skills, so the suite exposes one copy of each skill. `pi-core` also
provides the stable `/drone-doctor` and `/drone-example` onboarding commands;
the latter is read-only unless the user explicitly supplies `--run <question>`.

## 0.1.11 candidate

This candidate pins `pi-core@0.1.9`, `pi-knowledge@0.2.1`, and
`pi-research@0.2.0`. The research package contains the complete evidence journal,
source archive, claim checks, provenance and Zotero domain implementation. Its
`/host` export and declarations are included in the aggregate tarball; the suite
only composes package resources and does not provide a second implementation.
The manifest includes the permissions of the bundled research package. External
writes and installations still require the host authorization flow.

Run `npm run build`, `npm run build:check`, and `npm test` in this package after
building its workspace dependencies. The checks verify exact versions, resource
paths, tool registration and rejection of unsupported research claims. This
candidate has not been published to npm. The publicly released 0.1.10 remains immutable.

Core 0.1.9 adds the native session-scoped task read adapter. Its task reconciliation reads approved, non-private deliverables and preserves cwd/session isolation. Private `.pi/research-notes` candidates are not deliverables; the real-session acceptance writes a separate `research-summary.md` through the authorized tool flow. The candidate source dependency is pinned to the same version as the vendored tarball used by clean workspace installs.
