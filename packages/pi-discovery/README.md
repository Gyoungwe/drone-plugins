# `@gyoungwe/pi-discovery`

Read-only discovery host for Drone. The package reads the existing `DiscoveryService` JSON-array journals: `critics.json`, `multipath.json`, `plans.json` and `evaluations.json`. Its root matches that service: the host-provided `agentDir`, or `<projectRoot>/runs/.drone-discovery` when no override is supplied. Critic and multipath lists omit the persistence-only `recordedAt` field, matching the public host projection. Missing files produce empty lists; malformed files report errors. Reads never create or alter journals.

The supplying host must authorize and isolate each journal root. Legacy critic, multipath and evaluation records do not contain a project id; passing a different `projectId` with the same `agentDir` cannot isolate their contents. The plugin does not invent project ownership or migrate the stored format.

`npm run check` verifies source/output hashes, typechecks, exercises the projections and installs/loads the packed artifact in a clean prefix. The host's optional `plugin-record-parity.test.ts` requires `DRONE_DISCOVERY_PLUGIN_TARBALL` and compares the installed package with journals written by the real `DiscoveryService`; without a candidate tarball that test is skipped.

Kernel execution, authorization, inquiry writes, native IPC and B5d–B5f computation remain host-owned until their contracts are migrated.
