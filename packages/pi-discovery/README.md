# `@gyoungwe/pi-discovery`

An unpublished, host-only Drone Desktop candidate. The package owns discovery algorithms, kernel-session orchestration, critic/multipath/exploration/evaluation state and journal projections. It exports `discoveryHostLoader.create(input)`; creation requires a project identity, absolute project root and explicit host-owned services. The zero-argument legacy loader fails closed.

The host supplies compute execution, atomic storage, inquiry integration, authorization, event routing and cancellation. The plugin has no direct filesystem, network or process client. Its manifest declares existing `workspace` scope for project-local persistence; this is a declaration, not an automatic root grant or permission to write external services.

Legacy JSON-array journals remain compatible. Critic and multipath projections omit persistence-only `recordedAt`. The host must isolate the supplied journal/storage roots: legacy records lack project identity, so changing `projectId` while sharing the same backing root does not isolate data. This migration does not invent ownership or rewrite existing journals.

There is no native Pi extension, registered Pi tool or Desktop UI entrypoint in this package. `hosts` therefore declares only `drone-desktop`; native Pi and B5 GUI acceptance remain pending. Desktop IPC and safety boundaries stay host-owned, while the domain service implementation lives here.

`npm run check` verifies rebuild hashes, types, service behavior and clean installation of the host entry. The installed smoke injects in-memory host services and labels itself a fixture check. Its six service tests do not establish real Desktop integration, a native tool session, B5 GUI acceptance or npm publication. Run real host/backend and installed-app checks separately before recording those capabilities as complete.
