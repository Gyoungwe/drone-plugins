import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { matchesPluginApiDependency, verifyBundledPluginApi } from "./bundled-plugin-api.mjs";
import { pluginApiName, preparePluginApi } from "./prepare-plugin-api.mjs";

const run = promisify(execFile);
const maxBuffer = 16 * 1024 * 1024;
export const blockInternalRegistry = "--@gyoungwe:registry=http://127.0.0.1:9/";

export async function inspectPackedPlugin(tarball, api) {
	const [metadata, archive] = await Promise.all([
		run("tar", ["-xOf", tarball, "package/package.json"], { maxBuffer }),
		run("tar", ["-tzf", tarball], { maxBuffer }),
	]);
	const pkg = JSON.parse(metadata.stdout);
	const files = archive.stdout.trimEnd().split("\n");
	if (!matchesPluginApiDependency(pkg, api.spec))
		throw new Error(`${tarball} has an invalid Plugin API dependency`);
	if (
		pkg.dependencies?.[pluginApiName] &&
		!files.includes(`package/node_modules/${pluginApiName}/package.json`)
	)
		throw new Error(`${tarball} is missing its bundled Plugin API`);
	if (files.some((path) => /\/node_modules\/@earendil-works\/(?:pi-|chord\/)/u.test(path)))
		throw new Error(`${tarball} bundles part of the Pi runtime`);
	return pkg;
}

export async function installPackedPlugins(prefix, tarballs) {
	const api = await preparePluginApi();
	const packages = await Promise.all(tarballs.map((tarball) => inspectPackedPlugin(tarball, api)));
	await run(
		"npm",
		[
			"install",
			"--prefix",
			prefix,
			"--ignore-scripts",
			"--legacy-peer-deps",
			"--no-audit",
			"--no-fund",
			"--fetch-retries=0",
			blockInternalRegistry,
			...tarballs,
		],
		{ maxBuffer },
	);
	for (const pkg of packages) {
		if (pkg.dependencies?.[pluginApiName])
			await verifyBundledPluginApi(join(prefix, "node_modules", pkg.name), api);
	}
	return api;
}
