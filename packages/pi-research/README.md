# @gyoungwe/pi-research

Self-contained research evidence tools for native Pi and Drone's public host
composition. Version 0.2.0 is a release candidate in this repository; this change
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
