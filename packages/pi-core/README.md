# @gyoungwe/pi-core

Portable Pi extension for Drone's task ledger and user-facing core tools:
`ask_user`, `set_status`, `todo`, `deliver_files`, and `memory_save`.

It also exposes `/drone-doctor` (a stable JSON host/package diagnostic) and
`/drone-example` (a read-only example preview). The example accepts
`knowledge`, `research`, `analysis`, or `evidence` profiles, with `research`
as the default; add `--run <question>` only when an explicit read-only run is
wanted. Reports distinguish `unconfigured`, `needs-data`, `blocked`, `ready`,
and `started`, and never claim a scientific result without source receipts.

The package also registers the `@drone/tasks` runtime. Native Pi uses the
extension context's `ctx.ui`; Drone Desktop can inject its existing ask gate
through `registerPiCore(pi, { ask })`. The package has no Electron, backend, or
renderer dependency and keeps all task and memory data in the existing `.pi`
locations.

Desktop task views are packaged with this owner in `ui/plugin.json` (Drone UI v1).
They require Plugin API 1.3's `sessions.prompt`, `hooks.useSessionMessages` and
`chat.message` binding. Missing bindings show an incompatible diagnostic. Native
Pi entry points remain React-free. The UI reads safe session journal projections;
review/actions go through the existing `/task-action` command with the rendered
session ID and journal revision. Disabling the UI contribution does not dispose
the native owner. Removing the entire task owner releases its guard and makes its
task operations unavailable; ordinary host permissions continue to apply.
