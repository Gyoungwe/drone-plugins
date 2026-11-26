import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { preparePluginApi } from "./prepare-plugin-api.mjs";

const run = promisify(execFile);
const name = "@gyoungwe/plugin-api";
const version = "2.0.0";
const asset = `gyoungwe-plugin-api-${version}.tgz`;
const url = `https://github.com/Gyoungwe/Drone/releases/download/plugin-api-v${version}/${asset}`;
const sumsUrl = new URL("SHA256SUMS", url).href;
const testEnv = { PATH: process.env.PATH };

const sha256Of = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJson = (path, value) => writeFile(path, JSON.stringify(value));

async function fixture(context) {
	const root = await mkdtemp(join(tmpdir(), "prepare-plugin-api-test-"));
	context.after(() => rm(root, { recursive: true, force: true }));
	const cache = join(root, "cache");
	const path = join(root, asset);
	await mkdir(join(root, "package"));
	const exports = Object.fromEntries(
		[".", "./runtime", "./native", "./resource", "./ui"].map((entry) => [entry, "./index.js"]),
	);
	await writeJson(join(root, "package/package.json"), { name, version, exports });
	await writeFile(join(root, "package/index.js"), "export {};\n");
	await run("tar", ["-czf", path, "-C", root, "package"]);
	const bytes = await readFile(path);
	const sha256 = sha256Of(bytes);
	const pkg = {
		name: "consumer",
		private: true,
		devDependencies: { [name]: url },
		dronePluginApiSha256: sha256,
	};
	const lock = {
		name: pkg.name,
		lockfileVersion: 3,
		packages: {
			"": { name: pkg.name, devDependencies: { ...pkg.devDependencies } },
			[`node_modules/${name}`]: {
				version,
				resolved: url,
				integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
				dev: true,
			},
		},
	};
	const save = () =>
		Promise.all([
			writeJson(join(root, "package.json"), pkg),
			writeJson(join(root, "package-lock.json"), lock),
		]);
	await save();
	return { root, path, cache, bytes, sha256, pkg, lock, save };
}

function releaseFetch(tarball, sums) {
	return async (requested) => {
		assert([url, sumsUrl].includes(requested));
		return new Response(requested === url ? tarball : sums);
	};
}

test("prepares the exact GitHub Release archive and its checksum", async (context) => {
	const { root, cache, bytes, sha256 } = await fixture(context);
	const api = await preparePluginApi({
		root,
		cache,
		env: testEnv,
		fetchAsset: releaseFetch(bytes, `${sha256}  ${asset}\n`),
	});
	assert.equal(api.source, url);
	assert.equal(api.version, version);
	assert.equal(api.sha256, sha256);
	assert.deepEqual(await readFile(api.path), bytes);
});

test("rejects a substituted archive even if its release checksum changes too", async (context) => {
	const { root, cache } = await fixture(context);
	const swapped = Buffer.from("substituted");
	await assert.rejects(
		preparePluginApi({
			root,
			cache,
			env: {},
			fetchAsset: releaseFetch(swapped, `${sha256Of(swapped)}  ${asset}\n`),
		}),
		/SHA256SUMS.*committed SHA-256/u,
	);
});

test("rejects checksum files naming a different asset and bytes with the wrong SHA-256", async (context) => {
	const { root, cache, bytes, sha256 } = await fixture(context);
	for (const [fetchAsset, expected] of [
		[releaseFetch(bytes, `${sha256}  other.tgz\n`), /SHA256SUMS.*filename/u],
		[releaseFetch("different archive", `${sha256}  ${asset}\n`), /archive SHA-256/u],
	]) {
		await assert.rejects(preparePluginApi({ root, cache, env: {}, fetchAsset }), expected);
	}
});

test("rejects URLs outside the exact versioned GitHub Release asset", async (context) => {
	const { root, cache, pkg, save } = await fixture(context);
	for (const invalid of [
		url.replace("github.com/", "example.com/"),
		url.replace(asset, "other.tgz"),
		`${url}?download=1`,
	]) {
		pkg.devDependencies[name] = invalid;
		await save();
		await assert.rejects(preparePluginApi({ root, cache, env: {} }), /Plugin API Release URL/u);
	}
});

test("rejects stale root, resolved, and nested version entries in the lock", async (context) => {
	const { root, cache, lock, save } = await fixture(context);
	lock.packages[""].devDependencies[name] = "^2.0.0";
	await save();
	await assert.rejects(preparePluginApi({ root, cache, env: {} }), /root lock.*stale/u);
	lock.packages[""].devDependencies[name] = url;
	const entry = lock.packages[`node_modules/${name}`];
	entry.resolved = "https://registry.npmjs.org/plugin-api.tgz";
	await save();
	await assert.rejects(preparePluginApi({ root, cache, env: {} }), /lock entry.*stale/u);
	entry.resolved = url;
	lock.packages[`node_modules/other/node_modules/${name}`] = { ...entry, version: "2.1.0" };
	await save();
	await assert.rejects(preparePluginApi({ root, cache, env: {} }), /lock entry.*stale/u);
});

test("rejects an archive whose SHA-256 matches but lockfile SRI differs", async (context) => {
	const { root, cache, path, lock, save } = await fixture(context);
	lock.packages[`node_modules/${name}`].integrity = `sha512-${Buffer.alloc(64).toString("base64")}`;
	await save();
	await assert.rejects(
		preparePluginApi({ root, cache, env: { DRONE_PLUGIN_API_TARBALL: path }, offline: true }),
		/SHA-512.*lockfile/u,
	);
});

test("a verified offline tarball seeds an otherwise empty npm cache for an offline npm ci", async (context) => {
	const { root, cache, path, bytes, sha256 } = await fixture(context);
	const env = { ...testEnv, DRONE_PLUGIN_API_TARBALL: path };
	const fetchAsset = () => assert.fail("offline mode called fetch");
	const install = () =>
		run("npm", ["ci", "--cache", cache, "--offline", "--ignore-scripts", "--no-audit"], { cwd: root });
	await assert.rejects(install(), /ENOTCACHED/u);
	await assert.rejects(
		preparePluginApi({ root, cache, env: {}, offline: true, fetchAsset }),
		/absolute tarball/u,
	);
	const api = await preparePluginApi({ root, cache, env, offline: true, fetchAsset });
	assert.equal(api.source, "offline-tarball");
	assert.equal(api.sha256, sha256);
	assert.deepEqual(await readFile(api.path), bytes);
	await install();
	assert.equal(JSON.parse(await readFile(join(root, "node_modules", name, "package.json"))).version, version);
});

test("the worktree override is rejected before archive access in CI and releases", async () => {
	const script = join(import.meta.dirname, "prepare-plugin-api.mjs");
	for (const flag of ["CI", "DRONE_PLUGIN_API_RELEASE"]) {
		await assert.rejects(
			run(process.execPath, [script, "--worktree", "--sha256", "f".repeat(64), "--", "npm", "run", "check"], {
				env: { ...process.env, [flag]: "1", DRONE_PLUGIN_API_TARBALL: "/missing.tgz" },
			}),
			/worktree override.*CI.*release/u,
		);
	}
});

test("the local worktree override re-locks different bytes without editing the source workspace", async (context) => {
	const { root, cache, sha256 } = await fixture(context);
	const originalLock = await readFile(join(root, "package-lock.json"));
	const candidate = join(root, "unpublished.tgz");
	await writeFile(join(root, "package/index.js"), "export const local = true;\n");
	await run("tar", ["-czf", candidate, "-C", root, "package"]);
	const candidateSha = sha256Of(await readFile(candidate));
	assert.notEqual(candidateSha, sha256);
	await mkdir(join(root, "scripts"));
	for (const file of ["prepare-plugin-api.mjs", "is-main-module.mjs"]) {
		await copyFile(join(import.meta.dirname, file), join(root, "scripts", file));
	}
	await writeFile(join(root, ".gitignore"), "/cache/\n");
	await run("git", ["init", "--quiet", "--template="], { cwd: root });
	const { stdout } = await run(
		process.execPath,
		[
			"scripts/prepare-plugin-api.mjs",
			"--worktree",
			"--sha256",
			candidateSha,
			"--",
			process.execPath,
			"--input-type=module",
			"-e",
			`import { local } from '${name}'; if (!local) throw new Error('Expected the local package');`,
		],
		{ cwd: root, env: { ...testEnv, npm_config_cache: cache, DRONE_PLUGIN_API_TARBALL: candidate } },
	);
	assert(stdout.includes(`"sha256":"${candidateSha}"`));
	assert.deepEqual(await readFile(join(root, "package-lock.json")), originalLock);
});
