import assert from "node:assert/strict";
import test from "node:test";
import { clone, evidence, exportedAt, portableCheckpoint, reidentify } from "./portable-fixtures.mjs";

test("matrix 4: private capsule imports, forks and produces a matching comparison receipt", () => {
	const { checkpoint, blobs } = portableCheckpoint();
	const capsule = evidence.createEvidenceCapsule(checkpoint, blobs);
	const imported = evidence.validateCapsuleImport(evidence.serializeCapsule(capsule));
	assert.deepEqual(imported, checkpoint);
	assert.deepEqual(evidence.createBranch({ id: "fork", checkpoint: imported, createdAt: exportedAt }), {
		schemaVersion: 1,
		id: "fork",
		checkpointId: checkpoint.id,
		sourceAnalysisId: checkpoint.analysis.id,
		status: "preparing",
		createdAt: exportedAt,
	});
	const receipt = evidence.createReplayReceipt({
		id: "receipt",
		checkpoint: imported,
		completedAt: exportedAt,
		environmentFingerprint: checkpoint.environmentFingerprint,
		outputs: checkpoint.files.map(({ artifact }) => artifact),
	});
	assert.equal(receipt.status, "reproduced");
	assert.equal(receipt.checkpointId, checkpoint.id);
	assert.deepEqual(
		receipt.outputChecks,
		checkpoint.files.map(({ artifact }) => ({ path: artifact.path, matched: true })),
	);
});

const corruption = [
	[
		"wrong format",
		(value) => {
			value.format = "other";
		},
		"Invalid capsule format",
	],
	[
		"wrong version",
		(value) => {
			value.version = 2;
		},
		"Unsupported capsule version",
	],
	[
		"bad base64",
		(value, hash) => {
			value.blobs[hash] = "%%%";
		},
		"Invalid capsule base64",
	],
	[
		"digest mismatch",
		(value, hash) => {
			value.blobs[hash] = Buffer.from("x".repeat(Buffer.from(value.blobs[hash], "base64").length)).toString(
				"base64",
			);
		},
		"Capsule blob checksum mismatch",
	],
	[
		"truncated blob",
		(value, hash) => {
			value.blobs[hash] = Buffer.from(value.blobs[hash], "base64").subarray(1).toString("base64");
		},
		"Capsule blob size mismatch",
	],
	[
		"extra blob",
		(value) => {
			value.blobs["0".repeat(64)] = "eA==";
		},
		"Unexpected capsule blob",
	],
	[
		"missing blob",
		(value, hash) => {
			delete value.blobs[hash];
		},
		"Missing capsule blob",
	],
	[
		"checkpoint digest",
		(value) => {
			value.checkpoint.analysis.question = "changed";
		},
		"Checkpoint manifest checksum mismatch",
	],
];
for (const [label, mutate, message] of corruption) {
	test(`matrix 7: import rejects ${label} distinctly`, () => {
		const { checkpoint, blobs } = portableCheckpoint();
		const value = evidence.createEvidenceCapsule(checkpoint, blobs);
		mutate(value, Object.keys(value.blobs)[0]);
		assert.throws(() => evidence.validateCapsuleImport(JSON.stringify(value)), { message });
	});
}

test("matrix 7: legacy publication metadata is rejected instead of importing a disclosed checkpoint", () => {
	const { checkpoint, blobs } = portableCheckpoint();
	const capsule = evidence.createEvidenceCapsule(checkpoint, blobs);
	capsule.publication = { audience: "public", omittedPaths: [] };
	assert.throws(() => evidence.validateCapsuleImport(capsule), /Invalid capsule keys/);
});

test("matrix 7: valid empty artifacts round-trip as empty base64 blobs", () => {
	const artifact = evidence.artifactFromBytes({
		artifactId: "empty",
		versionId: "empty-v1",
		path: "empty.txt",
		bytes: "",
		role: "output",
	});
	const { checkpoint } = portableCheckpoint();
	const empty = reidentify({ ...checkpoint, files: [{ artifact, kind: "output" }] });
	const capsule = evidence.createEvidenceCapsule(empty, { [artifact.sha256]: "" });
	assert.equal(evidence.validateCapsuleImport(capsule).id, empty.id);
	assert.equal(capsule.blobs[artifact.sha256], "");
});

function replayInput(checkpoint) {
	return {
		environmentFingerprint: checkpoint.environmentFingerprint,
		outputs: checkpoint.files.map(({ artifact }) => ({
			path: artifact.path,
			bytes: artifact.bytes,
			sha256: artifact.sha256,
		})),
	};
}

test("matrix 8: matching replay metadata passes without executing anything", () => {
	const { checkpoint } = portableCheckpoint();
	const proof = evidence.verifyReplay(checkpoint, replayInput(checkpoint));
	assert.equal(proof.status, "reproduced");
	assert.equal(proof.detail, "Exact output bytes and environment matched");
	assert.equal(proof.environmentMatched, true);
});

for (const kind of ["output", "extra", "environment"]) {
	test(`matrix 8: ${kind} mismatch is reported distinctly`, () => {
		const { checkpoint } = portableCheckpoint();
		const input = replayInput(checkpoint);
		if (kind === "output") input.outputs[0].sha256 = "0".repeat(64);
		if (kind === "extra") input.outputs.push({ path: "unexpected.txt", bytes: 1, sha256: "0".repeat(64) });
		if (kind === "environment") input.environmentFingerprint = "changed-environment";
		const proof = evidence.verifyReplay(checkpoint, input);
		assert.equal(proof.status, "failed");
		if (kind === "output") {
			assert.equal(proof.outputChecks[0].matched, false);
			assert.equal(proof.detail, `Output mismatch: ${input.outputs[0].path}`);
		} else if (kind === "extra") {
			assert.deepEqual(proof.outputChecks.at(-1), { path: "unexpected.txt", matched: false });
			assert.equal(proof.detail, "Unexpected output: unexpected.txt");
		} else {
			assert.equal(proof.environmentMatched, false);
			assert.equal(proof.detail, "Environment mismatch");
		}
	});
}

for (const field of ["executor", "callback", "run"]) {
	test(`matrix 8: comparison and receipt APIs reject ${field} callbacks`, () => {
		const { checkpoint } = portableCheckpoint();
		let invoked = false;
		const callback = () => {
			invoked = true;
		};
		assert.throws(
			() => evidence.verifyReplay(checkpoint, { ...replayInput(checkpoint), [field]: callback }),
			/Unsupported replay comparison field/,
		);
		assert.throws(
			() =>
				evidence.createReplayReceipt({
					id: "receipt",
					checkpoint,
					completedAt: exportedAt,
					...replayInput(checkpoint),
					[field]: callback,
				}),
			/Unsupported replay comparison field/,
		);
		assert.equal(invoked, false);
	});
}

for (const field of [
	"approval",
	"grant",
	"authorization",
	"executionApproval",
	"writeGrant",
	"executionConsent",
	"writeApproved",
	"approved",
]) {
	for (const location of ["checkpoint", "analysis", "artifact", "lineage", "provenance"]) {
		test(`matrix 9: reject inherited ${location}.${field} on import and fork`, () => {
			const { checkpoint, blobs } = portableCheckpoint();
			const value = clone(checkpoint);
			if (location === "checkpoint") value[field] = { allowed: true };
			if (location === "analysis") value.analysis[field] = { allowed: true };
			if (location === "artifact") value.files[0].artifact[field] = { allowed: true };
			if (location === "lineage") value.lineage = { eventId: "event:fixture", [field]: { allowed: true } };
			if (location === "provenance")
				value.analysis.provenance = { schemaVersion: 1, artifacts: [], [field]: { allowed: true } };
			const identified = reidentify(value);
			const capsule = { format: "drone-evidence-capsule", version: 1, checkpoint: identified, blobs };
			assert.throws(
				() => evidence.validateCapsuleImport(capsule),
				/Evidence JSON cannot carry authorization/,
			);
			assert.throws(
				() => evidence.createBranch({ id: "fork", checkpoint: identified, createdAt: exportedAt }),
				/Evidence JSON cannot carry authorization/,
			);
		});
	}
}

test("matrix 9: dotted metadata keys cannot spoof the scientific-review exception", () => {
	const { checkpoint, blobs } = portableCheckpoint();
	const identified = reidentify({ ...checkpoint, "analysis.review": { approved: true } });
	const capsule = { format: "drone-evidence-capsule", version: 1, checkpoint: identified, blobs };
	assert.throws(
		() => evidence.validateCapsuleImport(JSON.stringify(capsule)),
		/Evidence JSON cannot carry authorization/,
	);
	assert.throws(
		() => evidence.createBranch({ id: "fork", checkpoint: identified, createdAt: exportedAt }),
		/Evidence JSON cannot carry authorization/,
	);
});
