# @gyoungwe/pi-knowledge

The first native Pi package in Drone. It exposes the knowledge/Vault extension
through one installable Pi entry point. The published package contains a
self-contained `dist/index.mjs` bundle and its package-local knowledge worker;
it has no runtime dependency on a Drone checkout or private Drone package.

The package is intentionally honest on first run: `knowledge_status` returns
`{ "status": "unconfigured", "next": "/drone-init" }` until a Vault binding
exists. The package does not create a Vault implicitly and does not change the
existing `.pi/` or Vault file formats.

Task authorization and progress tools (`task_*`, `task-status` and
`task-action`) are provided by `@gyoungwe/pi-core`; this package registers only
knowledge and research tools. The `research-workflow` skill is owned by
`@gyoungwe/pi-research` and is intentionally not bundled here.

The bundle and worker are built from this package's source and committed as
release artifacts. `npm run build` regenerates them and refreshes the content
manifest; `npm run build:check` is the CI freshness gate.

`npm run smoke` loads the packaged extension with the native registration
contract, checks the first-run `unconfigured` response, and verifies that the
dry-run tarball contains only publishable package files. Pi 1.1.0 can record a
local `.tgz` as an extension path instead of unpacking it; install the unpacked
package directory when using that host version.

## 0.3.0 source candidate

Knowledge category counts and recent-note groups now share one rule: explicit frontmatter type takes precedence, then the nearest recognized category directory, then filename keywords for untyped notes. A method named `mapping-tools.md` remains a method; a typed concept is not relabeled from its filename. This is a local source candidate, not an npm publication claim.

Scientific claim comparisons preserve missing conditions and unknown directions
as unresolved. Only comparable observations with explicit opposite directions
produce a conflict candidate; text similarity alone cannot establish one.
Versioned comparisons retain both source hashes and unresolved conditions across
restarts without promoting earlier records to scientific verification.

Automatic topic-memory capture after a summary consumes the exact body-bound
claims returned by a reviewed host delivery. It checks the final body, claim-set
and source hashes instead of accepting the model's original tool arguments.
Absent or stale delivery receipts leave that automatic capture unavailable;
ordinary knowledge reading and candidate memory remain separate capabilities.

Explicit experience navigation is available through the existing
`research_search_knowledge` tool with `kind:"experiences"`, a `workflow` and a
`host_id`. It reuses the current Vault/project's existing experience store and
filters by the supplied workflow and host. Results keep `navigationOnly:true`,
`evidenceEligible:false` and `instructionEligible:false`; this mode does not
automatically inject memory or turn a previous repair into an execution plan.
