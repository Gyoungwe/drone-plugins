#!/usr/bin/env node
// Clean-install the packed plugin and exercise real SDK tool execution, never user credentials.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const root = mkdtempSync(join(tmpdir(), "pi-research-sdk-"));
const host = "@earendil-works/pi-coding-agent";
const family = [
	"chord",
	"pi-agent-core",
	"pi-ai",
	"pi-codemode",
	"pi-coding-agent",
	"pi-mcp",
	"pi-telemetry",
	"pi-tui",
];
function environment(dir) {
	const home = join(dir, "home");
	mkdirSync(home, { recursive: true });
	writeFileSync(join(home, ".npmrc"), "registry=https://registry.npmjs.org\n");
	return {
		PATH: process.env.PATH,
		HOME: home,
		TMPDIR: tmpdir(),
		LANG: "en_US.UTF-8",
		PI_CODING_AGENT_DIR: join(home, ".pi/agent"),
		npm_config_userconfig: join(home, ".npmrc"),
		npm_config_globalconfig: join(home, "global.npmrc"),
		npm_config_cache: join(root, "npm-cache"),
	};
}
function run(command, args, cwd, env) {
	return execFileSync(command, args, {
		cwd,
		env,
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024,
	});
}
try {
	const env = environment(root);
	const packed = JSON.parse(
		run(
			"npm",
			["pack", "--json", "--ignore-scripts", "--pack-destination", root],
			packageRoot,
			env,
		),
	)[0];
	assert(
		packed.files.some((file) => file.path === "dist/index.mjs"),
		"build the plugin before SDK acceptance",
	);
	const tarball = join(root, packed.filename);
	const latest = JSON.parse(
		run("npm", ["view", host, "dist-tags.latest", "--json"], root, env),
	);
	const matrix = [];
	for (const [target, version] of [
		["locked", "1.1.0"],
		["latest", latest],
	]) {
		const prefix = join(root, target);
		mkdirSync(prefix);
		const targetEnv = environment(prefix);
		const dependencies = Object.fromEntries(
			(target === "locked" ? family : ["pi-coding-agent", "pi-ai"]).map(
				(name) => [`@earendil-works/${name}`, version],
			),
		);
		dependencies["@gyoungwe/pi-research"] = `file:${tarball}`;
		writeFileSync(
			join(prefix, "package.json"),
			JSON.stringify({ private: true, type: "module", dependencies }),
		);
		run(
			"npm",
			["install", "--ignore-scripts", "--no-audit", "--no-fund"],
			prefix,
			targetEnv,
		);
		const installed = JSON.parse(
			readFileSync(join(prefix, "node_modules", host, "package.json"), "utf8"),
		).version;
		assert.equal(installed, version);
		copyFileSync(
			join(import.meta.dirname, "sdk-session-probe.mjs"),
			join(prefix, "probe.mjs"),
		);
		const probe = spawnSync(process.execPath, ["probe.mjs"], {
			cwd: prefix,
			env: targetEnv,
			encoding: "utf8",
		});
		assert(probe.stdout.trim(), `SDK probe failed: ${probe.stderr}`);
		const result = JSON.parse(probe.stdout.trim().split("\n").at(-1));
		assert.equal(probe.status, result.status === "PASS" ? 0 : 1, probe.stderr);
		matrix.push({ target, version, ...result });
		console.log(JSON.stringify(matrix.at(-1)));
	}
	const evidence = {
		status: matrix.every((cell) => cell.status === "PASS") ? "PASS" : "FAIL",
		packageVersion: packed.version,
		tarballSha256: createHash("sha256")
			.update(readFileSync(tarball))
			.digest("hex"),
		model:
			"Pi faux provider (deterministic offline model); real AgentSession and tool dispatch; no remote model inference",
		isolation:
			"Fresh HOME, npm config, agent directory and install prefix for each matrix cell; environment allowlist; no user credentials",
		matrix,
	};
	const outIndex = process.argv.indexOf("--out");
	if (outIndex >= 0)
		writeFileSync(
			resolve(process.argv[outIndex + 1]),
			`${JSON.stringify(evidence, null, 2)}\n`,
		);
	console.log(JSON.stringify(evidence));
	if (evidence.status !== "PASS") process.exitCode = 1;
} finally {
	rmSync(root, { recursive: true, force: true });
}
