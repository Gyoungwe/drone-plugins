#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(join(tmpdir(), "drone-pi-evidence-smoke-"));
const installRoot = join(temp, "install");
await mkdir(installRoot, { recursive: true });
try {
  const packed = await execFileAsync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temp], { cwd: packageRoot, maxBuffer: 8 * 1024 * 1024 });
  const metadata = JSON.parse(packed.stdout.trim())[0];
  assert(metadata?.filename?.endsWith(".tgz"), "npm pack did not produce a tarball");
  const tarball = join(temp, metadata.filename);
  await execFileAsync("npm", ["install", "--prefix", installRoot, "--ignore-scripts", "--omit=peer", "--no-audit", "--no-fund", tarball], { cwd: packageRoot, maxBuffer: 16 * 1024 * 1024 });
  const packageDir = join(installRoot, "node_modules/@gyoungwe/pi-evidence");
  const packageJson = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
  assert.equal(packageJson.pi.extensions[0], "./dist/index.mjs");
  const extension = await import(`file://${join(packageDir, packageJson.pi.extensions[0])}`);
  const tools = new Map();
  const registration = extension.default({ registerTool(tool) { tools.set(tool.name, tool); } });
  assert.deepEqual(registration.tools, ["evidence_validate_analysis_plan", "evidence_validate_manifest", "evidence_validate_capsule", "evidence_verify_replay"]);
  assert.equal(tools.size, 4);
  assert([...tools.values()].every((tool) => tool.drone?.readOnly === true));
  const result = await tools.get("evidence_validate_manifest").execute("smoke", { manifest: { version: 1, entries: [{ artifactId: "smoke", versionId: "smoke-v1", path: "smoke.txt", bytes: 5, sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", role: "input", parentVersionIds: [] }] } });
  assert.equal(result.details.valid, true);
  const planResult = await tools.get("evidence_validate_analysis_plan").execute("smoke-plan", { plan: {
    format: "drone-analysis-evidence-plan",
    version: 1,
    analysis: { id: "smoke", version: "analysis-contract-1" },
    adapter: { id: "assembly", version: "1.0.0" },
    adapterSnapshotSha256: "a".repeat(64),
    method: { id: "spades", version: "4.0.0" },
    requiredOutputs: ["assembly/contigs.fasta"],
    readiness: { ok: true, inferentialClaimsAllowed: false, gates: [], warnings: [] },
    execution: "host-required",
    evidence: "host-supplied",
  } });
  assert.equal(planResult.details.valid, true);
  console.log(JSON.stringify({ package: "@gyoungwe/pi-evidence", tarball: metadata.filename, tools: [...tools.keys()], readOnly: true, installed: true }));
} finally { await rm(temp, { recursive: true, force: true }); }
