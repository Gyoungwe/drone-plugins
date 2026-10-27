import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
export declare const MEMORY_SAVE_TOOL = "memory_save";
declare const memorySaveParams: Type.TObject<{
    action: Type.TOptional<Type.TUnion<[Type.TLiteral<"save">, Type.TLiteral<"forget">]>>;
    type: Type.TOptional<Type.TUnion<[Type.TLiteral<"feedback">, Type.TLiteral<"user">]>>;
    name: Type.TOptional<Type.TString>;
    description: Type.TOptional<Type.TString>;
    body: Type.TOptional<Type.TString>;
    file: Type.TOptional<Type.TString>;
}>;
export interface MemorySaveDetails {
    action: "save" | "forget";
    file: string;
    name?: string;
    removed?: boolean;
}
/** H2：模型自写项目记忆。只写 feedback/user，只在受信任项目开放；结果首行「已记住：…」，可用 forget 撤销。 */
export declare function makeMemorySaveTool(): ToolDefinition<typeof memorySaveParams>;
export {};
