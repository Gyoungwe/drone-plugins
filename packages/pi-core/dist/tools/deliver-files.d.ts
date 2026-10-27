import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
export declare const deliverFilesParams: Type.TObject<{
    files: Type.TArray<Type.TObject<{
        path: Type.TString;
        title: Type.TOptional<Type.TString>;
        description: Type.TOptional<Type.TString>;
    }>>;
}>;
export interface DeliverFilesDetails {
    files: Array<{
        path: string;
        title: string;
        description?: string;
        bytes: number;
    }>;
}
/**
 * P17：交付工具。只校验文件存在并回传元数据（不读内容），UI 据此渲染横向交付卡，点击在右栏 PreviewHost 打开。
 */
export declare function makeDeliverFilesTool(): ToolDefinition<typeof deliverFilesParams>;
