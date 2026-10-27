# @gyoungwe/pi-research

Self-contained research evidence tools for native Pi and Drone's public host
composition. Version 0.3.2 is a release candidate in this repository; this change
does not publish it to npm.

The native entry registers `research_search_sources`, `research_read_source`,
`research_deposit_research_note`, `research_answer_sources`, `research_status`,
and `research_loop`. Source discovery and hash-checked reading stay inside the
workspace. Candidate notes go into `.pi/research-notes`. The answer packet requires
two distinct current-session read receipts; it is evidence to assess, not an
independent scientific verification.

The run lifecycle uses the complete persisted research core: archive integrity,
observed reading receipts, structured claim bindings, provenance, and recovery.
Empty claims or invented source references cannot make a run answerable. Run
journals are isolated by Pi session identity and extension instance, without a
process-global ledger. Native run artifacts default to `results/`; optional
project-local `.pi/research-workspace.json` can supply `resultsRoot`,
`obsidianVault`, and `knowledgeBindingRevision`.

`research_read_source` accepts a bounded `start_line`. Repeated reads retain up
to 16 individual observed ranges for the current source hash; unread gaps are
never represented as read. The host research loop also retains separate receipt
IDs for non-contiguous source excerpts and resets them at its existing turn and
session boundaries.

`research_loop` exposes the same structured claim schema used by its runtime:
each claim requires `claim`, `relationship`, `limitations`, and bounded
`sources` with `path`, `start_line`, `end_line`, and a verbatim `quote`. The
host records source hashes and reading receipt IDs. `result_slug` determines
the persisted topic ID; there is no separate `topic` input.

`requires_provenance:true` adds an explicit manifest prerequisite. `start` does
not create that manifest: in a host providing `research_record_run_manifest`,
call it before `complete`/`finalize`, listing actual source paths in `files` with
`role:"input"`. The manifest records current file snapshots and observed command
references; it does not imply executed analysis, QC or scientific validation.
Missing manifests keep the gate closed and name this next action. Invalid JSON
and other filesystem errors are reported directly.

`registerResearchExtension` returns a host-scoped delivery handle. Desktop uses
that same loop and journal to recheck evidence before writing a summary, hash the
final normalized UTF-8 body, and read back every copy before committing a receipt.
The injected semantic reviewer sees every body block, structured claims, memory
metadata and actual observed excerpts. Missing/unknown review, changed sources or
out-of-scope conclusions cannot reuse an older answerable gate. A model-assessed
receipt records model identity and observed usage but always keeps
`scientificallyVerified:false`. Native source packets remain candidate evidence;
they do not acquire Desktop's summary-writing or model-review ports implicitly.

The `/host` entry exports the complete research core, Zotero identity/write/
reconciliation algorithms, institutional access, and `registerResearchExtension`.
Desktop supplies workspace/project binding, scheduling, authorization, transport
and Vault ports. Network access, setup subprocesses, and external writes belong
to these host-mediated operations; loading the native entry does not implicitly
perform them. Writes require authorization and read-back. Actual Zotero account
and Protocols.io write acceptance remains separate from isolated unit tests.

For host migration, `/host` also exports `createResearchConnectorHostLoader`.
The factory accepts host-owned `fetchImpl` and/or project-storage ports and
exposes read-only Semantic Scholar, arXiv, and project-storage connectors. It
does not create clients or retain credentials; without an injected transport the
default loader remains unavailable. Returned hits include hashed, read-only source
receipts. The write adapter is still fail-closed.

Pi is a peer dependency and is never bundled. There are no `@drone/*`, Electron,
plugin-to-plugin, or source-checkout dependencies. `migration-sources.json` records
original paths and reachable Git ancestry. Build with `npm run build`; `npm run
check` runs reproducible artifact checks, unit tests, package smoke, and real SDK
sessions on pinned Pi 1.1.0 and npm latest using isolated HOME and an offline faux
provider. These sessions exercise actual SDK tool dispatch without user credentials.

The package also ships the API 1.3 candidate `entrypoints.desktopRuntime` at
`dist/desktop-runtime.mjs`. Its `status` and `listRuns` operations are read-only:
the Desktop host supplies the selected workspace scope and `roots.resolve` /
`files.list` /
`files.readText` capabilities, while the adapter rejects application scope and
path traversal before any capability call. The adapter does not start a model,
subprocess, network request or write; the public API 1.3 release and full Desktop
GUI acceptance remain separate release gates.

The optional Desktop UI package still exposes only the research status panel. No
Zotero page is registered here because the current public `window.DroneUI` contract
has no Zotero runtime binding; adding a page without that host port would fabricate
state. Real Zotero local/Web API setup, account credentials, external writes and GUI
lifecycle remain `NOT_RUN` in this package-only slice.

The `/host` entry also exports the versioned, read-only `researchHostLoader` and
`registerResearchHost` seams. A composition root injects a `ResearchHostPort`
(`resolveRoot`, `readText`, and `listFiles`) and receives `status`/`listRuns`
operations without giving the plugin direct filesystem, network, Electron, or Pi
runtime access. Desktop's `desktopRuntime` uses this same adapter, so host and UI
reads share one run projection.

The `/host` entry additionally exports the versioned, read-only `zoteroHostLoader`
and `registerZoteroHost` seams. A composition root injects a `ZoteroHostPort.read`
transport and optional library/verifier context; the adapter delegates exact DOI
identity and attachment metadata projection to the existing reconciliation policy.
Credentials, network access, response limits and authorization remain host-owned.
This seam is covered by package tests and does not claim a real Zotero account or
desktop connection.

Pi is a peer dependency and is never bundled. There are no `@drone/*`, Electron,
plugin-to-plugin, or source-checkout dependencies. `migration-sources.json` records
original paths and reachable Git ancestry. Build with `npm run build`; `npm run
check` runs reproducible artifact checks, unit tests, package smoke, and real SDK
sessions on pinned Pi 1.1.0 and npm latest using isolated HOME and an offline faux
provider. These sessions exercise actual SDK tool dispatch without user credentials.

The package also ships the API 1.3 candidate `entrypoints.desktopRuntime` at
`dist/desktop-runtime.mjs`. Its `status` and `listRuns` operations are read-only:
the Desktop host supplies the selected workspace scope and `roots.resolve` /
`files.list` /
`files.readText` capabilities, while the adapter rejects application scope and
path traversal before any capability call. The adapter does not start a model,
subprocess, network request or write; the public API 1.3 release and full Desktop
GUI acceptance remain separate release gates.

The optional Desktop UI package still exposes only the research status panel. No
Zotero page is registered here because the current public `window.DroneUI` contract
has no Zotero runtime binding; adding a page without that host port would fabricate
state. Real Zotero local/Web API setup, account credentials, external writes and GUI
lifecycle remain `NOT_RUN` in this package-only slice.
