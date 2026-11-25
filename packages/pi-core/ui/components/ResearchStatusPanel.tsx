import { useLanguage } from "../api";

export function ResearchStatusPanelContent() {
	const zh = useLanguage() === "zh";
	return (
		<section
			data-drone-ui-pack="research-status"
			style={{
				padding: "12px 14px",
				borderRadius: "12px",
				border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
			}}
		>
			<strong style={{ display: "block", marginBottom: "4px" }}>
				{zh ? "科研工作台" : "Research workbench"}
			</strong>
			<span style={{ opacity: 0.72, fontSize: "12px" }}>
				{zh ? "已从已安装 UI 包加载" : "Loaded from the installed UI package"}
			</span>
		</section>
	);
}
