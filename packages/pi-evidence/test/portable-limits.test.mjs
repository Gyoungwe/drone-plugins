import assert from "node:assert/strict";
import test from "node:test";
import { evidence, portableCheckpoint, reidentify, resign } from "./portable-fixtures.mjs";

test("matrix 6: artifact totals accept exactly 64 MiB and reject one extra byte", () => {
	assert.equal(evidence.EVIDENCE_CAPSULE_LIMIT, 64 * 1024 * 1024);
	const { checkpoint } = portableCheckpoint();
	const artifact = { ...checkpoint.files[0].artifact, bytes: evidence.EVIDENCE_CAPSULE_LIMIT };
	assert.equal(evidence.validateArtifactManifest([artifact]).valid, true);
	assert.equal(evidence.validateArtifactManifest([{ ...artifact, bytes: artifact.bytes + 1 }]).valid, false);
	const second = { ...artifact, path: "second.txt", versionId: "second-v1", bytes: 1 };
	assert.equal(evidence.validateArtifactManifest([artifact, second]).valid, false);
});

test("matrix 6: private capsule verifies actual 64 MiB bytes and rejects total +1", () => {
	const bytes = Buffer.alloc(evidence.EVIDENCE_CAPSULE_LIMIT, 120);
	const artifact = evidence.artifactFromBytes({
		artifactId: "large",
		versionId: "large-v1",
		path: "large.txt",
		bytes,
		role: "output",
	});
	const { checkpoint } = portableCheckpoint();
	const boundary = reidentify({ ...checkpoint, files: [{ artifact, kind: "output" }] });
	const capsule = evidence.createEvidenceCapsule(boundary, { [artifact.sha256]: bytes });
	assert.equal(evidence.validateCapsuleImport(capsule).id, boundary.id);
	const extra = { ...artifact, artifactId: "extra", versionId: "extra-v1", path: "extra.txt", bytes: 1 };
	capsule.checkpoint = reidentify({
		...boundary,
		files: [...boundary.files, { artifact: extra, kind: "output" }],
	});
	assert.throws(() => evidence.validateCapsuleImport(capsule), /Evidence exceeds capsule limit/);
});

test("matrix 6: attestation counts included shared-hash file sizes at 64 MiB and rejects +1", () => {
	const bytes = Buffer.alloc(evidence.EVIDENCE_CAPSULE_LIMIT / 2, 120);
	const hash = evidence.sha256Hex(bytes);
	const attestation = resign({
		format: "drone-evidence-attestation",
		schemaVersion: 1,
		audience: "public",
		checkpointId: "a".repeat(64),
		createdAt: "2026-11-17T12:00:00.000Z",
		exportedAt: "2026-11-17T12:01:00.000Z",
		files: [
			{ sha256: hash, included: true },
			{ sha256: hash, included: true },
		],
		blobs: { [hash]: bytes.toString("base64") },
	});
	assert.equal(evidence.verifyAttestation(attestation).files.length, 2);
	const extraHash = evidence.sha256Hex("x");
	attestation.files.push({ sha256: extraHash, included: true });
	attestation.files.sort((a, b) => a.sha256.localeCompare(b.sha256));
	attestation.blobs[extraHash] = "eA==";
	assert.throws(() => evidence.verifyAttestation(resign(attestation)), /Evidence exceeds capsule limit/);
});
