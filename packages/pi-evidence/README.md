# @gyoungwe/pi-evidence

Portable evidence contracts for native Pi and Drone Desktop. The package is a
read-only boundary: it validates content-addressed artifact manifests,
provenance and digest declarations, immutable checkpoint and branch metadata,
evidence capsules, and replay/import proofs.

The package does not read files, write a ledger, create workspaces, execute a
workflow, or inherit execution authorization. A host supplies bytes and
persists validated records in its composition root. Capsule blobs are passed as
base64 strings or `Uint8Array` values, so a host can choose its own storage
policy. Absolute paths, traversal, credential names, `.pi`/`.drone` state and
other private state labels are rejected at the contract boundary.

The native Pi extension registers three read-only tools:

- `evidence_validate_manifest`
- `evidence_validate_capsule`
- `evidence_verify_replay`

`npm run check` runs the typecheck, deterministic self-contained build,
registration tests and a clean tarball install smoke. It does not publish the
package or call a model.

## Portable contract policy

The pure contract keeps Drone's version-1 formats and `EVIDENCE_CAPSULE_LIMIT`
(64 MiB of artifact bytes). Checkpoint IDs hash the complete host snapshot,
including readiness and provenance, excluding only checkpoint lineage and
`analysis.provenance.lineage`. Host v1 lineage uses `schemaVersion: 1`,
`eventId`, optional `causationId` and `runAttemptId`; malformed envelopes are
rejected. The former `parentEventId` field has been removed. File order is part of identity; checkpoint
creation uses the host's lexical path order. Host v1 untagged provenance and
scientific review metadata are retained. Canonical JSON sorts object keys,
encodes explicit undefined properties as null, and ends with a newline.

`createEvidenceCapsule(checkpoint, blobs)` produces the exact private host v1
`drone-evidence-capsule`: `format`, `version`, full `checkpoint`, and `blobs`.
Private capsules support validation/import, branch descriptors and comparison
receipts. There is no publication/omission-list variant: legacy publications
are rejected. Import errors distinguish format, version, base64, checksum,
size, extra blobs and missing blobs. Empty files use empty base64 strings;
shared hashes store one blob, with every declared file size checked.

`createEvidenceCapsule(checkpoint, blobs, audience, exportedAt)` requires an
explicit ISO timestamp for `public` or `restricted` exports. These return the
host v1 `drone-evidence-attestation`, with exactly `format`, `schemaVersion`,
`audience`, `checkpointId`, `createdAt`, `exportedAt`, `files`, `blobs` and
`digest`. Files are sorted `{sha256, included}` records; paths, analysis IDs,
assays and kinds never enter the export. The author assigns artifact access
levels; invalid classifications are rejected, and unspecified levels are
private. Public exports include public bytes; restricted exports include
public and restricted bytes. Extra supplied source blobs are not exported.

The new public exports are `EvidenceAttestationCapsule` and
`verifyAttestation(value)`. The verifier checks exact keys, lowercase hashes,
file ordering, canonical ISO timestamps, canonical base64, included blob
membership, SHA-256 digests and the total included file size. Its digest hashes
stable JSON without the trailing newline, as the host does. A shared hash is
included when any corresponding file is included, exactly as in host v1;
classification cannot make identical bytes secret after publication. An
attestation proves internal integrity, not the author's access classification
or provenance. It is verify-only: capsule import/parsing and branch creation
reject attestations. Use `canonicalJson` to serialize a verified attestation;
`serializeCapsule`, `capsuleDigest` and `capsuleBytes` remain private-capsule APIs.
The obsolete `EvidenceCapsulePublication` export has been removed.

Freeze, import and fork writes each require fresh host approval. This package
performs no writes and grants no authorization. Checkpoint JSON is rejected
recursively when keys contain approval, grant, authoriz, consent or approved
(case-insensitive), including nested lineage/artifact/provenance metadata.
The sole exception is host v1 `analysis.review.approved`, which records
scientific review only. Branch descriptors contain only their identity,
checkpoint/source analysis IDs, status and timestamp; review metadata never
confers execution or write permission.

Replay is comparison only: `verifyReplay` and `createReplayReceipt` compare
host-supplied output hashes, sizes and environment fingerprints. They report
output, unexpected-output and environment differences separately; executor,
callback and other extra input fields are rejected. No replay API runs code.
Host I/O, durable ownership, per-action authorization and capability degradation
belong to the later owner/UI tickets.

The `test/portable-*.test.mjs` matrix covers host fixture parity, disclosure,
verify-only policy, corruption, shared blobs, actual 64 MiB boundaries, replay
comparison and approval rejection. `test/portable-fixtures.mjs` supplies only
test data. The small JSON fixtures under `test/fixtures/host-v1-*` were produced
from Drone host revision `943752b035115765b1a204e7b580add8eeda1bd0` using its
checkpoint hash, canonical JSON and attestation builder/verifier; expected
identities are stored separately from the implementation under test.
