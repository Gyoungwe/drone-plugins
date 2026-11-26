# @gyoungwe/pi-core

Portable Pi extension for Drone's task ledger, Workbench, and core tools.

- Core tools include `ask_user`, `set_status`, `todo`, `deliver_files`, and `memory_save`.
- Task ledger tools include `task_status`, `task_plan`, `task_wait`, `task_reconcile`, and `task_evidence_restore`.
- Workbench tools include `workbench_plan`, `workbench_status`, `workbench_todo`, and `workbench_memory_save`.

It also exposes `/drone-doctor` (a stable JSON host/package diagnostic) and
`/drone-example` (a read-only example preview). The example accepts
`knowledge`, `research`, `analysis`, or `evidence` profiles, with `research`
as the default; add `--run <question>` only when an explicit read-only run is
wanted. Reports distinguish `unconfigured`, `needs-data`, `blocked`, `ready`,
and `started`, and never claim a scientific result without source receipts.

The package owns and registers the canonical task runtime. Native Pi uses the
extension context's `ctx.ui`; Drone Desktop can inject its existing ask gate
through `registerPiCore(pi, { ask })`. The package has no Electron, backend, or
renderer dependency and keeps the core task ledger and project memory in the
existing `.pi` locations. Workbench tools hold task and memory state in memory for
each registration. The root entry also exposes `registerPiWorkbench` and `WorkbenchStore`.

The `@gyoungwe/pi-core/host` entry exports `createWorkbenchRuntime` for callers
with an authorized application-state root. The factory loads `workbench.json`
through the host state capability. Persistence uses the current caller's write
grant and a version check. The package declares `workspace-read` and `workspace`
filesystem access and `externalWrites: false`.

The Tasks, Workbench, and Research panels ship in `ui/plugin.json` (Drone UI v1).
Task views require Plugin API 1.3's `sessions.command`, `hooks.useSessionMessages` and
`chat.message` binding. Missing bindings show an incompatible diagnostic. Native
Pi entry points remain React-free. The UI reads safe session journal projections;
review/actions use explicit command dispatch to the existing `/task-action`
handler with the rendered session ID and journal revision. Disabling the UI
contribution does not dispose the native owner. Explicitly disposing the native
owner releases its guard and makes its task operations unavailable; ordinary
host permissions continue to apply. Package-setting changes are not yet
dynamically connected to native owner disposal.
Workbench requires the host language, sessions, and transcript bindings. Research
status requires the language binding. Each panel returns `null` when its bindings
are unavailable.
