import { type FailureCandidateSink } from "./failure-candidates.js";
import type { LiteratureReceipt, LiteratureReceiptOptions } from "./literature-receipt.js";
import type { ResearchReceiptEvent } from "./receipt-journal.js";
import { type ResearchBreakerBudget, type ResearchContextEviction, type ResearchUsageSample } from "./research-breaker.js";
import { type PreparedResearchDelivery, type ResearchDeliveryCopy, type ResearchDeliveryReceipt, type ResearchSummaryAssessment } from "./research-delivery.js";
import { type ResearchExecutionMode, type ResearchToolStep } from "./research-fast-path.js";
import { type ResearchGate, type ResearchRunMetadata, topicIdFromResultSlug } from "./research-loop-state.js";
export { RESEARCH_DOCUMENT_KIND, RESEARCH_STAGES } from "./research-loop-state.js";
export interface ResearchLoopWorkspace {
    resultsRoot: string;
    obsidianVault?: string | null;
    knowledgeBindingRevision?: number | null;
}
export interface ResearchLoopPorts {
    resolveProject(cwd: string): Promise<string>;
    workspace(cwd: string): Promise<ResearchLoopWorkspace>;
    verifyLiteratureReceipt(input: LiteratureReceiptOptions): Promise<LiteratureReceipt>;
    sourceStatus(input: {
        cwd: string;
        run_dir: string;
        verify?: boolean;
    }): Promise<unknown>;
    exclusive?<T>(key: string, work: () => Promise<T>): Promise<T>;
    breakerBudget?: ResearchBreakerBudget;
    failureCandidateSink?: FailureCandidateSink;
}
type RunScope = {
    cwd?: string;
    runDir?: string;
};
type StartInput = {
    cwd?: string;
    project?: string;
    resultSlug?: string;
    query?: string;
    requiresProvenance?: boolean;
    mode?: ResearchExecutionMode;
};
type UpdateInput = RunScope & {
    action?: string;
    query?: string;
    notes?: string;
    outcome?: string;
    reason?: string;
    sourceRefs?: string[];
    claimRefs?: string[];
    claimBindings?: unknown;
    expectedRevision?: number | string;
};
type Receipt = RunScope & ResearchReceiptEvent;
type ToolBlock = {
    block: true;
    reason: string;
    terminate?: true;
};
type DeliveryInput = RunScope & {
    prepared: PreparedResearchDelivery;
    copies: readonly ResearchDeliveryCopy[];
    assessment?: ResearchSummaryAssessment;
    memoryClaims?: readonly Record<string, unknown>[];
};
export declare function createResearchLoop(ports: ResearchLoopPorts): {
    startResearchRun: (input?: StartInput) => Promise<{
        run_dir: string;
        metadata: ResearchRunMetadata;
        evidence_gate: ResearchGate;
        revision: number;
        escalationRequired: boolean | undefined;
    }>;
    updateResearchLoop: (input?: UpdateInput) => Promise<{
        escalationRequired?: boolean | undefined;
        run_dir: string;
        metadata: ResearchRunMetadata;
        evidence_gate: ResearchGate;
        revision: number;
    }>;
    completeResearchGate: (input?: Omit<UpdateInput, "action">) => Promise<{
        escalationRequired?: boolean | undefined;
        run_dir: string;
        metadata: ResearchRunMetadata;
        evidence_gate: ResearchGate;
        revision: number;
    }>;
    prepareResearchDelivery: (input: RunScope & {
        markdown: string;
    }) => Promise<PreparedResearchDelivery>;
    commitResearchDelivery: (input: DeliveryInput) => Promise<ResearchDeliveryReceipt>;
    observeResearchReceipt: (receipt?: Receipt) => Promise<{
        escalationRequired?: boolean | undefined;
        run_dir: string;
        metadata: ResearchRunMetadata;
        evidence_gate: ResearchGate;
        revision: number;
    } | null>;
    checkTool: (cwd: string, runDir: string, step: ResearchToolStep, pending?: readonly ResearchToolStep[]) => Promise<ToolBlock | undefined>;
    observeUsage: (cwd: string, runDir: string, sample: ResearchUsageSample) => Promise<{
        escalationRequired?: boolean | undefined;
        run_dir: string;
        metadata: ResearchRunMetadata;
        evidence_gate: ResearchGate;
        revision: number;
    } | null>;
    observeContextEviction: (cwd: string, runDir: string, event: ResearchContextEviction) => Promise<{
        escalationRequired?: boolean | undefined;
        run_dir: string;
        metadata: ResearchRunMetadata;
        evidence_gate: ResearchGate;
        revision: number;
    } | null>;
    flushResearchReceipts: ({ cwd, runDir }?: RunScope) => Promise<void>;
    resetResearchReceipts: ({ cwd, runDir }?: RunScope) => void;
    topicIdFromResultSlug: typeof topicIdFromResultSlug;
    dispose: () => void;
};
