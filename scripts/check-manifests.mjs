import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../packages/", import.meta.url);
const required = ["schemaVersion", "id", "version", "drone", "entrypoints", "capabilities", "hosts", "permissions"];
const packages = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory());
const failures = [];

for (const pkg of packages) {
  const path = new URL(`${pkg.name}/plugin.manifest.json`, root);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    failures.push(`${pkg.name}: missing or invalid plugin.manifest.json (${error.message})`);
    continue;
  }
  for (const key of required) if (!(key in manifest)) failures.push(`${pkg.name}: missing ${key}`);
  if (manifest.drone?.pluginApi !== 1) failures.push(`${pkg.name}: drone.pluginApi must be 1`);
  if (manifest.drone?.resultContract !== "drone-result/v3") failures.push(`${pkg.name}: resultContract must be drone-result/v3`);
  if (!Array.isArray(manifest.hosts) || manifest.hosts.length === 0) failures.push(`${pkg.name}: hosts must be non-empty`);
  if (JSON.stringify(manifest).includes("../Drone")) failures.push(`${pkg.name}: manifest references the host source tree`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Plugin manifests checked: ${packages.length}`);
