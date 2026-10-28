# `@gyoungwe/pi-discovery`

Unpublished 0.2.0 candidate: one standard Pi package contains its native entry, optional Drone runtime and optional Desktop panel. It requires the unpublished Plugin API 1.3 candidate. No public npm release is implied.

The package owns discovery algorithms, kernel-session orchestration, critic/multipath/exploration/evaluation state and journal projections. `discoveryHostLoader.create(input)` remains the legacy composition entry and requires explicit host services. Its zero-argument loader fails closed. The new `desktopRuntime` owns a canonical-workspace pool; UI actions and native projections use the same owner and domain service.

## Native tools

- `discovery_status`: existing journal counts and binding/ownership readiness.
- `discovery_list_records` / `discovery_search_records`: read up to 32 records from a journal.
- `discovery_bind_workspace`: bind the selected state root to the actual workspace and acquire an exclusive writer lease. In the default Node adapter, pass `root: "native-state"`; existing journals require `acknowledgeExistingData: true`.
- `discovery_create_plan`: persist an exploration plan without executing code or certifying its findings.

Default native state remains `<current session cwd>/runs/.drone-discovery`. Read tools create no directories and may inspect unbound existing journals. They reject symlinks, malformed JSON and journals above 1 MiB. An explicit Node adapter may use an already-selected Desktop state root; an existing binding must match the actual native canonical workspace. Native tools do not infer a HOME/application directory.

Native writes use snapshot hashes, compare-and-swap, a same-directory atomic temporary file, write-back verification and the shared `@gyoungwe/plugin-api/node/reservations` implementation. This is a local Node storage adapter, not backend `JsonStore`. A cleanup error retains writer ownership for explicit recovery. The official `session_shutdown` hook drains accepted calls before disposing domain state and releasing leases. Raw `AgentSession.dispose()` alone does not emit that hook; SDK embedders must run the public extension shutdown lifecycle, as the Drone session engine does.

## Desktop runtime and panel

Enablement requests separate state/file directory grants from the installed manifest. The panel receives only its real bound runtime client; no direct IPC or backend import is used. It lists approved state roots, shows existing-data acknowledgement, binds one root to the selected live workspace, saves exploration plans and reads them back. Disable/removal unmounts the panel; native ownership and full runtime disable are tested separately.

To preserve old Desktop journals, explicitly select the existing project-hashed discovery directory itself. Binding writes only `workspace-binding.json`, never rewrites existing journals, and preserves a unique existing plan project ID. Mixed/conflicting legacy project IDs reject adoption. Empty roots use the existing `discovery-<canonical-workspace-sha256-first-32>` identity. A root already bound to another workspace cannot be rebound.

Managed journals use real host `JsonStore` CAS ports. Native and managed writers share one local-user `state-writers` lease protocol. The remaining legacy backend writer also holds that lease during actual writes and rejects stale snapshots before replacing journals. Cleanup failure is never reported as successful release.

Kernel execution, critic, multipath, evaluation, Inquiry and export ports are still unavailable in the **new** runtime. The existing legacy host service retains its prior capabilities until the complete replacement is verified. This candidate does not claim full P5 or formal macOS GUI acceptance.

## Checks

`npm run check` verifies generated hashes, types, domain behavior, native tool registration, real temporary filesystem round trips, corruption/symlink bounds, mixed project rejection and clean install. Set `DRONE_PLUGIN_API_TARBALL` to the verified private API 1.3 tarball. The smoke's in-memory legacy host services remain explicitly fixture evidence.

Host `packed-discovery-owner-sdk.test.ts` clean-installs the same tarball, builds its real UI with the production builder, mounts it through the production registry/entry host, executes actual UI actions and actual managed SDK tool dispatch, and checks another Node process running a real SDK against the same root. It also checks real legacy writer competition, preservation and stale-reader rejection. Offline faux providers supply deterministic tool calls; these are real SDK dispatches without remote inference.

`discovery-native-readback-sdk.test.ts` creates real journals through the production installed legacy writer and reads them from the same tarball in native sessions. `scripts/check-sdk-sessions.mjs` repeats readback in clean locked Pi 1.1.0/latest installations. These are separate from Docker/Podman and formal installer GUI acceptance.
