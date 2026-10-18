/**
 * The host supplies the React instance and UI hooks through window.DroneUI.
 * Keeping this package import-free makes the tarball safe to install without
 * bundling a second React copy and keeps the renderer boundary explicit.
 */
type DroneUiRuntime = {
	React: { createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown };
	hooks: { useLanguage: () => "zh" | "en" };
};

function runtime(): DroneUiRuntime | undefined {
	return (globalThis as { window?: { DroneUI?: DroneUiRuntime } }).window?.DroneUI;
}

export function ResearchStatusPanel(): unknown {
	const drone = runtime();
	if (!drone) return null;
	const language = drone.hooks.useLanguage();
	return drone.React.createElement(
		"section",
		{
			"data-drone-ui-pack": "research-status",
			style: {
				padding: "12px 14px",
				borderRadius: "12px",
				border: "1px solid color-mix(in srgb, currentColor 14%, transparent)",
			},
		},
		drone.React.createElement(
			"strong",
			{ style: { display: "block", marginBottom: "4px" } },
			language === "zh" ? "科研工作台" : "Research workbench",
		),
		drone.React.createElement(
			"span",
			{ style: { opacity: 0.72, fontSize: "12px" } },
			language === "zh" ? "已从已安装 UI 包加载" : "Loaded from the installed UI package",
		),
	);
}
