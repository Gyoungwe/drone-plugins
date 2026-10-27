import { type TodoItem } from "../contracts";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
export { formatTodoList } from "../contracts";
/**
 * 规整 todo 输入：去空 content；同时最多保留一个 in_progress（保留第一个、其余降 pending）；
 * 超出上限截断。返回规范后的列表。
 */
export declare function normalizeTodos(raw: TodoItem[]): TodoItem[];
declare const todoParams: Type.TObject<{
    todos: Type.TArray<Type.TObject<{
        content: Type.TString;
        status: Type.TUnion<[Type.TLiteral<"pending">, Type.TLiteral<"in_progress">, Type.TLiteral<"completed">]>;
    }>>;
}>;
/**
 * 内置 todo 工具：维护复杂多步任务的任务清单（全量替换协议，Claude Code TodoWrite 同款）。
 * 不做 todo_read：模型可见的 content 即当前清单（tool result 回显在上下文里），
 * compaction 后由 todo-reminder 扩展自动重新注入。
 */
export declare function makeTodoTool(): ToolDefinition<typeof todoParams>;
