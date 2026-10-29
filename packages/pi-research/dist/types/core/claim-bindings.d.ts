/** Structural claim/source provenance checks; this never judges scientific truth. */
export type ClaimRelationship = "direct" | "indirect" | "hypothesis" | "unsupported";
export interface ClaimBindingSource {
    path: string;
    doi?: unknown;
    zotero_key?: unknown;
    hash: string;
    start_line: number;
    end_line: number;
    quote: string;
    original_location?: string;
    reading_basis?: string;
    read_receipt_id?: string;
    originalFulltextReadThisTurn?: false;
}
export interface ClaimBinding {
    id: string;
    claim: string;
    relationship: ClaimRelationship;
    limitations: string;
    organism?: string;
    method?: string;
    sources: ClaimBindingSource[];
    supportAssessment: "model-asserted-unreviewed";
    provenanceChecked: true;
    scientificallyVerified: false;
}
export interface ClaimSourceRecord {
    path: string;
    doi?: unknown;
    zotero_key?: unknown;
    hash: string;
}
export interface ClaimReadRecord {
    receiptId?: string;
    hash: string;
    startLine: number;
    endLine: number;
    text: string;
}
/** Validate bounded claims against source/read receipts from the current scope. */
export declare function validateClaimBindings(bindings: unknown, sources: readonly ClaimSourceRecord[], reads: ReadonlyMap<string, ClaimReadRecord | readonly ClaimReadRecord[]>): ClaimBinding[];
export declare function claimBindingRefs(bindings: readonly Pick<ClaimBinding, "claim" | "relationship" | "limitations" | "sources">[]): string[];
export declare const CLAIM_BINDING_SCHEMA: {
    readonly type: "array";
    readonly minItems: 1;
    readonly maxItems: 64;
    readonly items: {
        readonly type: "object";
        readonly properties: {
            readonly claim: {
                readonly type: "string";
            };
            readonly relationship: {
                readonly type: "string";
                readonly enum: readonly ["direct", "indirect", "hypothesis", "unsupported"];
            };
            readonly organism: {
                readonly type: "string";
            };
            readonly method: {
                readonly type: "string";
            };
            readonly limitations: {
                readonly type: "string";
            };
            readonly sources: {
                readonly type: "array";
                readonly maxItems: 12;
                readonly items: {
                    readonly type: "object";
                    readonly properties: {
                        readonly path: {
                            readonly type: "string";
                        };
                        readonly start_line: {
                            readonly type: "integer";
                            readonly minimum: 1;
                        };
                        readonly end_line: {
                            readonly type: "integer";
                            readonly minimum: 1;
                        };
                        readonly quote: {
                            readonly type: "string";
                        };
                        readonly original_location: {
                            readonly type: "string";
                        };
                    };
                    readonly required: readonly ["path", "start_line", "end_line", "quote"];
                };
            };
        };
        readonly required: readonly ["claim", "relationship", "limitations", "sources"];
    };
};
