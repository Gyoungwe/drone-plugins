# @gyoungwe/research-suite

The suite aggregates the published `@gyoungwe/pi-core`,
`@gyoungwe/pi-knowledge`, and `@gyoungwe/pi-research` packages. The release
tarball bundles those dependencies so a Pi host can discover the extensions and
skills without a second network resolution step. `research-workflow` comes
from `@gyoungwe/pi-research`; `@gyoungwe/pi-knowledge` supplies the Vault and
Show Me skills, so the suite exposes one copy of each skill. `pi-core` also
provides the stable `/drone-doctor` and `/drone-example` onboarding commands;
the latter is read-only unless the user explicitly supplies `--run <question>`.

## 0.2.2 source candidate

This candidate pins `pi-core@0.1.9`, `pi-knowledge@0.3.0`, and
`pi-research@0.3.2`. The research package contains the complete evidence journal,
source archive, claim checks, provenance and Zotero domain implementation. Its
`/host` export and declarations are included in the aggregate tarball; the suite
only composes package resources and does not provide a second implementation.
The manifest includes the permissions of the bundled research package. External
writes and installations still require the host authorization flow.

Run `npm run build`, `npm run build:check`, and `npm test` in this package after
building its workspace dependencies. The checks verify exact versions, resource
paths, tool registration and rejection of unsupported research claims. This
source update is not evidence of npm publication.
