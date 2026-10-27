import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
/** Public command/report contract used by native Pi and the Desktop command palette. */
export declare const DRONE_COMMAND_SCHEMA_VERSION: 1;
export declare const PI_CORE_PACKAGE_VERSION: "0.2.0";
export declare const PI_HOST_RANGE: ">=1.1.0 <2.0.0";
export type ExampleKind = "knowledge" | "research" | "analysis" | "evidence";
type KnowledgeStatus = "configured" | "unconfigured" | "unknown";
type CheckStatus = "pass" | "blocked" | "incompatible" | "unknown";
export interface DoctorReport {
    schemaVersion: typeof DRONE_COMMAND_SCHEMA_VERSION;
    command: "drone-doctor";
    status: CheckStatus;
    plugin: {
        name: "@gyoungwe/pi-core";
        version: string;
        piRange: string;
    };
    host: {
        kind: "native-pi" | "drone-desktop" | "unknown";
        version: string | null;
        source: string;
    };
    checks: Array<{
        id: string;
        status: CheckStatus;
        detail: string;
        missing?: string[];
    }>;
    commands: string[];
    tools: string[];
    next: string | null;
}
export interface ExampleReport {
    schemaVersion: typeof DRONE_COMMAND_SCHEMA_VERSION;
    command: "drone-example";
    example: ExampleKind;
    status: "unconfigured" | "needs-data" | "needs-container" | "blocked" | "ready" | "started";
    mode: "preview" | "run";
    title: string;
    steps: string[];
    requiredTools: string[];
    missingTools: string[];
    next: string;
    question?: string;
}
export declare function buildDoctorReport(pi: any, options?: {
    hostKind?: DoctorReport["host"]["kind"];
    hostVersion?: string | null;
}): DoctorReport;
export declare function buildExampleReport(pi: any, mode?: ExampleReport["mode"], question?: string, options?: {
    example?: ExampleKind;
    knowledgeStatus?: KnowledgeStatus;
    containerAvailable?: boolean;
}): ExampleReport;
export declare function parseExampleArgs(args: string): {
    mode: ExampleReport["mode"];
    example: ExampleKind;
    question?: string;
};
/** Register the stable onboarding commands used by native Pi and Desktop. */
export declare function registerDroneCommands(pi: ExtensionAPI, options?: {
    hostKind?: DoctorReport["host"]["kind"];
}): void;
export {};
