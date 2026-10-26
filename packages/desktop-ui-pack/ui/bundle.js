// ui/src/index.ts
function runtime() {
  return globalThis.window?.DroneUI;
}
function ResearchStatusPanel() {
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
        border: "1px solid color-mix(in srgb, currentColor 14%, transparent)"
      }
    },
    drone.React.createElement(
      "strong",
      { style: { display: "block", marginBottom: "4px" } },
      language === "zh" ? "\u79D1\u7814\u5DE5\u4F5C\u53F0" : "Research workbench"
    ),
    drone.React.createElement(
      "span",
      { style: { opacity: 0.72, fontSize: "12px" } },
      language === "zh" ? "\u5DF2\u4ECE\u5DF2\u5B89\u88C5 UI \u5305\u52A0\u8F7D" : "Loaded from the installed UI package"
    )
  );
}
export {
  ResearchStatusPanel
};
