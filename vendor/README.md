# Candidate contract and runtime fixtures

These tarballs are source-controlled build inputs for clean prepublication checks. Publishable package manifests retain semver dependencies; the workspace lock resolves the exact candidate bytes locally. Nothing in this directory is a claim that an npm release exists.

| Artifact | Status | SHA-256 |
| --- | --- | --- |
| `gyoungwe-plugin-api-1.2.0.tgz` | Unpublished candidate from Drone `codex/knowledge-page-closure`, adds the explicit Knowledge UI contract | `056322c91ff96fb05bc0b9d1721d834450e6146f3969b819fc1d6267c33ad960` |
| `gyoungwe-pi-core-0.1.9.tgz` | Unpublished candidate from the same Drone branch, native session-scoped task read authorization | `4ebf4bf82c2166f07a5312a1b2f6795ff88880bb79698c1f27cce4e26a6358fe` |

The older 1.1.0 contract tarball is retained for historical release reproducibility. The current clean install smoke uses 1.2.0. Replace candidate receipts only after rebuilding and rerunning the relevant checks; never silently substitute different bytes for a published version.
