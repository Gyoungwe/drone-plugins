#!/usr/bin/env node

// Assemble the aggregate package from the exact dependency versions declared
// by package.json. npm only includes bundleDependencies when real package
// directories exist below this package, so workspace symlinks must be copied
// into this private staging tree before publishing.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(packageRoot, "../..");
const packageJsonPath = join(packageRoot, "package.json");
const manifestPath = join(packageRoot, "plugin.manifest.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const checkOnly = process.argv.includes("--check");
const bundled = Object.keys(packageJson.dependencies || {}).filter((name) =>
	(packageJson.bundleDependencies || []).includes(name),
);

const fail = (message) => {
	throw new Error(`[research-suite build] ${message}`);
};

if (packageJson.name !== "@gyoungwe/research-suite") fail(`unexpected package name: ${packageJson.name}`);
if (manifest.id !== "drone-research-suite") fail("plugin.manifest id is incorrect");
if (manifest.version !== packageJson.version) fail("plugin.manifest version must match package.json");
if (manifest.drone?.pluginApi !== 1) fail("plugin.manifest drone.pluginApi must be 1");
if (manifest.drone?.resultContract !== "drone-result/v3") fail("plugin.manifest resultContract must be drone-result/v3");

const stagedRoot = join(packageRoot, "node_modules");
if (!checkOnly) {
	await rm(stagedRoot, { recursive: true, force: true });
	const copied = new Set();
	const copyDependency = async (name, targetRoot = stagedRoot) => {
		const key = `${targetRoot}\0${name}`;
		if (copied.has(key)) return;
		copied.add(key);
		const rootSource = join(workspaceRoot, "node_modules", ...name.split("/"));
		const nestedSource = join(packageRoot, "node_modules", ...name.split("/"));
		// npm may keep a bundled dependency nested below the aggregate package
		// instead of hoisting it. Both layouts are valid clean installs.
		const source = existsSync(rootSource) ? rootSource : nestedSource;
		const target = join(targetRoot, ...name.split("/"));
		if (!existsSync(source)) fail(`dependency ${name} is unavailable; run npm ci first`);
		await mkdir(join(target, ".."), { recursive: true });
		await cp(source, target, { recursive: true, dereference: true });
		const dependency = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
		for (const child of Object.keys(dependency.dependencies || {})) await copyDependency(child, stagedRoot);
	};
	for (const name of bundled) await copyDependency(name);
}

const packageAt = (name) => join(stagedRoot, ...name.split("/"));
const readPackage = async (name) => {
	const path = join(packageAt(name), "package.json");
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT") fail(`bundled dependency ${name} is missing; run npm run build`);
		throw error;
	}
};

for (const name of bundled) {
	const dependency = await readPackage(name);
	if (dependency.version !== packageJson.dependencies[name])
		fail(`${name} is ${dependency.version}; expected ${packageJson.dependencies[name]}`);
	if (existsSync(packageAt(name))) {
		const info = await stat(packageAt(name));
		if (!info.isDirectory()) fail(`${name} staging path is not a directory`);
	}
	for (const entry of dependency.pi?.extensions || []) {
		if (!existsSync(join(packageAt(name), entry))) fail(`${name} extension entry is missing: ${entry}`);
	}
}

// The native composition keeps its existing three extension entries. Knowledge's
// optional Desktop resource is carried by that same dependency, never registered
// as a second native extension or copied into a standalone suite UI bundle.
const knowledgeManifest = JSON.parse(await readFile(join(packageAt("@gyoungwe/pi-knowledge"), "plugin.manifest.json"), "utf8"));
if (knowledgeManifest.entrypoints.ui !== "./ui/plugin.json") fail("knowledge package is missing its co-packaged UI entrypoint");
const knowledgeUi = JSON.parse(await readFile(join(packageAt("@gyoungwe/pi-knowledge"), knowledgeManifest.entrypoints.ui), "utf8"));
await readFile(join(packageAt("@gyoungwe/pi-knowledge"), "ui", knowledgeUi.main));
if (JSON.stringify(knowledgeUi.contributions.map(entry => entry.region)) !== JSON.stringify(["knowledge.page", "knowledge.surface", "app.overlay"])) fail("knowledge UI ownership is incorrect");

const knowledgeSkills = await readdir(join(packageAt("@gyoungwe/pi-knowledge"), "skills"), { withFileTypes: true });
const researchSkills = await readdir(join(packageAt("@gyoungwe/pi-research"), "skills"), { withFileTypes: true });
const skillNames = (entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const knowledgeNames = skillNames(knowledgeSkills);
const researchNames = skillNames(researchSkills);
if (knowledgeNames.includes("research-workflow")) fail("pi-knowledge still bundles research-workflow");
if (!researchNames.includes("research-workflow")) fail("pi-research must provide research-workflow");
const overlap = knowledgeNames.filter((name) => researchNames.includes(name));
if (overlap.length) fail(`duplicate skills across bundled packages: ${overlap.join(", ")}`);

const expectedExtensions = bundled.map((name) => `./node_modules/${name}/dist/index.mjs`);
if (JSON.stringify(manifest.entrypoints?.extensions) !== JSON.stringify(expectedExtensions))
	fail("manifest extensions do not match bundled package dependencies");
const expectedSkills = [
	"./node_modules/@gyoungwe/pi-knowledge/skills",
	"./node_modules/@gyoungwe/pi-research/skills",
];
if (JSON.stringify(manifest.entrypoints?.skills) !== JSON.stringify(expectedSkills))
	fail("manifest skills do not match bundled package dependencies");

const hash = createHash("sha256");
for (const name of bundled) {
	const dependency = await readFile(join(packageAt(name), "package.json"));
	hash.update(name).update("\0").update(dependency).update("\0");
}
const markerPath = join(packageRoot, "build-manifest.json");
const marker = {
	version: 1,
	generator: "packages/research-suite/scripts/build.mjs",
	packageVersion: packageJson.version,
	bundled,
	dependenciesSha256: hash.digest("hex"),
};
const current = existsSync(markerPath) ? JSON.parse(await readFile(markerPath, "utf8")) : null;
const serialized = `${JSON.stringify(marker, null, 2)}\n`;
if (checkOnly) {
	if (JSON.stringify(current) !== JSON.stringify(marker)) fail("build-manifest.json is stale; run npm run build");
	console.log("research-suite package staging is up to date");
} else {
	await writeFile(markerPath, serialized);
	console.log("research-suite package staging is ready");
}

