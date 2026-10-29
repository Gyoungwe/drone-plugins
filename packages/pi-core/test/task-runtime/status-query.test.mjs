import { expect, it } from "vitest";
import { isTaskStatusQuery } from "../../src/task-runtime/status-query.mjs";
it.each(["完成到哪了", "进度怎么样？", "查看任务进度", "任务状态", "task status", "What's the status?"])("recognizes task status: %s", text => {
 expect(isTaskStatusQuery(text)).toBe(true);
});
it.each(["继续", "请分析任务状态的数据结构", "what is the status of this gene?", "status page layout"])("keeps ordinary requests available to the model: %s", text => {
 expect(isTaskStatusQuery(text)).toBe(false);
});
