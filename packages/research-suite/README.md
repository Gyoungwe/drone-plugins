# @gyoungwe/research-suite

The suite aggregates the published `@gyoungwe/pi-core`,
`@gyoungwe/pi-knowledge`, and `@gyoungwe/pi-research` packages. The release
tarball bundles those dependencies so a Pi host can discover the extensions and
skills without a second network resolution step. `research-workflow` comes
from `@gyoungwe/pi-research`; `@gyoungwe/pi-knowledge` supplies the Vault and
Show Me skills, so the suite exposes one copy of each skill. `pi-core` also
provides the stable `/drone-doctor` and `/drone-example` onboarding commands;
the latter is read-only unless the user explicitly supplies `--run <question>`.
