import type { ClaimBinding } from "./claim-bindings.js";
export declare const summaryHash: (value: string | Uint8Array) => string;
/** The bytes written to SUMMARY.md, not a hash of the model's unnormalized input. */
export declare const summaryBody: (markdown: string) => string;
export interface PreparedResearchDelivery {
    runId: string;
    evidenceRevision: number;
    gateSha256: string;
    claimsSha256: string;
    bodySha256: string;
    body: string;
    claims: readonly ClaimBinding[];
    readReceipts: readonly SummaryReadReceipt[];
}
export interface SummaryReadReceipt {
    receiptId: string;
    path: string;
    sha256: string;
    startLine: number;
    endLine: number;
    text: string;
}
export interface SummaryMemoryClaim extends Record<string, unknown> {
    bindingId: string;
    claim: string;
    sourcePath: string;
    sourceHash: string;
    startLine: number;
    endLine: number;
    limitations: string;
}
interface SummaryEvidenceReference {
    path: string;
    sha256: string;
    startLine: number;
    endLine: number;
    readReceiptId: string;
}
type SummaryAssessment = "supported" | "contradicted" | "out-of-scope" | "unknown";
export interface ResearchSummaryReviewPacket {
    version: 1;
    body: string;
    bodySha256: string;
    gateSha256: string;
    claimsSha256: string;
    evidenceRevision: number;
    blocks: readonly {
        blockId: string;
        text: string;
        start: number;
        end: number;
        proposedClaimIds: readonly string[];
    }[];
    claims: readonly ClaimBinding[];
    readReceipts: readonly SummaryReadReceipt[];
    memoryClaims: readonly (SummaryMemoryClaim & {
        memoryClaimSha256: string;
    })[];
    packetSha256: string;
}
export interface ResearchSummaryAssessment {
    status: "model-assessed";
    packetSha256: string;
    bodySha256: string;
    provider: string;
    model: string;
    /** Host-observed model usage; absent when the provider did not report it. */
    usage?: unknown;
    blocks: readonly {
        blockId: string;
        role: "claim" | "limitation" | "navigation";
        assessment: SummaryAssessment;
        claimIds: readonly string[];
        evidence: readonly SummaryEvidenceReference[];
        reason: string;
    }[];
    /** Required separately: a supported body never approves an unassessed memory scope. */
    memoryClaims: readonly {
        bindingId: string;
        memoryClaimSha256: string;
        assessment: SummaryAssessment;
        evidence: readonly SummaryEvidenceReference[];
        reason: string;
    }[];
}
/** Bounded model inputs are validated here, rather than again inside the host writer. */
export declare function deliveryMemoryClaims(input: unknown, prepared: PreparedResearchDelivery): SummaryMemoryClaim[];
export declare function summaryReviewPacket(prepared: PreparedResearchDelivery, memoryClaims: readonly SummaryMemoryClaim[]): ResearchSummaryReviewPacket;
/** Structural consistency and provenance only: the model's assessment is never scientific verification. */
export declare function validateSummaryAssessment(value: unknown, packet: ResearchSummaryReviewPacket): ResearchSummaryAssessment;
export interface ResearchDeliveryCopy {
    role: "run" | "latest" | "history" | "vault";
    path: string;
    /** UTF-8 byte region containing the canonical summary inside a managed note. */
    bodyRegion?: {
        start: number;
        end: number;
    };
}
export interface ResearchDeliveryReceipt {
    version: 1;
    receiptScope: "current-session-current-turn";
    id: string;
    runId: string;
    evidenceRevision: number;
    committedRevision: number;
    gateSha256: string;
    claimsSha256: string;
    bodySha256: string;
    copies: readonly {
        role: ResearchDeliveryCopy["role"];
        path: string;
        artifactSha256: string;
        bodySha256: string;
    }[];
    memoryClaimsSha256: string;
    sources: readonly {
        path: string;
        sha256: string;
        readReceiptIds: readonly string[];
    }[];
    semanticAssessment: {
        status: "not-reviewed";
    } | ResearchSummaryAssessment;
    scientificallyVerified: false;
}
export {};
