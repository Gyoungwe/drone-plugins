# pi-research read-only host registry

2026-10-27 — `@gyoungwe/pi-research` now contains a transport-backed, read-only
research connector registry at its `/host` entry. `createResearchConnectorHostLoader`
accepts only host-owned ports: a `fetchImpl` for public Semantic Scholar and arXiv
metadata, and/or a project-storage search port for workspace-relative files. The
plugin does not create clients, persist credentials, resolve workspace paths, or
call write endpoints. Every returned hit carries a `readOnly: true` source receipt
with a content hash; connector failures are returned as structured failures.

The default `researchConnectorHostLoader` remains unavailable when no transport is
injected, so a host cannot mistake an empty registry for a successful search. The
write adapter remains fail-closed and is unchanged by this migration.

Evidence:

- `npm run typecheck --workspace @gyoungwe/pi-research` — PASS
- `npm test --workspace @gyoungwe/pi-research -- research-host.test.ts` — PASS (3 tests)
- `npm run check --workspace @gyoungwe/pi-research` — PASS, including clean-pack
  SDK sessions against Pi `1.1.0` and latest `1.4.0` (152 package tests).
- The transport-backed test uses a stubbed public response and host project index;
  it is a contract regression test, not a real-account or network acceptance.
- Build artifacts and their manifest are regenerated with `npm run build --workspace
  @gyoungwe/pi-research`; the complete workspace gate remains to be run before
  integration.

Remaining boundary: Drone must inject its authorized fetch and project-storage
ports when it wires the loader. This package intentionally does not claim GUI,
credential, or third-party account acceptance from the isolated tests above.
