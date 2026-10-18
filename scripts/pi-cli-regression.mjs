#!/usr/bin/env node

// Exercise the published research suite through Pi's command-line package
// manager. This intentionally starts the real `pi` executable for every
// matrix entry; loading extensions through the SDK would not cover Pi's
// package resolution, module roots, or conflict diagnostics.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const piVersions = (process.env.PI_CLI_VERSIONS ?? "1.1.0,latest")
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);
const timeoutMs = Number.parseInt(process.env.PI_CLI_TIMEOUT_MS ?? "120000", 10);
const positiveSource = process.env.RESEARCH_SUITE_PACKAGE ?? "@gyoungwe/research-suite@0.1.5";
const legacySource = process.env.RESEARCH_SUITE_LEGACY_PACKAGE ?? "@gyoungwe/research-suite@0.1.1";
const evidencePath = process.env.PI_CLI_EVIDENCE;

assert(piVersions.length > 0, "PI_CLI_VERSIONS must contain at least one version");
assert(Number.isSafeInteger(timeoutMs) && timeoutMs > 0, "PI_CLI_TIMEOUT_MS must be a positive integer");

async function run(file, args, options = {}) {
	return await new Promise((resolve) => {
		const child = spawn(file, args, {
			cwd: options.cwd,
			env: options.env,
			// Pi must see EOF on stdin: a real non-interactive CLI regression must
			// never inherit the runner's open pipe and wait for user input.
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		const stdout = [];
		const stderr = [];
		let settled = false;
		let timedOut = false;
		const maxBuffer = options.maxBuffer ?? 16 * 1024 * 1024;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, options.timeout ?? timeoutMs);
		child.stdout.on("data", (chunk) => {
			stdout.push(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr.push(chunk);
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			finish({
				exitCode: 1,
				stdout: Buffer.concat(stdout).subarray(0, maxBuffer).toString("utf8"),
				stderr: Buffer.concat(stderr).subarray(0, maxBuffer).toString("utf8") || String(error.message ?? error),
				timedOut,
			});
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			finish({
				exitCode: timedOut ? 124 : code ?? 1,
				stdout: Buffer.concat(stdout).subarray(0, maxBuffer).toString("utf8"),
				stderr: Buffer.concat(stderr).subarray(0, maxBuffer).toString("utf8"),
				timedOut,
			});
		});
	});
}

function commandEnvironment(home, npmCache) {
	return {
		...process.env,
		HOME: home,
		PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
		NPM_CONFIG_CACHE: npmCache,
		npm_config_cache: npmCache,
		CI: "1",
		NO_COLOR: "1",
		TERM: "dumb",
	};
}

function isConflict(stderr) {
	return /conflicts?/iu.test(stderr);
}

function sourcePath(source) {
	const value = source.startsWith("file:") ? source.slice("file:".length) : source;
	if (isAbsolute(value)) return value;
	if (value.startsWith(".")) return resolve(root, value);
	return undefined;
}

async function packSource(source, tarballRoot, env) {
	const localPath = sourcePath(source);
	if (localPath) {
		if (!existsSync(localPath)) throw new Error(`research-suite tarball does not exist: ${localPath}`);
		const packageJson = await packageMetadataFromTarball(localPath);
		return {
			source,
			tarball: localPath,
			package: {
				name: packageJson.name,
				version: packageJson.version,
				filename: basename(localPath),
			},
		};
	}

	const packageSpec = source.startsWith("npm:") ? source.slice("npm:".length) : source;
	const result = await run(
		npm,
		["pack", packageSpec, "--ignore-scripts", "--json", "--pack-destination", tarballRoot],
		{ cwd: root, env },
	);
	if (result.exitCode !== 0) {
		throw new Error(`npm pack failed for ${source}: ${result.stderr.trim() || result.stdout.trim()}`);
	}

	let metadata;
	try {
		metadata = JSON.parse(result.stdout.trim())[0];
	} catch (error) {
		throw new Error(`npm pack returned invalid metadata for ${source}: ${error.message}`);
	}
	assert(metadata?.filename?.endsWith(".tgz"), `npm pack did not produce a tarball for ${source}`);
	const tarball = join(tarballRoot, basename(metadata.filename));
	if (!existsSync(tarball)) throw new Error(`npm pack output is missing: ${tarball}`);
	return { source, tarball, package: metadata };
}

async function packageMetadataFromTarball(tarball) {
	const result = await run("tar", ["-xOf", tarball, "package/package.json"], { cwd: root });
	if (result.exitCode !== 0) {
		throw new Error(`could not inspect research-suite tarball: ${result.stderr.trim() || result.stdout.trim()}`);
	}
	try {
		return JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`research-suite tarball contains invalid package.json: ${error.message}`);
	}
}

function piInstallSource(source, packageInfo) {
	if (sourcePath(source)) {
		if (!packageInfo?.name || !packageInfo?.version)
			throw new Error("a local research-suite tarball must declare name and version");
		return `npm:${packageInfo.name}@${packageInfo.version}`;
	}
	return source.startsWith("npm:") ? source : `npm:${source}`;
}

async function installPi(version, prefix, env) {
	await mkdir(prefix, { recursive: true });
	const result = await run(
		npm,
		[
			"install",
			"--prefix",
			prefix,
			"--no-save",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--legacy-peer-deps",
			`@earendil-works/pi-coding-agent@${version}`,
		],
		{ cwd: root, env, maxBuffer: 32 * 1024 * 1024 },
	);
	if (result.exitCode !== 0) {
		const detail = result.stderr.trim() || result.stdout.trim();
		throw new Error(
			`Pi ${version} installation failed${result.timedOut ? ` (timed out after ${timeoutMs} ms)` : ""}: ${detail}`,
		);
	}

	const bin = join(prefix, "node_modules", ".bin", process.platform === "win32" ? "pi.cmd" : "pi");
	if (!existsSync(bin)) throw new Error(`Pi ${version} installation did not provide ${bin}`);
	const versionResult = await run(bin, ["--version"], { cwd: root, env });
	if (versionResult.exitCode !== 0) {
		throw new Error(
			`Pi ${version} binary did not start${versionResult.timedOut ? ` (timed out after ${timeoutMs} ms)` : ""}: ${versionResult.stderr.trim()}`,
		);
	}
	return { bin, resolvedVersion: versionResult.stdout.trim() };
}

async function invokePi({ pi, packageSource, runRoot, env, expected }) {
	const install = await run(pi.bin, ["install", packageSource], { cwd: runRoot, env });
	if (install.exitCode !== 0) {
		return {
			phase: "install",
			exitCode: install.exitCode,
			stdout: install.stdout,
			stderr: install.stderr,
			conflicts: isConflict(install.stderr),
			timedOut: install.timedOut,
		};
	}

	// Keep this invocation literal and visible in evidence. It is the actual
	// regression target, rather than a loader-only approximation.
	const requestedCommands = expected === "pass" ? ["/task-status", "/drone-doctor", "/drone-example"] : ["/task-status"];
	const probes = [];
	for (const requested of requestedCommands) {
		const execution = await run(pi.bin, ["-p", "--no-session", requested], { cwd: runRoot, env });
		probes.push({
			command: ["pi", "-p", "--no-session", requested],
			exitCode: execution.exitCode,
			stdout: execution.stdout,
			stderr: execution.stderr,
			conflicts: isConflict(execution.stderr),
			timedOut: execution.timedOut,
		});
	}
	const failedProbe = probes.find((probe) => probe.exitCode !== 0 || probe.conflicts);
	return {
		phase: "run",
		command: probes[0].command,
		commands: probes,
		exitCode: failedProbe?.exitCode ?? 0,
		stdout: probes.map((probe) => `${probe.command.at(-1)}\n${probe.stdout}`).join("\n"),
		stderr: probes.map((probe) => `${probe.command.at(-1)}\n${probe.stderr}`).join("\n"),
		conflicts: probes.some((probe) => probe.conflicts),
		timedOut: probes.some((probe) => probe.timedOut),
	};
}

async function runCase({ label, source, expected }) {
	const caseRoot = await mkdtemp(join(smokeRoot, `${label}-`));
	const result = {
		label,
		source,
		expected,
		status: "NOT_RUN",
		reason: undefined,
		pi: [],
	};

	try {
		// Resolve the package source once. Each Pi version below gets its own
		// HOME, package-manager cache, project directory and binary prefix.
		const packHome = join(caseRoot, "pack-home");
		const packCache = join(caseRoot, "pack-cache");
		await mkdir(packHome, { recursive: true });
		await mkdir(packCache, { recursive: true });
		const packEnv = commandEnvironment(packHome, packCache);
		const packageInfo = await packSource(source, tarballRoot, packEnv);
		result.tarball = packageInfo.tarball;
		result.package = packageInfo.package;
		result.installSource = piInstallSource(source, packageInfo.package);
		for (const version of piVersions) {
			const versionRoot = await mkdtemp(join(caseRoot, `${version.replaceAll(/[^a-z0-9.-]/giu, "-")}-`));
			const home = join(versionRoot, "home");
			const npmCache = join(versionRoot, "npm-cache");
			const runRoot = join(versionRoot, "project");
			const piRoot = join(versionRoot, "pi");
			await mkdir(runRoot, { recursive: true });
			await mkdir(home, { recursive: true });
			await mkdir(npmCache, { recursive: true });
			const env = commandEnvironment(home, npmCache);
			try {
				const pi = await installPi(version, piRoot, env);
				const probe = await invokePi({ pi, packageSource: result.installSource, runRoot, env, expected });
				const failed = probe.exitCode !== 0 || probe.conflicts;
				result.pi.push({ version, resolvedVersion: pi.resolvedVersion, ...probe, failed });
			} catch (error) {
				result.pi.push({ version, status: "NOT_RUN", reason: String(error?.message ?? error), failed: true });
			}
		}

		const failures = result.pi.filter((probe) => probe.failed || probe.status === "NOT_RUN").length;
		const notRun = result.pi.filter((probe) => probe.status === "NOT_RUN");
		if (expected === "pass") {
			if (notRun.length > 0 || result.pi.length !== piVersions.length) {
				result.status = "NOT_RUN";
				result.reason = `one or more Pi versions were NOT_RUN: ${notRun.map((probe) => `${probe.version}: ${probe.reason}`).join("; ")}`;
			} else if (failures > 0) {
				result.status = "FAIL";
				result.reason = "Pi CLI returned a non-zero exit code or reported extension conflicts";
			} else {
				result.status = "PASS";
			}
		} else if (notRun.length > 0 || result.pi.length !== piVersions.length) {
			result.status = "NOT_RUN";
			result.reason = `one or more legacy Pi versions were NOT_RUN: ${notRun.map((probe) => `${probe.version}: ${probe.reason}`).join("; ")}`;
		} else if (failures === result.pi.length) {
			result.status = "EXPECTED_FAILURE";
		} else {
			result.status = "FAIL";
			result.reason = "legacy package did not fail on every Pi version as expected";
		}
	} catch (error) {
		result.status = "NOT_RUN";
		result.reason = String(error?.message ?? error);
	}
	return result;
}

const smokeRoot = await mkdtemp(join(tmpdir(), "drone-pi-cli-regression-"));
const tarballRoot = join(smokeRoot, "tarballs");
await mkdir(tarballRoot, { recursive: true });
const results = [];
try {
	results.push(await runCase({ label: "positive", source: positiveSource, expected: "pass" }));
	results.push(await runCase({ label: "legacy", source: legacySource, expected: "fail" }));

	const summary = {
		command: "pi -p --no-session /task-status",
		piVersions,
		timeoutMs,
		positiveSource,
		legacySource,
		results,
	};
	if (evidencePath) {
		await mkdir(dirname(resolve(evidencePath)), { recursive: true });
		await writeFile(resolve(evidencePath), `${JSON.stringify(summary, null, 2)}\n`);
	}
	console.log(JSON.stringify(summary, null, 2));

	const positive = results[0];
	if (positive.status !== "PASS") {
		console.error(`research-suite positive Pi CLI regression failed: ${positive.reason ?? positive.status}`);
		process.exitCode = 1;
	}
	const legacy = results[1];
	if (legacy.status === "NOT_RUN") {
		console.error(`research-suite legacy Pi CLI regression was NOT_RUN: ${legacy.reason}`);
		if (process.env.REQUIRE_LEGACY_REGRESSION === "1") process.exitCode = 1;
	} else if (legacy.status === "FAIL") {
		console.error(`research-suite legacy Pi CLI regression failed: ${legacy.reason}`);
		process.exitCode = 1;
	}
} finally {
	await rm(smokeRoot, { recursive: true, force: true });
}
