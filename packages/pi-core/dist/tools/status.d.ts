import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
declare const statusParams: Type.TObject<{
    kind: Type.TOptional<Type.TUnion<[Type.TLiteral<"plan">, Type.TLiteral<"update">, Type.TLiteral<"progress">, Type.TLiteral<"summary">]>>;
    detail: Type.TOptional<Type.TString>;
    next: Type.TOptional<Type.TString>;
    text: Type.TString;
    phase: Type.TOptional<Type.TUnion<[Type.TLiteral<"planning">, Type.TLiteral<"literature-search">, Type.TLiteral<"knowledge-search">, Type.TLiteral<"web-search">, Type.TLiteral<"reading">, Type.TLiteral<"verification">, Type.TLiteral<"synthesis">, Type.TLiteral<"deposit">, Type.TLiteral<"archive">, Type.TLiteral<"skill-evolution">, Type.TLiteral<"other">]>>;
}>;
export interface StatusToolDetails {
    status: string;
    phase: string;
    uiOnly: true;
    detail?: string;
    next?: string;
    kind?: "plan" | "update" | "summary";
}
export declare function makeStatusTool(): ToolDefinition<typeof statusParams>;
export {};
