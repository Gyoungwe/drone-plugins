import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "plugin.manifest.json"), "utf8"));
const ui = JSON.parse(readFileSync(join(root, "ui/plugin.json"), "utf8"));
if (pkg.version !== manifest.version || pkg.version !== ui.version) throw new Error("Package and manifests must share one version");
const bundled = await build({ entryPoints: [join(root, "ui/src/index.ts")], bundle: true, write: false, format: "esm", platform: "browser", target: "chrome140", logLevel: "silent" });
const outputs = new Map([
	["ui/bundle.js", bundled.outputFiles[0].text],
	["dist/index.js", `export const pluginId = ${JSON.stringify(manifest.id)};\nexport const uiManifest = ${JSON.stringify(ui)};\n`],
]);
const sha = value => createHash("sha256").update(value).digest("hex");
const inputs = Object.fromEntries(["ui/src/index.ts", "scripts/build.mjs", "package.json", "plugin.manifest.json", "ui/plugin.json"].map(path => [path, sha(readFileSync(join(root, path)))]));
outputs.set("build-manifest.json", JSON.stringify({ artifactSource: "ui/src/index.ts", inputs, outputs: Object.fromEntries([...outputs].map(([path, text]) => [path, sha(text)])) }, null, 2) + "\n");
for (const [path, text] of outputs) {
	const target = join(root, path);
	if (check) {
		if (!existsSync(target) || readFileSync(target, "utf8") !== text) throw new Error(`Stale generated output: ${path}`);
	} else {
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, text);
	}
}
console.log(`[desktop-ui-pack] ${check ? "checked" : "built"} ${ui.name}@${pkg.version}`);
