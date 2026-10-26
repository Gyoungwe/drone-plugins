import { useLanguage } from "./runtime-api";

const zh = {
	title: "知识库",
	refresh: "刷新",
	loading: "正在加载…",
	search: "搜索",
	query: "搜索知识库",
	searchHint: "输入关键词查找当前知识库中的资料",
	unconfigured: "尚未绑定知识库",
	unconfiguredHint: "完成知识库绑定后，这里会显示概览并支持搜索。",
	project: "当前课题",
	application: "共享资料",
	notes: "篇笔记",
	recent: "最近更新",
	noRecent: "暂无索引记录。",
	indexMissing: "尚未读取索引状态。",
	uninitialized: "索引尚未初始化",
	indexing: "正在建立索引",
	partial: "索引尚未完整",
	ready: "索引已就绪",
	results: "搜索结果",
	noResults: "没有匹配结果。",
	incomplete: "索引尚未完整，当前结果不代表全部资料。",
	lines: "行",
	unsupportedTitle: "其他知识功能暂不可用",
	unsupported:
		"当前支持概览、搜索和刷新。笔记阅读、知识图谱、审核、设置、自动发现、云同步及 Zotero 功能仍在迁移中。",
	readOnly: "搜索片段仅供浏览，不代表当前会话已读取原文或完成证据核验。",
};
const en: Record<keyof typeof zh, string> = {
	title: "Knowledge",
	refresh: "Refresh",
	loading: "Loading…",
	search: "Search",
	query: "Search knowledge",
	searchHint: "Find material in the current knowledge library",
	unconfigured: "No knowledge library is bound",
	unconfiguredHint:
		"Bind a knowledge library to view its overview and search its contents.",
	project: "Current project",
	application: "Shared material",
	notes: "notes",
	recent: "Recently updated",
	noRecent: "No indexed records yet.",
	indexMissing: "Index status has not been read yet.",
	uninitialized: "Index not initialized",
	indexing: "Indexing",
	partial: "Index incomplete",
	ready: "Index ready",
	results: "Search results",
	noResults: "No matching results.",
	incomplete:
		"The index is incomplete; these results do not represent all material.",
	lines: "Lines",
	unsupportedTitle: "Other knowledge features are temporarily unavailable",
	unsupported:
		"Overview, search and refresh are available. Note reading, graphs, reviews, settings, discovery, cloud sync and Zotero are still being migrated.",
	readOnly:
		"Search excerpts are for browsing. They do not establish that this session read the source or verified its evidence.",
};
export function useNativeKnowledgeText() {
	return useLanguage() === "zh" ? zh : en;
}
