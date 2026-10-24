/**
 * Host-neutral run-level evidence lifecycle. Source retrieval, archive writes,
 * and Zotero operations remain host ports; this package only owns the receipt
 * state machine and session ledger.
 */
export declare function registerResearchLoop(pi: any): void;
