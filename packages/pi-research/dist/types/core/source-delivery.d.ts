export declare function requiresPaperEvidence(prompt: unknown): boolean;
export declare function hasPaperCitation(sources: readonly {
    path?: unknown;
    paperDois?: unknown;
}[]): boolean;
export interface ManualPageAssessment {
    status: "document-unassessed" | "reference-page-only" | "landing-or-overview-page";
    complete: false;
    candidates: Array<{
        url: string;
        title: string;
    }>;
    optionCount?: number;
    note: string;
}
/**
 * Classify a downloaded manual page without claiming completeness.  The host
 * archive adapter supplies bytes and the final URL; this policy only parses
 * bounded HTML and emits same-origin follow-up candidates.
 */
export declare function assessManualPage(bytes: Uint8Array, contentType: unknown, url: string): ManualPageAssessment;
export declare const RESEARCH_ANSWER_GUIDANCE = "Write the visible answer as a scientist-facing research memo, not an internal execution log. Start the visible answer with the scientific conclusion or best current interpretation in 3\u20135 lines, then state the evidence level and one default recommendation with the reason it is the best next move. Explicitly separate what the current evidence supports, what it cannot establish, and which primary evidence would most improve the decision. Ask the user only about choices that materially change the scientific design; when several follow-up actions are possible, choose and explain a recommended default instead of asking the user to pick an internal task. Do not expose internal workflow terms such as claims binding, evidence gate, Vault, host, archive, Wiki, deposition, receipts, or note paths anywhere in the visible answer. Translate source status into research language such as \u2018\u76EE\u524D\u7ED3\u8BBA\u4E3B\u8981\u6765\u81EA\u7EFC\u8FF0\u548C\u6574\u7406\u6750\u6599\u2019 or \u2018\u8BE5\u673A\u5236\u5C1A\u7F3A\u5C11\u539F\u59CB\u8BBA\u6587\u76F4\u63A5\u6838\u9A8C\u2019. Keep file writes, indexing, and knowledge-base maintenance invisible unless the user explicitly asks for them; if they must be mentioned, use one human-facing sentence after the scientific answer and never turn them into the main next step. Keep limitations decision-relevant and say what can proceed now, what should remain provisional, and what evidence should be added next.";
export declare const PAPER_EVIDENCE_GUIDANCE = "For research design, give a short provisional plan first, then a bounded evidence pass. Support each key scientific claim with a specific original paper: author/year, DOI, exact section/figure/page actually read, organism, method, result and limitations. Cite the corresponding source beside the claim; keep long storage paths out of the main prose when a short title/year citation is available. Wiki is orientation, not a substitute for original papers. Separate reported findings from your proposed design and cross-species hypotheses. Distinguish signaling ligands (Wg, Dpp, Hh), DNA-binding transcription factors and cofactors; do not scan ligand or cofactor motifs as if they were DNA-binding TFs. For motif analysis use supported downstream DNA-binding factors (e.g. Sd, Pan/TCF, Mad, Ci), verify the relevant motif model, and do not treat a motif hit as occupancy or causality. When dual-library deposition is authorized, reuse exact DOI matches, import metadata and only legally open fulltext to Zotero, and deposit an interpreted linked source note to the bound knowledge base. Verify both destinations with research_verify_literature; a run download or source manifest is NOT Zotero import. Report metadata-only, missing fulltext, unavailable, and partial destinations as evidence limitations, not as the main result. Do not retry a write after an uncertain response until reading back the DOI. Never call storage or bibliographic checks scientific verification.";
export interface DeliveryContract {
    kind: "research" | "software" | "mixed";
    showMeAvailable: boolean;
    guidance: string;
}
export declare function deliveryContract(prompt: unknown, { showMeAvailable, researchContinuation, }?: {
    showMeAvailable?: boolean;
    researchContinuation?: boolean;
}): DeliveryContract | null;
