# `@gyoungwe/pi-discovery`

An unpublished standard Pi package with a read-only native extension and an optional Drone Desktop host. The package owns discovery algorithms, kernel-session orchestration, critic/multipath/exploration/evaluation state and journal projections. It exports `discoveryHostLoader.create(input)`; creation requires a project identity, absolute project root and explicit host-owned services. The zero-argument legacy loader fails closed.

The host supplies compute execution, atomic storage, inquiry integration, authorization, event routing and cancellation. The plugin has no direct filesystem, network or process client. Its manifest declares existing `workspace` scope for project-local persistence; this is a declaration, not an automatic root grant or permission to write external services.

Legacy JSON-array journals remain compatible. Critic and multipath projections omit persistence-only `recordedAt`. The host must isolate the supplied journal/storage roots: legacy records lack project identity, so changing `projectId` while sharing the same backing root does not isolate data. This migration does not invent ownership or rewrite existing journals.

The standard `pi.extensions` entry registers three read-only tools:

- `discovery_status`: report existing journal counts, or `unconfigured` when no journal exists.
- `discovery_list_records`: return up to 32 records from one existing journal.
- `discovery_search_records`: search the JSON records in one existing journal.

These tools read only `<current session cwd>/runs/.drone-discovery/{sessions,critics,multipath,plans,evaluations,baselines}.json`. This is the production backend composition's default location when no `agentDir` override is supplied. The reader uses the tool call's current workspace every time, rejects symlinked journal paths and malformed/oversized files, never creates directories, and never writes or starts an interpreter. Listing is bounded to 32 records; each input journal is limited to 1 MiB. Records are stored observations, not independent scientific validation.

Drone Desktop currently supplies a different, project-hashed agent directory. Native tools do **not** infer, adopt or expose that HOME/application state. Shared Desktop/native journal ownership, native execution/authorization, Inquiry access, cancellation and B5 GUI remain pending. The tools explicitly report execution and Inquiry as unavailable. There is no Desktop UI entrypoint in this package.

`npm run check` verifies rebuild hashes, types, service behavior and clean installation of both entries. The host smoke injects in-memory services and labels itself a fixture check. Unit tests cover registration parity, empty workspaces, two-workspace isolation, unchanged journal bytes, symlinks, corruption and bounds. These tests are not formal GUI or container acceptance.

The companion host `discovery-native-readback-sdk.test.ts` creates and executes explicit local subprocess fixture sessions through the installed package's actual production service, then reads its real persisted journals using the **same tarball** in real Pi `AgentSession` tool dispatch. Optional `DRONE_DISCOVERY_SDK_MATRIX_SCRIPT` points to this package's `scripts/check-sdk-sessions.mjs` to repeat that readback after clean installation with locked Pi 1.1.0 and the current latest SDK. Those sessions use an offline faux model, isolated HOME/auth stores and no remote inference; the fixture runner is not Docker/Podman acceptance. No npm release is implied.
