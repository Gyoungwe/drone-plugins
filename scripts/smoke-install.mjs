#!/usr/bin/env node

// Install every currently publishable package from real npm tarballs into a
// clean prefix. The probe intentionally uses the native registration surface
// and does not make a model call or touch the user's Pi state.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const packageNames = ["pi-knowledge", "desktop-ui-pack", "research-suite"];
const smokeRoot = await mkdtemp(join(tmpdir(), "drone-plugin-install-smoke-"));
const tarballRoot = join(smokeRoot, "tarballs");
const installRoot = join(smokeRoot, "install");
await mkdir(tarballRoot, { recursive: true });
await mkdir(installRoot, { recursive: true });

const packageJsonFor = async (name) => JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8"));
const tarballs = {};
try {
	for (const name of packageNames) {
		const packageJson = await packageJsonFor(name);
		const output = await execFileAsync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", tarballRoot], {
			cwd: join(root, "packages", name),
			maxBuffer: 8 * 1024 * 1024,
		});
		const metadata = JSON.parse(output.stdout.trim())[0];
		assert(metadata?.filename?.endsWith(".tgz"), `${name} did not produce an npm tarball`);
		tarballs[name] = { packageJson, path: join(tarballRoot, metadata.filename) };
	}

	const installPackage = {
		name: "drone-plugin-install-smoke",
		version: "0.0.0",
		private: true,
		type: "module",
		dependencies: Object.fromEntries(
			packageNames.map((name) => [tarballs[name].packageJson.name, `file:${tarballs[name].path}`]),
		),
	};
	await writeFile(join(installRoot, "package.json"), `${JSON.stringify(installPackage, null, 2)}\n`);
	await execFileAsync(
		"npm",
		["install", "--prefix", installRoot, "--ignore-scripts", "--legacy-peer-deps", "--no-audit", "--no-fund"],
		{ cwd: root, maxBuffer: 16 * 1024 * 1024 },
	);

	for (const name of packageNames) {
		const packageJson = tarballs[name].packageJson;
		const installedRoot = join(installRoot, "node_modules", ...packageJson.name.split("/"));
		const installed = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
		assert.equal(installed.name, packageJson.name, `${name} installed under the wrong package name`);
		await readFile(join(installedRoot, "plugin.manifest.json"));
	}

	const piRoot = join(installRoot, "node_modules", "@gyoungwe", "pi-knowledge");
	const previousKnowledgeDir = process.env.DRONE_KNOWLEDGE_DIR;
	process.env.DRONE_KNOWLEDGE_DIR = join(smokeRoot, "unconfigured");
	const { default: register } = await import(pathToFileURL(join(piRoot, "dist/index.mjs")).href);
	const tools = new Map();
	const commands = new Map();
	const pi = {
		events: { on() {}, emit() {} },
		on() {},
		appendEntry() {},
		getCommands: () => [...commands.keys()].map((name) => ({ name })),
		readSemanticSettings: async () => ({}),
		saveSemanticSettings: async () => undefined,
		sendMessage: async () => undefined,
		sendUserMessage: async () => undefined,
		registerTool(definition) {
			tools.set(definition.name, definition);
		},
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
	};
	register(pi);
	assert(tools.has("knowledge_status"), "installed pi-knowledge did not register knowledge_status");
	assert(tools.has("knowledge_search"), "installed pi-knowledge did not register knowledge_search");
	try {
		const status = await tools.get("knowledge_status").execute(
			"combined:status",
			{},
			new AbortController().signal,
			() => undefined,
			{ cwd: installRoot, sessionId: "combined-install-smoke" },
		);
		assert.equal(status.details.status, "unconfigured");
		console.log(
			JSON.stringify({
				packages: packageNames.map((name) => tarballs[name].packageJson.name),
				installed: true,
				piKnowledgeTools: tools.size,
				knowledgeStatus: status.details.status,
			}),
		);
	} finally {
		if (previousKnowledgeDir === undefined) delete process.env.DRONE_KNOWLEDGE_DIR;
		else process.env.DRONE_KNOWLEDGE_DIR = previousKnowledgeDir;
	}
} finally {
	await rm(smokeRoot, { recursive: true, force: true });
}
