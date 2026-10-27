/**
 * 项目记忆（P12）：`<cwd>/.pi/memory/` 下一条记忆一个带类型的 Markdown 文件，`MEMORY.md` 是索引。
 * 系统提示只注入索引（每行一条：标题 + 一句话），正文按需用 read 读取，保持提示词精简。
 */
export declare const MEMORY_TYPES: readonly ["user", "feedback", "project", "reference"];
export type MemoryType = (typeof MEMORY_TYPES)[number];
export interface MemoryEntry {
    name: string;
    description: string;
    type: MemoryType;
    body: string;
}
export declare const MEMORY_INDEX = "MEMORY.md";
export declare const MAX_INDEX_LINES = 200;
export declare function memoryDir(cwd: string): string;
export declare function memorySlug(name: string): string;
export declare function serializeMemory(entry: MemoryEntry): string;
export declare function parseMemory(text: string): MemoryEntry | null;
export declare function renderMemoryIndex(entries: Array<MemoryEntry & {
    file: string;
}>): string;
export declare function listMemories(cwd: string): Array<MemoryEntry & {
    file: string;
}>;
/** 写一条记忆（同名覆盖）并重建索引。返回文件名。 */
export declare function writeMemory(cwd: string, entry: MemoryEntry): string;
/** 注入系统提示的段落：只有索引，超过 MAX_INDEX_LINES 行截断。没有记忆返回空数组。 */
export declare function memoryIndexPrompt(cwd: string): string[];
/** H2：撤销一条记忆（删除文件并重建索引）。文件名必须是 listMemories 能列出的条目；返回是否删除。 */
export declare function forgetMemory(cwd: string, file: string): boolean;
