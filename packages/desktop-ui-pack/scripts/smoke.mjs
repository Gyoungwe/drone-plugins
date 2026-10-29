import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(join(tmpdir(), "drone-research-status-ui-"));
try {
	const pack = JSON.parse((await run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temp], { cwd: root })).stdout)[0];
	await writeFile(join(temp, "package.json"), '{"name":"research-status-consumer","private":true,"version":"0.0.0"}');
	await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(temp, pack.filename)], { cwd: temp });
	const installed = join(temp, "node_modules/@gyoungwe/desktop-ui-pack");
	const manifest = JSON.parse(await readFile(join(installed, "ui/plugin.json"), "utf8"));
	assert.deepEqual(manifest.contributions.map(entry => entry.region), ["panel.tab"]);
	const loaded = await import(pathToFileURL(join(installed, "ui", manifest.main)));
	assert.deepEqual(Object.keys(loaded), ["ResearchStatusPanel"]);
	console.log(JSON.stringify({ package: "@gyoungwe/desktop-ui-pack", version: manifest.version, cleanInstall: true, exports: Object.keys(loaded), gui: "NOT_RUN" }));
} finally {
	await rm(temp, { recursive: true, force: true });
}
