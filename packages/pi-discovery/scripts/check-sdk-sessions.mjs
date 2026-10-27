#!/usr/bin/env node
// Explicit writer workspaces prevent a hand-authored JSON fixture from silently standing in for the producer.
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

const args = process.argv.slice(2);
assert.equal(
	args[0],
	"--writer-workspaces",
	"Run the host writer→SDK acceptance with three explicit workspaces",
);
const workspaces = args.slice(1, 4).map((value) => resolve(value));
assert.equal(workspaces.length, 3);
const tarballArg = args.indexOf("--tarball");
assert(tarballArg >= 0, "Pass the same tarball used by the actual host writer");
const tarball = resolve(args[tarballArg + 1]);
const root = mkdtempSync(join(tmpdir(), "pi-discovery-sdk-"));
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
function run(command, values, cwd, env) {
	return execFileSync(command, values, {
		cwd,
		env,
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024,
	});
}
try {
	const latest = JSON.parse(
		run(
			"npm",
			["view", "@earendil-works/pi-coding-agent", "dist-tags.latest", "--json"],
			root,
			environment(root),
		),
	);
	const matrix = [];
	for (const [target, version] of [
		["locked", "1.1.0"],
		["latest", latest],
	]) {
		const prefix = join(root, target);
		mkdirSync(prefix);
		const env = environment(prefix);
		const dependencies = Object.fromEntries(
			(target === "locked" ? family : ["pi-coding-agent", "pi-ai"]).map(
				(name) => [`@earendil-works/${name}`, version],
			),
		);
		dependencies["@gyoungwe/pi-discovery"] = `file:${tarball}`;
		writeFileSync(
			join(prefix, "package.json"),
			JSON.stringify({ private: true, type: "module", dependencies }),
		);
		run(
			"npm",
			["install", "--ignore-scripts", "--no-audit", "--no-fund"],
			prefix,
			env,
		);
		copyFileSync(
			join(import.meta.dirname, "sdk-session-probe.mjs"),
			join(prefix, "probe.mjs"),
		);
		const probe = spawnSync(process.execPath, ["probe.mjs", ...workspaces], {
			cwd: prefix,
			env,
			encoding: "utf8",
			timeout: 90_000,
		});
		assert.equal(probe.status, 0, `${probe.stdout}\n${probe.stderr}`);
		const result = JSON.parse(probe.stdout.trim().split("\n").at(-1));
		matrix.push({ target, version, ...result });
	}
	console.log(
		JSON.stringify({
			status: "PASS",
			tarballSha256: createHash("sha256")
				.update(readFileSync(tarball))
				.digest("hex"),
			writer: "host-supplied actual-writer workspaces; see companion host test",
			matrix,
		}),
	);
} finally {
	rmSync(root, { recursive: true, force: true });
}
