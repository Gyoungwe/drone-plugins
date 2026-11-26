import { type FailureCandidateSink } from "./core/failure-candidates.js";
import type { Tool } from "./research-loop-tool.js";
export { citationUri, pageRange } from "./evidence-loop-parse.js";
type Pi = {
    registerTool(tool: Omit<Tool, "executionMode">): void;
};
export interface EvidenceLoopOptions {
    failureCandidateSink?: FailureCandidateSink;
}
export declare function registerEvidenceLoop(pi: Pi, { failureCandidateSink }?: EvidenceLoopOptions): void;
