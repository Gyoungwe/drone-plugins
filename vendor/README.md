# Runtime fixtures

The workspace pins Plugin API to the Drone GitHub Release archive. `node scripts/prepare-plugin-api.mjs` checks the published checksum, `package.json` SHA-256, and `package-lock.json` SRI before staging the archive and seeding the npm cache. See the [workspace setup](../README.md#开发门槛) for offline use.

| Artifact | Status | SHA-256 |
| --- | --- | --- |
| `gyoungwe-pi-core-0.1.9.tgz` | First UI merge fixture | `e4e6e1eda352e8f4dbe2ba9407cd3e4d18e7144c7b6fbf88e836280c6766e730` |
| `gyoungwe-pi-core-0.2.0.tgz` | Merged source fixture with self-contained declarations and milestone planning | `2259745b457c17b95ce854a8ba050663f47efd3c22407317b497570431f4913b` |
