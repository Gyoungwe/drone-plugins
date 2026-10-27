# Candidate contract and runtime fixtures

These source-controlled tarballs are build inputs for clean prepublication checks. Publishable manifests retain semver dependencies; the workspace lock resolves the exact candidate locally. These fixtures do not claim an npm release or authorize republishing an existing version.

| Artifact | Status | SHA-256 |
| --- | --- | --- |
| `gyoungwe-plugin-api-1.2.0.tgz` | Scientific branch legacy fixture, retained unchanged for historical evidence; current native UI checks use 1.3.0 | `f392b29afed0b2ba59ccb4f4ebd5956fa706f9b28750f77b5c6fc0067f2c80f5` |
| `gyoungwe-plugin-api-1.3.0.tgz` | Built declarations packed from the clean Drone `74fe57e2` checkout; unpublished native/runtime/resource contract candidate | `5a4b46f427b7613d9ab6519fd6d29bb3c6e977d32fff1d33076317cbf185e55d` |
| `gyoungwe-pi-core-0.1.9.tgz` | Repacked from this merge's pi-core source build, for local acceptance only; supersede with the separate 0.2.0 migration before release | `e4e6e1eda352e8f4dbe2ba9407cd3e4d18e7144c7b6fbf88e836280c6766e730` |

Run the candidate UI checks with `DRONE_PLUGIN_API_TARBALL="$PWD/vendor/gyoungwe-plugin-api-1.3.0.tgz" npm run check`. The clean install smoke records the API hash and explicitly reports `publicRegistryInstall:false`. API 1.3 still needs its separate authorized publication and clean registry verification before consumer minimum versions can be finalized.
