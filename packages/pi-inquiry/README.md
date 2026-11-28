# `@gyoungwe/pi-inquiry`

Canonical Inquiry ledger, host-event runtime, and optional Drone Desktop UI plugin (`0.1.0`).

## Distribution

- Distributed at version `0.1.0` via **GitHub Release** only (not published to npm and not listed in Drone's default locked plugins).
- Packaged metadata and runtime declarations are defined in `package.json`, `plugin.manifest.json`, and `ui/plugin.json`.

## Deliverables

- **Official Pi extension** (`./dist/index.mjs`): exposes `inquiry_read` and `inquiry_write` tools wrapping scoped operations in `{ "request": { "action": "status" } }`.
- **Optional Drone Desktop UI** (`./ui/plugin.json`): contributes the `inquiry` panel (`panel.tab`) and `inquiry-artifact-status` (`panel.artifact.contribution`).
- **Managed runtime provider** (`./dist/runtime.mjs`): provides `inquiry.runtime@1` (`inquiry.read`, `inquiry.write`) backed by the same canonical Inquiry SQL/WASM ledger owner, preserving SQLite file format, project identity, and original bytes.

## Host Event Bridge, Rerun, and Workspace Promotion

- **Host event bridge**: declares and wires all four host event topics (`inquiry.compute`, `inquiry.decision`, `inquiry.local-execution`, `inquiry.task-terminal`) through passive bounded buffering plus explicit `drainHostEvents` projection inside a single SQLite CAS transaction.
- **Two-phase `inquiry.rerun` capability**: declared via `drone.inquiryRerun: "request"`, enabled by default in the managed Desktop runtime, and explicitly disabled in standalone Pi CLI (`src/native-runtime.ts`).
- **Workspace promotion**: declares `workspace-write` in `plugin.manifest.json` and requires the user to grant a writable working directory; the host approves each file move and each write to `results/index.json` individually. Without that grant, status reports `workspace-promotion-file-port` as unavailable.

## Storage, Isolation, and Write Safety

- Desktop manifest grants separate JSON metadata and binary state directories; select the same original ledger directory for both grants, then bind existing data to the active workspace.
- Native Pi defaults to `<canonical workspace>/runs/.drone-inquiry` and does not silently adopt a different Desktop directory; a trusted Node adapter may configure an existing directory via `nativeInquiryExtension` options. Every native write displays the workspace, SDK session, and affected bytes/metadata through the real SDK confirmation UI (no UI means no native write).
- Writes enforce caller authorization, a cross-process writer lease, raw-byte CAS, readback, and immutable SHA-named original backups. Active WAL/SHM/journal files, external modifications, and databases over the 4 MiB boundary are refused. Cleanup failures retain the lease for explicit reconciliation.
- Desktop JSON uses the host's `JsonStore`; native Pi persists bounded JSON metadata atomically via the Node binary/CAS helper with strict corruption checks and readback.

## Boundaries and Verification Status

- Explicit `record*` writes (`recordComputeEvent`, `recordTaskTerminal`, `recordLocalExecution`) run the event projector inside the same SQLite CAS transaction on validated ordinary JSON, but remain `plugin-asserted-or-imported` records rather than independent host provenance proofs; supplying a session ID, hash, or provenance grants no execution or storage authority.
- Formal packaged DMG GUI acceptance remains `NOT_RUN`.

## Development and Verification

After [workspace setup](../../README.md#开发门槛):

- `npm run check`: runs `typecheck`, `build:check`, `build`, `test`, and clean-install `smoke` with the bundled `@gyoungwe/plugin-api`.
- `npm run check:domain`: runs `typecheck`, `build:check`, and `test` across canonical Node/WASM SQL, original-byte persistence, host events, rerun, promotion, and runtime provider flows.
- `npm run build` / `npm run build:check`: generates `dist/` (untracked in Git, including the `sql.js` loader, WASM, and license) and verifies input/output hashes recorded in `build-manifest.json`.
