import { useLanguage } from "./api";

const zh = {
 "storage.unknown": "这条历史记录没有存储回执，无法确认已保存。",
 "storage.memory": "仅保留在当前内存会话，未保存到磁盘；重新加载后需要重新授权。",
 "storage.deferred": "检查点尚未落盘，外部写入暂不可用。",
 "storage.failed": "会话存储失败，显示最近确认的记录；请从磁盘重新打开。",
	"taskRow.running": "任务仍在执行；完成进度会随结果更新，无需重复发起。",
	"taskRow.unconfirmed":
		"还有几项没确认完成；这是较早的记录，先核对一下已有结果，别重复生成。",
	"taskRow.noDeliverables": "还没约定要交付什么，暂不显示进度。",
	"taskRow.steps": "已执行 {n} 步",
	"taskRow.accepted": " · 已完成 {done}/{total}",
	"taskRow.progressLabel": "交付完成进度",
	"taskRow.progressText": "已完成 {done}/{total} 项",
	"taskRow.continue": "继续做剩下的",
	"taskRow.milestones": "交付项 {done}/{total}",
	"taskRow.operations": "操作记录 {n}",
	"taskArtifacts.openSessionFirst": "请先打开产物所属会话",
	"taskArtifacts.changed": "文件已变化，预览当前版本",
	"taskArtifacts.notFound": "文件待重新定位",
	"taskArtifacts.preview": "侧栏预览",
	"taskArtifacts.more": "另有 {count} 个产物，见详细记录",
	panelTitle: "任务安排",
	attention: "有 {count} 项任务需要你处理",
	incompatible:
		"任务界面与当前宿主不兼容，需要 Plugin API 1.3 的会话消息和发送接口。",
	empty: "此会话还没有任务记录。",
};
const en: Record<keyof typeof zh, string> = {
 "storage.unknown": "This historical record has no storage receipt; saved state is unconfirmed.",
 "storage.memory": "Live-only in this memory session, not saved to disk; reload requires fresh authorization.",
 "storage.deferred": "The checkpoint is not on disk yet; external writes are unavailable.",
 "storage.failed": "Session storage failed. Showing the last confirmed state; reopen from disk.",
	"taskRow.running":
		"The task is still running; acceptance progress updates as results come in — no need to start it again.",
	"taskRow.unconfirmed":
		"Some items are not confirmed yet; this is an older record — check the existing results before generating them again.",
	"taskRow.noDeliverables":
		"No deliverables have been agreed yet, so there is no progress to show.",
	"taskRow.steps": "{n} steps run",
	"taskRow.accepted": " · {done}/{total} accepted",
	"taskRow.progressLabel": "Deliverable acceptance progress",
	"taskRow.progressText": "{done} of {total} accepted",
	"taskRow.continue": "Continue with the rest",
	"taskRow.milestones": "Acceptance items {done}/{total}",
	"taskRow.operations": "Operation log {n}",
	"taskArtifacts.openSessionFirst":
		"Open the session this output belongs to first",
	"taskArtifacts.changed": "file changed — previews the current version",
	"taskArtifacts.notFound": "file needs to be located again",
	"taskArtifacts.preview": "preview in sidebar",
	"taskArtifacts.more": "{count} more outputs in the full record",
	panelTitle: "Tasks",
	attention: "{count} tasks need your attention",
	incompatible:
		"Task UI is incompatible with this host; Plugin API 1.3 session messages and prompt bindings are required.",
	empty: "This session has no task records yet.",
};
export type TaskTextKey = keyof typeof zh;
export function taskText(
	language: "zh" | "en",
	key: TaskTextKey,
	params: Record<string, string | number> = {},
): string {
	const text = (language === "en" ? en : zh)[key];
	return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]));
}
export function useTaskText() {
	const language = useLanguage();
	return (key: TaskTextKey, params?: Record<string, string | number>) =>
		taskText(language, key, params);
}
