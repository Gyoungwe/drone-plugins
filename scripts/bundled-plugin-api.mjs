import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { pluginApiName, preparePluginApi } from "./prepare-plugin-api.mjs";

const run = promisify(execFile);

function bundledApiDirectory(packageRoot) {
	return join(packageRoot, "node_modules", pluginApiName);
}

async function matchesArchive(directory, extracted) {
	try {
		if (!(await lstat(directory)).isDirectory()) return false;
		await run("diff", ["-qr", directory, extracted]);
		return true;
	} catch (error) {
		if (error.syscall === "lstat" && error.code === "ENOENT") return false;
		if (error.code === 1) return false;
		throw error;
	}
}

async function extractArchive(api, staging) {
	await run("tar", ["-xzf", api.path, "--strip-components=1", "-C", staging]);
}

export async function stageBundledPluginApi(packageRoot) {
	const api = await preparePluginApi();
	const directory = bundledApiDirectory(packageRoot);
	await mkdir(dirname(directory), { recursive: true });
	const staging = await mkdtemp(join(dirname(directory), ".plugin-api-"));
	try {
		await extractArchive(api, staging);
		if (!(await matchesArchive(directory, staging))) {
			await rm(directory, { recursive: true, force: true });
			await rename(staging, directory);
		}
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
	return api;
}

export async function verifyBundledPluginApi(packageRoot, api) {
	const staging = await mkdtemp(join(tmpdir(), "verify-bundled-plugin-api-"));
	try {
		await extractArchive(api, staging);
		if (!(await matchesArchive(bundledApiDirectory(packageRoot), staging)))
			throw new Error(`${packageRoot} does not bundle the verified Plugin API ${api.version} files`);
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
}

export function matchesPluginApiDependency(pkg, spec) {
	const runtime = pkg.dependencies?.[pluginApiName];
	const peer = pkg.peerDependencies?.[pluginApiName];
	const bundled = pkg.bundleDependencies?.includes(pluginApiName);
	if (pkg.name === "@gyoungwe/pi-research")
		return (
			runtime === undefined &&
			peer === ">=2.0.0 <3.0.0" &&
			!bundled &&
			pkg.peerDependenciesMeta?.[pluginApiName]?.optional === true
		);
	return runtime === spec && peer === undefined && bundled;
}
