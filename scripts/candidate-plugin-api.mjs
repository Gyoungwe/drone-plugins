import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

/** Explicit private-acceptance input; never written into publishable dependencies. */
export async function candidatePluginApi() {
	const supplied = process.env.DRONE_PLUGIN_API_TARBALL;
	assert(supplied, "Candidate UI v2 needs DRONE_PLUGIN_API_TARBALL pointing to the verified private Plugin API 1.3 tarball");
	const path = resolve(supplied);
	const { stdout } = await promisify(execFile)("tar", ["-xOf", path, "package/package.json"]);
	const metadata = JSON.parse(stdout);
	assert.equal(metadata.name, "@gyoungwe/plugin-api");
	assert.equal(metadata.version, "1.3.0");
	for (const entry of ["./runtime", "./native", "./resource"]) assert(metadata.exports[entry], `Candidate API is missing ${entry}`);
	return { path, version: metadata.version, sha256: createHash("sha256").update(await readFile(path)).digest("hex") };
}
