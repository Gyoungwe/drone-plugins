import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const smokeRoot = await mkdtemp(join(tmpdir(), "drone-desktop-ui-pack-"));
try {
	const packed = JSON.parse(
		(await execFileAsync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", smokeRoot], { cwd: root })).stdout,
	)[0];
	const tarball = join(smokeRoot, packed.filename);
	const list = (await execFileAsync("tar", ["-tzf", tarball])).stdout;
	for (const entry of ["package/ui/plugin.json", "package/ui/src/index.ts", "package/plugin.manifest.json"]) {
		if (!list.split("\n").includes(entry)) throw new Error(`tarball is missing ${entry}`);
	}
	const manifest = JSON.parse(await readFile(join(root, "ui/plugin.json"), "utf8"));
	console.log(JSON.stringify({ package: "@gyoungwe/desktop-ui-pack", uiPlugin: manifest.name, tarball: packed.filename, clean: true }));
} finally {
	await rm(smokeRoot, { recursive: true, force: true });
}
