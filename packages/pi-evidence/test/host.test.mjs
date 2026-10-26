import test from "node:test";
import assert from "node:assert/strict";
import { evidenceHostLoader } from "../dist/host.mjs";

test("evidence host loader exposes read-only validation tools", async () => {
	const host = evidenceHostLoader.load();
	assert.equal(host.contractVersion, 1);
	assert.deepEqual(host.manifest.tools, ["evidence_validate_manifest", "evidence_verify_replay"]);
	const result = await host.tools.evidence_validate_manifest.execute({
		manifest: {
			version: 1,
			entries: [
				{
					artifactId: "artifact-1",
					versionId: "version-1",
					path: "results/output.txt",
					sha256: "a".repeat(64),
					bytes: 1,
				},
			],
		},
	});
	assert.equal(result.valid, true);
});
