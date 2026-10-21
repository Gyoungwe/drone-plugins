import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";

export const CAPABILITIES = new Set([
	"knowledge", "research", "search", "evidence-context", "analysis", "planning", "files", "evidence",
	"provenance", "replay", "connectors", "read-only", "provenance-receipts", "ui",
]);
const FILESYSTEM_PERMISSIONS = new Set(["workspace-read", "workspace", "configured-vault", "vault-read"]);
const PERMISSION_KEYS = new Set(["filesystem", "network", "subprocess", "externalWrites", "credentials", "readWrite", "externalSideEffects"]);
const HOSTS = new Set(["native-pi", "drone-desktop"]);
const TOOL_RE = /^[a-z][a-z0-9_-]*$/u;
const ID_RE = /^drone-[a-z0-9-]+$/u;
const PACKAGES_ROOT = resolve(import.meta.dirname, "../packages");

function failure(failures, packageName, message) { failures.push(`${packageName}: ${message}`); }

function entrypointPaths(entrypoints) {
	if (!entrypoints || typeof entrypoints !== "object") return [];
	return Object.entries(entrypoints).flatMap(([kind, value]) =>
		(Array.isArray(value) ? value : [value]).map((path) => ({ kind, path })),
	);
}

function normalizedRelative(value) {
	return normalize(String(value)).replaceAll("\\", "/").replace(/^\.\//u, "");
}

function filePatternCovers(pattern, target) {
	const file = normalizedRelative(pattern);
	const path = normalizedRelative(target);
	if (file === path) return true;
	if (file.endsWith("/*")) return path.startsWith(`${file.slice(0, -2)}/`);
	return path.startsWith(`${file}/`);
}

function entrypointCovered(path, packageJson) {
	const files = Array.isArray(packageJson.files) ? packageJson.files : [];
	if (files.some((pattern) => typeof pattern === "string" && filePatternCovers(pattern, path))) return true;
	const normalizedPath = normalizedRelative(path);
	if (!normalizedPath.startsWith("node_modules/")) return false;
	const parts = normalizedPath.split("/");
	const dependency = parts[1]?.startsWith("@") ? parts.slice(1, 3).join("/") : parts[1];
	return Array.isArray(packageJson.bundleDependencies) && packageJson.bundleDependencies.includes(dependency);
}

function validatePermissions(packageName, permissions, failures) {
	if (!permissions || typeof permissions !== "object" || Array.isArray(permissions)) {
		failure(failures, packageName, "permissions must be an object");
		return;
	}
	for (const key of Object.keys(permissions)) if (!PERMISSION_KEYS.has(key)) failure(failures, packageName, `permissions.${key} is not supported`);
	const value = permissions;
	for (const key of ["filesystem", "network", "subprocess", "credentials", "externalSideEffects"]) {
		if (value[key] !== undefined && (!Array.isArray(value[key]) || value[key].some((item) => typeof item !== "string")))
			failure(failures, packageName, `permissions.${key} must be an array of strings`);
	}
	if (Array.isArray(value.filesystem)) for (const item of value.filesystem) if (!FILESYSTEM_PERMISSIONS.has(item)) failure(failures, packageName, `permissions.filesystem has invalid value ${item}`);
	if (value.externalWrites !== undefined && typeof value.externalWrites !== "boolean") failure(failures, packageName, "permissions.externalWrites must be boolean");
	if (value.readWrite !== undefined) {
		if (!value.readWrite || typeof value.readWrite !== "object" || Array.isArray(value.readWrite)) failure(failures, packageName, "permissions.readWrite must be an object");
		else for (const key of ["read", "write", "delete"]) if (typeof value.readWrite[key] !== "boolean") failure(failures, packageName, `permissions.readWrite.${key} must be boolean`);
	}
}

function isUiOnly(manifest) {
	const keys = Object.keys(manifest.entrypoints ?? {});
	return keys.length > 0 && keys.every((key) => key === "ui");
}

export function validatePackageManifest(packageJson, manifest, packageRoot) {
	const failures = [];
	const packageName = packageJson.name ?? packageRoot.split(/[\\/]/u).pop();
	if (!ID_RE.test(manifest.id ?? "")) failure(failures, packageName, "id must match ^drone-[a-z0-9-]+$");
	if (manifest.version !== packageJson.version) failure(failures, packageName, "manifest.version must match package.json version");
	if (manifest.schemaVersion !== 1) failure(failures, packageName, "schemaVersion must be 1");
	if (manifest.drone?.pluginApi !== 1) failure(failures, packageName, "drone.pluginApi must be 1");
	if (manifest.drone?.resultContract !== "drone-result/v3") failure(failures, packageName, "drone.resultContract must be drone-result/v3");
	if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) failure(failures, packageName, "capabilities must be a non-empty array");
	for (const capability of manifest.capabilities ?? []) if (!CAPABILITIES.has(capability)) failure(failures, packageName, `unknown capability ${capability}`);
	if (!Array.isArray(manifest.hosts) || manifest.hosts.length === 0) failure(failures, packageName, "hosts must be a non-empty array");
	for (const host of manifest.hosts ?? []) if (!HOSTS.has(host)) failure(failures, packageName, `unknown host ${host}`);
	if (!manifest.entrypoints || typeof manifest.entrypoints !== "object") failure(failures, packageName, "entrypoints must be an object");
	else for (const { kind, path } of entrypointPaths(manifest.entrypoints)) {
		if (typeof path !== "string" || path.length === 0 || path.includes("..")) { failure(failures, packageName, `entrypoints.${kind} has an invalid path`); continue; }
		if (!existsSync(join(packageRoot, path))) failure(failures, packageName, `entrypoint does not exist: ${path}`);
		if (!entrypointCovered(path, packageJson)) failure(failures, packageName, `entrypoint is not covered by files: ${path}`);
	}
	if (!isUiOnly(manifest)) {
		if (!Array.isArray(manifest.tools)) failure(failures, packageName, "L1 manifest must declare tools");
		const tools = manifest.tools ?? [];
		if (new Set(tools).size !== tools.length) failure(failures, packageName, "tools contains duplicates");
		for (const tool of tools) if (typeof tool !== "string" || !TOOL_RE.test(tool)) failure(failures, packageName, `invalid tool name ${String(tool)}`);
	}
	validatePermissions(packageName, manifest.permissions, failures);
	const droneDependencies = Object.keys(packageJson.dependencies ?? {}).filter((name) => name.startsWith("@gyoungwe/"));
	const bundled = new Set(packageJson.bundleDependencies ?? []);
	for (const dependency of droneDependencies) if (dependency !== "@gyoungwe/plugin-api" && !bundled.has(dependency)) failure(failures, packageName, `must not depend on another Drone plugin: ${dependency}`);
	for (const dependency of Object.keys(packageJson.dependencies ?? {})) if (dependency.startsWith("@earendil-works/pi-")) failure(failures, packageName, `Pi runtime must be a peerDependency: ${dependency}`);
	return failures;
}

export async function checkManifests(root = PACKAGES_ROOT) {
	const failures = [];
	const packages = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory());
	for (const pkg of packages) {
		const packageRoot = join(root, pkg.name);
		try {
			const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
			const manifest = JSON.parse(await readFile(join(packageRoot, "plugin.manifest.json"), "utf8"));
			failures.push(...validatePackageManifest(packageJson, manifest, packageRoot));
		} catch (error) {
			failure(failures, pkg.name, `missing or invalid package/manifest (${error.message})`);
		}
	}
	if (failures.length) throw new Error(failures.join("\n"));
	return packages.length;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
	try { console.log(`Plugin manifests checked: ${await checkManifests()}`); }
	catch (error) { console.error(error.message); process.exit(1); }
}
