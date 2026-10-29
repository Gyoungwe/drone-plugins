import { type AskRequest, type AskResponse } from "../contracts";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
declare const paramsSchema: Type.TObject<{
    title: Type.TOptional<Type.TString>;
    kind: Type.TOptional<Type.TUnion<[Type.TLiteral<"clarification">, Type.TLiteral<"authorization">]>>;
    purpose: Type.TOptional<Type.TUnion<[Type.TLiteral<"clarification">, Type.TLiteral<"authorization">]>>;
    questions: Type.TArray<Type.TObject<{
        id: Type.TString;
        label: Type.TOptional<Type.TString>;
        prompt: Type.TString;
        type: Type.TOptional<Type.TUnion<[Type.TLiteral<"single">, Type.TLiteral<"multi">, Type.TLiteral<"preview">, Type.TLiteral<"text">]>>;
        required: Type.TOptional<Type.TBoolean>;
        options: Type.TArray<Type.TObject<{
            value: Type.TString;
            label: Type.TString;
            description: Type.TOptional<Type.TString>;
            preview: Type.TOptional<Type.TString>;
            recommended: Type.TOptional<Type.TBoolean>;
        }>>;
        recommendation: Type.TOptional<Type.TObject<{
            value: Type.TString;
            reason: Type.TString;
            confidence: Type.TOptional<Type.TUnion<[Type.TLiteral<"high">, Type.TLiteral<"medium">, Type.TLiteral<"low">]>>;
            basedOn: Type.TOptional<Type.TArray<Type.TString>>;
        }>>;
        allowCustomText: Type.TOptional<Type.TBoolean>;
    }>>;
    proposal: Type.TOptional<Type.TObject<{
        proposalHash: Type.TString;
        contextHash: Type.TOptional<Type.TString>;
        capabilityHash: Type.TOptional<Type.TString>;
        workflowHash: Type.TOptional<Type.TString>;
        recommendation: Type.TOptional<Type.TObject<{
            value: Type.TString;
            reason: Type.TString;
            confidence: Type.TOptional<Type.TUnion<[Type.TLiteral<"high">, Type.TLiteral<"medium">, Type.TLiteral<"low">]>>;
            basedOn: Type.TOptional<Type.TArray<Type.TString>>;
        }>>;
        reason: Type.TOptional<Type.TString>;
        evidence: Type.TOptional<Type.TArray<Type.TString>>;
        benefits: Type.TOptional<Type.TArray<Type.TString>>;
        costs: Type.TOptional<Type.TArray<Type.TString>>;
        risks: Type.TOptional<Type.TArray<Type.TString>>;
        resources: Type.TOptional<Type.TArray<Type.TString>>;
        authorizationActions: Type.TOptional<Type.TArray<Type.TObject<{
            id: Type.TString;
            label: Type.TString;
            description: Type.TOptional<Type.TString>;
            risk: Type.TOptional<Type.TUnion<[Type.TLiteral<"low">, Type.TLiteral<"high">]>>;
            independent: Type.TOptional<Type.TBoolean>;
        }>>>;
        authorizationScopeHash: Type.TOptional<Type.TString>;
    }>>;
    decisionProposal: Type.TOptional<Type.TObject<{
        proposalHash: Type.TString;
        contextHash: Type.TOptional<Type.TString>;
        capabilityHash: Type.TOptional<Type.TString>;
        workflowHash: Type.TOptional<Type.TString>;
        recommendation: Type.TOptional<Type.TObject<{
            value: Type.TString;
            reason: Type.TString;
            confidence: Type.TOptional<Type.TUnion<[Type.TLiteral<"high">, Type.TLiteral<"medium">, Type.TLiteral<"low">]>>;
            basedOn: Type.TOptional<Type.TArray<Type.TString>>;
        }>>;
        reason: Type.TOptional<Type.TString>;
        evidence: Type.TOptional<Type.TArray<Type.TString>>;
        benefits: Type.TOptional<Type.TArray<Type.TString>>;
        costs: Type.TOptional<Type.TArray<Type.TString>>;
        risks: Type.TOptional<Type.TArray<Type.TString>>;
        resources: Type.TOptional<Type.TArray<Type.TString>>;
        authorizationActions: Type.TOptional<Type.TArray<Type.TObject<{
            id: Type.TString;
            label: Type.TString;
            description: Type.TOptional<Type.TString>;
            risk: Type.TOptional<Type.TUnion<[Type.TLiteral<"low">, Type.TLiteral<"high">]>>;
            independent: Type.TOptional<Type.TBoolean>;
        }>>>;
        authorizationScopeHash: Type.TOptional<Type.TString>;
    }>>;
}>;
export interface AskUserToolDeps {
    ask: (request: Omit<AskRequest, "id" | "sessionId">, signal?: AbortSignal, ctx?: unknown) => Promise<AskResponse>;
}
export declare function makeAskUserTool(deps: AskUserToolDeps): ToolDefinition<typeof paramsSchema>;
export {};
