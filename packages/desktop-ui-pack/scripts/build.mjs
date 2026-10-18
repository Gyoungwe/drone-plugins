import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = join(root, "plugin.manifest.json");
const uiManifestPath = join(root, "ui", "plugin.json");
const sourcePath = join(root, "ui", "src", "index.ts");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const uiManifest = JSON.parse(readFileSync(uiManifestPath, "utf8"));
const failures = [];

if (manifest.drone?.pluginApi !== 1) failures.push("plugin API must be 1");
if (manifest.entrypoints?.ui !== "./ui/plugin.json") failures.push("entrypoints.ui must point to ui/plugin.json");
if (uiManifest.droneUi !== 1) failures.push("ui plugin contract must be 1");
if (uiManifest.name !== "drone-research-ui") failures.push("unexpected UI plugin name");
if (uiManifest.main !== "src/index.ts") failures.push("UI main must remain inside ui/");
if (!existsSync(sourcePath)) failures.push("UI source is missing");
const source = readFileSync(sourcePath, "utf8");
if (source.includes("../Drone") || source.includes("electron") || source.includes("@drone/backend")) {
	failures.push("UI source references a host-private dependency");
}
if (failures.length) {
	console.error(failures.join("\n"));
	process.exit(1);
}

if (!process.argv.includes("--check")) {
	const dist = join(root, "dist");
	mkdirSync(dist, { recursive: true });
	writeFileSync(
		join(dist, "index.js"),
		`export const pluginId = ${JSON.stringify(manifest.id)};\nexport const uiManifest = ${JSON.stringify(uiManifest)};\n`,
	);
}
console.log(`[desktop-ui-pack] ${process.argv.includes("--check") ? "checked" : "built"} ${uiManifest.name}`);
