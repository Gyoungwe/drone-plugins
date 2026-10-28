// ui/api.ts
var host = window.DroneUI;
var { sessions } = host;
var { useSessionMessages, useLanguage, useAgentActive } = host.hooks;
var { useSessionsStore, useUiStore } = host.stores;
var { openExternal, openResourceExternal } = host.helpers;
function uiCompatibility() {
  const missing = [];
  if (typeof host.sessions?.command !== "function")
    missing.push("sessions.command");
  if (typeof host.hooks.useSessionMessages !== "function")
    missing.push("hooks.useSessionMessages");
  return missing.length ? { status: "incompatible", missing } : { status: "compatible", missing };
}

// ui/copy.ts
var zh = {
  "taskRow.running": "\u4EFB\u52A1\u4ECD\u5728\u6267\u884C\uFF1B\u5B8C\u6210\u8FDB\u5EA6\u4F1A\u968F\u7ED3\u679C\u66F4\u65B0\uFF0C\u65E0\u9700\u91CD\u590D\u53D1\u8D77\u3002",
  "taskRow.unconfirmed": "\u8FD8\u6709\u51E0\u9879\u6CA1\u786E\u8BA4\u5B8C\u6210\uFF1B\u8FD9\u662F\u8F83\u65E9\u7684\u8BB0\u5F55\uFF0C\u5148\u6838\u5BF9\u4E00\u4E0B\u5DF2\u6709\u7ED3\u679C\uFF0C\u522B\u91CD\u590D\u751F\u6210\u3002",
  "taskRow.noDeliverables": "\u8FD8\u6CA1\u7EA6\u5B9A\u8981\u4EA4\u4ED8\u4EC0\u4E48\uFF0C\u6682\u4E0D\u663E\u793A\u8FDB\u5EA6\u3002",
  "taskRow.steps": "\u5DF2\u6267\u884C {n} \u6B65",
  "taskRow.accepted": " \xB7 \u5DF2\u5B8C\u6210 {done}/{total}",
  "taskRow.progressLabel": "\u4EA4\u4ED8\u5B8C\u6210\u8FDB\u5EA6",
  "taskRow.progressText": "\u5DF2\u5B8C\u6210 {done}/{total} \u9879",
  "taskRow.continue": "\u7EE7\u7EED\u505A\u5269\u4E0B\u7684",
  "taskRow.milestones": "\u4EA4\u4ED8\u9879 {done}/{total}",
  "taskRow.operations": "\u64CD\u4F5C\u8BB0\u5F55 {n}",
  "taskArtifacts.openSessionFirst": "\u8BF7\u5148\u6253\u5F00\u4EA7\u7269\u6240\u5C5E\u4F1A\u8BDD",
  "taskArtifacts.changed": "\u6587\u4EF6\u5DF2\u53D8\u5316\uFF0C\u9884\u89C8\u5F53\u524D\u7248\u672C",
  "taskArtifacts.notFound": "\u6587\u4EF6\u5F85\u91CD\u65B0\u5B9A\u4F4D",
  "taskArtifacts.preview": "\u4FA7\u680F\u9884\u89C8",
  "taskArtifacts.more": "\u53E6\u6709 {count} \u4E2A\u4EA7\u7269\uFF0C\u89C1\u8BE6\u7EC6\u8BB0\u5F55",
  panelTitle: "\u4EFB\u52A1\u5B89\u6392",
  attention: "\u6709 {count} \u9879\u4EFB\u52A1\u9700\u8981\u4F60\u5904\u7406",
  incompatible: "\u4EFB\u52A1\u754C\u9762\u4E0E\u5F53\u524D\u5BBF\u4E3B\u4E0D\u517C\u5BB9\uFF0C\u9700\u8981 Plugin API 1.3 \u7684\u4F1A\u8BDD\u6D88\u606F\u548C\u53D1\u9001\u63A5\u53E3\u3002",
  empty: "\u6B64\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u4EFB\u52A1\u8BB0\u5F55\u3002"
};
var en = {
  "taskRow.running": "The task is still running; acceptance progress updates as results come in \u2014 no need to start it again.",
  "taskRow.unconfirmed": "Some items are not confirmed yet; this is an older record \u2014 check the existing results before generating them again.",
  "taskRow.noDeliverables": "No deliverables have been agreed yet, so there is no progress to show.",
  "taskRow.steps": "{n} steps run",
  "taskRow.accepted": " \xB7 {done}/{total} accepted",
  "taskRow.progressLabel": "Deliverable acceptance progress",
  "taskRow.progressText": "{done} of {total} accepted",
  "taskRow.continue": "Continue with the rest",
  "taskRow.milestones": "Acceptance items {done}/{total}",
  "taskRow.operations": "Operation log {n}",
  "taskArtifacts.openSessionFirst": "Open the session this output belongs to first",
  "taskArtifacts.changed": "file changed \u2014 previews the current version",
  "taskArtifacts.notFound": "file needs to be located again",
  "taskArtifacts.preview": "preview in sidebar",
  "taskArtifacts.more": "{count} more outputs in the full record",
  panelTitle: "Tasks",
  attention: "{count} tasks need your attention",
  incompatible: "Task UI is incompatible with this host; Plugin API 1.3 session messages and prompt bindings are required.",
  empty: "This session has no task records yet."
};
function taskText(language, key, params = {}) {
  const text = (language === "en" ? en : zh)[key];
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name]));
}
function useTaskText() {
  const language = useLanguage();
  return (key, params) => taskText(language, key, params);
}

// generated-style:./styles/generated
var taskStyles = '/*! tailwindcss v4.3.3 | MIT License | https://tailwindcss.com */\n@layer drone-task-properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){:where(.drone-task-ui) *,:where(.drone-task-ui) :before,:where(.drone-task-ui) :after,:where(.drone-task-ui) ::backdrop{--drone-task-tw-space-y-reverse:0;--drone-task-tw-border-style:solid;--drone-task-tw-leading:initial;--drone-task-tw-font-weight:initial;--drone-task-tw-duration:initial;--drone-task-tw-ease:initial}}}@layer drone-task-theme{:where(.drone-task-ui),:where(.drone-task-ui){--spacing:.25rem;--text-xs:.75rem;--text-xs--line-height:calc(1 / .75);--font-weight-medium:500;--ease-out:cubic-bezier(0, 0, .2, 1);--default-transition-duration:.15s;--default-transition-timing-function:cubic-bezier(.4, 0, .2, 1)}}@layer drone-task-utilities{:where(.drone-task-ui) .mt-0\\.5{margin-top:calc(var(--spacing) * .5)}:where(.drone-task-ui) .mt-1{margin-top:var(--spacing)}:where(.drone-task-ui) .mt-2{margin-top:calc(var(--spacing) * 2)}:where(.drone-task-ui) .mt-3{margin-top:calc(var(--spacing) * 3)}:where(.drone-task-ui) .ml-5{margin-left:calc(var(--spacing) * 5)}:where(.drone-task-ui) .flex{display:flex}:where(.drone-task-ui) .h-0\\.5{height:calc(var(--spacing) * .5)}:where(.drone-task-ui) .h-full{height:100%}:where(.drone-task-ui) .min-h-0{min-height:0}:where(.drone-task-ui) .w-full{width:100%}:where(.drone-task-ui) .max-w-full{max-width:100%}:where(.drone-task-ui) .min-w-0{min-width:0}:where(.drone-task-ui) .shrink-0{flex-shrink:0}:where(.drone-task-ui) .cursor-pointer{cursor:pointer}:where(.drone-task-ui) .list-disc{list-style-type:disc}:where(.drone-task-ui) .flex-wrap{flex-wrap:wrap}:where(.drone-task-ui) .items-center{align-items:center}:where(.drone-task-ui) .items-start{align-items:flex-start}:where(.drone-task-ui) .justify-between{justify-content:space-between}:where(.drone-task-ui) .gap-2{gap:calc(var(--spacing) * 2)}:where(.drone-task-ui) :where(.space-y-0\\.5>:not(:last-child)){--drone-task-tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * .5) * var(--drone-task-tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * .5) * calc(1 - var(--drone-task-tw-space-y-reverse)))}:where(.drone-task-ui) .gap-x-2{column-gap:calc(var(--spacing) * 2)}:where(.drone-task-ui) .truncate{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}:where(.drone-task-ui) .overflow-auto{overflow:auto}:where(.drone-task-ui) .overflow-hidden{overflow:hidden}:where(.drone-task-ui) .rounded{border-radius:.25rem}:where(.drone-task-ui) .rounded-full{border-radius:3.40282e38px}:where(.drone-task-ui) .rounded-md{border-radius:8px}:where(.drone-task-ui) .rounded-xl{border-radius:14px}:where(.drone-task-ui) .border{border-style:var(--drone-task-tw-border-style);border-width:1px}:where(.drone-task-ui) .border-t{border-top-style:var(--drone-task-tw-border-style);border-top-width:1px}:where(.drone-task-ui) .border-b{border-bottom-style:var(--drone-task-tw-border-style);border-bottom-width:1px}:where(.drone-task-ui) .border-border,:where(.drone-task-ui) .border-border\\/70{border-color:var(--color-border)}@supports (color:color-mix(in lab, red, red)){:where(.drone-task-ui) .border-border\\/70{border-color:color-mix(in oklab, var(--color-border) 70%, transparent)}}:where(.drone-task-ui) .border-warn\\/35{border-color:var(--color-warn)}@supports (color:color-mix(in lab, red, red)){:where(.drone-task-ui) .border-warn\\/35{border-color:color-mix(in oklab, var(--color-warn) 35%, transparent)}}:where(.drone-task-ui) .bg-hover{background-color:var(--color-hover)}:where(.drone-task-ui) .bg-ok{background-color:var(--color-ok)}:where(.drone-task-ui) .bg-surface{background-color:var(--color-surface)}:where(.drone-task-ui) .bg-warn,:where(.drone-task-ui) .bg-warn\\/10{background-color:var(--color-warn)}@supports (color:color-mix(in lab, red, red)){:where(.drone-task-ui) .bg-warn\\/10{background-color:color-mix(in oklab, var(--color-warn) 10%, transparent)}}:where(.drone-task-ui) .p-3{padding:calc(var(--spacing) * 3)}:where(.drone-task-ui) .px-2{padding-inline:calc(var(--spacing) * 2)}:where(.drone-task-ui) .px-3{padding-inline:calc(var(--spacing) * 3)}:where(.drone-task-ui) .py-0\\.5{padding-block:calc(var(--spacing) * .5)}:where(.drone-task-ui) .py-1{padding-block:var(--spacing)}:where(.drone-task-ui) .py-2{padding-block:calc(var(--spacing) * 2)}:where(.drone-task-ui) .pt-3{padding-top:calc(var(--spacing) * 3)}:where(.drone-task-ui) .pl-4{padding-left:calc(var(--spacing) * 4)}:where(.drone-task-ui) .text-left{text-align:left}:where(.drone-task-ui) .text-xs{font-size:var(--text-xs);line-height:var(--drone-task-tw-leading,var(--text-xs--line-height))}:where(.drone-task-ui) .text-\\[12px\\]{font-size:12px}:where(.drone-task-ui) .text-\\[13px\\]{font-size:13px}:where(.drone-task-ui) .leading-4{--drone-task-tw-leading:calc(var(--spacing) * 4);line-height:calc(var(--spacing) * 4)}:where(.drone-task-ui) .leading-5{--drone-task-tw-leading:calc(var(--spacing) * 5);line-height:calc(var(--spacing) * 5)}:where(.drone-task-ui) .font-medium{--drone-task-tw-font-weight:var(--font-weight-medium);font-weight:var(--font-weight-medium)}:where(.drone-task-ui) .break-words{overflow-wrap:break-word}:where(.drone-task-ui) .break-all{word-break:break-all}:where(.drone-task-ui) .whitespace-pre-wrap{white-space:pre-wrap}:where(.drone-task-ui) .text-err{color:var(--color-err)}:where(.drone-task-ui) .text-ink{color:var(--color-ink)}:where(.drone-task-ui) .text-ink-2{color:var(--color-ink-2)}:where(.drone-task-ui) .text-ink-dim{color:var(--color-ink-dim)}:where(.drone-task-ui) .text-ink-faint{color:var(--color-ink-faint)}:where(.drone-task-ui) .text-link{color:var(--link)}:where(.drone-task-ui) .text-ok{color:var(--color-ok)}:where(.drone-task-ui) .text-warn{color:var(--color-warn)}:where(.drone-task-ui) .line-through{text-decoration-line:line-through}:where(.drone-task-ui) .underline{text-decoration-line:underline}:where(.drone-task-ui) .underline-offset-2{text-underline-offset:2px}:where(.drone-task-ui) .transition-\\[width\\]{transition-property:width;transition-timing-function:var(--drone-task-tw-ease,var(--default-transition-timing-function));transition-duration:var(--drone-task-tw-duration,var(--default-transition-duration))}:where(.drone-task-ui) .duration-200{--drone-task-tw-duration:.2s;transition-duration:.2s}:where(.drone-task-ui) .ease-out{--drone-task-tw-ease:var(--ease-out);transition-timing-function:var(--ease-out)}:where(.drone-task-ui) .last\\:border-0:last-child{border-style:var(--drone-task-tw-border-style);border-width:0}@media (hover:hover){:where(.drone-task-ui) .hover\\:bg-hover:hover{background-color:var(--color-hover)}:where(.drone-task-ui) .hover\\:underline:hover{text-decoration-line:underline}}:where(.drone-task-ui) .disabled\\:opacity-40:disabled{opacity:.4}@media (prefers-reduced-motion:reduce){:where(.drone-task-ui) .motion-reduce\\:transition-none{transition-property:none}}}@property --drone-task-tw-space-y-reverse{syntax:"*";inherits:false;initial-value:0}@property --drone-task-tw-border-style{syntax:"*";inherits:false;initial-value:solid}@property --drone-task-tw-leading{syntax:"*";inherits:false}@property --drone-task-tw-font-weight{syntax:"*";inherits:false}@property --drone-task-tw-duration{syntax:"*";inherits:false}@property --drone-task-tw-ease{syntax:"*";inherits:false}\n\n.drone-task-ui { min-width: 0; }\n';

// ui/components/TaskDecisionCard.tsx
import { useState } from "react";

// ui/format-card-text.ts
var MARKERS = [
  { pattern: /[-*•][ \t]+/ },
  { pattern: /\d+[.)、][ \t]+/ },
  { pattern: /[一二三四五六七八九十]+[、.][ \t]+/ }
];
function countMatches(value, pattern) {
  return value.match(new RegExp(pattern.source, "g"))?.length ?? 0;
}
function markerAfterColon(value) {
  const match = value.match(
    /[:：][ \t]*(?:[-*•][ \t]+|\d+[.)、][ \t]+|[一二三四五六七八九十]+[、.][ \t]+)/
  );
  if (!match) return void 0;
  return MARKERS.find(
    (marker) => new RegExp(`^${marker.pattern.source}`).test(
      match[0].replace(/^[:：][ \t]*/, "")
    )
  );
}
function formatLine(line) {
  const normalized = line.replace(/[ \t]+/g, " ").trim();
  if (!normalized) return "";
  const colonMarker = markerAfterColon(normalized);
  const repeatedMarker = MARKERS.find(
    (marker2) => countMatches(normalized, marker2.pattern) >= 2
  );
  const marker = colonMarker ?? repeatedMarker;
  if (!marker) return normalized;
  const withColonBreak = colonMarker ? normalized.replace(
    new RegExp(`([:\uFF1A])[ 	]*(?=${marker.pattern.source})`),
    "$1\n"
  ) : normalized;
  return withColonBreak.replace(
    new RegExp(`[ 	]+(?=${marker.pattern.source})`, "g"),
    "\n"
  );
}
function formatCardText(value) {
  return value.replace(/\r\n?/g, "\n").split("\n").map(formatLine).join("\n").trim();
}

// ui/presentation.ts
function taskActionArguments(view, taskId, action, extra = {}) {
  const text = JSON.stringify({
    ...extra,
    taskId,
    revision: view.revision,
    action
  });
  if (text.length > 4e3) throw new Error("Task action is too large");
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(text))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return encoded;
}
function taskDeliveryPresentation(task, agentActive, language = "zh") {
  const terminal = TERMINAL_TASK_STATES.has(task.state);
  const allAccepted = task.milestones.length > 0 && task.milestones.every((m) => m.state === "completed");
  const unsettled = task.operations.some(
    (o) => o.state === "started" || o.state === "unknown"
  ) || task.actions.some((a) => a.state === "pending");
  const deliveryComplete = allAccepted && !unsettled;
  const warnings = !!task.reason || task.operations.some((o) => o.state === "failed");
  const closed = task.state === "cancelled" || task.state === "archived";
  const labels = language === "en" ? TASK_STATE_LABELS_EN : TASK_STATE_LABELS;
  const label = closed ? labels[task.state] : agentActive && !terminal && task.state !== "waiting_user" ? language === "en" ? "Running" : "\u6267\u884C\u4E2D" : deliveryComplete ? warnings ? language === "en" ? "Delivery complete \xB7 with reminders" : "\u4EA4\u4ED8\u5DF2\u5B8C\u6210 \xB7 \u6709\u63D0\u9192" : language === "en" ? "Delivery complete" : "\u4EA4\u4ED8\u5DF2\u5B8C\u6210" : allAccepted && unsettled ? language === "en" ? "Deliverables accepted \xB7 items still need checking" : "\u4EA4\u4ED8\u5DF2\u9A8C\u6536 \xB7 \u5C1A\u6709\u4E8B\u9879\u5F85\u6838\u5BF9" : labels[task.state];
  return {
    label,
    deliveryComplete,
    canContinue: !terminal && !agentActive && !deliveryComplete
  };
}
var TASK_STATE_LABELS = {
  pending: "\u5F85\u5F00\u59CB",
  running: "\u6267\u884C\u4E2D",
  waiting_user: "\u7B49\u5F85\u4F60",
  blocked: "\u53D7\u963B",
  partial: "\u90E8\u5206\u5B8C\u6210",
  completed: "\u8BB0\u5F55\u7684\u9A8C\u6536\u5DF2\u6EE1\u8DB3",
  cancelled: "\u5DF2\u53D6\u6D88",
  archived: "\u5DF2\u5F52\u6863"
};
var TASK_STATE_LABELS_EN = {
  pending: "Pending",
  running: "Running",
  waiting_user: "Waiting for you",
  blocked: "Blocked",
  partial: "Partly complete",
  completed: "Recorded acceptance satisfied",
  cancelled: "Cancelled",
  archived: "Archived"
};
var TASK_REASON_TEXT = {
  "task-authorization-required": "\u8BA1\u5212\u5DF2\u7ECF\u51C6\u5907\u597D\uFF0C\u7B49\u4F60\u70B9\u5934\u3002\u786E\u8BA4\u4E00\u6B21\uFF0C\u540E\u9762\u5C31\u81EA\u52A8\u505A\u5B8C\uFF0C\u4E0D\u518D\u53CD\u590D\u6253\u6270\u3002",
  "automatic-recovery": "\u521A\u624D\u4E2D\u65AD\u4E86\u4E00\u4E0B\uFF0C\u5DF2\u7ECF\u4ECE\u4E0A\u6B21\u4FDD\u5B58\u7684\u5730\u65B9\u63A5\u7740\u505A\uFF0C\u4E0D\u7528\u4F60\u64CD\u4F5C\u3002",
  "automatic-stage-checkpoint": "\u8FDB\u5C55\u5DF2\u4FDD\u5B58\uFF0C\u6B63\u5728\u63A5\u7740\u505A\u4E0B\u4E00\u90E8\u5206\u3002",
  "automatic-handoff": "\u8FD9\u4E00\u6B65\u5DF2\u4FDD\u5B58\uFF0C\u6309\u4F60\u4E4B\u524D\u7684\u6388\u6743\u63A5\u7740\u505A\u5269\u4E0B\u7684\uFF0C\u4E0D\u7528\u518D\u786E\u8BA4\u3002",
  "total-budget": "\u8FD9\u4E2A\u4EFB\u52A1\u7684\u6B65\u6570\u5DF2\u7ECF\u7528\u5B8C\uFF0C\u505A\u51FA\u6765\u7684\u7ED3\u679C\u90FD\u4FDD\u7559\u7740\u3002\u60F3\u7EE7\u7EED\u505A\uFF0C\u8BF7\u91CD\u65B0\u63CF\u8FF0\u9700\u6C42\u5F00\u4E00\u4E2A\u65B0\u4EFB\u52A1\u3002",
  "stage-budget": "\u6700\u8FD1\u4E00\u6BB5\u6CA1\u6709\u505A\u51FA\u65B0\u8FDB\u5C55\uFF0C\u5148\u505C\u4E0B\u6765\u4FDD\u7559\u7ED3\u679C\uFF0C\u907F\u514D\u7A7A\u8F6C\u3002",
  "budget-review-required": "\u8FD9\u4E00\u6BB5\u7684\u6B65\u6570\u7528\u5B8C\u4E86\u3002\u5148\u770B\u770B\u76EE\u524D\u7684\u7ED3\u679C\uFF0C\u786E\u8BA4\u540E\u53EF\u4EE5\u5728\u4EFB\u52A1\u9762\u677F\u7EE7\u7EED\u3002",
  "reconcile-before-retry": "\u4E0A\u6B21\u6709\u64CD\u4F5C\u6CA1\u7B49\u5230\u7ED3\u679C\u5C31\u4E2D\u65AD\u4E86\uFF08\u6BD4\u5982\u5199\u6587\u4EF6\u3001\u5B89\u88C5\u3001\u4E0A\u4F20\uFF09\uFF0C\u73B0\u5728\u4E0D\u786E\u5B9A\u5B83\u505A\u6CA1\u505A\u6210\u3002\u8BF7\u5148\u70B9\u201C\u6838\u5BF9\u5DF2\u6709\u7ED3\u679C\u201D\u770B\u4E00\u4E0B\u5B9E\u9645\u60C5\u51B5\uFF0C\u522B\u8BA9\u5B83\u76F2\u76EE\u91CD\u505A\u4E00\u904D\u3002",
  "binding-changed": "\u77E5\u8BC6\u5E93\u6362\u4E86\uFF0C\u65E7\u4EFB\u52A1\u91CC\u67E5\u5230\u7684\u5185\u5BB9\u4E0D\u80FD\u7EE7\u7EED\u7528\u3002\u8BF7\u91CD\u65B0\u63CF\u8FF0\u9700\u6C42\uFF0C\u5F00\u4E00\u4E2A\u65B0\u4EFB\u52A1\u3002",
  "tool-failure": "\u4E2D\u95F4\u6709\u4E00\u6B65\u51FA\u9519\u4E86\u3002\u5177\u4F53\u662F\u54EA\u4E00\u6B65\u3001\u5F71\u4E0D\u5F71\u54CD\u7ED3\u679C\uFF0C\u770B\u4E0B\u9762\u7684\u8BB0\u5F55\u3002",
  "user-cancelled-choice-not-consent": "\u4F60\u53D6\u6D88\u4E86\u521A\u624D\u7684\u9009\u62E9\u3002\u4EFB\u52A1\u505C\u5728\u539F\u5730\u7B49\u4F60\u51B3\u5B9A\uFF0C\u4E0D\u4F1A\u81EA\u4F5C\u4E3B\u5F20\u7EE7\u7EED\u3002",
  "user-action-cancelled": "\u4F60\u8DF3\u8FC7\u4E86\u4E00\u4E2A\u9700\u8981\u4F60\u5904\u7406\u7684\u4E8B\u9879\uFF0C\u4EFB\u52A1\u5148\u505C\u7740\u3002\u60F3\u7EE7\u7EED\u65F6\u518D\u8BF4\u4E00\u58F0\u5C31\u884C\u3002",
  "wiki-rejected-or-stale": "Wiki \u4FEE\u6539\u6CA1\u6709\u901A\u8FC7\u5BA1\u9605\uFF08\u6216\u8005\u6765\u6E90\u5185\u5BB9\u53D8\u4E86\uFF09\uFF0C\u8FD9\u4E00\u9879\u8FD8\u4E0D\u7B97\u5B8C\u6210\u3002",
  "verified-stage-checkpoint": "\u6709\u4E00\u9879\u4EA4\u4ED8\u5DF2\u7ECF\u786E\u8BA4\u5B8C\u6210\uFF0C\u63A5\u7740\u505A\u4E0B\u4E00\u9879\u3002",
  "session-restored": "\u4F1A\u8BDD\u5DF2\u6062\u590D\uFF0C\u4ECE\u4E0A\u6B21\u4FDD\u5B58\u7684\u8FDB\u5EA6\u63A5\u7740\u6765\u3002",
  "legacy-checkpoint-unreviewed": "\u8FD9\u662F\u4ECE\u65E7\u7248\u672C\u5E26\u8FC7\u6765\u7684\u4EFB\u52A1\u8BB0\u5F55\uFF0C\u4E4B\u524D\u505A\u4E86\u4EC0\u4E48\u8FD8\u6CA1\u6838\u5BF9\u8FC7\u3002",
  "user-cancelled": "\u4F60\u5DF2\u53D6\u6D88\u8FD9\u4E2A\u4EFB\u52A1\u3002",
  "user-archived": "\u4EFB\u52A1\u5DF2\u5F52\u6863\u3002"
};
var TASK_REASON_TEXT_EN = {
  "task-authorization-required": "The plan is ready for your approval. One approval covers the agreed work.",
  "automatic-recovery": "The saved checkpoint was restored; work is continuing without another approval.",
  "automatic-stage-checkpoint": "Progress was saved and the next part is continuing.",
  "automatic-handoff": "This step was saved; the remaining work continues under the existing authorization.",
  "total-budget": "The task reached its call limit. Existing results are retained; start a new task to continue.",
  "stage-budget": "Recent steps made no new progress. Work paused to preserve results and avoid repeating effects.",
  "budget-review-required": "This stage reached its call limit. Review the saved results before continuing.",
  "reconcile-before-retry": "An earlier side effect has an uncertain outcome. Check the existing result before retrying it.",
  "binding-changed": "The knowledge binding changed. Start a newly scoped task instead of reusing old evidence or permissions.",
  "tool-failure": "An operation failed. Check its recorded result and effect on the remaining work.",
  "user-cancelled-choice-not-consent": "The choice was cancelled. The task is waiting; cancellation grants no consent.",
  "user-action-cancelled": "A requested user action was skipped. The task remains paused.",
  "wiki-rejected-or-stale": "The Wiki update was rejected or its sources changed; this item is not accepted.",
  "verified-stage-checkpoint": "One deliverable was checked; work continues with the next item.",
  "session-restored": "The session resumed from its saved checkpoint.",
  "legacy-checkpoint-unreviewed": "This older checkpoint has not been reconciled yet.",
  "user-cancelled": "You cancelled this task.",
  "user-archived": "The task was archived."
};
function explainTaskReason(code, language = "zh") {
  return code ? (language === "en" ? TASK_REASON_TEXT_EN : TASK_REASON_TEXT)[code] || code : null;
}
var TERMINAL_TASK_STATES = /* @__PURE__ */ new Set([
  "completed",
  "cancelled",
  "archived"
]);
function tasksForTranscript(view) {
  return view.tasks.filter(
    (task) => task.actions.some(
      (action) => action.kind === "review" && action.state === "pending"
    )
  );
}
function clip(text, max) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}\u2026` : flat;
}
function pendingReview(task) {
  return task.actions.find(
    (action) => action.kind === "review" && action.state === "pending"
  );
}
function tasksForDecision(view) {
  const pending = tasksForTranscript(view);
  if (pending.length) return pending;
  const active = view.tasks.find((task) => task.id === view.activeTaskId) ?? view.tasks.at(-1);
  return active ? [active] : [];
}
function taskDecision(task, lang = "zh") {
  const zh2 = lang !== "en";
  const review = pendingReview(task);
  const milestone = review?.milestoneId ? task.milestones.find((item) => item.id === review.milestoneId) : void 0;
  const canComplete = Boolean(
    review && milestone && milestone.acceptance.kind === "human_review" && milestone.state !== "completed"
  );
  const terminal = TERMINAL_TASK_STATES.has(task.state);
  const doneNames = task.milestones.filter((item) => item.state === "completed").map((item) => item.title);
  const openNames = task.milestones.filter((item) => item.state !== "completed").map((item) => item.title);
  const done = doneNames.length ? zh2 ? `\u5DF2\u7ECF\u505A\u6210\uFF1A${doneNames.join("\u3001")}` : `Done: ${doneNames.join(", ")}` : zh2 ? "\u5DF2\u7ECF\u505A\u6210\uFF1A\u8FD8\u6CA1\u6709\u52FE\u6389\u7684\u4EA4\u4ED8" : "Done: nothing checked off yet";
  const remaining = openNames.length ? zh2 ? `\u8FD8\u5DEE\uFF1A${openNames.join("\u3001")}` : `Left: ${openNames.join(", ")}` : task.remainingSummary ? zh2 ? `\u8FD8\u5DEE\uFF1A${clip(task.remainingSummary, 160)}` : `Left: ${clip(task.remainingSummary, 160)}` : zh2 ? "\u8FD8\u5DEE\uFF1A\u6CA1\u6709\u5217\u51FA\u7684\u672A\u5B8C\u6210\u9879" : "Left: no open deliverable is listed";
  const stop = task.reason === "stage-budget" || task.reason === "budget-review-required" ? zh2 ? "\u505C\u5728\u8FD9\u4E00\u6BB5\u7684\u6B65\u6570\u4E0A\u9650" : "Stopped at this stage's step limit" : task.reason === "total-budget" ? zh2 ? "\u505C\u5728\u6574\u4E2A\u4EFB\u52A1\u7684\u6B65\u6570\u4E0A\u9650" : "Stopped at the task step limit" : review ? zh2 ? "\u505C\u4E0B\u6765\u7B49\u4F60\u770B\u4E00\u773C" : "Stopped for you to look" : task.state === "blocked" ? zh2 ? "\u505C\u5728\u5BBF\u4E3B\u62E6\u4F4F\u7684\u5730\u65B9" : "Stopped at a host block" : zh2 ? "\u8FD8\u5728\u505A" : "Still going";
  const ops = task.operations.slice(-4).map((op) => `${op.tool} \xB7 ${op.state}`);
  const details = [
    zh2 ? `\u6B65\u6570 ${task.budget.calls}\uFF0C\u8FD9\u4E00\u6BB5 ${task.budget.stageCalls}` : `Calls ${task.budget.calls}, this stage ${task.budget.stageCalls}`,
    task.reason ? zh2 ? `\u539F\u56E0\u4EE3\u7801 ${task.reason}` : `Reason code ${task.reason}` : zh2 ? "\u6CA1\u6709\u539F\u56E0\u4EE3\u7801" : "No reason code",
    ...typeof task.progressCount === "number" ? [
      zh2 ? `\u8FD9\u4E00\u6BB5\u65B0\u8FDB\u5C55 ${task.progressCount}\uFF0C\u8D77\u70B9 ${task.stageStartProgress ?? 0}` : `Progress ${task.progressCount}, stage start ${task.stageStartProgress ?? 0}`
    ] : [],
    ...ops
  ];
  const closed = task.state === "archived" ? zh2 ? "\u5DF2\u5F52\u6863" : "archived" : task.state === "cancelled" || task.state === "completed" ? zh2 ? "\u5DF2\u7ED3\u675F" : "ended" : task.state === "blocked" ? zh2 ? "\u505C\u7740" : "stopped" : zh2 ? "\u8FD8\u5728\u505A" : "in progress";
  const mode = review && !terminal ? "decision" : "line";
  return {
    mode,
    title: review?.title.trim() || task.goal,
    stop,
    done,
    remaining,
    details,
    line: `${task.goal} \xB7 ${closed}`,
    canComplete,
    canDefer: mode === "decision",
    canEnd: mode === "decision" && !terminal,
    completeActionId: canComplete && review ? review.id : null,
    cannotComplete: mode === "decision" && !canComplete ? zh2 ? "\u8FD9\u9879\u5BF9\u4E0D\u4E0A\u5177\u4F53\u4EA4\u4ED8\uFF0C\u4E0D\u80FD\u66FF\u4F60\u52FE\u5B8C\u6210\u3002" : "This review is not tied to a deliverable, so it cannot be marked complete." : null,
    completeLabel: zh2 ? "\u6211\u770B\u8FC7\u4E86\uFF0C\u8FD9\u9879\u7B97\u5B8C\u6210" : "I checked it; count this done",
    deferLabel: zh2 ? "\u5148\u4E0D\u9A8C\u6536\uFF0C\u7EE7\u7EED\u540E\u9762\u7684" : "Leave it unchecked and continue",
    endLabel: zh2 ? "\u7ED3\u675F\u8FD9\u9879\u4EFB\u52A1" : "End this task",
    detailsLabel: zh2 ? "\u8BE6\u60C5" : "Details"
  };
}
function taskNeedsUser(task) {
  if (task.authorizationRequired && !task.executionConsent) return true;
  if (task.state === "waiting_user" || task.state === "blocked") return true;
  return task.actions.some(
    (a) => a.kind === "authorization" && a.state === "pending"
  );
}

// ui/components/TaskDecisionCard.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function TaskDecisionCard({
  task,
  view,
  sessionId,
  agentActive,
  readOnly = false,
  embedded = false
}) {
  const language = useLanguage();
  const decision = taskDecision(task, language === "en" ? "en" : "zh");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async (text) => {
    if (!sessionId) return;
    setBusy(true);
    setError("");
    try {
      await sessions.command(sessionId, "task-action", text);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const content = /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("h4", { className: "text-[13px] font-medium leading-5 text-ink", children: formatCardText(decision.title) }),
    /* @__PURE__ */ jsx("p", { className: "mt-1 whitespace-pre-wrap text-[12px] leading-5 text-ink", children: formatCardText(decision.stop) }),
    /* @__PURE__ */ jsx("p", { className: "whitespace-pre-wrap text-[12px] leading-5 text-ink-dim", children: formatCardText(decision.done) }),
    /* @__PURE__ */ jsx("p", { className: "whitespace-pre-wrap text-[12px] leading-5 text-ink-dim", children: formatCardText(decision.remaining) }),
    decision.cannotComplete && /* @__PURE__ */ jsx("p", { className: "mt-1 whitespace-pre-wrap text-[12px] leading-5 text-ink-dim", children: formatCardText(decision.cannotComplete) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-2 flex flex-wrap gap-2", children: [
      decision.canComplete && decision.completeActionId && /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          disabled: busy || readOnly || !sessionId || agentActive,
          className: "rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-2 hover:bg-hover disabled:opacity-40",
          onClick: () => {
            const actionId = decision.completeActionId;
            if (!actionId) return;
            void send(
              taskActionArguments(view, task.id, "acknowledge", { actionId })
            );
          },
          children: decision.completeLabel
        }
      ),
      decision.canDefer && /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          disabled: busy || readOnly || !sessionId || agentActive,
          className: "rounded-md bg-warn/10 px-2 py-1 text-xs text-warn disabled:opacity-40",
          onClick: () => void send("\u7EE7\u7EED"),
          children: decision.deferLabel
        }
      ),
      decision.canEnd && /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          disabled: busy || readOnly || !sessionId || agentActive,
          className: "rounded-md border border-border px-2 py-1 text-xs text-ink-dim hover:bg-hover disabled:opacity-40",
          onClick: () => void send(taskActionArguments(view, task.id, "cancel")),
          children: decision.endLabel
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("details", { className: "mt-2", children: [
      /* @__PURE__ */ jsx("summary", { className: "cursor-pointer text-xs text-ink-dim", children: decision.detailsLabel }),
      /* @__PURE__ */ jsx("ul", { className: "mt-1 list-disc space-y-0.5 pl-4", children: decision.details.map((line) => /* @__PURE__ */ jsx(
        "li",
        {
          className: "whitespace-pre-wrap text-xs leading-4 text-ink-dim",
          children: formatCardText(line)
        },
        line
      )) })
    ] }),
    error && /* @__PURE__ */ jsx("p", { role: "alert", className: "mt-1 whitespace-pre-wrap text-xs text-err", children: formatCardText(error) })
  ] });
  if (decision.mode === "line") {
    return /* @__PURE__ */ jsx(
      "p",
      {
        className: embedded ? "mt-2 whitespace-pre-wrap text-[12px] text-ink-dim" : "mt-2 text-[12px] text-ink-dim",
        "data-testid": "task-decision-line",
        children: formatCardText(decision.line)
      }
    );
  }
  return embedded ? /* @__PURE__ */ jsx(
    "div",
    {
      className: "mt-3 border-t border-border/70 pt-3",
      "data-testid": "task-decision",
      children: content
    }
  ) : /* @__PURE__ */ jsx(
    "section",
    {
      className: "mt-2 rounded-xl border border-warn/35 bg-surface px-3 py-2",
      "data-testid": "task-decision",
      children: content
    }
  );
}

// ui/TaskMessage.tsx
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function TaskMessageContent({
  message,
  sessionId,
  agentActive,
  readOnly,
  renderDefault
}) {
  const messages = useSessionMessages(sessionId);
  if (message.kind !== "assistant" || !message.taskView) return renderDefault();
  const view = message.taskView;
  const latest = messages.findLast(
    (value) => value.kind === "assistant" && value.taskView
  );
  const ordinaryText = Boolean(message.text && !message.hostStatus);
  if (latest?.id !== message.id) return ordinaryText ? renderDefault() : null;
  return /* @__PURE__ */ jsxs2(Fragment2, { children: [
    tasksForDecision(view).map((task) => /* @__PURE__ */ jsx2(
      TaskDecisionCard,
      {
        task,
        view,
        sessionId,
        agentActive,
        readOnly
      },
      task.id
    )),
    ordinaryText || message.route || message.progress ? renderDefault() : null
  ] });
}

// ui/components/TaskRow.tsx
import { useState as useState2 } from "react";

// ui/components/MilestoneEvidence.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function MilestoneEvidence({
  milestone,
  sessionId
}) {
  const cwd = useSessionsStore(
    (state2) => state2.sessions.find((session) => session.sessionId === sessionId)?.cwd
  );
  if (milestone.acceptance.kind === "file" || milestone.acceptance.kind === "human_review")
    return null;
  const { acceptance, evidence } = milestone;
  const state = milestone.state === "completed" ? "found" : evidence?.state || "pending";
  const fields = Object.entries(acceptance).filter(
    ([key, value]) => !["kind", "path", "sha256"].includes(key) && typeof value === "string" && value
  );
  return /* @__PURE__ */ jsxs3("div", { className: "ml-5 mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-dim", children: [
    /* @__PURE__ */ jsx3("span", { children: evidence?.summary || state }),
    evidence?.note && /* @__PURE__ */ jsx3("span", { className: "text-ink-faint", children: evidence.note }),
    state !== "found" && evidence?.reason && !evidence.summary && /* @__PURE__ */ jsx3("span", { children: evidence.reason }),
    fields.map(([key, value]) => /* @__PURE__ */ jsx3("code", { className: "break-all text-ink-faint", title: key, children: value }, key)),
    evidence?.links?.filter((link) => link.kind !== "note").map((link) => /* @__PURE__ */ jsx3(
      "button",
      {
        type: "button",
        className: "text-link hover:underline",
        onClick: () => void (link.kind === "external" ? openExternal(link.target) : openResourceExternal(link.target, cwd)),
        children: link.label
      },
      `${link.kind}:${link.target}`
    ))
  ] });
}

// ui/artifacts.ts
function localHref(path) {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized || [...normalized].some((character) => character.charCodeAt(0) < 32) || /^(?:file:|\/\/)/i.test(normalized) || /^[a-z][a-z0-9+.-]*:/i.test(normalized) && !/^[a-z]:\//i.test(normalized))
    return;
  const encoded = normalized.split("/").map(
    (part) => encodeURIComponent(part).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16)}`
    )
  ).join("/");
  if (/^[a-z]:\//i.test(normalized))
    return `file:///${normalized.slice(0, 2)}${encoded.slice(4)}`;
  return normalized.startsWith("/") ? `file://${encoded}` : `./${encoded}`;
}
function taskArtifactLinks(task) {
  const byPath = /* @__PURE__ */ new Map();
  const add = (path, state) => {
    if (!path) return;
    const href = localHref(path);
    if (!href) return;
    const normalized = path.replaceAll("\\", "/");
    byPath.set(
      /^[a-z]:/i.test(normalized) ? normalized.toLowerCase() : normalized,
      { path, href, state }
    );
  };
  for (const milestone of task.milestones)
    if (milestone.state === "completed" && milestone.evidence?.kind === "file-observed")
      add(milestone.evidence.path, "observed");
  for (const operation of task.operations)
    if (operation.artifact && !operation.artifact.intentOnly && !["started", "failed"].includes(operation.state))
      add(operation.artifact.path, operation.state);
  return [...byPath.values()];
}

// ui/components/TaskArtifactLinks.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function TaskArtifactLinks({
  task,
  sessionId
}) {
  const t = useTaskText();
  const cwd = useSessionsStore(
    (state) => state.sessions.find((session) => session.sessionId === sessionId)?.cwd
  );
  const open = useUiStore((state) => state.openResourcePreview);
  const files = taskArtifactLinks(task);
  if (!files.length) return null;
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      className: "mt-2 flex flex-wrap gap-2 text-xs",
      "data-testid": "task-artifacts",
      children: [
        files.slice(0, 6).map((file) => /* @__PURE__ */ jsxs4(
          "a",
          {
            href: file.href,
            className: "max-w-full break-all rounded border border-border px-2 py-1 underline underline-offset-2 hover:bg-hover",
            "aria-disabled": !cwd && file.href.startsWith("./"),
            title: !cwd && file.href.startsWith("./") ? t("taskArtifacts.openSessionFirst") : file.path,
            onClick: (event) => {
              event.preventDefault();
              if (!cwd && file.href.startsWith("./")) return;
              open({
                href: file.href,
                label: file.path.split(/[\\/]/).pop(),
                cwd
              });
            },
            children: [
              file.path.split(/[\\/]/).pop(),
              " \xB7",
              " ",
              file.state === "changed" ? t("taskArtifacts.changed") : file.state === "not-found" ? t("taskArtifacts.notFound") : t("taskArtifacts.preview")
            ]
          },
          file.href
        )),
        files.length > 6 && /* @__PURE__ */ jsx4("span", { children: t("taskArtifacts.more", { count: files.length - 6 }) })
      ]
    }
  );
}

// ui/components/TaskRow.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function operationStateLabel(state, zh2) {
  const labels = {
    queued: ["\u6392\u961F\u4E2D", "queued"],
    running: ["\u5904\u7406\u4E2D", "running"],
    done: ["\u5DF2\u5B8C\u6210", "completed"],
    completed: ["\u5DF2\u5B8C\u6210", "completed"],
    error: ["\u672A\u5B8C\u6210", "needs attention"],
    failed: ["\u672A\u5B8C\u6210", "needs attention"],
    blocked: ["\u9700\u8981\u5904\u7406", "needs attention"]
  };
  const pair = labels[state];
  return pair ? pair[zh2 ? 0 : 1] : state;
}
function TaskRow({
  task,
  view,
  sessionId,
  agentActive,
  readOnly = false
}) {
  const t = useTaskText();
  const language = useLanguage();
  const zh2 = language === "zh";
  const [busy, setBusy] = useState2(false), [error, setError] = useState2("");
  const done = task.milestones.filter((m) => m.state === "completed").length;
  const pct = task.milestones.length ? Math.round(done / task.milestones.length * 100) : 0;
  const reason = explainTaskReason(task.reason, language);
  const presentation = taskDeliveryPresentation(task, agentActive, language);
  const pendingReview2 = task.actions.some(
    (action) => action.kind === "review" && action.state === "pending"
  );
  const remainingSummary = (agentActive ? t("taskRow.running") : task.remainingSummary) || (task.milestones.length ? t("taskRow.unconfirmed") : t("taskRow.noDeliverables"));
  return /* @__PURE__ */ jsxs5("article", { className: "border-b border-border px-2 py-2 last:border-0", children: [
    /* @__PURE__ */ jsxs5("div", { className: "flex items-start justify-between gap-2", children: [
      /* @__PURE__ */ jsx5("h4", { className: "min-w-0 break-words text-[12px] font-medium leading-4", children: task.goal }),
      /* @__PURE__ */ jsx5("span", { className: "shrink-0 rounded-full border border-border px-2 py-0.5 text-xs", children: presentation.label })
    ] }),
    /* @__PURE__ */ jsxs5("p", { className: "mt-0.5 text-xs text-ink-dim", children: [
      t("taskRow.steps", { n: task.budget.calls }),
      task.milestones.length > 0 && t("taskRow.accepted", { done, total: task.milestones.length })
    ] }),
    task.milestones.length > 0 && /* @__PURE__ */ jsx5(
      "div",
      {
        className: "mt-1 h-0.5 overflow-hidden rounded-full bg-hover",
        role: "progressbar",
        "aria-label": t("taskRow.progressLabel"),
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": pct,
        "aria-valuetext": t("taskRow.progressText", {
          done,
          total: task.milestones.length
        }),
        children: /* @__PURE__ */ jsx5(
          "div",
          {
            className: `h-full rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none ${pct < 100 ? "bg-warn" : "bg-ok"}`,
            style: { width: `${pct}%` }
          }
        )
      }
    ),
    reason && /* @__PURE__ */ jsx5("p", { className: "mt-1 truncate text-xs text-ink-dim", title: reason, children: reason }),
    /* @__PURE__ */ jsx5(
      "p",
      {
        className: "mt-1 truncate text-xs leading-4",
        "data-testid": "task-remaining-summary",
        title: remainingSummary,
        children: remainingSummary
      }
    ),
    presentation.canContinue && !pendingReview2 && /* @__PURE__ */ jsx5(
      "button",
      {
        type: "button",
        disabled: busy || readOnly || agentActive || !sessionId,
        className: "mt-2 w-full rounded-md bg-warn/10 px-2 py-2 text-left text-xs text-warn disabled:opacity-40",
        onClick: async () => {
          if (!sessionId) return;
          setBusy(true);
          setError("");
          try {
            await sessions.command(
              sessionId,
              "task-action",
              taskActionArguments(view, task.id, "progress")
            );
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        },
        children: t("taskRow.continue")
      }
    ),
    error && /* @__PURE__ */ jsx5("p", { role: "alert", className: "text-xs text-err", children: error }),
    /* @__PURE__ */ jsx5(TaskArtifactLinks, { task, sessionId }),
    !!task.milestones.length && /* @__PURE__ */ jsxs5("details", { className: "mt-2", children: [
      /* @__PURE__ */ jsx5("summary", { className: "cursor-pointer text-xs text-ink-dim", children: t("taskRow.milestones", { done, total: task.milestones.length }) }),
      /* @__PURE__ */ jsx5("ul", { className: "mt-1 space-y-0.5", children: task.milestones.map((m) => /* @__PURE__ */ jsxs5("li", { className: "text-xs leading-4", children: [
        /* @__PURE__ */ jsxs5("div", { className: "flex items-start gap-2", children: [
          /* @__PURE__ */ jsx5(
            "span",
            {
              className: m.state === "completed" ? "text-ok" : "text-ink-dim",
              children: m.state === "completed" ? "\u2713" : "\u25CB"
            }
          ),
          /* @__PURE__ */ jsx5(
            "span",
            {
              className: m.state === "completed" ? "text-ink-dim line-through" : "",
              children: m.title
            }
          )
        ] }),
        /* @__PURE__ */ jsx5(MilestoneEvidence, { milestone: m, sessionId })
      ] }, m.id)) })
    ] }),
    !!task.operations.length && /* @__PURE__ */ jsxs5("details", { className: "mt-2", children: [
      /* @__PURE__ */ jsx5("summary", { className: "cursor-pointer text-xs text-ink-dim", children: t("taskRow.operations", { n: task.operations.length }) }),
      /* @__PURE__ */ jsx5("ul", { className: "mt-1 space-y-0.5", children: task.operations.slice(-12).map((o) => /* @__PURE__ */ jsxs5("li", { className: "truncate text-xs text-ink-dim", children: [
        /* @__PURE__ */ jsx5("code", { children: o.tool }),
        " \xB7 ",
        operationStateLabel(o.state, zh2)
      ] }, o.id)) })
    ] })
  ] });
}

// ui/TaskPanel.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function TaskPanelContent() {
  const sessionId = useSessionsStore((state) => state.activeSessionId);
  const readOnly = useSessionsStore(
    (state) => state.sessions.find((session) => session.sessionId === sessionId)?.readOnly === true
  );
  const messages = useSessionMessages(sessionId);
  const agentActive = useAgentActive(sessionId);
  const t = useTaskText();
  const latest = messages.findLast(
    (message) => message.kind === "assistant" && message.taskView
  );
  const view = latest?.kind === "assistant" ? latest.taskView : void 0;
  const attention = view?.tasks.filter(taskNeedsUser).length || 0;
  return /* @__PURE__ */ jsxs6("section", { className: "min-h-0 overflow-auto p-3", "data-testid": "task-panel", children: [
    /* @__PURE__ */ jsx6("h3", { className: "text-[13px] font-medium text-ink", children: t("panelTitle") }),
    attention > 0 && /* @__PURE__ */ jsx6("p", { className: "mt-1 text-[12px] text-warn", children: t("attention", { count: attention }) }),
    view?.tasks.length ? view.tasks.map((task) => /* @__PURE__ */ jsx6(
      TaskRow,
      {
        task,
        view,
        sessionId,
        agentActive,
        readOnly
      },
      task.id
    )) : /* @__PURE__ */ jsx6("p", { className: "mt-3 text-[12px] text-ink-dim", children: t("empty") })
  ] });
}

// ui/entry.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function Surface({ children }) {
  return /* @__PURE__ */ jsxs7("div", { className: "drone-task-ui", children: [
    /* @__PURE__ */ jsx7("style", { "data-drone-task-styles": true, children: taskStyles }),
    children
  ] });
}
function Incompatible() {
  return /* @__PURE__ */ jsxs7("p", { role: "alert", "data-task-ui-status": "incompatible", children: [
    taskText("en", "incompatible"),
    " / ",
    taskText("zh", "incompatible")
  ] });
}
function TaskPanel() {
  return /* @__PURE__ */ jsx7(Surface, { children: uiCompatibility().status === "compatible" ? /* @__PURE__ */ jsx7(TaskPanelContent, {}) : /* @__PURE__ */ jsx7(Incompatible, {}) });
}
function TaskMessage(props) {
  if (typeof props.renderDefault !== "function")
    return /* @__PURE__ */ jsx7(Surface, { children: /* @__PURE__ */ jsx7(Incompatible, {}) });
  if (props.message.kind !== "assistant" || !props.message.taskView)
    return props.renderDefault();
  if (uiCompatibility().status !== "compatible")
    return /* @__PURE__ */ jsx7(Surface, { children: /* @__PURE__ */ jsx7(Incompatible, {}) });
  return /* @__PURE__ */ jsx7(Surface, { children: /* @__PURE__ */ jsx7(TaskMessageContent, { ...props }) });
}
export {
  TaskMessage,
  TaskPanel
};
