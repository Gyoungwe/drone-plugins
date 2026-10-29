#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "ui/plugin.json"), "utf8"));
if (pkg.version !== manifest.version) throw new Error("Package and UI manifest must share one version");
if (manifest.droneUi !== 1 || manifest.main !== "bundle.js") throw new Error("Unsupported research UI contract");
const bundled = await build({
	absWorkingDir: root,
	entryPoints: ["ui/src/index.tsx"],
	bundle: true,
	write: false,
	format: "esm",
	platform: "browser",
	target: "chrome140",
	jsx: "automatic",
	external: ["react", "react-dom", "react/jsx-runtime", "@gyoungwe/plugin-api", "@gyoungwe/plugin-api/*"],
	logLevel: "silent",
});
const output = bundled.outputFiles[0].text;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const inputs = Object.fromEntries(["ui/src/index.tsx", "scripts/build-ui.mjs", "package.json", "plugin.manifest.json", "ui/plugin.json"].map((path) => [path, sha(readFileSync(join(root, path)))]));
const buildManifest = `${JSON.stringify({ artifactSource: "ui/src/index.tsx", inputs, outputs: { "ui/bundle.js": sha(output) } }, null, 2)}\n`;
const outputs = new Map([["ui/bundle.js", output], ["ui/build-manifest.json", buildManifest]]);
for (const [path, text] of outputs) {
	const target = join(root, path);
	if (check) {
		if (!existsSync(target) || readFileSync(target, "utf8") !== text) throw new Error(`Stale generated output: ${path}`);
	} else {
		mkdirSync(resolve(target, ".."), { recursive: true });
		writeFileSync(target, text);
	}
}
console.log(`[pi-research UI] ${check ? "checked" : "built"} ${manifest.name}@${pkg.version}`);
