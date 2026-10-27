// ui/src/index.ts
var EMPTY_TASKS = [];
var EMPTY_ENTRY = { todos: EMPTY_TASKS };
function runtime() {
  return globalThis.window?.DroneUI;
}
function WorkbenchPanelImpl() {
  const drone = runtime();
  if (!drone) return null;
  const language = drone.hooks.useLanguage();
  const activeSessionId = drone.stores.useSessionsStore((state) => state.activeSessionId);
  const entry = drone.stores.useTranscriptStore(
    (state) => (activeSessionId ? state.bySession[activeSessionId] : void 0) ?? EMPTY_ENTRY
  );
  const tasks = entry.todos ?? EMPTY_TASKS;
  const text = language === "zh" ? { title: "\u5DE5\u4F5C\u53F0", tasks: "\u4EFB\u52A1", memory: "\u8BB0\u5FC6", noTasks: "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u4EFB\u52A1\u3002", noMemory: "\u8FD8\u6CA1\u6709\u4FDD\u5B58\u7684\u5DE5\u4F5C\u53F0\u8BB0\u5FC6\u3002" } : { title: "Workbench", tasks: "Tasks", memory: "Memory", noTasks: "No tasks in the active session.", noMemory: "No saved workbench memory yet." };
  const taskChildren = tasks.length > 0 ? tasks.map((task) => drone.React.createElement(
    "li",
    { key: `${task.status}:${task.content}`, className: "flex items-start gap-2 text-[13px] text-ink" },
    drone.React.createElement("span", { className: "text-ink-dim", "aria-hidden": true }, task.status === "completed" ? "\u2713" : "\xB7"),
    task.content
  )) : [drone.React.createElement("li", { key: "empty", className: "text-[13px] text-ink-dim" }, text.noTasks)];
  return drone.React.createElement(
    "section",
    { "data-drone-ui-workbench": "panel", className: "flex flex-col gap-4 p-4 text-ink" },
    drone.React.createElement("h2", { className: "text-[15px] font-medium" }, text.title),
    drone.React.createElement(
      "div",
      { className: "flex flex-col gap-2" },
      drone.React.createElement("h3", { className: "text-[12px] font-medium uppercase tracking-wide text-ink-dim" }, text.tasks),
      drone.React.createElement("ul", { className: "flex flex-col gap-1", "aria-label": text.tasks }, taskChildren)
    ),
    drone.React.createElement(
      "div",
      { className: "flex flex-col gap-2" },
      drone.React.createElement("h3", { className: "text-[12px] font-medium uppercase tracking-wide text-ink-dim" }, text.memory),
      drone.React.createElement("p", { className: "text-[13px] text-ink-dim" }, text.noMemory)
    )
  );
}
var fallbackMemo = (component) => component;
var WorkbenchPanel = (runtime()?.React.memo ?? fallbackMemo)(WorkbenchPanelImpl);
export {
  WorkbenchPanel
};
