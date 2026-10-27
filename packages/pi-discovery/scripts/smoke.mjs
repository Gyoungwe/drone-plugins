#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "pi-discovery-smoke-"));
try {
	const packed = JSON.parse((await exec("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", root], { cwd: fileURLToPath(new URL("..", import.meta.url)), maxBuffer: 4 * 1024 * 1024 })).stdout)[0];
	assert.match(packed.filename, /\.tgz$/u);
	console.log(JSON.stringify({ package: "@gyoungwe/pi-discovery", tarball: packed.filename, readOnly: true }));
} finally {
	await rm(root, { recursive: true, force: true });
}
