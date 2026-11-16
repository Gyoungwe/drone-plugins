export const specialistZh = {
	specialist_reviewer: "Wiki 模型审核员",
	specialists: "知识库协作助手",
	specialistMode: "自动调度模式",
	specialistAuto: "按阶段自动调用",
	specialistManual: "仅明确委派",
	specialistOff: "关闭",
	specialistCost:
		"协作助手使用独立模型请求，可能产生费用。默认沿用主模型；可在模型设置中单独指定。只传当前任务与必要来源，不传主会话历史。",
	specialistDenied: "当前知识库目录不允许协作助手访问；调度已关闭，不能用此开关提升权限。",
	specialistPermissions: "角色、职责与最小权限",
	specialistLimits:
		"每轮最多 4 次，知识协作助手全应用最多并发 2 个；单个最长 120 秒。无 shell、网络抓取、递归委派、正式 Wiki 写入或批准权限。",
	specialistLimitsSummary:
		"每轮最多 {maxRunsPerTurn} 次；最多并发 {concurrency} 个（上限 {maxConcurrency}）；单个最长 {timeoutSeconds} 秒。",
	specialistModels: "配置协作助手模型",
	specialistModel: "模型",
	specialistThinking: "思考强度",
	specialistFollowMain: "跟随主会话",
	specialistUnavailable: "当前不可用",
	specialistBudget: "预算",
	specialistLastRun: "最近运行",
	specialistNeverRun: "当前会话尚未运行",
	specialistTriggerReview: "仅人工触发审核",
	specialist_navigator: "知识导航员",
	specialist_navigator_hint: "知识请求开始时读导航、找相关 Wiki 与证据；返回少量入口。",
	specialist_evidence: "证据整理员",
	specialist_evidence_hint: "多来源比较时核对范围、版本与冲突；不认证科学正确性。",
	specialist_wiki: "Wiki 修订员",
	specialist_wiki_hint: "摘要保存后起草修订；应用暂存候选修改，仍需你审核。",
	specialist_explainer: "Show Me 讲解员",
	specialist_explainer_hint: "基于指定来源和已加载的研究工具生成讲解；应用归档结果，不执行软件测试。",
	specialistRuns: "知识协作助手运行",
	specialistUsage: "输入 / 输出 tokens",
	specialistUnverified: "协作助手摘要是待核验的交接摘要，不是主会话的读取记录或最终结论。",
};

export const specialistEn: Record<keyof typeof specialistZh, string> = {
	specialist_reviewer: "Wiki reviewer",
	specialists: "Knowledge collaborators",
	specialistMode: "Specialist dispatch mode",
	specialistAuto: "Automatic by stage",
	specialistManual: "Explicit delegation only",
	specialistOff: "Off",
	specialistCost:
		"Separate model requests may incur charges. Inherit the parent model unless configured per role. Only the task and selected sources are sent, never parent history.",
	specialistDenied:
		"Knowledge-base policy denies access for collaborating assistants. This switch cannot elevate permissions.",
	specialistPermissions: "Roles and capability limits",
	specialistLimits:
		"Up to 4 calls per turn, 2 knowledge specialists concurrently across the app, 120 seconds each. No shell, network fetch, recursive delegation, live Wiki writes or approval.",
	specialistLimitsSummary:
		"Up to {maxRunsPerTurn} calls per turn; {concurrency} concurrently (maximum {maxConcurrency}); up to {timeoutSeconds} seconds per run.",
	specialistModels: "Configure specialist models",
	specialistModel: "Model",
	specialistThinking: "Thinking",
	specialistFollowMain: "Follow main session",
	specialistUnavailable: "currently unavailable",
	specialistBudget: "Budget",
	specialistLastRun: "Last run",
	specialistNeverRun: "Not run in this session",
	specialistTriggerReview: "Human-triggered review only",
	specialist_navigator: "Knowledge navigator",
	specialist_navigator_hint:
		"Read navigation, locate relevant Wiki and evidence at the start of knowledge tasks.",
	specialist_evidence: "Evidence curator",
	specialist_evidence_hint:
		"Compare assigned sources, versions, applicability and conflicts; no scientific certification.",
	specialist_wiki: "Wiki editor",
	specialist_wiki_hint:
		"Draft after summary save. The application stages the candidate; human approval is still required.",
	specialist_explainer: "Show Me explainer",
	specialist_explainer_hint:
		"Use assigned sources and the loaded research tool. The application archives the result; no software execution or tests.",
	specialistRuns: "Specialist runs",
	specialistUsage: "Input / output tokens",
	specialistUnverified:
		"Specialist summaries are unverified handoff notes, not parent reading records or final conclusions.",
};
