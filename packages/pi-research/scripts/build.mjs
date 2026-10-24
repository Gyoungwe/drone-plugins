#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { build } from "esbuild";

const packageRoot = resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");
const outputPath = join(packageRoot, "dist/index.mjs");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new Error(`[pi-research build] ${message}`); };
const ensureFile = async (path) => { try { if (!(await stat(path)).isFile()) fail(`missing file: ${relative(packageRoot, path)}`); } catch (error) { if (error?.code === "ENOENT") fail(`missing file: ${relative(packageRoot, path)}`); throw error; } };
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(packageRoot, "plugin.manifest.json"), "utf8"));
if (packageJson.name !== "@gyoungwe/pi-research") fail("unexpected package name");
if (manifest.version !== packageJson.version) fail("manifest version must match package version");
if (manifest.entrypoints?.extension !== "./dist/index.mjs") fail("extension entrypoint is incorrect");
if (!checkOnly) {
  await rm(join(packageRoot, "dist"), {recursive: true, force: true});
  await mkdir(join(packageRoot, "dist"), {recursive: true});
  await build({entryPoints: [join(packageRoot, "src/index.ts")], bundle: true, format: "esm", platform: "node", target: "node20", outfile: outputPath, sourcemap: false, external: ["node:*"]});
}
await ensureFile(outputPath);
const output = await readFile(outputPath, "utf8");
for (const pattern of [/from\s+["'](?:electron|@drone\/(?:backend|desktop|extensions|research|shared|compute))["']/u, /import\s*\(\s*["'](?:electron|@drone\/(?:backend|desktop|extensions|research|shared|compute))["']/u, /(?:from|import\s*\(|require\s*\()["']\.\.\//u]) if (pattern.test(output)) fail(`bundle contains forbidden import: ${pattern}`);
for (const name of manifest.tools) if (!output.includes(JSON.stringify(name))) fail(`bundle is missing ${name}`);
const sourceFiles = ["src/evidence-gate.ts", "src/evidence-loop.ts", "src/research-loop.ts", "src/index.ts", "src/pdfjs-worker.d.ts"];
const inputHash = createHash("sha256");
for (const file of sourceFiles) { const bytes = await readFile(join(packageRoot, file)); inputHash.update(file).update("\0").update(bytes).update("\0"); }
const buildManifest = {version: 1, generator: "packages/pi-research/scripts/build.mjs", inputsSha256: inputHash.digest("hex"), outputs: {"dist/index.mjs": sha256(await readFile(outputPath))}};
const manifestPath = join(packageRoot, "build-manifest.json");
if (checkOnly) { const current = JSON.parse(await readFile(manifestPath, "utf8")); if (JSON.stringify(current) !== JSON.stringify(buildManifest)) fail("build-manifest.json is stale; run npm run build"); } else await writeFile(manifestPath, `${JSON.stringify(buildManifest, null, 2)}\n`);
console.log(`pi-research source artifacts ${checkOnly ? "are up to date" : "built"}`);
