# Candidate contract and runtime fixtures

These source-controlled tarballs are inputs for clean prepublication checks. Publishable manifests retain semver dependencies; the workspace lock resolves exact candidate bytes locally. These fixtures do not claim an npm release or authorize republishing an existing version.

| Artifact | Status | SHA-256 |
| --- | --- | --- |
| `gyoungwe-plugin-api-1.2.0.tgz` | Legacy scientific contract fixture; retained unchanged for historical evidence | `f392b29afed0b2ba59ccb4f4ebd5956fa706f9b28750f77b5c6fc0067f2c80f5` |
| `gyoungwe-plugin-api-1.3.0.tgz` | Historical native UI merge input, packed from clean Drone `74fe57e2` | `5a4b46f427b7613d9ab6519fd6d29bb3c6e977d32fff1d33076317cbf185e55d` |
| `gyoungwe-plugin-api-1.3.0-3328a151.tgz` | Current candidate: independent build/pack from `git archive` of committed Drone `3328a151`, including task/discovery contracts | `35b7fbaf772d11a1bae00332ba56084f74402968afe32bb15f422c69cac2dfa3` |
| `gyoungwe-pi-core-0.1.9.tgz` | Historical first UI merge fixture; not a release input | `e4e6e1eda352e8f4dbe2ba9407cd3e4d18e7144c7b6fbf88e836280c6766e730` |
| `gyoungwe-pi-core-0.2.0.tgz` | Current merged source build, including self-contained declarations and milestone planning | `2259745b457c17b95ce854a8ba050663f47efd3c22407317b497570431f4913b` |

Run current candidate checks with `DRONE_PLUGIN_API_TARBALL="$PWD/vendor/gyoungwe-plugin-api-1.3.0-3328a151.tgz" npm run check`. Clean install receipts report `publicRegistryInstall:false`. API 1.3 still needs authorized publication and clean registry verification before consumer minimum versions are finalized. Distinct filenames preserve historical inputs and prevent a cache from silently substituting another unpublished 1.3 candidate.
