import { type ResearchLoopPorts } from "./core/research-loop.js";
import { type PreparedResearchDelivery, type ResearchDeliveryCopy, type ResearchDeliveryReceipt, type ResearchSummaryReviewPacket } from "./core/research-delivery.js";
export interface ResearchExtensionPorts extends ResearchLoopPorts {
    resolveSessionProject(ctx: any, requested?: string): Promise<{
        project: string;
    }>;
    describeProject(resolution: any): unknown;
    registerTool(pi: any, tool: any): void;
    run<T>(operation: () => T | Promise<T>): Promise<T>;
    reviewSummary?(ctx: any, packet: ResearchSummaryReviewPacket): Promise<unknown>;
}
type Tool = {
    name: string;
    label: string;
    description: string;
    parameters: Record<string, unknown>;
    drone?: Record<string, unknown>;
    execute: (...args: any[]) => Promise<unknown>;
};
type Pi = {
    events?: {
        on?: (event: string, listener: (...args: any[]) => any) => unknown;
        emit?: (...args: any[]) => unknown;
    };
    registerTool(definition: Tool): void;
    on?: (event: string, listener: (...args: any[]) => any) => unknown;
};
export interface ResearchDeliveryWriterResult<T> {
    value: T;
    copies: readonly ResearchDeliveryCopy[];
    rollback(): Promise<void>;
}
export interface ResearchExtensionHandle {
    deliver<T>(ctx: any, input: {
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
export {};
