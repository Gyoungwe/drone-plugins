import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const extension = await import(pathToFileURL(join(root, "dist/index.mjs")).href);
const manifest = JSON.parse(await readFile(join(root, "plugin.manifest.json"), "utf8"));
const tools = new Map();
const registration = extension.default({
	registerTool(tool) {
		tools.set(tool.name, tool);
	},
});
assert.deepEqual(registration.tools, manifest.tools);
assert.deepEqual([...tools.keys()], registration.tools);
for (const tool of tools.values()) assert.equal(tool.drone.readOnly, true);

const manifestResult = await tools.get("evidence_validate_manifest").execute("manifest", {
	manifest: {
		version: 1,
		entries: [
			{
				artifactId: "one",
				versionId: "one-v1",
				path: "input.txt",
				bytes: 5,
				sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
				role: "input",
				parentVersionIds: [],
			},
		],
	},
});
assert.equal(manifestResult.details.valid, true);

const plan = {
	format: "drone-analysis-evidence-plan",
	version: 1,
	analysis: { id: "assembly-evidence", version: "analysis-contract-1" },
	adapter: { id: "assembly", version: "1.0.0" },
	adapterSnapshotSha256: "a".repeat(64),
	method: { id: "spades", version: "4.0.0" },
	requiredOutputs: ["assembly/contigs.fasta"],
	readiness: { ok: true, inferentialClaimsAllowed: false, gates: [], warnings: [] },
	execution: "host-required",
	evidence: "host-supplied",
};
const planResult = await tools.get("evidence_validate_analysis_plan").execute("plan", { plan });
assert.equal(planResult.details.valid, true);
assert.deepEqual(planResult.details.plan.requiredOutputs, ["assembly/contigs.fasta"]);
await assert.rejects(
	() =>
		tools.get("evidence_validate_analysis_plan").execute("unsafe", {
			plan: { ...plan, requiredOutputs: ["../private.json"] },
		}),
	/relative paths/,
);

const dist = await readFile(join(root, "dist/index.mjs"), "utf8");
assert(!dist.includes("@drone/backend"));
assert(!dist.includes("electron"));
assert(!dist.includes("node:fs"));
assert(!dist.includes("../../"));
console.log("pi-evidence registration and read-only boundary smoke passed");
