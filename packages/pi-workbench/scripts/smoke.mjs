#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const temp = join(tmpdir(), `drone-pi-workbench-smoke-${process.pid}`);
const install = join(temp, "install");
await mkdir(install, { recursive: true });
try {
	const packed = JSON.parse((await execFileAsync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temp], { cwd: root })).stdout.trim())[0];
	const tarball = join(temp, packed.filename);
	await execFileAsync("npm", ["install", "--prefix", install, "--ignore-scripts", "--omit=peer", "--no-audit", "--no-fund", tarball], { cwd: root });
	const pkg = JSON.parse(await readFile(join(install, "node_modules/@gyoungwe/pi-workbench/package.json"), "utf8"));
	const mod = await import(`file://${join(install, "node_modules/@gyoungwe/pi-workbench", pkg.pi.extensions[0])}`);
	const tools = new Map();
	const registered = mod.default({ registerTool(tool) { tools.set(tool.name, tool); } });
	assert.equal(tools.size, 4);
	const plan = (await tools.get("workbench_plan").execute("smoke", { items: ["Smoke task"] })).details;
	assert.equal(plan.tasks.length, 1);
	console.log(JSON.stringify({ package: pkg.name, version: pkg.version, tools: [...tools.keys()], installed: true, scoped: true }));
} finally {
	await rm(temp, { recursive: true, force: true });
}
