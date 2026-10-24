#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new Error(`[pi-research build] ${message}`); };
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(packageRoot, "plugin.manifest.json"), "utf8"));
if (packageJson.name !== "@gyoungwe/pi-research") fail("unexpected package name");
if (manifest.version !== packageJson.version) fail("manifest version must match package version");
if (manifest.entrypoints?.extension !== "./dist/index.mjs") fail("extension entrypoint is incorrect");
if (manifest.entrypoints?.host !== "./dist/host.mjs") fail("host entrypoint is incorrect");

const compiled = await build({
  absWorkingDir: packageRoot,
  entryPoints: {index: "src/index.ts", host: "src/host.ts"},
  bundle: true, format: "esm", platform: "node", target: "node20",
  outdir: "dist", outExtension: {".js": ".mjs"},
  sourcemap: false, preserveSymlinks: true, external: ["node:*"], metafile: true, write: false,
});
const forbidden = /(?:@drone\/|@gyoungwe\/(?!plugin-api(?:["'/]|$))|["']electron(?:\/|["']))/u;
const inputs = Object.keys(compiled.metafile.inputs).sort();
for (const input of inputs) {
  const metadata = compiled.metafile.inputs[input];
  for (const imported of metadata.imports) {
    if (forbidden.test(imported.path)) fail(`forbidden dependency in ${input}: ${imported.path}`);
  }
  if (input.startsWith("src/")) {
    const source = await readFile(join(packageRoot, input), "utf8");
    if (forbidden.test(source)) fail(`forbidden source dependency in ${input}`);
  }
}
const artifacts = new Map(compiled.outputFiles.map(file => [relative(packageRoot, file.path), Buffer.from(file.contents)]));
const extension = artifacts.get("dist/index.mjs").toString("utf8");
for (const name of manifest.tools) if (!extension.includes(JSON.stringify(name))) fail(`bundle is missing ${name}`);

async function filesUnder(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(join(root, prefix), {withFileTypes: true})) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}
const temporary = await mkdtemp(join(tmpdir(), "pi-research-types-"));
try {
  const tsc = fileURLToPath(import.meta.resolve("typescript/bin/tsc"));
  execFileSync(process.execPath, [tsc, "--project", "tsconfig.build.json", "--outDir", temporary], {cwd: packageRoot, stdio: "pipe"});
  for (const file of await filesUnder(temporary)) artifacts.set(`dist/types/${file}`, await readFile(join(temporary, file)));
} finally {
  await rm(temporary, {recursive: true, force: true});
}
const inputHash = createHash("sha256");
const buildInputs = [...new Set([...inputs, ...await filesUnder(join(packageRoot, "src")).then(files => files.map(file => `src/${file}`)), "package.json", "plugin.manifest.json", "tsconfig.build.json", "scripts/build.mjs"])].sort();
for (const file of buildInputs) inputHash.update(file).update("\0").update(await readFile(resolve(packageRoot, file))).update("\0");
const outputs = Object.fromEntries([...artifacts].sort(([a], [b]) => a.localeCompare(b)).map(([file, bytes]) => [file, sha256(bytes)]));
const buildManifest = {version: 1, generator: "packages/pi-research/scripts/build.mjs", inputsSha256: inputHash.digest("hex"), outputs};
const manifestPath = join(packageRoot, "build-manifest.json");
if (checkOnly) {
  for (const [file, bytes] of artifacts) {
    if (!(await readFile(join(packageRoot, file))).equals(bytes)) fail(`${file} differs from a clean rebuild`);
  }
  const actualFiles = await filesUnder(join(packageRoot, "dist"));
  if (actualFiles.length !== artifacts.size) fail("dist contains stale artifacts");
  const current = JSON.parse(await readFile(manifestPath, "utf8"));
  if (JSON.stringify(current) !== JSON.stringify(buildManifest)) fail("build-manifest.json is stale; run npm run build");
} else {
  await rm(join(packageRoot, "dist"), {recursive: true, force: true});
  for (const [file, bytes] of artifacts) {
    await mkdir(dirname(join(packageRoot, file)), {recursive: true});
    await writeFile(join(packageRoot, file), bytes);
  }
  await writeFile(manifestPath, `${JSON.stringify(buildManifest, null, 2)}\n`);
}
console.log(`pi-research source artifacts ${checkOnly ? "match a clean rebuild" : "built"}`);
