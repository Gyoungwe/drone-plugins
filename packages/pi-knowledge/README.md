# @gyoungwe/pi-knowledge

The first native Pi package in Drone. It exposes the knowledge/Vault extension
through one installable Pi entry point. The published package contains a
self-contained `dist/index.mjs` bundle and its package-local knowledge worker;
it has no runtime dependency on a Drone checkout or private Drone package.

The package is intentionally honest on first run: `knowledge_status` returns
`{ "status": "unconfigured", "next": "/drone-init" }` until a Vault binding
exists. The package does not create a Vault implicitly and does not change the
existing `.pi/` or Vault file formats.

The bundle is produced by the host build and committed here as the release
artifact. The external repository deliberately does not rebuild private Drone
source; `npm run build` verifies the checked-in artifact and refreshes its
content manifest, while `npm run build:check` is the CI freshness gate.

`npm run smoke` loads the packaged extension with the native registration
contract, checks the first-run `unconfigured` response, and verifies that the
dry-run tarball contains only publishable package files. Pi 1.1.0 can record a
local `.tgz` as an extension path instead of unpacking it; install the unpacked
package directory when using that host version.
