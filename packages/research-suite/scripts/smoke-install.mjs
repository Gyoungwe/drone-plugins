#!/usr/bin/env node
/**
 * Pack and install the aggregate from its own tarball, then load every native
 * entry through the official Pi resource loader. This script intentionally
 * runs from a clean prefix and never resolves the workspace source tree.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const packageRoot = new URL("..", import.meta.url).pathname;
const sdkFamily = ["chord", "pi-agent-core", "pi-ai", "pi-codemode", "pi-coding-agent", "pi-mcp", "pi-telemetry", "pi-tui"];
const root = await mkdtemp(join(tmpdir(), "drone-research-suite-install-"));
const tarballRoot = join(root, "tarballs");
const installRoot = join(root, "install");
await mkdir(tarballRoot, { recursive: true });
await mkdir(installRoot, { recursive: true });
const env = {
	...process.env,
	HOME: join(root, "home"),
	npm_config_cache: join(root, "npm-cache"),
	npm_config_userconfig: join(root, "npmrc"),
};
await mkdir(env.HOME, { recursive: true });
await writeFile(env.npm_config_userconfig, "registry=https://registry.npmjs.org\n", "utf8");
try {
	const packed = JSON.parse(
		(await run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", tarballRoot], {
			cwd: packageRoot,
			env,
		})).stdout,
	)[0];
	assert(packed?.filename?.endsWith(".tgz"), "research-suite did not produce an npm tarball");
	const tarball = join(tarballRoot, packed.filename);
	const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
	await writeFile(
		join(installRoot, "package.json"),
		`${JSON.stringify({
			private: true,
			type: "module",
			dependencies: {
				[packageJson.name]: `file:${tarball}`,
				...Object.fromEntries(sdkFamily.map((name) => [`@earendil-works/${name}`, "1.1.0"])),
			},
		}, null, 2)}\n`,
		"utf8",
	);
	await run(
		"npm",
		["install", "--ignore-scripts", "--legacy-peer-deps", "--no-audit", "--no-fund"],
		{ cwd: installRoot, env },
	);
	const suiteRoot = join(installRoot, "node_modules", "@gyoungwe", "research-suite");
	const installed = JSON.parse(await readFile(join(suiteRoot, "package.json"), "utf8"));
	assert.equal(installed.version, packageJson.version);
	const extensions = installed.pi.extensions.map((entry) => join(suiteRoot, entry));
	const sdkEntry = pathToFileURL(
		join(installRoot, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js"),
	).href;
	const { DefaultResourceLoader, SettingsManager } = await import(sdkEntry);
	const loader = new DefaultResourceLoader({
		cwd: installRoot,
		agentDir: join(installRoot, "agent"),
		settingsManager: SettingsManager.inMemory({ projectTrusted: true }),
		noExtensions: true,
		noSkills: true,
		additionalExtensionPaths: extensions,
	});
	await loader.reload();
	const loaded = loader.getExtensions();
	assert.deepEqual(loaded.errors, [], JSON.stringify(loaded.errors));
	const names = loaded.extensions.flatMap((extension) => [...extension.tools.keys()]);
	for (const name of ["task_plan", "knowledge_status", "research_search_sources", "research_loop"])
		assert(names.includes(name), `installed suite did not register ${name}`);
	const receipt = {
		status: "PASS",
		package: packageJson.name,
		version: installed.version,
		tarballSha256: createHash("sha256").update(await readFile(tarball)).digest("hex"),
		installRootIsClean: true,
		loadedExtensions: loaded.extensions.length,
		toolCount: names.length,
		tools: names,
		model: "Pi loader only; no credentials and no model call",
	};
	console.log(JSON.stringify(receipt));
} finally {
	await rm(root, { recursive: true, force: true });
}
