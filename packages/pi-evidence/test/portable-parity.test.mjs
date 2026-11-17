import assert from "node:assert/strict";
import test from "node:test";
import { clone, evidence, fixture, fixtureBytes } from "./portable-fixtures.mjs";

const checkpoint = fixture("checkpoint");
const capsule = fixture("private-capsule");
const expected = fixture("expected");

test("matrix 1: host v1 checkpoint retains the exact host identity", () => {
	const { id, ...body } = checkpoint;
	assert.equal(evidence.checkpointId(body), expected.checkpointId);
	assert.equal(id, expected.checkpointId);
	evidence.validateCheckpoint(checkpoint);
	assert.deepEqual(evidence.createCheckpoint(body), checkpoint);
});

test("matrix 1: host v1 private capsule parses with exact canonical bytes and digest", () => {
	const parsed = evidence.parseCapsule(fixtureBytes("private-capsule"));
	assert.deepEqual(parsed, capsule);
	assert.equal(evidence.capsuleDigest(parsed), expected.capsuleDigest);
	assert.equal(evidence.serializeCapsule(parsed), fixtureBytes("private-capsule"));
	assert.deepEqual(evidence.createEvidenceCapsule(checkpoint, capsule.blobs), capsule);
});

test("matrix 2: checkpoint and provenance lineage do not change host IDs", () => {
	const { id: _id, ...body } = clone(checkpoint);
	const before = evidence.checkpointId(body);
	body.lineage = {
		schemaVersion: 1,
		eventId: "event:new-branch",
		runAttemptId: "run:new",
		causationId: "event:parent",
	};
	body.analysis.provenance.lineage = {
		schemaVersion: 1,
		eventId: "event:new-provenance",
		causationId: "event:other",
	};
	assert.equal(evidence.checkpointId(body), before);
	delete body.lineage;
	delete body.analysis.provenance.lineage;
	assert.equal(evidence.checkpointId(body), before);
});

function bodyLeaves(value, path = []) {
	if (value === null || typeof value !== "object" || Object.keys(value).length === 0) return [path];
	return Object.entries(value).flatMap(([key, child]) =>
		((key === "lineage" || key === "id") && path.length === 0) ||
		(key === "lineage" && path.join(".") === "analysis.provenance")
			? []
			: bodyLeaves(child, [...path, key]),
	);
}

for (const path of bodyLeaves(checkpoint)) {
	test(`matrix 2: hashed body field ${path.join(".")} changes identity`, () => {
		const { id: _id, ...body } = clone(checkpoint);
		const parent = path.slice(0, -1).reduce((value, key) => value[key], body);
		const key = path.at(-1);
		const value = parent[key];
		parent[key] = Array.isArray(value)
			? ["changed"]
			: typeof value === "number"
				? value + 1
				: typeof value === "boolean"
					? !value
					: `${value}:changed`;
		assert.notEqual(evidence.checkpointId(body), evidence.checkpointId(checkpointBody()));
	});
}

function checkpointBody() {
	const { id: _id, ...body } = checkpoint;
	return body;
}

test("matrix 2: file order is hashed and freeze uses the host lexical path order", () => {
	const body = checkpointBody();
	assert.notEqual(
		evidence.checkpointId({ ...body, files: [...body.files].reverse() }),
		evidence.checkpointId(body),
	);
	const files = body.files.slice(0, 2).map((file, index) => ({
		...file,
		artifact: { ...file.artifact, path: index === 0 ? "a.txt" : "Z.txt" },
	}));
	assert.deepEqual(
		evidence.createCheckpoint({ ...body, files }).files.map((file) => file.artifact.path),
		["Z.txt", "a.txt"],
	);
});

test("matrix 2: canonical undefined fields follow the host v1 null encoding", () => {
	assert.equal(evidence.canonicalJson({ present: undefined }), '{"present":null}\n');
});

for (const lineage of [
	{ schemaVersion: 2, eventId: "event:fixture" },
	{ schemaVersion: 1, eventId: "event:fixture", parentEventId: "event:parent" },
	{ schemaVersion: 1, eventId: "event:fixture", causationId: "event:fixture" },
	{ schemaVersion: 1, eventId: "event:fixture", runAttemptId: "unsafe/id" },
]) {
	test(`matrix 2: reject malformed host v1 lineage ${JSON.stringify(lineage)}`, () => {
		for (const location of ["checkpoint", "provenance"]) {
			const value = clone(checkpoint);
			if (location === "checkpoint") value.lineage = lineage;
			else value.analysis.provenance.lineage = lineage;
			assert.throws(() => evidence.validateCheckpoint(value), /causal envelope|event cannot cause itself/);
		}
	});
}
