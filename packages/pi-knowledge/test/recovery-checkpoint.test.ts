import { expect, it } from "vitest";
import { parseKnowledgeRecoveryCheckpoint } from "../src/core/recovery-checkpoint.js";
const record = { id: "read-one", sessionId: "session", taskId: null, path: "Library/Methods/source.md", hash: "a".repeat(64), startLine: 1, maxChars: 5000, vaultId: "b".repeat(24), bindingRevision: 1, used: true, evicted: true };
it("decodes bounded historical windows without copying forged grants/proofs or losing consumed state", () => {
 expect(parseKnowledgeRecoveryCheckpoint({scope:"session:/workspace", approved:true, roots:["/outside"], records:[{...record, liveProof:{status:"released"},grants:["/outside"]}]})).toEqual({scope:"session:/workspace",records:[record]});
 for (const path of ["../outside.md", "/outside.md", "C:\\outside.md"]) expect(()=>parseKnowledgeRecoveryCheckpoint({scope:"session:/workspace",records:[{...record,path}]})).toThrow("within the Vault");
 expect(()=>parseKnowledgeRecoveryCheckpoint({scope:"session:/workspace",records:[{...record,maxChars:8001}]})).toThrow("Invalid");
 expect(()=>parseKnowledgeRecoveryCheckpoint({scope:"session:/workspace",records:[record,{...record,used:false}]})).toThrow("duplicate receipt");
});
