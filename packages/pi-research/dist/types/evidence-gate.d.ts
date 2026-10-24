/**
 * Pure evidence-gate state machine.
 *
 * The host owns persistence and tool orchestration; this module only enforces
 * the monotonic stages required before a research answer can be published.
 */
export declare const EVIDENCE_STAGES: readonly ["created", "local_query_recorded", "external_search_recorded", "sources_inspected", "sources_archived", "claims_bound", "answerable"];
export type EvidenceStage = (typeof EVIDENCE_STAGES)[number];
export type EvidenceFailure = "unavailable" | "browser_required" | "failed";
export interface EvidenceEvent {
    type: EvidenceStage | EvidenceFailure;
    at: string;
    [key: string]: unknown;
}
export interface EvidenceGateState {
    scope: string;
    stage: EvidenceStage;
    status: "ok";
    answerable: boolean;
    events: EvidenceEvent[];
}
export interface EvidenceGateFailureState {
    scope: string;
    stage: EvidenceStage;
    status: EvidenceFailure;
    answerable: false;
    events: EvidenceEvent[];
}
export interface EvidenceGate {
    advance(next: EvidenceStage, details?: Record<string, unknown>): EvidenceGateState;
    fail(status: EvidenceFailure, details?: Record<string, unknown>): EvidenceGateFailureState;
    snapshot(): EvidenceGateState;
}
export declare function createEvidenceGate({ scope }?: {
    scope?: string;
}): EvidenceGate;
export declare function assertEvidenceAnswerable(gate: Pick<EvidenceGate, "snapshot">, { claimBindings }?: {
    claimBindings?: unknown[];
}): EvidenceGateState;
