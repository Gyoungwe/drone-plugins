import type { Buffer } from "node:buffer";
export interface TaskFileDescriptor {
 readonly path: string;
 readonly absolutePath: string;
 readonly rootKind: "workspace" | "vault" | "research-run";
}
export interface TaskFileExpectation {
 readonly kind?: string;
 readonly doi?: string;
 readonly title?: string;
 readonly sha256?: string;
}
export function inspectTaskBytes(bytes: Buffer, descriptor: TaskFileDescriptor, expected?: TaskFileExpectation): Promise<TaskFileDescriptor & {
 bytes: number;sha256: string;observedAt: string;kind:"file"|"pdf";identity:string;extraction?:{pages:number;partial:boolean};
}>;
