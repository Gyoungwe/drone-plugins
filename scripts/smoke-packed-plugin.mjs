import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { validatePackageManifest } from "./check-manifests.mjs";
import { installPackedPlugins } from "./packed-plugins.mjs";
import { pluginApiName } from "./prepare-plugin-api.mjs";

const root = resolve(import.meta.dirname, "..");
const run = promisify(execFile);
const piPeer = "@earendil-works/pi-coding-agent";

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

async function releaseWorkspace(slug, version) {
	if (!/^[a-z][a-z0-9-]*$/u.test(slug) || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(version))
		throw new Error("A single workspace slug and exact stable expected_version are required");
	const directory = join(root, "packages", slug);
	const pkg = await readJson(join(directory, "package.json"));
	if (pkg.name !== `@gyoungwe/${slug}` || pkg.version !== version)
		throw new Error(`Expected @gyoungwe/${slug}@${version}, found ${pkg.name}@${pkg.version}`);
	const manifest = await readJson(join(directory, "plugin.manifest.json"));
	if (manifest.version !== version) throw new Error("plugin.manifest.json must match expected_version");
	return { pkg, id: manifest.id, filename: `gyoungwe-${slug}-${version}.tgz` };
}

async function verifyNpmPack({ pkg, filename }, directory, metadataPath) {
	const packed = await readJson(metadataPath);
	const [archive] = packed;
	if (
		packed.length !== 1 ||
		archive.name !== pkg.name ||
		archive.version !== pkg.version ||
		archive.filename !== filename
	)
		throw new Error(`npm pack must produce exactly ${filename}`);
	const tarball = resolve(directory, filename);
	const bytes = await readFile(tarball);
	const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
	if (archive.integrity !== integrity) throw new Error(`${filename} does not match npm pack integrity`);
	return { tarball, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function checkInstalledPlugin(directory, name, version, api, expectedId) {
	const pkg = await readJson(join(directory, "package.json"));
	const manifest = await readJson(join(directory, "plugin.manifest.json"));
	if (pkg.name !== name || pkg.version !== version || (expectedId && manifest.id !== expectedId))
		throw new Error(`Packed plugin identity does not match ${name}@${version}`);
	if (pkg.peerDependencies?.[piPeer] !== ">=1.1.0 <2.0.0") throw new Error(`${name} has an invalid Pi peer`);
	const failures = validatePackageManifest(pkg, manifest, directory, api.spec);
	if (failures.length) throw new Error(failures.join("\n"));
	if (manifest.entrypoints.ui) {
		const uiPath = join(directory, manifest.entrypoints.ui);
		const ui = await readJson(uiPath);
		if (ui.version !== version || typeof ui.main !== "string" || ui.main.includes(".."))
			throw new Error(`${name} has an invalid UI manifest`);
		if (!(await stat(join(dirname(uiPath), ui.main))).isFile())
			throw new Error(`${name} is missing its UI entry`);
	}
	return pkg;
}

async function smokePiCli(directory, prefix) {
	const env = {
		PATH: process.env.PATH,
		HOME: prefix,
		PI_CODING_AGENT_DIR: join(prefix, "agent"),
		DRONE_KNOWLEDGE_DIR: join(prefix, "knowledge"),
		PI_SKIP_VERSION_CHECK: "1",
		NO_COLOR: "1",
	};
	for (const command of ["/task-status", "/drone-doctor", "/drone-example"]) {
		const invocation = run(
			join(root, "node_modules/.bin/pi"),
			["--no-extensions", "-e", directory, "-p", "--no-session", command],
			{ cwd: prefix, env, timeout: 30_000 },
		);
		invocation.child.stdin.end();
		const { stdout, stderr } = await invocation;
		if (/conflicts?/iu.test(stderr)) throw new Error(`Pi reported an extension conflict: ${stderr}`);
		console.log(`${command}\n${stdout.trim()}`);
	}
}

async function smokePackedPlugin(workspace, directory, metadata) {
	const { tarball, sha256 } = await verifyNpmPack(workspace, directory, metadata);
	const prefix = await mkdtemp(join(tmpdir(), "drone-release-smoke-"));
	try {
		const api = await installPackedPlugins(join(prefix, "install"), [tarball]);
		const { name, version } = workspace.pkg;
		const installed = join(prefix, "install/node_modules", name);
		const pkg = await checkInstalledPlugin(installed, name, version, api, workspace.id);
		for (const bundled of pkg.bundleDependencies ?? []) {
			if (bundled !== pluginApiName)
				await checkInstalledPlugin(
					join(installed, "node_modules", bundled),
					bundled,
					pkg.dependencies[bundled],
					api,
				);
		}
		const { stdout } = await run(process.execPath, [
			join(root, "scripts/check-pi-package-format.mjs"),
			installed,
			"--configure-dir-env=DRONE_KNOWLEDGE_DIR",
		]);
		console.log(stdout.trim());
		if (name === "@gyoungwe/research-suite") await smokePiCli(installed, prefix);
		console.log(JSON.stringify({ package: name, version, sha256, pluginApiSha256: api.sha256 }));
	} finally {
		await rm(prefix, { recursive: true, force: true });
	}
}

const [mode, slug, version, directory, metadata, ...extra] = process.argv.slice(2);
if (mode === "--preflight" && slug && version && !directory) {
	const { pkg } = await releaseWorkspace(slug, version);
	if (pkg.private === true) throw new Error(`${pkg.name} is marked private in package.json`);
} else if (mode === "--packed" && slug && version && directory && metadata && !extra.length) {
	await smokePackedPlugin(await releaseWorkspace(slug, version), directory, metadata);
} else {
	throw new Error(
		"Usage: --preflight <slug> <version> or --packed <slug> <version> <archive-dir> <pack-json>",
	);
}
