# @gyoungwe/pi-research

Self-contained research evidence tools for native Pi and Drone's public host
composition. Version 0.3.1 is a release candidate in this repository; this change
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

Pi is a peer dependency and is never bundled. There are no `@drone/*`, Electron,
plugin-to-plugin, or source-checkout dependencies. `migration-sources.json` records
original paths and reachable Git ancestry. Build with `npm run build`; `npm run
check` runs reproducible artifact checks, unit tests, package smoke, and real SDK
sessions on pinned Pi 1.1.0 and npm latest using isolated HOME and an offline faux
provider. These sessions exercise actual SDK tool dispatch without user credentials.
