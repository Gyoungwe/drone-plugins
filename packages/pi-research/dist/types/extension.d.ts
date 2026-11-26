import { type PreparedResearchDelivery, type ResearchDeliveryCopy, type ResearchDeliveryReceipt, type ResearchSummaryReviewPacket } from "./core/research-delivery.js";
import { type ResearchLoopPorts } from "./core/research-loop.js";
import { type Context, type Tool } from "./research-loop-tool.js";
export type { FailureCandidateInput, FailureCandidateSink } from "./core/failure-candidates.js";
type Listener = (event: unknown, ctx: Context) => unknown;
type Pi = {
    events?: {
        on?(name: string, listener: (payload: unknown) => unknown): unknown;
        emit?(...args: unknown[]): unknown;
    };
    registerTool(definition: Tool): void;
    on?(event: string, listener: Listener): unknown;
};
type Project = {
    project: string;
};
export interface ResearchExtensionPorts extends ResearchLoopPorts {
    resolveSessionProject(ctx: Context, requested?: string): Promise<Project>;
    describeProject(resolution: Project): unknown;
    registerTool(pi: Pi, tool: Tool): void;
    run<T>(operation: () => T | Promise<T>): Promise<T>;
    reviewSummary?(ctx: Context, packet: ResearchSummaryReviewPacket): Promise<unknown>;
}
export interface ResearchDeliveryWriterResult<T> {
    value: T;
    copies: readonly ResearchDeliveryCopy[];
    rollback(): Promise<void>;
}
export interface ResearchExtensionHandle {
    deliver<T>(ctx: Context, input: {
        runDir: string;
        markdown: string;
        claims?: unknown;
    }, writer: (prepared: PreparedResearchDelivery) => Promise<ResearchDeliveryWriterResult<T>>): Promise<{
        value: T;
        receipt: ResearchDeliveryReceipt;
        claims: readonly Record<string, unknown>[];
    }>;
}
export declare function registerResearchExtension(pi: Pi, ports: ResearchExtensionPorts): ResearchExtensionHandle | undefined;
