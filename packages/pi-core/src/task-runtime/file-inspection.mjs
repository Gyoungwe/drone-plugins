import { createHash } from "node:crypto";
import { readPdfIdentity } from "./pdf-identity.mjs";

const error = (code, message) => Object.assign(new Error(message), { code });

/** Pure acceptance algorithm. The adapter supplies bytes and its actual scope/version descriptor.
 * Native Pi reads the bounded file itself; managed adapters must obtain a stable approved snapshot.
 */
export async function inspectTaskBytes(bytes, descriptor, expected = {}) {
  const identity = {
    path: descriptor.path,
    absolutePath: descriptor.absolutePath,
    rootKind: descriptor.rootKind,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    observedAt: (/* @__PURE__ */ new Date()).toISOString(),
    kind: "file",
    identity: "not-requested"
  };
  if (expected.kind === "pdf") {
    if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
      throw error("not-pdf", "Not a PDF: HTML landing pages and renamed downloads are not accepted.");
    identity.kind = "pdf";
    if (expected.doi || expected.title) {
      const found = await readPdfIdentity(bytes);
      const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, "");
      const doi = String(expected.doi || "").toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "");
      const title = normalize(expected.title);
      const titleMatch = title.length >= 12 && normalize(found.text).includes(title);
      const doiMatch = !!doi && found.text.toLowerCase().includes(doi);
      if (doi && !doiMatch || title.length >= 12 && !titleMatch)
        throw error(
          "identity-mismatch",
          "Selected PDF does not match the requested title/DOI in the inspected first pages. Choose the correct file or explicitly revise the request; original unchanged."
        );
      identity.identity = doiMatch && titleMatch ? "metadata-matched" : "needs-review";
      identity.extraction = { pages: found.pages, partial: found.partial };
    }
    identity.identity = expected.sha256 ? identity.sha256 === expected.sha256 ? "hash-matched" : "mismatch" : identity.identity === "metadata-matched" ? "metadata-matched" : "needs-review";
    if (identity.identity === "mismatch")
      throw error(
        "identity-mismatch",
        "File hash does not match the requested artifact; original file was not changed."
      );
  }
  if (expected.sha256 && expected.kind !== "pdf" && identity.sha256 !== expected.sha256)
    throw error("artifact-changed", "File version differs from the expected hash.");
  return identity;
}
