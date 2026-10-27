import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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
const workspace = resolve(packageRoot, "../..");
const root = mkdtempSync(join(tmpdir(), "suite-pdf-install-"));
const home = join(root, "home");
mkdirSync(home);
writeFileSync(join(home, ".npmrc"), "registry=https://registry.npmjs.org\n");
const env = {
	PATH: process.env.PATH,
	HOME: home,
	TMPDIR: tmpdir(),
	npm_config_userconfig: join(home, ".npmrc"),
	npm_config_globalconfig: join(home, "global.npmrc"),
};
const run = (command, args, cwd = root) =>
	execFileSync(command, args, {
		cwd,
		env,
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024,
	});
try {
	const packed = JSON.parse(
		run(
			"npm",
			["pack", "--json", "--ignore-scripts", "--pack-destination", root],
			packageRoot,
		),
	)[0];
	const { overrides } = JSON.parse(
		readFileSync(join(workspace, "package.json"), "utf8"),
	);
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({
			private: true,
			type: "module",
			dependencies: {
				"@gyoungwe/research-suite": `file:${join(root, packed.filename)}`,
				"@earendil-works/pi-coding-agent": "1.1.0",
			},
			overrides,
		}),
	);
	run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
	copyFileSync(
		join(import.meta.dirname, "pdf-probe.mjs"),
		join(root, "probe.mjs"),
	);
	const probe = spawnSync(process.execPath, ["probe.mjs"], {
		cwd: root,
		env,
		encoding: "utf8",
	});
	assert.ifError(probe.error);
	const output = probe.stdout + probe.stderr;
	assert.equal(probe.status, 0, output);
	assert(
		!/Cannot load.*canvas|Cannot polyfill/.test(output),
		"installed suite must provide the optional PDF runtime on this supported platform",
	);
	console.log(output.trim());
} finally {
	rmSync(root, { recursive: true, force: true });
}
