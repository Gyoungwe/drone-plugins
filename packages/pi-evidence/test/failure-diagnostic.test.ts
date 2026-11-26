import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import {
	evidenceFailureCandidate,
	validateArtifactManifest,
	validateCapsuleImport,
	verifyReplay,
} from "../dist/index.mjs";

const receipt = "83cac661-d34c-4c94-a152-556cedc6efd4";
const secret = "https://fixture-user@example.invalid/object?token=fixture-secret#private";

function checkpoint() {
	return validateCapsuleImport(
		readFileSync(new URL("./fixtures/host-v1-private-capsule.json", import.meta.url), "utf8"),
	);
}

test("maps replay mismatches without including the environment or output paths", () => {
	const frozen = checkpoint();
	const outputs = frozen.files.filter((file) => file.kind === "output").map((file) => file.artifact);
	const result = verifyReplay(frozen, { environmentFingerprint: secret, outputs: [] });
	assert.equal(result.status, "failed");
	assert.deepEqual(evidenceFailureCandidate({ validator: "verifyReplay", result }, receipt), {
		failureCode: "replay-verification-failed",
		subject: "Replay verification",
		scopeKind: "project",
		summary: "The replay outputs or environment did not match the checkpoint.",
		provenance: { sourcePlugin: "drone-pi-evidence", producer: "evidence-validator", receiptId: receipt },
	});
	const reproduced = verifyReplay(frozen, { environmentFingerprint: frozen.environmentFingerprint, outputs });
	assert.equal(reproduced.status, "reproduced");
	assert.equal(
		evidenceFailureCandidate({ validator: "verifyReplay", result: reproduced }, receipt),
		undefined,
	);
});

test("maps manifest failures without entries, error text or untrusted receipt strings", () => {
	const result = validateArtifactManifest([{ path: secret, bytes: -1, sha256: "invalid" }]);
	assert.equal(result.valid, false);
	const input = { validator: "validateArtifactManifest", result } as const;
	const candidate = evidenceFailureCandidate(input, secret);
	assert.equal(candidate?.failureCode, "artifact-manifest-invalid");
	assert.match(candidate?.provenance.receiptId ?? "", /^[a-f0-9]{64}$/);
	assert.deepEqual(evidenceFailureCandidate(input, secret), candidate);
	assert.doesNotMatch(JSON.stringify(candidate), /fixture-user|fixture-secret|example\.invalid|token=/);
	assert.equal(
		evidenceFailureCandidate(
			{ validator: "validateArtifactManifest", result: validateArtifactManifest([]) },
			receipt,
		),
		undefined,
	);
});

test("labels thrown capsule import failures without forwarding the error", () => {
	assert.throws(
		() => validateCapsuleImport(secret),
		(error) => {
			const candidate = evidenceFailureCandidate({ validator: "validateCapsuleImport", error }, receipt);
			assert.equal(candidate?.failureCode, "capsule-import-invalid");
			assert.equal(candidate?.provenance.receiptId, receipt);
			assert.doesNotMatch(JSON.stringify(candidate), /fixture-secret|example\.invalid/);
			return true;
		},
	);
});
