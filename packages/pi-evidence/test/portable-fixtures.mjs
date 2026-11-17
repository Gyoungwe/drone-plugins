import { readFileSync } from "node:fs";
import * as evidence from "../dist/index.mjs";

export { evidence };
export const fixtureBytes = (name) =>
	readFileSync(new URL(`./fixtures/host-v1-${name}.json`, import.meta.url), "utf8");
export const fixture = (name) => JSON.parse(fixtureBytes(name));
export const clone = (value) => structuredClone(value);
export const exportedAt = "2026-11-17T12:01:00.000Z";

export function portableCheckpoint() {
	const artifacts = ["public", "restricted", "private"].map((accessLevel, index) =>
		evidence.artifactFromBytes({
			artifactId: `portable-${index}`,
			versionId: `portable-${index}-v1`,
			path: `outputs/${accessLevel}.txt`,
			bytes: `${accessLevel} bytes`,
			role: "output",
			accessLevel,
		}),
	);
	const checkpoint = evidence.createCheckpoint({
		analysis: {
			version: 1,
			id: "portable-analysis",
			question: "Compare evidence",
			assay: "portable-assay",
			mode: "exploratory",
		},
		files: artifacts.map((artifact) => ({ artifact, kind: "output" })),
		createdAt: "2026-11-17T12:00:00.000Z",
		environmentFingerprint: "portable-environment",
	});
	const blobs = Object.fromEntries(
		artifacts.map((artifact) => [
			artifact.sha256,
			Buffer.from(`${artifact.accessLevel} bytes`).toString("base64"),
		]),
	);
	return { checkpoint, blobs };
}

export function reidentify(checkpoint) {
	const { id: _id, ...body } = checkpoint;
	return { ...body, id: evidence.checkpointId(body) };
}

export function resign(attestation) {
	const { digest: _digest, ...body } = attestation;
	return { ...body, digest: evidence.sha256Hex(evidence.stableJson(body)) };
}
