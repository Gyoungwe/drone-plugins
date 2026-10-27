import { memo, type ReactNode } from "react";

type Language = "zh" | "en";
type DroneUiRuntime = { hooks: { useLanguage: () => Language } };

function runtime(): DroneUiRuntime | undefined {
	return (globalThis as { window?: { DroneUI?: DroneUiRuntime } }).window?.DroneUI;
}

function useLanguage(): Language {
	const drone = runtime();
	return drone ? drone.hooks.useLanguage() : "en";
}

function ResearchCard({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<section className="rounded-lg border border-border bg-surface p-3 text-ink shadow-soft">
			<h2 className="text-[13px] font-medium">{title}</h2>
			<p className="mt-1 text-[12px] text-ink-2">{description}</p>
			<div className="mt-3 flex flex-wrap gap-2">{children}</div>
		</section>
	);
}

function Badge({ children }: { children: ReactNode }) {
	return <span className="rounded-md border border-border bg-canvas px-2 py-1 text-[11px] text-ink-2">{children}</span>;
}

export const ResearchHome = memo(function ResearchHome() {
	const language = useLanguage();
	return (
		<ResearchCard
			title={language === "zh" ? "研究工作台" : "Research workbench"}
			description={
				language === "zh"
					? "从新任务开始一条有证据回执的研究流程。"
					: "Start an evidence-gated research flow from a new task."
			}
		>
			<Badge>{language === "zh" ? "来源检索" : "Source search"}</Badge>
			<Badge>{language === "zh" ? "引用回执" : "Citation receipts"}</Badge>
			<Badge>{language === "zh" ? "连接器授权" : "Connector authorization"}</Badge>
		</ResearchCard>
	);
});

export const ResearchCitations = memo(function ResearchCitations() {
	const language = useLanguage();
	return (
		<ResearchCard
			title={language === "zh" ? "引用" : "Citations"}
			description={
				language === "zh"
					? "研究回答只使用本轮已读取并带哈希回执的来源。"
					: "Research answers use sources read in this run with hash receipts."
			}
		>
			<Badge>{language === "zh" ? "读取后才能引用" : "Read before citing"}</Badge>
			<Badge>{language === "zh" ? "页码可追溯" : "Page traceable"}</Badge>
		</ResearchCard>
	);
});

export const ResearchConnectors = memo(function ResearchConnectors() {
	const language = useLanguage();
	return (
		<ResearchCard
			title={language === "zh" ? "研究连接器" : "Research connectors"}
			description={
				language === "zh"
					? "连接器由宿主授权；不可用时研究流程保留本地来源降级路径。"
					: "Connectors are authorized by the host; local sources remain available when one is unavailable."
			}
		>
			<Badge>{language === "zh" ? "开放来源" : "Open sources"}</Badge>
			<Badge>Zotero</Badge>
			<Badge>{language === "zh" ? "机构访问" : "Institutional access"}</Badge>
		</ResearchCard>
	);
});
