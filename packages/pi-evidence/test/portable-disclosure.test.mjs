import assert from "node:assert/strict";
import test from "node:test";
import {
	clone,
	evidence,
	exportedAt,
	fixture,
	fixtureBytes,
	portableCheckpoint,
	resign,
} from "./portable-fixtures.mjs";

for (const audience of ["public", "restricted"]) {
	test(`matrix 3: ${audience} export matches host v1 attestation bytes and digest`, () => {
		const checkpoint = fixture("checkpoint");
		const capsule = evidence.createEvidenceCapsule(
			checkpoint,
			fixture("private-capsule").blobs,
			audience,
			exportedAt,
		);
		assert.equal(evidence.canonicalJson(capsule), fixtureBytes(`${audience}-attestation`));
		assert.equal(capsule.digest, fixture("expected")[`${audience}Digest`]);
		assert.deepEqual(evidence.verifyAttestation(capsule), capsule);
		const serialized = JSON.stringify(capsule);
		for (const label of [
			checkpoint.analysis.id,
			checkpoint.analysis.assay,
			...checkpoint.files.flatMap((file) => [file.artifact.path, file.kind]),
		]) {
			assert.equal(serialized.includes(label), false, label);
		}
		assert.deepEqual(
			capsule.files,
			checkpoint.files
				.map(({ artifact }) => ({
					sha256: artifact.sha256,
					included:
						artifact.accessLevel === "public" ||
						(audience === "restricted" && artifact.accessLevel === "restricted"),
				}))
				.sort((a, b) => a.sha256.localeCompare(b.sha256)),
		);
	});
	test(`matrix 3: ${audience} filters mixed-access bytes before serialization`, () => {
		const { checkpoint, blobs } = portableCheckpoint();
		const exported = evidence.createEvidenceCapsule(checkpoint, blobs, audience, exportedAt);
		const allowed = checkpoint.files.filter(
			({ artifact }) =>
				artifact.accessLevel === "public" ||
				(audience === "restricted" && artifact.accessLevel === "restricted"),
		);
		assert.deepEqual(
			Object.keys(exported.blobs).sort(),
			allowed.map(({ artifact }) => artifact.sha256).sort(),
		);
		assert.equal(exported.format, "drone-evidence-attestation");
		assert.equal(exported.files.length, 3);
	});
}

test("matrix 3: invalid artifact access classifications are rejected before export", () => {
	const { checkpoint, blobs } = portableCheckpoint();
	checkpoint.files[0].artifact.accessLevel = "unclassified";
	const { id: _id, ...body } = checkpoint;
	checkpoint.id = evidence.checkpointId(body);
	assert.throws(
		() => evidence.createEvidenceCapsule(checkpoint, blobs, "public", exportedAt),
		/Invalid artifact access level/,
	);
});

test("matrix 4: valid attestation is verify-only for both import and fork", () => {
	const attestation = fixture("public-attestation");
	assert.deepEqual(evidence.verifyAttestation(attestation), attestation);
	for (const value of [attestation, JSON.stringify(attestation)]) {
		assert.throws(() => evidence.validateCapsuleImport(value), {
			message: "Attestation capsules are verify-only and cannot be imported",
		});
	}
	assert.throws(() => evidence.createBranch({ id: "fork", checkpoint: attestation, createdAt: exportedAt }), {
		message: "Attestation capsules are verify-only and cannot be forked",
	});
});

const tampering = [
	[
		"wrong key set",
		(value) => {
			value.analysisId = "leaked";
		},
		/Invalid attestation keys/,
	],
	[
		"file metadata",
		(value) => {
			value.files[0].path = "leaked.txt";
		},
		/Invalid attestation file keys/,
	],
	[
		"unsorted files",
		(value) => {
			value.files.reverse();
		},
		/Attestation files are not sorted by sha256/,
	],
	[
		"bad timestamp",
		(value) => {
			value.exportedAt = "2026-11-17";
		},
		/Invalid attestation timestamp/,
	],
	[
		"digest mismatch",
		(value) => {
			value.digest = "0".repeat(64);
		},
		/Attestation digest mismatch/,
	],
	[
		"wrong audience",
		(value) => {
			value.audience = "private";
		},
		/Invalid attestation audience/,
	],
	[
		"wrong version",
		(value) => {
			value.schemaVersion = 2;
		},
		/Unsupported attestation version/,
	],
];
for (const [label, mutate, error] of tampering) {
	test(`matrix 4: attestation rejects ${label}`, () => {
		const value = clone(fixture("public-attestation"));
		mutate(value);
		assert.throws(() => evidence.verifyAttestation(value), error);
	});
}

test("matrix 5: shared bytes have one blob in private and hash-only exports", () => {
	const { checkpoint, blobs } = portableCheckpoint();
	const first = checkpoint.files[0].artifact;
	const second = checkpoint.files[1].artifact;
	second.sha256 = first.sha256;
	second.bytes = first.bytes;
	second.accessLevel = "public";
	first.accessLevel = "public";
	const { id: _id, ...body } = checkpoint;
	checkpoint.id = evidence.checkpointId(body);
	const privateCapsule = evidence.createEvidenceCapsule(checkpoint, blobs);
	assert.equal(Object.keys(privateCapsule.blobs).length, 2);
	const attestation = evidence.createEvidenceCapsule(checkpoint, blobs, "public", exportedAt);
	assert.equal(Object.keys(attestation.blobs).length, 1);
	assert.equal(attestation.files.filter((file) => file.included).length, 2);
	assert.deepEqual(evidence.verifyAttestation(attestation), attestation);
});

for (const kind of ["not included", "not listed", "missing included"]) {
	test(`matrix 5: reject ${kind} attestation blob`, () => {
		const value = clone(fixture("public-attestation"));
		const privateCapsule = fixture("private-capsule");
		if (kind === "missing included") delete value.blobs[value.files.find((file) => file.included).sha256];
		else {
			const hash =
				kind === "not included" ? value.files.find((file) => !file.included).sha256 : "0".repeat(64);
			value.blobs[hash] = privateCapsule.blobs[hash] ?? "eA==";
		}
		assert.throws(
			() => evidence.verifyAttestation(resign(value)),
			kind === "missing included" ? /Missing attestation blob/ : /Unexpected attestation blob/,
		);
	});
}

test("matrix 3: an empty access classification is rejected rather than treated as private", () => {
	const { checkpoint, blobs } = portableCheckpoint();
	checkpoint.files[0].artifact.accessLevel = "";
	const { id: _id, ...body } = checkpoint;
	checkpoint.id = evidence.checkpointId(body);
	assert.throws(() => evidence.createEvidenceCapsule(checkpoint, blobs), /Invalid artifact access level/);
});
