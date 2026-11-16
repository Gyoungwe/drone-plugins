#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "ui/plugin.json"), "utf8"));
if (pkg.version !== manifest.version) throw new Error("Package and UI manifest must share one version");
if (manifest.droneUi !== 2 || manifest.main !== "bundle.js")
	throw new Error("Unsupported research UI contract");

function walk(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
	);
}
const sources = walk(join(root, "ui/src")).filter((path) => /\.tsx?$/.test(path) && !/\.test\./.test(path));
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
const inputs = Object.fromEntries(
	[
		...sources,
		join(root, "scripts/build-ui.mjs"),
		join(root, "package.json"),
		join(root, "plugin.manifest.json"),
		join(root, "ui/plugin.json"),
	]
		.sort()
		.map((path) => [relative(root, path), sha(readFileSync(path))]),
);
const buildManifest = `${JSON.stringify({ artifactSource: "ui/src/index.tsx", inputs, outputs: { "ui/bundle.js": sha(output) } }, null, 2)}\n`;
const outputs = new Map([
	["ui/bundle.js", output],
	["ui/build-manifest.json", buildManifest],
]);
for (const [path, text] of outputs) {
	const target = join(root, path);
	if (check) {
		if (!existsSync(target) || readFileSync(target, "utf8") !== text)
			throw new Error(`Stale generated output: ${path}`);
	} else {
		mkdirSync(resolve(target, ".."), { recursive: true });
		writeFileSync(target, text);
	}
}
console.log(`[pi-research UI] ${check ? "checked" : "built"} ${manifest.name}@${pkg.version}`);
