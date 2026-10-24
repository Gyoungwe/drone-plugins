import { type ResearchLoopPorts } from "./core/research-loop.js";
export interface ResearchExtensionPorts extends ResearchLoopPorts {
    resolveSessionProject(ctx: any, requested?: string): Promise<{
        project: string;
    }>;
    describeProject(resolution: any): unknown;
    registerTool(pi: any, tool: any): void;
    run<T>(operation: () => T | Promise<T>): Promise<T>;
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
export declare function registerResearchExtension(pi: Pi, ports: ResearchExtensionPorts): void;
export {};
