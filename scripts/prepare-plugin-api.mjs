import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { isMainModule } from "./is-main-module.mjs";

const run = promisify(execFile);
export const pluginApiName = "@gyoungwe/plugin-api";
const workspace = resolve(import.meta.dirname, "..");
const sha256Pattern = /^[a-f0-9]{64}$/u;
const releaseUrl =
	/^https:\/\/github\.com\/Gyoungwe\/Drone\/releases\/download\/plugin-api-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\/(gyoungwe-plugin-api-\1\.tgz)$/u;
const sriPattern = /^sha512-[A-Za-z0-9+/]{86}==$/u;
const requiredExports = [".", "./runtime", "./native", "./resource", "./ui"];

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

function requireLocalWorktree(env) {
	if (env.CI !== undefined || env.GITHUB_ACTIONS !== undefined || env.DRONE_PLUGIN_API_RELEASE !== undefined)
		throw new Error("Plugin API worktree override is disabled in CI and release jobs");
}

function pinFromManifest(pkg, env) {
	const spec = pkg.devDependencies?.[pluginApiName];
	const sha256 = pkg.dronePluginApiSha256;
	if (pkg.private !== true || typeof sha256 !== "string" || !sha256Pattern.test(sha256))
		throw new Error("The private workspace must commit a Plugin API SHA-256");
	if (env.DRONE_PLUGIN_API_WORKTREE === "1") {
		requireLocalWorktree(env);
		const path = env.DRONE_PLUGIN_API_TARBALL;
		const matched = /^gyoungwe-plugin-api-(\d+\.\d+\.\d+)\.tgz$/u.exec(basename(path ?? ""));
		if (matched && isAbsolute(path) && spec === `file:${path}`)
			return { spec, version: matched[1], filename: matched[0], sha256, worktree: true };
		throw new Error("The disposable worktree must pin its verified Plugin API tarball");
	}
	const matched = releaseUrl.exec(spec);
	if (!matched) throw new Error("Expected an exact Drone Plugin API Release URL and filename");
	return { spec, version: matched[1], filename: matched[2], sha256 };
}

function pluginApiLockEntries(packages) {
	return Object.entries(packages).filter(
		([location, entry]) =>
			entry.name === pluginApiName ||
			location.endsWith(`/node_modules/${pluginApiName}`) ||
			location === `node_modules/${pluginApiName}`,
	);
}

export async function readPluginApiPin(root = workspace, env = process.env) {
	const pin = pinFromManifest(await readJson(join(root, "package.json")), env);
	const lock = await readJson(join(root, "package-lock.json"));
	const packages = lock.packages;
	const integrity = packages?.[`node_modules/${pluginApiName}`]?.integrity;
	if (lock.lockfileVersion !== 3 || packages?.[""]?.devDependencies?.[pluginApiName] !== pin.spec)
		throw new Error("Plugin API root lock is stale");
	for (const [location, entry] of Object.entries(packages)) {
		if (!/^packages\/[^/]+$/u.test(location)) continue;
		const pkg = await readJson(join(root, location, "package.json"));
		for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
			const spec = pkg[field]?.[pluginApiName];
			if (
				spec !== entry[field]?.[pluginApiName] ||
				(field !== "peerDependencies" && spec !== undefined && spec !== pin.spec)
			)
				throw new Error(`Plugin API workspace lock is stale: ${location} ${field}`);
		}
	}
	if (!sriPattern.test(integrity)) throw new Error("Plugin API lockfile is missing a SHA-512 SRI");
	const expectedResolution = pin.worktree ? resolve(pin.spec.slice(5)) : pin.spec;
	for (const [location, entry] of pluginApiLockEntries(packages)) {
		if (entry.inBundle && location !== `node_modules/${pluginApiName}` && entry.version === pin.version)
			continue;
		const resolved =
			pin.worktree && entry.resolved?.startsWith("file:")
				? resolve(root, entry.resolved.slice(5))
				: entry.resolved;
		if (
			entry.link ||
			entry.version !== pin.version ||
			resolved !== expectedResolution ||
			entry.integrity !== integrity
		)
			throw new Error(`Plugin API lock entry is stale: ${location}`);
	}
	return { ...pin, integrity };
}

async function npmCache(root, env) {
	const { stdout } = await run("npm", ["config", "get", "cache"], { cwd: root, env });
	return resolve(root, stdout.trim());
}

async function readSuppliedArchive(path) {
	if (!path || !isAbsolute(path))
		throw new Error("DRONE_PLUGIN_API_TARBALL must point to an absolute tarball path");
	if (!(await lstat(path)).isFile()) throw new Error("DRONE_PLUGIN_API_TARBALL must be a regular file");
	return readFile(path);
}

async function download(url, fetchAsset) {
	const response = await fetchAsset(url, { signal: AbortSignal.timeout(45_000) });
	if (!response.ok) throw new Error(`Plugin API download failed (${response.status}): ${url}`);
	if (response.url && !response.url.startsWith("https://")) throw new Error(`Non-HTTPS redirect: ${url}`);
	return Buffer.from(await response.arrayBuffer());
}

async function downloadRelease(pin, fetchAsset) {
	const checksum = await download(new URL("SHA256SUMS", pin.spec).href, fetchAsset);
	const match = /^([a-f0-9]{64}) {2}([^\r\n]+)\n$/u.exec(checksum.toString("utf8"));
	if (match?.[2] !== pin.filename)
		throw new Error("SHA256SUMS must identify the exact Release asset filename");
	if (match[1] !== pin.sha256) throw new Error("SHA256SUMS differs from the committed SHA-256");
	return download(pin.spec, fetchAsset);
}

function cachePath(cache, pin) {
	return join(cache, "drone-plugin-api", pin.sha256, pin.filename);
}

async function cachedArchive(path) {
	try {
		return await readSuppliedArchive(path);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		return undefined;
	}
}

async function verifyArchiveIdentity(path, version) {
	const { stdout } = await run("tar", ["-xOf", path, "package/package.json"]);
	const pkg = JSON.parse(stdout);
	if (pkg.name !== pluginApiName || pkg.version !== version)
		throw new Error(`Expected ${pluginApiName}@${version} inside the archive`);
	const { stdout: listing } = await run("tar", ["-tzf", path]);
	const files = new Set(listing.trimEnd().split("\n"));
	for (const entry of requiredExports) {
		const target = pkg.exports?.[entry];
		const paths = typeof target === "string" ? [target] : [target?.types, target?.import];
		if (paths.some((path) => !path?.startsWith("./") || !files.has(`package/${path.slice(2)}`)))
			throw new Error(`Plugin API archive is missing export ${entry}`);
	}
}

async function stageApiArchive(bytes, pin, cache) {
	if (!sha256Pattern.test(pin.sha256) || createHash("sha256").update(bytes).digest("hex") !== pin.sha256)
		throw new Error("Plugin API archive SHA-256 differs from the expected digest");
	const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
	if (pin.integrity && integrity !== pin.integrity)
		throw new Error("Plugin API archive SHA-512 differs from the lockfile SRI");
	const path = cachePath(cache, pin);
	const directory = join(path, "..");
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const staging = await mkdtemp(join(directory, ".stage-"));
	const staged = join(staging, pin.filename);
	try {
		await writeFile(staged, bytes, { mode: 0o600 });
		await verifyArchiveIdentity(staged, pin.version);
		await rename(staged, path);
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
	return { ...pin, path, integrity };
}

export async function preparePluginApi({
	root = workspace,
	env = process.env,
	cache,
	offline = false,
	fresh = false,
	fetchAsset = fetch,
} = {}) {
	const pin = await readPluginApiPin(root, env);
	const cacheRoot = cache ?? (await npmCache(root, env));
	const input = env.DRONE_PLUGIN_API_TARBALL;
	const local = offline || input !== undefined;
	const cached = local || fresh ? undefined : await cachedArchive(cachePath(cacheRoot, pin));
	const bytes = local
		? await readSuppliedArchive(input)
		: (cached ?? (await downloadRelease(pin, fetchAsset)));
	const pluginApi = await stageApiArchive(bytes, pin, cacheRoot);
	await run("npm", ["cache", "add", pluginApi.path, "--cache", cacheRoot, "--ignore-scripts"], {
		cwd: root,
		env,
	});
	const source = pin.worktree ? "worktree" : local ? "offline-tarball" : cached ? "digest-cache" : pin.spec;
	return { ...pluginApi, source, cache: cacheRoot };
}

async function runCommand(command, args, options) {
	return new Promise((complete, reject) => {
		const child = spawn(command, args, { ...options, stdio: "inherit" });
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (code === 0) complete();
			else reject(new Error(`${command} exited with ${signal ?? code}`));
		});
	});
}

async function copyWorktree(root, target, env) {
	const options = { cwd: root, env, maxBuffer: 8 * 1024 * 1024 };
	const [files, deleted] = await Promise.all([
		run("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--deduplicate"], options),
		run("git", ["ls-files", "-z", "--deleted"], options),
	]);
	const removed = new Set(deleted.stdout.split("\0"));
	const paths = files.stdout.split("\0").filter((path) => !removed.has(path));
	for (const path of paths) {
		const destination = join(target, path);
		await mkdir(dirname(destination), { recursive: true });
		await cp(join(root, path), destination, { verbatimSymlinks: true });
	}
	return paths.filter((path) => /^packages\/[^/]+\/package\.json$/u.test(path));
}

async function pinLocalArchive(target, manifests, release, candidate) {
	for (const manifest of ["package.json", ...manifests]) {
		const path = join(target, manifest);
		const pkg = await readJson(path);
		if (manifest === "package.json") {
			pkg.devDependencies[pluginApiName] = `file:${candidate.path}`;
			pkg.dronePluginApiSha256 = candidate.sha256;
		} else if (pkg.dependencies?.[pluginApiName] === release.spec) {
			pkg.dependencies[pluginApiName] = `file:${candidate.path}`;
		}
		await writeFile(path, `${JSON.stringify(pkg, null, "\t")}\n`);
	}
}

async function runPluginApiWorktree({ root, env, sha256, command, commandArgs }) {
	const release = await readPluginApiPin(root, env);
	const cache = await npmCache(root, env);
	const bytes = await readSuppliedArchive(env.DRONE_PLUGIN_API_TARBALL);
	const { filename, version } = release;
	const candidate = await stageApiArchive(bytes, { filename, version, sha256 }, cache);
	const target = await mkdtemp(join(tmpdir(), "drone-plugin-api-worktree-"));
	try {
		const manifests = await copyWorktree(root, target, env);
		const gitOptions = { cwd: target, env };
		await run("git", ["init", "--quiet", "--template="], gitOptions);
		await run("git", ["add", "."], gitOptions);
		await pinLocalArchive(target, manifests, release, candidate);
		const childEnv = {
			...env,
			DRONE_PLUGIN_API_TARBALL: candidate.path,
			DRONE_PLUGIN_API_WORKTREE: "1",
			npm_config_cache: cache,
		};
		const options = { cwd: target, env: childEnv };
		const npmFlags = ["--ignore-scripts", "--no-audit", "--no-fund"];
		await runCommand("npm", ["install", "--package-lock-only", ...npmFlags], options);
		await preparePluginApi({ root: target, env: childEnv, cache, offline: true });
		await runCommand("npm", ["ci", ...npmFlags], options);
		console.log(JSON.stringify({ source: "worktree", version, sha256, workspace: target }));
		await runCommand(command, commandArgs, options);
	} finally {
		await rm(target, { recursive: true, force: true });
	}
}

async function main(args, env) {
	const separator = args.indexOf("--");
	const options = separator === -1 ? args : args.slice(0, separator);
	const [command, ...commandArgs] = separator === -1 ? [] : args.slice(separator + 1);
	if (options[0] === "--worktree") {
		requireLocalWorktree(env);
		if (options.length !== 3 || options[1] !== "--sha256" || !sha256Pattern.test(options[2]) || !command)
			throw new Error("Usage: --worktree --sha256 <hex> -- <command> [args]");
		await runPluginApiWorktree({ root: workspace, env, sha256: options[2], command, commandArgs });
		return;
	}
	if (
		(options.length && (options.length !== 1 || options[0] !== "--offline")) ||
		(separator !== -1 && !command)
	)
		throw new Error("Usage: node scripts/prepare-plugin-api.mjs [--offline] [-- <command> [args]]");
	const { path, version, sha256, source, cache } = await preparePluginApi({
		env,
		offline: options[0] === "--offline",
		fresh: true,
	});
	console.log(JSON.stringify({ path, version, sha256, source }));
	if (command)
		await runCommand(command, commandArgs, { cwd: workspace, env: { ...env, npm_config_cache: cache } });
}

if (isMainModule(import.meta.url)) {
	try {
		await main(process.argv.slice(2), process.env);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
