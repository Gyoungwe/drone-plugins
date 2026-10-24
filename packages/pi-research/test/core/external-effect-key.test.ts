import { describe, expect, it } from "vitest";
import { externalEffectKey } from "../../src/core/external-effect-key.js";

describe("external effect identity migration", () => {
  it("preserves the host's canonical nested object algorithm and receipt key", () => {
    const a = {doi: "10.1/example", destination: {library: 42, type: "user"}, tags: ["one", "two"]};
    const b = {tags: ["one", "two"], destination: {type: "user", library: 42}, doi: "10.1/example"};
    expect(externalEffectKey("zotero-save", a)).toBe(externalEffectKey("zotero-save", b));
    expect(externalEffectKey("zotero-save", a)).toBe("zotero-save:5ab5ea4eb234e5bd9e568f02448b8f0cad76e9b762e5245b6b89d7c206fc5f16");
    expect(externalEffectKey("zotero-save", {...a, tags: ["two", "one"]})).not.toBe(externalEffectKey("zotero-save", a));
  });
});
