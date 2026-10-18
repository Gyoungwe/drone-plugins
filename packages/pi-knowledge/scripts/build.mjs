#!/usr/bin/env node

// The external repository owns the publishable artifact and its freshness
// checks. The bundle itself is produced by the Drone host, where the private
// domain sources live, then committed here through the subtree migration.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");
// `research-workflow` is owned by @gyoungwe/pi-research. Keeping it out of
// this package prevents duplicate skill discovery when the suite is loaded.
const expectedSkills = ["research-vault", "research-show-me"];
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const manifestPath = join(packageRoot, "plugin.manifest.json");
const buildManifestPath = join(packageRoot, "build-manifest.json");
const outputPaths = ["dist/index.mjs", "lib/knowledge/runtime/worker.mjs"];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
	throw new Error(`[pi-knowledge build] ${message}`);
};
const ensureFile = async (relativePath) => {
	const path = join(packageRoot, relativePath);
	try {
		if (!(await stat(path)).isFile()) fail(`${relativePath} is not a file`);
	} catch (error) {
		if (error?.code === "ENOENT") fail(`${relativePath} is missing`);
		throw error;
	}
	return path;
};

if (packageJson.name !== "@gyoungwe/pi-knowledge") fail(`unexpected package name: ${packageJson.name}`);
if (packageJson.main !== "./dist/index.mjs") fail("main must point at the bundled extension");
if (packageJson.peerDependencies?.["@earendil-works/pi-coding-agent"] !== ">=1.1.0 <2.0.0")
	fail("Pi peer dependency must remain >=1.1.0 <2.0.0");

const outputBytes = new Map();
for (const relativePath of outputPaths) outputBytes.set(relativePath, await readFile(await ensureFile(relativePath)));

// The host bundle must be executable from an installed package. A fallback to a
// checkout's .pi runtime would make a published package depend on private state.
for (const [relativePath, bytes] of outputBytes) {
	const text = bytes.toString("utf8");
	if (/from\s+["'](?:electron|@drone\/(?:backend|desktop))["']/.test(text))
		fail(`${relativePath} contains a forbidden host import`);
	if (/import\s*\(\s*["'](?:electron|@drone\/(?:backend|desktop))["']/.test(text))
		fail(`${relativePath} contains a forbidden dynamic host import`);
	if (/(?:from|import\s*\(|require\s*\()\s*["'](?:\.\/\.\/)+/.test(text))
		fail(`${relativePath} contains a package-boundary relative import`);
	if (text.includes(".pi/lib/knowledge/runtime/worker.mjs"))
		fail(`${relativePath} falls back to a host .pi worker`);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1) fail("plugin.manifest schemaVersion must be 1");
if (manifest.id !== "drone-pi-knowledge") fail("plugin.manifest id is incorrect");
if (manifest.version !== packageJson.version) fail("plugin.manifest version must match package.json");
if (manifest.drone?.pluginApi !== 1) fail("plugin.manifest drone.pluginApi must be 1");
if (manifest.drone?.resultContract !== "drone-result/v3") fail("plugin.manifest resultContract must be drone-result/v3");
if (manifest.entrypoints?.extension !== "./dist/index.mjs") fail("extension entrypoint is incorrect");
if (manifest.entrypoints?.worker !== "./lib/knowledge/runtime/worker.mjs") fail("worker entrypoint is incorrect");
if (manifest.entrypoints?.skills !== "./skills") fail("skills entrypoint is incorrect");
if (!Array.isArray(manifest.hosts) || !manifest.hosts.includes("native-pi")) fail("native-pi host is missing");

const skills = [];
for (const name of expectedSkills) {
	const relativePath = `skills/${name}/SKILL.md`;
	await ensureFile(relativePath);
	skills.push(relativePath);
}
const skillRoot = join(packageRoot, "skills");
for (const entry of await readdir(skillRoot, { withFileTypes: true })) {
	if (entry.isDirectory() && !expectedSkills.includes(entry.name)) fail(`unexpected skill directory: ${entry.name}`);
}

const source = await readFile(join(packageRoot, "src/index.ts"), "utf8");
if (/@drone\//.test(source) || /from\s+["']\.\./.test(source)) fail("source marker reaches into private Drone packages");

const current = existsSync(buildManifestPath) ? JSON.parse(await readFile(buildManifestPath, "utf8")) : null;
const next = {
	version: 1,
	generator: "packages/pi-knowledge/scripts/build.mjs",
	artifactSource: "drone-host-bundle",
	outputs: Object.fromEntries([...outputBytes].map(([path, bytes]) => [path, sha256(bytes)])),
	skills,
};
const currentComparable = current && JSON.stringify(current);
const nextComparable = JSON.stringify(next, null, "\t") + "\n";
if (checkOnly) {
	if (currentComparable !== JSON.stringify(next)) fail("build-manifest.json is stale; run npm run build");
	console.log("pi-knowledge package artifacts are up to date");
} else {
	await writeFile(buildManifestPath, nextComparable);
	console.log("verified pi-knowledge package artifacts and refreshed build-manifest.json");
}
