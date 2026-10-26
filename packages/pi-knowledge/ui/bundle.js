// ui/knowledge/KnowledgeView.tsx
import { useEffect as useEffect17, useRef as useRef8, useState as useState18 } from "react";

// ui/api.ts
var host = window.DroneUI;
var getKnowledgeApi = () => host.knowledge;
var { Button, StatePanel, Switch, ActionSurface, PageHeader, Markdown, ChevronDownIcon, ObsidianIcon, RoadmapLane, PluginEntryHost } = host.components;
var { useAgentActive, usePluginEntries, useT, useLanguage } = host.hooks;
var { isDraftSessionId, selectTranscript, pushToast, relativeTime, taskArtifactLinks, roadmapStatus, legacyEvidenceNotice, COMPOSER_FOCUS_EVENT, PROTECTED_KNOWLEDGE_AGENTS, SUBAGENT_THINKING_LEVELS } = host.helpers;
var { useKnowledgeStore, useSessionsStore, useSettingsStore, useTranscriptStore, useUiStore, useDraftStore } = host.stores;
var UI_REGIONS = { KnowledgeTab: "knowledge.tab" };

// ui/knowledge/copy.ts
var knowledgeZh = {
  cancel: "\u53D6\u6D88",
  specialist_reviewer: "Wiki \u6A21\u578B\u5BA1\u6838\u5458",
  modelReviewButton: "\u6A21\u578B\u81EA\u52A8\u5BA1\u6838",
  modelReviewPreflight: "\u6A21\u578B\u9884\u5BA1",
  modelReviewAdviceHint: "\u5BF9\u7167\u672C\u8F6E\u6765\u6E90\u7247\u6BB5\u7ED9\u51FA\u610F\u89C1\uFF1B\u901A\u8FC7\u540E\u4ECD\u9700\u4F60\u70B9\u5E94\u7528\u624D\u4F1A\u5199\u5165 Wiki\u3002",
  modelReviewModel: "\u5BA1\u6838\u6A21\u578B",
  modelReviewInherit: "\u6CBF\u7528\u5F53\u524D\u4F1A\u8BDD\u6A21\u578B",
  modelReviewSession: "\u8BF7\u5728\u6B64\u5019\u9009\u6240\u5C5E\u9879\u76EE\u6253\u5F00\u4F1A\u8BDD\uFF0C\u5E76\u9009\u62E9\u53EF\u7528\u6A21\u578B\u3002",
  modelReviewHint: "\u4EC5\u5BA1\u6838\u5F53\u524D\u5019\u9009\uFF1B\u8BFB\u53D6\u5019\u9009\u4FEE\u6539\u3001\u53D7\u4FDD\u62A4\u4EBA\u5DE5\u5185\u5BB9\u548C\u6700\u591A 6 \u4E2A\u6765\u6E90\u8303\u56F4\u3002\u72EC\u7ACB\u8BF7\u6C42\u4E0D\u643A\u5E26\u804A\u5929\u5386\u53F2\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u641C\u7D22\u6574\u5E93\u6216\u4E0B\u8F7D\u6587\u732E\u3002",
  modelReviewAck: "\u540C\u610F\u5C06\u8FD9\u4E9B\u5185\u5BB9\u53D1\u9001\u7ED9\u6240\u9009\u6A21\u578B\uFF0C\u77E5\u6653\u4F1A\u4EA7\u751F\u6A21\u578B\u7528\u91CF\u3002",
  modelReviewAutoApply: "\u6A21\u578B\u5BA1\u6838\u901A\u8FC7\u4E14\u6240\u6709\u7A0B\u5E8F\u68C0\u67E5\u901A\u8FC7\u540E\uFF0C\u81EA\u52A8\u5E94\u7528\u8FD9\u4E00\u4E2A\u5019\u9009\u3002",
  modelReviewWriteHint: "\u9ED8\u8BA4\u53EA\u7ED9\u610F\u89C1\uFF0C\u4E0D\u5199 Wiki\u3002\u9009\u62E9\u81EA\u52A8\u5E94\u7528\u4F1A\u66F4\u65B0\u5F53\u524D\u5019\u9009\u7684\u6258\u7BA1\u533A\uFF1B\u6765\u6E90\u4E0D\u8DB3\u3001\u7248\u672C\u51B2\u7A81\u3001\u7248\u672C\u53D8\u5316\u6216\u53D6\u6D88\u65F6\u4E0D\u81EA\u52A8\u5199\u5165\u3002\u4E0D\u4F1A\u5F00\u542F\u540E\u53F0\u6301\u7EED\u5BA1\u6838\u3002",
  modelReviewStart: "\u5F00\u59CB\u5BA1\u6838",
  modelReviewRunning: "\u6B63\u5728\u72EC\u7ACB\u5BA1\u6838\uFF08\u6700\u957F 120 \u79D2\uFF09\u2026",
  modelReviewApplied: "\u6A21\u578B\u5BA1\u6838\u901A\u8FC7\uFF0C\u5DF2\u81EA\u52A8\u5E94\u7528",
  modelReviewPass: "\u6A21\u578B\u5EFA\u8BAE\u901A\u8FC7\uFF1B\u5C1A\u672A\u81EA\u52A8\u5E94\u7528",
  modelReviewReject: "\u6A21\u578B\u4E0D\u5EFA\u8BAE\u901A\u8FC7\uFF1B\u4FDD\u7559\u5019\u9009\u7B49\u5F85\u4EBA\u5DE5\u5904\u7406",
  modelReviewHuman: "\u9700\u8981\u4EBA\u5DE5\u5BA1\u6838\uFF1B\u672A\u81EA\u52A8\u5E94\u7528",
  modelReviewNotHuman: "\u6A21\u578B\u5BA1\u6838 \u2260 \u4EBA\u5DE5\u5BA1\u6838 \u2260 \u79D1\u5B66\u9A8C\u8BC1",
  modelReviewAudit: "\u67E5\u770B\u5BA1\u6838\u8BB0\u5F55\u4E0E\u68C0\u67E5\u9879",
  modelReviewUsage: "\u5BA1\u6838\u7528\u91CF",
  modelReviewInput: "\u8F93\u5165",
  modelReviewOutput: "\u8F93\u51FA\uFF08\u542B\u63A8\u7406\uFF09",
  modelReviewCostUnknown: "\u672A\u63D0\u4F9B\u6709\u6548\u8BA1\u4EF7",
  modelReviewUsageHint: "\u72EC\u7ACB\u6A21\u578B\u5BA1\u6838\u7684\u6267\u884C\u8BB0\u5F55\uFF1B\u4E0D\u8BA1\u5165\u4E3B\u804A\u5929\u672C\u8F6E\u7EDF\u8BA1\u3002\u672A\u4E0A\u62A5\u7F13\u5B58\u5B57\u6BB5\u65F6\u4E0D\u63A8\u7B97\u7F13\u5B58\u547D\u4E2D\u7387\uFF0C\u96F6\u8D39\u7528\u4E0D\u4EE3\u8868\u514D\u8D39\u3002",
  reviewCheck_evidenceSupportsChanges: "\u6765\u6E90\u652F\u6301\u62DF\u4FEE\u6539\u5185\u5BB9",
  reviewCheck_scopeAndUncertaintyPreserved: "\u9002\u7528\u8303\u56F4\u4E0E\u4E0D\u786E\u5B9A\u6027\u5F97\u5230\u4FDD\u7559",
  reviewCheck_noUnresolvedContradictions: "\u6CA1\u6709\u672A\u89E3\u51B3\u7684\u77DB\u76FE",
  reviewCheck_humanContentPreserved: "\u4EBA\u5DE5\u5185\u5BB9\u5F97\u5230\u4FDD\u7559",
  reviewCheck_noInstructionInjection: "\u672A\u53D1\u73B0\u6307\u4EE4\u6CE8\u5165",
  specialists: "\u77E5\u8BC6\u5E93\u534F\u4F5C\u52A9\u624B",
  specialistMode: "\u81EA\u52A8\u8C03\u5EA6\u6A21\u5F0F",
  specialistAuto: "\u6309\u9636\u6BB5\u81EA\u52A8\u8C03\u7528",
  specialistManual: "\u4EC5\u660E\u786E\u59D4\u6D3E",
  specialistOff: "\u5173\u95ED",
  specialistCost: "\u534F\u4F5C\u52A9\u624B\u4F7F\u7528\u72EC\u7ACB\u6A21\u578B\u8BF7\u6C42\uFF0C\u53EF\u80FD\u4EA7\u751F\u8D39\u7528\u3002\u9ED8\u8BA4\u6CBF\u7528\u4E3B\u6A21\u578B\uFF1B\u53EF\u5728\u6A21\u578B\u8BBE\u7F6E\u4E2D\u5355\u72EC\u6307\u5B9A\u3002\u53EA\u4F20\u5F53\u524D\u4EFB\u52A1\u4E0E\u5FC5\u8981\u6765\u6E90\uFF0C\u4E0D\u4F20\u4E3B\u4F1A\u8BDD\u5386\u53F2\u3002",
  specialistDenied: "\u5F53\u524D\u77E5\u8BC6\u5E93\u76EE\u5F55\u4E0D\u5141\u8BB8\u534F\u4F5C\u52A9\u624B\u8BBF\u95EE\uFF1B\u8C03\u5EA6\u5DF2\u5173\u95ED\uFF0C\u4E0D\u80FD\u7528\u6B64\u5F00\u5173\u63D0\u5347\u6743\u9650\u3002",
  specialistPermissions: "\u89D2\u8272\u3001\u804C\u8D23\u4E0E\u6700\u5C0F\u6743\u9650",
  specialistLimits: "\u6BCF\u8F6E\u6700\u591A 4 \u6B21\uFF0C\u77E5\u8BC6\u534F\u4F5C\u52A9\u624B\u5168\u5E94\u7528\u6700\u591A\u5E76\u53D1 2 \u4E2A\uFF1B\u5355\u4E2A\u6700\u957F 120 \u79D2\u3002\u65E0 shell\u3001\u7F51\u7EDC\u6293\u53D6\u3001\u9012\u5F52\u59D4\u6D3E\u3001\u6B63\u5F0F Wiki \u5199\u5165\u6216\u6279\u51C6\u6743\u9650\u3002",
  specialistModels: "\u914D\u7F6E\u534F\u4F5C\u52A9\u624B\u6A21\u578B",
  specialistModel: "\u6A21\u578B",
  specialistThinking: "\u601D\u8003\u5F3A\u5EA6",
  specialistFollowMain: "\u8DDF\u968F\u4E3B\u4F1A\u8BDD",
  specialistUnavailable: "\u5F53\u524D\u4E0D\u53EF\u7528",
  specialistBudget: "\u9884\u7B97",
  specialistLastRun: "\u6700\u8FD1\u8FD0\u884C",
  specialistNeverRun: "\u5F53\u524D\u4F1A\u8BDD\u5C1A\u672A\u8FD0\u884C",
  specialistTriggerReview: "\u4EC5\u4EBA\u5DE5\u89E6\u53D1\u5BA1\u6838",
  specialist_navigator: "\u77E5\u8BC6\u5BFC\u822A\u5458",
  specialist_navigator_hint: "\u77E5\u8BC6\u8BF7\u6C42\u5F00\u59CB\u65F6\u8BFB\u5BFC\u822A\u3001\u627E\u76F8\u5173 Wiki \u4E0E\u8BC1\u636E\uFF1B\u8FD4\u56DE\u5C11\u91CF\u5165\u53E3\u3002",
  specialist_evidence: "\u8BC1\u636E\u6574\u7406\u5458",
  specialist_evidence_hint: "\u591A\u6765\u6E90\u6BD4\u8F83\u65F6\u6838\u5BF9\u8303\u56F4\u3001\u7248\u672C\u4E0E\u51B2\u7A81\uFF1B\u4E0D\u8BA4\u8BC1\u79D1\u5B66\u6B63\u786E\u6027\u3002",
  specialist_wiki: "Wiki \u4FEE\u8BA2\u5458",
  specialist_wiki_hint: "\u6458\u8981\u4FDD\u5B58\u540E\u8D77\u8349\u4FEE\u8BA2\uFF1B\u5E94\u7528\u6682\u5B58\u5019\u9009\u4FEE\u6539\uFF0C\u4ECD\u9700\u4F60\u5BA1\u6838\u3002",
  specialist_explainer: "Show Me \u8BB2\u89E3\u5458",
  specialist_explainer_hint: "\u57FA\u4E8E\u6307\u5B9A\u6765\u6E90\u548C\u5DF2\u52A0\u8F7D\u7684\u7814\u7A76\u5DE5\u5177\u751F\u6210\u8BB2\u89E3\uFF1B\u5E94\u7528\u5F52\u6863\u7ED3\u679C\uFF0C\u4E0D\u6267\u884C\u8F6F\u4EF6\u6D4B\u8BD5\u3002",
  specialistRuns: "\u77E5\u8BC6\u534F\u4F5C\u52A9\u624B\u8FD0\u884C",
  specialistUsage: "\u8F93\u5165 / \u8F93\u51FA tokens",
  specialistUnverified: "\u534F\u4F5C\u52A9\u624B\u6458\u8981\u662F\u5F85\u6838\u9A8C\u7684\u4EA4\u63A5\u6458\u8981\uFF0C\u4E0D\u662F\u4E3B\u4F1A\u8BDD\u7684\u8BFB\u53D6\u8BB0\u5F55\u6216\u6700\u7EC8\u7ED3\u8BBA\u3002",
  worker_queued: "\u6392\u961F",
  worker_running: "\u8FD0\u884C\u4E2D",
  worker_completed: "\u5DF2\u4EA4\u63A5",
  worker_failed: "\u5931\u8D25",
  worker_cancelled: "\u5DF2\u53D6\u6D88",
  worker_skipped: "\u5DF2\u8DF3\u8FC7",
  linkPreviewOnly: "\u539F\u7B14\u8BB0\u672A\u6539\u5199\uFF1B\u672C\u5730\u6765\u6E90\u94FE\u63A5\u6309\u76F8\u540C\u9879\u76EE\u7684\u73B0\u5B58\u7ED3\u679C\u6587\u4EF6\u89E3\u6790\uFF1A",
  emptyPreview: "\u76EE\u5F55\u4E3A\u7A7A\u6216\u5C1A\u672A\u9009\u62E9\u8DEF\u5F84\uFF1B\u4E0B\u65B9\u4ECD\u53EF\u9884\u89C8\u5C06\u4F7F\u7528\u7684\u7ED3\u6784\u548C\u6A21\u677F\u3002",
  sampleContent: "\u7B14\u8BB0\u6A21\u677F\u6B63\u6587\uFF08\u53EA\u8BFB\uFF09",
  setupComplete: "\u521D\u59CB\u5316\u5B8C\u6210",
  findings: "\u5177\u4F53\u68C0\u7D22\u7ED3\u679C",
  candidateHint: "\u68C0\u7D22\u7247\u6BB5\u4E0D\u7B49\u4E8E\u6A21\u578B\u5DF2\u8BFB\u53D6\uFF0C\u4E5F\u4E0D\u4EE3\u8868\u79D1\u5B66\u7ED3\u8BBA\u5DF2\u9A8C\u8BC1\u3002",
  outputs: "\u4F1A\u8BDD\u6210\u679C\u4E0E\u5F85\u529E",
  noFindings: "\u672C\u8F6E\u5C1A\u65E0\u5339\u914D\u6761\u76EE\u3002\u7D22\u5F15\u4E2D\u7684\u8D44\u6599\u4E0E\u6574\u7406\u540E\u7684 Wiki \u662F\u4E0D\u540C\u5C42\u6B21\u3002",
  title: "\u77E5\u8BC6\u5E93",
  subtitle: "\u5168\u5E94\u7528\u5171\u4EAB \xB7 \u9879\u76EE\u80CC\u666F\u72EC\u7ACB",
  cloudTitle: "\u4E91\u7AEF\u77E5\u8BC6\u5E93\uFF08WebDAV\uFF09",
  cloudHint: "\u4E91\u7AEF\u9700\u8981\u624B\u52A8\u68C0\u67E5\u5E76\u6309\u6B21\u8BFB\u5199\uFF1B\u672C\u5730\u77E5\u8BC6\u5E93\u76EE\u5F55\u4ECD\u662F\u5F53\u524D\u8BBE\u5907\u7684\u5DE5\u4F5C\u526F\u672C\uFF0C\u4E0D\u63D0\u4F9B\u5B9E\u65F6\u955C\u50CF\u3002",
  cloudNotesTitle: "\u540C\u6B65\u8BF4\u660E",
  cloudNotesWarning: "{count} \u6761\u5B89\u5168\u63D0\u793A \xB7 \u5C55\u5F00\u67E5\u770B",
  cloudProbe: "\u68C0\u67E5\u8FDE\u63A5",
  cloudInitialize: "\u521D\u59CB\u5316\u76EE\u5F55",
  cloudPassword: "\u5BC6\u7801",
  cloudPasswordPlaceholder: "\u8F93\u5165 WebDAV \u5BC6\u7801",
  cloudPasswordSave: "\u4FDD\u5B58\u5BC6\u7801",
  cloudPasswordClear: "\u6E05\u9664\u5BC6\u7801",
  cloudPasswordSaved: "\u5DF2\u4FDD\u5B58\u5230\u672C\u673A\uFF08\u4EC5\u5F53\u524D\u7528\u6237\u53EF\u8BFB\uFF09\uFF0C\u4E0D\u4F1A\u663E\u793A\u6216\u56DE\u4F20",
  cloudPasswordEnv: "\u6B63\u5728\u4F7F\u7528\u73AF\u5883\u53D8\u91CF DRONE_WEBDAV_PASSWORD\uFF1B\u5B83\u4F18\u5148\u4E8E\u6B64\u5904\u4FDD\u5B58\u7684\u5BC6\u7801",
  cloudEndpoint: "\u5730\u5740",
  cloudFolder: "\u76EE\u5F55",
  cloudModeDisabled: "\u672A\u914D\u7F6E",
  cloudModeUnchecked: "\u5C1A\u672A\u68C0\u67E5",
  cloudModeOffline: "\u79BB\u7EBF",
  cloudModeUnauthorized: "\u8BA4\u8BC1\u5931\u8D25",
  cloudModeReady: "\u5DF2\u8FDE\u63A5",
  cloudModeReadOnly: "\u53EA\u8BFB",
  cloudModeError: "\u5F02\u5E38",
  cloudManualSyncNotice: "WebDAV \u9700\u8981\u624B\u52A8\u540C\u6B65\uFF1A\u9009\u62E9\u7B14\u8BB0\u3001\u6BD4\u8F83\u4E24\u7AEF\u7248\u672C\uFF0C\u518D\u660E\u786E\u4E0A\u4F20\u5230\u4E91\u7AEF\u6216\u4ECE\u4E91\u7AEF\u53D6\u56DE\u3002\u4E0D\u4F1A\u540E\u53F0\u81EA\u52A8\u540C\u6B65\u3002",
  cloudSyncTitle: "\u7B14\u8BB0\u540C\u6B65\u5DE5\u4F5C\u53F0",
  cloudSyncStepHint: "\u9009\u62E9 \u2192 \u6BD4\u8F83 \u2192 \u786E\u8BA4",
  cloudSearchLabel: "\u9009\u62E9\u7B14\u8BB0",
  cloudSearchPlaceholder: "\u641C\u7D22\u8981\u540C\u6B65\u7684\u7B14\u8BB0\u2026",
  cloudSearch: "\u67E5\u627E\u7B14\u8BB0",
  cloudCompareSame: "\u4E24\u7AEF\u4E00\u81F4",
  cloudCompareConflict: "\u7248\u672C\u4E0D\u4E00\u81F4",
  cloudCompareLocalOnly: "\u4EC5\u672C\u5730\u5B58\u5728",
  cloudCompareRemoteOnly: "\u4EC5\u4E91\u7AEF\u5B58\u5728",
  cloudCompareUnavailable: "\u5C1A\u672A\u8BFB\u53D6",
  cloudLocalVersion: "\u672C\u5730\u7248\u672C",
  cloudRemoteVersion: "\u4E91\u7AEF\u7248\u672C",
  cloudPush: "\u4E0A\u4F20\u5230\u4E91\u7AEF\uFF08Push\uFF09",
  cloudPull: "\u4ECE\u4E91\u7AEF\u53D6\u56DE\uFF08Pull\uFF09",
  cloudResolveLocal: "\u786E\u8BA4\u8986\u76D6\u4E91\u7AEF\uFF08\u4F7F\u7528\u672C\u5730\u7248\u672C\uFF09",
  cloudResolveRemote: "\u786E\u8BA4\u8986\u76D6\u672C\u5730\uFF08\u4F7F\u7528\u4E91\u7AEF\u7248\u672C\uFF09",
  cloudSyncDone: "\u540C\u6B65\u5B8C\u6210",
  cloudSyncNeedsReview: "\u540C\u6B65\u672A\u5B8C\u6210\uFF0C\u8BF7\u67E5\u770B\u72B6\u6001\u5E76\u91CD\u65B0\u9884\u89C8",
  cloudSyncNeedsBinding: "\u5148\u9009\u62E9\u77E5\u8BC6\u5E93\uFF0C\u624D\u80FD\u9009\u62E9\u7B14\u8BB0\u5E76\u540C\u6B65",
  overview: "\u603B\u89C8\u4E0E\u914D\u7F6E",
  settings: "\u77E5\u8BC6\u5E93\u8BBE\u7F6E",
  knowledgeSettings: "\u77E5\u8BC6\u5E93\u8BBE\u7F6E",
  reviews: "Wiki \u5BA1\u6838",
  maintenance: "\u7D22\u5F15\u4E0E\u7EF4\u62A4",
  overviewTab: "\u603B\u89C8",
  networkTab: "\u7F51\u7EDC\u56FE",
  reviewTab: "\u5BA1\u9605",
  settingsTab: "\u8BBE\u7F6E",
  network: "\u7F51\u7EDC\u56FE",
  networkUnboundTitle: "\u5C1A\u672A\u5173\u8054\u77E5\u8BC6\u5E93",
  networkUnboundHint: "\u5173\u8054\u5DF2\u6709\u77E5\u8BC6\u5E93\u6216\u65B0\u5EFA\u77E5\u8BC6\u5E93\u540E\uFF0C\u8FD9\u91CC\u4F1A\u663E\u793A\u7B14\u8BB0\u4E4B\u95F4\u7684\u94FE\u63A5\u548C\u4E3B\u9898\u5173\u7CFB\u3002",
  networkDevHint: "\u5F53\u524D\u662F\u5F00\u53D1\u7248\u72EC\u7ACB\u914D\u7F6E\uFF1AuserData-dev \u4E0E ~/.pi/agent-dev \u4E0D\u4F1A\u81EA\u52A8\u8BFB\u53D6\u6B63\u5F0F\u7248\u914D\u7F6E\u3002\u4F60\u53EF\u4EE5\u9009\u62E9\u6B63\u5F0F\u7248\u6B63\u5728\u4F7F\u7528\u7684 Vault \u6765\u7EE7\u7EED\u3002",
  networkConnectExisting: "\u5173\u8054\u5DF2\u6709\u77E5\u8BC6\u5E93",
  networkCreate: "\u65B0\u5EFA\u77E5\u8BC6\u5E93",
  networkUseFormal: "\u4F7F\u7528\u6B63\u5F0F\u7248\u7684\u77E5\u8BC6\u5E93",
  homeSearch: "\u641C\u7D22",
  homeSearchPlaceholder: "\u641C\u7D22\u6587\u732E\u3001\u8F6F\u4EF6\u3001\u65B9\u6CD5\u6216\u60F3\u6CD5",
  homeSearchShortcut: "\u2318K",
  homeCategories: "\u5206\u7C7B",
  homeCategoryAll: "\u5168\u90E8",
  homeCategoryPaper: "\u6587\u732E",
  homeCategorySoftware: "\u8F6F\u4EF6",
  homeCategoryMethod: "\u65B9\u6CD5",
  homeCategoryIdea: "\u60F3\u6CD5",
  homeCategoryUnknown: "\u5176\u4ED6",
  homeSearchEmpty: "\u6CA1\u6709\u627E\u5230\u76F8\u5173\u7B14\u8BB0\u3002",
  homeSearchIncomplete: "\u6CA1\u6709\u627E\u5230\uFF1B\u7D22\u5F15\u4ECD\u5728\u6838\u5BF9\uFF0C\u7ED3\u679C\u53EF\u80FD\u4E0D\u5B8C\u6574\u3002",
  homeOpenGraph: "\u6253\u5F00\u7F51\u7EDC\u56FE",
  homeCloseGraph: "\u6536\u8D77\u7F51\u7EDC\u56FE",
  homeNewNote: "\u5728\u77E5\u8BC6\u5E93\u4E2D\u65B0\u5EFA",
  homeRecentDeposits: "\u6700\u8FD1\u6C89\u6DC0",
  homeRecentSource: "\u6765\u6E90\u4EFB\u52A1\u672A\u8BB0\u5F55",
  homeRecentSourceSaved: "\u77E5\u8BC6\u5E93\u4FDD\u5B58\u8BB0\u5F55",
  homeRecentTypeUnknown: "Wiki",
  homePendingTitle: "\u5F85\u5904\u7406\u4FEE\u6539",
  homePendingEmpty: "\u6CA1\u6709\u5F85\u5904\u7406\u4FEE\u6539\u3002",
  homePendingReview: "\u67E5\u770B\u5DEE\u5F02",
  homePendingCount: "{count} \u9879",
  homeHealthTitle: "\u5065\u5EB7\u68C0\u67E5",
  homeHealthLocalAnswers: "\u540C\u7C7B\u95EE\u9898\u7531\u672C\u5730\u56DE\u7B54",
  homeHealthIndexed: "\u5DF2\u7D22\u5F15\u7B14\u8BB0",
  homeHealthPending: "\u5F85\u5904\u7406\u6587\u4EF6",
  homeHealthJobs: "\u7EF4\u62A4\u4EFB\u52A1",
  homeHealthUnavailable: "\u2014",
  homeUnboundAction: "\u5173\u8054\u77E5\u8BC6\u5E93",
  homeBindingHint: "\u5173\u8054\u540E\u624D\u80FD\u641C\u7D22\u548C\u67E5\u770B\u77E5\u8BC6\u6761\u76EE\u3002",
  homeSearchUnavailable: "\u5C1A\u672A\u5173\u8054\u77E5\u8BC6\u5E93\uFF0C\u65E0\u6CD5\u68C0\u7D22\u3002",
  homeLoadingReviews: "\u6B63\u5728\u8BFB\u53D6\u5F85\u5904\u7406\u4FEE\u6539\u2026",
  homeReviewsError: "\u5F85\u5904\u7406\u4FEE\u6539\u8BFB\u53D6\u5931\u8D25",
  homeReviewUnavailable: "\u5F53\u524D\u9879\u76EE\u6CA1\u6709\u53EF\u5BA1\u6838\u7684\u5019\u9009\u3002",
  homeProjectContext: "\u9879\u76EE\u4E0A\u4E0B\u6587",
  homeProjectUnknown: "\u672A\u9009\u62E9\u9879\u76EE",
  homeVaultNotes: "\u7BC7\u7B14\u8BB0",
  homeLastDeposit: "\u4E0A\u6B21\u6C89\u6DC0",
  homeNever: "\u5C1A\u672A\u8BB0\u5F55",
  homeCountUnknown: "\u2014",
  graphTitle: "\u77E5\u8BC6\u7F51\u7EDC",
  graphEmpty: "\u8FD8\u6CA1\u6709\u5E26 [[\u53CC\u94FE]] \u7684\u7B14\u8BB0\u3002",
  graphSummary: "{nodes} \u7BC7\u7B14\u8BB0\u3001{edges} \u6761\u94FE\u63A5\uFF08\u5171 {total} \u7BC7\uFF0C\u6309\u8FDE\u63A5\u6570\u663E\u793A\u524D {limit} \u7BC7\uFF09",
  graphNebulaHint: "\u6EDA\u8F6E\u7F29\u653E\u3001\u62D6\u52A8\u5E73\u79FB\uFF1B\u989C\u8272\u662F\u81EA\u52A8\u8BC6\u522B\u7684\u4E3B\u9898\u7C07\uFF0C\u8D8A\u5927\u7684\u70B9\u8FDE\u63A5\u8D8A\u591A\u3002\u60AC\u505C\u9AD8\u4EAE\u76F8\u8FDE\u7B14\u8BB0\uFF0C\u70B9\u51FB\u6253\u5F00\u3002",
  graphAxisRelations: "\u5173\u7CFB\u5BC6\u5EA6\uFF08\u793A\u610F\uFF09",
  graphAxisConcepts: "\u6982\u5FF5\u5C42\u6B21\uFF08\u793A\u610F\uFF09",
  graphLinks: "{count} \u6761\u5173\u8054",
  graphReset: "\u590D\u4F4D",
  graphRelayout: "\u91CD\u65B0\u5E03\u5C40",
  graphHint: "\u60AC\u505C\u9AD8\u4EAE\u76F8\u8FDE\u7684\u7B14\u8BB0\uFF0C\u70B9\u51FB\u6253\u5F00\u3002\u84DD\u8272\u4E3A Wiki \u9875\u3002",
  graphSemantic: "\u76F8\u4F3C\u5185\u5BB9\u89C6\u56FE",
  graphAllFiles: "\u5168\u90E8\u6587\u4EF6",
  graphMergeMirrors: "\u5408\u5E76\u8BBA\u6587\u955C\u50CF",
  graphFocus: "\u805A\u7126",
  graphNebula: "\u7F51\u7EDC\u89C6\u56FE",
  graphBrowse: "\u6D4F\u89C8",
  graphHealthIsolated: "\u5B64\u7ACB {count}",
  graphHealthDuplicates: "\u53EF\u80FD\u91CD\u590D {count}",
  graphNodeCard: "\u8282\u70B9\u4FE1\u606F",
  graphOutgoing: "\u5411\u5916\u5173\u8054",
  graphIncoming: "\u53CD\u5411\u5173\u8054",
  graphHops: "\u5173\u8054\u5C42\u7EA7",
  graphMirrorWarning: "\u53D1\u73B0 {count} \u4E2A\u955C\u50CF\u8282\u70B9\uFF0C\u4EC5\u4F5C\u63D0\u793A\uFF0C\u4E0D\u8BA1\u5165\u8FDE\u63A5\u6570\u3002",
  graphOpenNote: "\u6253\u5F00\u7B14\u8BB0",
  graphSelectHint: "\u70B9\u51FB\u8282\u70B9\u67E5\u770B\u5C40\u90E8\u90BB\u57DF\u548C\u76F8\u5173\u5185\u5BB9\u3002",
  graphLegendNote: "\u7B14\u8BB0",
  graphLegendMirror: "\u955C\u50CF",
  graphRelationAll: "\u5168\u90E8\u5173\u7CFB",
  graphRelationLinks: "\u76F4\u63A5\u94FE\u63A5",
  graphRelationDirectory: "\u76EE\u5F55/\u63A8\u65AD",
  graphObservatoryLabel: "\u7814\u7A76\u77E5\u8BC6\u89C2\u6D4B\u53F0 \xB7 \u5173\u7CFB\u4E0E\u6765\u6E90",
  graphKeyboardHelp: "Tab \u9009\u62E9\u8282\u70B9\uFF0CEnter \u6216\u7A7A\u683C\u67E5\u770B\uFF1B+ \u653E\u5927\uFF0C\u2212 \u7F29\u5C0F\uFF0C0 \u91CD\u7F6E\uFF0CF \u805A\u7126\u9009\u4E2D\u8282\u70B9\uFF0CEscape \u5173\u95ED\u8BE6\u60C5\u3002",
  graphZoomIn: "\u653E\u5927",
  graphZoomOut: "\u7F29\u5C0F",
  graphFit: "\u9002\u5E94\u5168\u90E8",
  graphLive: "\u5B9E\u65F6\u66F4\u65B0",
  graphPaused: "\u5DF2\u6682\u505C \xB7 {count} \u6761\u5F85\u66F4\u65B0",
  graphLiveToggle: "\u70B9\u51FB\u6682\u505C\u6216\u6062\u590D\u5B9E\u65F6\u66F4\u65B0",
  graphResetView: "\u91CD\u7F6E\u89C6\u56FE",
  graphShortcuts: "+ / \u2212 \u7F29\u653E \xB7 \u62D6\u52A8\u5E73\u79FB \xB7 0 \u91CD\u7F6E \xB7 F \u805A\u7126 \xB7 Esc \u5173\u95ED\u8BE6\u60C5",
  graphDrawerClose: "\u5173\u95ED\u8BE6\u60C5",
  graphLegendMethod: "\u65B9\u6CD5",
  graphCategory: "\u5206\u7C7B",
  graphLegendMain: "\u4E3B\u8282\u70B9",
  graphLegendShared: "\u5171\u4EAB\u8FDE\u63A5",
  graphLegendDirect: "\u76F4\u63A5",
  graphLegendDirectory: "\u76EE\u5F55/\u63A8\u65AD",
  graphSelectedNode: "\u9009\u4E2D\u8282\u70B9",
  graphRelatedNotes: "\u76F8\u5173\u7B14\u8BB0",
  graphCollisionHint: "\u6807\u7B7E\u4F1A\u81EA\u52A8\u907F\u8BA9\uFF1B\u9009\u4E2D\u8282\u70B9\u540E\u53EA\u964D\u4F4E\u65E0\u5173\u5173\u7CFB\u7684\u89C6\u89C9\u6743\u91CD\u3002",
  graphColorType: "\u6309\u7C7B\u578B\u7740\u8272",
  graphColorCluster: "\u6309\u4E3B\u9898\u805A\u7C7B",
  graphScopeGlobal: "\u5168\u5C40",
  graphScopeLocal: "\u5C40\u90E8",
  graphHopCount: "{count} \u8DF3",
  graphLocalHint: "\u5C40\u90E8\u89C6\u56FE\uFF1A\u70B9\u9009\u4E00\u4E2A\u8282\u70B9\u540E\u663E\u793A\u5B83\u7684\u90BB\u57DF\u3002",
  graphHealth: "\u5065\u5EB7\u68C0\u67E5",
  graphHealthOrphan: "\u5B64\u7ACB\u7B14\u8BB0",
  graphHealthUncited: "\u672A\u88AB\u5F15\u7528\u7684 Wiki",
  graphHealthWarning: "\u9700\u8981\u6838\u5BF9",
  graphHealthUntitled: "\u7F3A\u5C11\u4E3B\u9898",
  graphHealthUntitledHint: "\u8282\u70B9\u540D\u8FD8\u662F\u6587\u4EF6\u540D\uFF08\u4F8B\u5982 PMC \u7F16\u53F7\u6216 .pdf\uFF09\uFF0C\u770B\u4E0D\u51FA\u8BB2\u4EC0\u4E48\u3002\u5EFA\u8BAE\u8865\u4E00\u4E2A\u4E3B\u9898\u3002",
  graphHealthUntitledPrompt: "\u8BF7\u9605\u8BFB\u77E5\u8BC6\u5E93\u7B14\u8BB0 {path} \u53CA\u5176\u6765\u6E90\uFF0C\u7528\u4E00\u53E5\u7B80\u77ED\u7684\u8BDD\u6982\u62EC\u5B83\u7684\u4E3B\u9898\uFF08\u4F8B\u5982\u201CDHX16 \u5728 pre-mRNA \u526A\u63A5\u4E2D\u7684\u4F5C\u7528\u201D\uFF09\uFF0C\u7136\u540E\u8C03\u7528 research_set_source_topic \u628A\u8FD9\u4E2A\u4E3B\u9898\u5199\u8FDB\u7B14\u8BB0\uFF1B\u53EA\u6539\u4E3B\u9898\uFF0C\u4E0D\u8981\u6539\u5199\u6B63\u6587\u3002",
  graphHealthEmpty: "\u5F53\u524D\u89C6\u56FE\u91CC\u6CA1\u6709\u53D1\u73B0\u95EE\u9898\u3002",
  graphHealthIntro: "\u53C2\u8003 LLM Wiki \u7684 lint\uFF1A\u627E\u51FA\u5199\u8FDB\u5E93\u91CC\u5374\u5F88\u96BE\u88AB\u590D\u7528\u7684\u77E5\u8BC6\u3002",
  graphHealthOrphanHint: "\u6CA1\u6709\u4EFB\u4F55\u53CC\u94FE\uFF0C\u68C0\u7D22\u548C\u5BF9\u8BDD\u5F88\u96BE\u590D\u7528\u5B83\u3002\u5EFA\u8BAE\u94FE\u63A5\u5230\u76F8\u5173 Wiki \u9875\u3002",
  graphHealthUncitedHint: "\u5DF2\u5199\u6210 Wiki\uFF0C\u4F46\u6CA1\u6709\u5176\u4ED6\u7B14\u8BB0\u94FE\u63A5\u5230\u5B83\u3002",
  graphHealthWarningHint: "\u6784\u5EFA\u56FE\u8C31\u65F6\u6807\u8BB0\u4E86\u63D0\u793A\uFF08\u955C\u50CF\u6216\u6807\u8BC6\u95EE\u9898\uFF09\uFF0C\u5EFA\u8BAE\u590D\u6838\u6765\u6E90\u3002",
  graphHealthOrphanPrompt: "\u8BF7\u68C0\u67E5\u77E5\u8BC6\u5E93\u7B14\u8BB0 {path}\uFF1A\u5B83\u76EE\u524D\u6CA1\u6709\u4EFB\u4F55\u53CC\u94FE\u3002\u627E\u51FA\u4E0E\u5B83\u76F8\u5173\u7684 Wiki \u9875\u9762\u6216\u4E3B\u9898\uFF0C\u628A\u5EFA\u8BAE\u7684\u94FE\u63A5\u4F5C\u4E3A\u5019\u9009\u63D0\u4EA4\u5230 Wiki \u5BA1\u9605\u961F\u5217\uFF0C\u4E0D\u8981\u76F4\u63A5\u6539\u5199\u6B63\u6587\u3002",
  graphHealthUncitedPrompt: "\u8BF7\u68C0\u67E5 Wiki \u9875\u9762 {path}\uFF1A\u76EE\u524D\u6CA1\u6709\u5176\u4ED6\u7B14\u8BB0\u94FE\u63A5\u5230\u5B83\u3002\u5224\u65AD\u5B83\u5E94\u88AB\u54EA\u4E9B\u9875\u9762\u6216\u4E3B\u9898\u5F15\u7528\uFF0C\u6216\u662F\u5426\u4E0E\u5DF2\u6709\u9875\u9762\u91CD\u590D\uFF1B\u628A\u5EFA\u8BAE\u4F5C\u4E3A\u5019\u9009\u63D0\u4EA4\u5230 Wiki \u5BA1\u9605\u961F\u5217\uFF0C\u4E0D\u8981\u76F4\u63A5\u6539\u5199\u6B63\u6587\u3002",
  graphInDegree: "\u88AB\u5F15\u7528 {count}",
  graphCluster: "\u4E3B\u9898 {count}",
  graphLegendShapes: "\u25CB \u6765\u6E90 \xB7 \u25A1 Wiki/\u6982\u5FF5 \xB7 \u25C7 \u4E3B\u5F20/\u8BC1\u636E",
  graphMore: "\u8FD8\u6709 {count} \u9879",
  networkChanges: "\u5B9E\u65F6\u53D8\u66F4",
  networkLive: "\u5B9E\u65F6\u66F4\u65B0",
  networkChangeSource: "{time} \xB7 \u6765\u6E90 {source}",
  networkChangesEmpty: "\u8FD8\u6CA1\u6709\u65B0\u7684\u77E5\u8BC6\u5E93\u53D8\u66F4\u3002",
  linksIncoming: "\u53CD\u5411\u94FE\u63A5",
  linksOutgoing: "\u94FE\u63A5\u5230",
  linksIncomingEmpty: "\u8FD8\u6CA1\u6709\u7B14\u8BB0\u94FE\u63A5\u5230\u8FD9\u91CC\u3002",
  linksOutgoingEmpty: "\u8FD9\u7BC7\u7B14\u8BB0\u6CA1\u6709 [[\u94FE\u63A5]]\u3002",
  linkMissing: "\u5C1A\u672A\u5EFA\u7ACB",
  dailyTitle: "\u65B0\u60F3\u6CD5",
  dailyLastRun: "\u4E0A\u6B21\u8FD0\u884C\uFF1A{time}",
  dailyNeverRun: "\u5C1A\u672A\u8FD0\u884C",
  flowWarnings: "\u6709\u63D0\u9192",
  reviewModeTitle: "\u77E5\u8BC6\u5BA1\u6838",
  reviewModeLabel: "\u77E5\u8BC6\u5BA1\u6838\u6A21\u5F0F",
  reviewAutomatic: "\u81EA\u52A8\u4FDD\u5B58 \xB7 \u975E\u963B\u65AD\u63D0\u9192\uFF08\u63A8\u8350\uFF09",
  reviewStrict: "\u4E25\u683C\u68C0\u67E5 \xB7 \u56DE\u7B54\u524D\u68C0\u67E5",
  reviewLegend: "\u5DF2\u4FDD\u5B58\uFF1A\u5185\u5BB9\u843D\u76D8\uFF0C\u4E0D\u4EE3\u8868\u79D1\u5B66\u9A8C\u8BC1\u3002 \u6709\u63D0\u9192\uFF1A\u8BC1\u636E\u5F85\u6838\u5B9E\uFF0C\u4E0D\u963B\u65AD\u56DE\u7B54\u3002 \u5F85\u786E\u8BA4\uFF1A\u4EBA\u5DE5\u5185\u5BB9\u6216\u51B2\u7A81\uFF0C\u4E0D\u81EA\u52A8\u8986\u76D6\u3002",
  reviewPermissions: "\u5DE5\u5177\u6743\u9650\u5728\u8F93\u5165\u6846\u7684\u201C\u81EA\u52A8\u6267\u884C / \u4E25\u683C\u786E\u8BA4\u201D\u4E2D\u5355\u72EC\u8BBE\u7F6E\uFF1B\u5220\u9664\u3001\u53D1\u5E03\u548C\u8D39\u7528\u8FB9\u754C\u4E0D\u4F1A\u56E0\u77E5\u8BC6\u81EA\u52A8\u5BA1\u6838\u800C\u653E\u5F00\u3002",
  wikiHistory: "Wiki \u4FDD\u5B58\u5386\u53F2\u4E0E\u64A4\u9500",
  wikiSaved: "\u5DF2\u4FDD\u5B58",
  wikiUndoConfirm: "\u64A4\u9500 {path} \u7684\u8FD9\u6B21\u4FDD\u5B58\uFF1F\u65B0\u5EFA\u9875\u9762\u4F1A\u5220\u9664\uFF0C\u5DF2\u4FEE\u6539\u7684\u9875\u9762\u4E0D\u4F1A\u88AB\u8986\u76D6\u3002",
  wikiUndo: "\u64A4\u9500",
  dailyNoNewNotes: "\u4E0A\u6B21\u8FD0\u884C\u65F6\uFF0C\u81EA {since} \u4EE5\u6765 Library/\u3001Wiki/\u3001Projects/ \u4E0B\u6CA1\u6709\u65B0\u589E\u6216\u4FEE\u6539\u7684\u7B14\u8BB0\uFF0C\u6240\u4EE5\u6CA1\u6709\u65B0\u60F3\u6CD5\u3002\u5176\u4ED6\u76EE\u5F55\u91CC\u7684\u7B14\u8BB0\u4E0D\u53C2\u4E0E\u6BCF\u65E5\u53D1\u73B0\u3002",
  dailyRanNoIdeas: "\u4E0A\u6B21\u8BFB\u4E86 {notes} \u7BC7\u6700\u8FD1\u66F4\u65B0\u7684\u7B14\u8BB0\uFF0C\u6CA1\u6709\u627E\u5230\u8DB3\u591F\u6709\u4F9D\u636E\u7684\u65B0\u60F3\u6CD5\u3002",
  dailyNotBound: "\u5C1A\u672A\u5173\u8054\u77E5\u8BC6\u5E93\u76EE\u5F55\uFF0C\u5173\u8054\u540E\u624D\u4F1A\u8FD0\u884C\u3002",
  dailyFailed: "\u4E0A\u6B21\u8FD0\u884C\u6CA1\u6709\u5B8C\u6210\uFF08{error}\uFF09\uFF0C\u4E0B\u4E2A\u6574\u70B9\u4F1A\u81EA\u52A8\u91CD\u8BD5\uFF1B\u4E5F\u53EF\u68C0\u67E5\u6A21\u578B\u8BBE\u7F6E\u540E\u70B9\u300C\u73B0\u5728\u8FD0\u884C\u300D\u3002",
  dailyEnabled: "\u6BCF\u65E5\u53D1\u73B0",
  dailyRunNow: "\u73B0\u5728\u8FD0\u884C",
  dailyHint: "\u6BCF\u5929\u4E00\u6B21\uFF1A\u62FF\u6700\u8FD1\u66F4\u65B0\u7684\u7B14\u8BB0\u548C\u76F8\u5173\u65E7\u7B14\u8BB0\u5BF9\u7167\uFF0C\u63D0\u51FA\u6700\u591A 3 \u6761\u6709\u4F9D\u636E\u3001\u53EF\u68C0\u9A8C\u7684\u65B0\u60F3\u6CD5\u3002\u90FD\u662F\u63A8\u6D4B\uFF0C\u9700\u8981\u4F60\u5224\u65AD\u3002",
  dailyEmpty: "\u6682\u65F6\u6CA1\u6709\u65B0\u60F3\u6CD5\u3002",
  dailySpeculative: "\u63A8\u6D4B",
  dailyBasis: "\u4F9D\u636E\uFF1A",
  dailyTest: "\u5982\u4F55\u68C0\u9A8C\uFF1A",
  dailySaved: "\u5DF2\u5B58\u4E3A",
  dailySave: "\u5B58\u4E3A\u60F3\u6CD5\u7B14\u8BB0",
  dailyDismiss: "\u5FFD\u7565",
  dailyRadarTitle: "\u65B0\u6587\u732E",
  dailyRadarEmpty: "\u6682\u65F6\u6CA1\u6709\u65B0\u6587\u732E\u3002",
  dailyRadarSource: "\u6765\u6E90\uFF1A{source}",
  dailyRadarTopics: "\u5339\u914D\u8BFE\u9898\uFF1A{topics}",
  dailyRadarCapture: "\u5165\u5E93",
  dailyRadarCaptured: "\u5DF2\u5165\u5E93",
  dailyRadarOpen: "\u6253\u5F00\u539F\u6587",
  homeRecent: "\u6700\u8FD1\u4FDD\u5B58",
  homeRecentEmpty: "\u8FD8\u6CA1\u6709\u4FDD\u5B58\u8BB0\u5F55\u3002",
  homePending: "\u5F85\u5904\u7406\u4FEE\u6539",
  homeManage: "\u7BA1\u7406\u4E0E\u7EF4\u62A4",
  homeManageHint: "\u5173\u8054\u3001\u7D22\u5F15\u3001\u76F8\u4F3C\u5185\u5BB9\u68C0\u7D22\u3001\u4E3B\u9898\u548C\u5BA1\u6838\u6A21\u5F0F\u5728\u300C\u77E5\u8BC6\u5E93 \u203A \u77E5\u8BC6\u5E93\u8BBE\u7F6E\u300D\u3002",
  refresh: "\u5237\u65B0\u72B6\u6001",
  loading: "\u6B63\u5728\u8BFB\u53D6\u672C\u5730\u72B6\u6001\u2026",
  failed: "\u64CD\u4F5C\u672A\u5B8C\u6210",
  retry: "\u91CD\u8BD5",
  close: "\u5173\u95ED",
  notBound: "\u5C1A\u672A\u5173\u8054\u5171\u4EAB\u77E5\u8BC6\u5E93",
  notBoundHint: "\u521B\u5EFA\u6216\u9009\u62E9\u4E00\u6B21\uFF0C\u6240\u6709\u9879\u76EE\u548C\u65B0\u4F1A\u8BDD\u5171\u540C\u4F7F\u7528\u3002\u4EE3\u7801\u4E0E\u7ED3\u679C\u76EE\u5F55\u4ECD\u5C5E\u4E8E\u5404\u81EA\u9879\u76EE\u3002",
  disabled: "\u6B64\u8FD0\u884C\u73AF\u5883\u5C1A\u672A\u542F\u7528\u5E94\u7528\u7EA7\u77E5\u8BC6\u5E93\u3002\u8BF7\u4F7F\u7528\u65B0\u7684\u684C\u9762\u6784\u5EFA\u3002",
  vault: "\u5F53\u524D\u77E5\u8BC6\u5E93\u76EE\u5F55\uFF08Vault\uFF09",
  scope: "\u9002\u7528\u8303\u56F4",
  scopeValue: "\u5E94\u7528\u7EA7\u5171\u4EAB",
  project: "\u5F53\u524D\u77E5\u8BC6\u9879\u76EE",
  noProject: "\u672A\u9009\u62E9\u9879\u76EE\uFF1B\u4EC5\u663E\u793A\u5171\u4EAB\u72B6\u6001",
  profile: "\u77E5\u8BC6\u7ED3\u6784",
  deposit: "\u4FDD\u5B58\u7B56\u7565",
  subagents: "\u5B50\u667A\u80FD\u4F53\u8BBF\u95EE",
  index: "\u672C\u5730\u7D22\u5F15",
  notes: "\u5DF2\u7D22\u5F15\u7B14\u8BB0",
  pending: "\u5F85\u5904\u7406\u6587\u4EF6",
  jobs: "\u7EF4\u62A4\u4EFB\u52A1",
  lastChecked: "\u6700\u8FD1\u76EE\u5F55\u6838\u5BF9",
  unknown: "\u5C1A\u672A\u5B8C\u6210",
  watching: "\u6587\u4EF6\u76D1\u542C\u6B63\u5E38",
  notWatching: "\u6587\u4EF6\u76D1\u542C\u4E0D\u53EF\u7528\uFF1B\u9700\u8981\u68C0\u67E5",
  privacy: "\u7D22\u5F15\u5728\u672C\u673A\u3002\u4F7F\u7528\u4E91\u7AEF\u6A21\u578B\u65F6\uFF0C\u9009\u4E2D\u7684\u5BFC\u822A\u4E0E\u77E5\u8BC6\u7247\u6BB5\u4F1A\u53D1\u9001\u7ED9\u8BE5\u6A21\u578B\uFF1B\u4E0D\u7B49\u4E8E\u7EAF\u672C\u5730\u9690\u79C1\u6A21\u5F0F\u3002",
  openVault: "\u6253\u5F00\u77E5\u8BC6\u5E93\u76EE\u5F55",
  adjust: "\u5207\u6362\u6216\u8C03\u6574\u77E5\u8BC6\u5E93",
  setup: "\u5F00\u59CB\u521D\u59CB\u5316\u95EE\u7B54\uFF08\u77E5\u8BC6\u5E93 + Zotero\uFF09",
  selectFolder: "\u9009\u62E9\u6587\u4EF6\u5939",
  adjustCurrent: "\u8C03\u6574\u5F53\u524D\u77E5\u8BC6\u5E93\u8BBE\u7F6E",
  switchFolder: "\u5207\u6362\u5230\u5176\u4ED6\u6587\u4EF6\u5939\u2026",
  newPath: "\u5207\u6362\u6216\u521B\u5EFA\u77E5\u8BC6\u5E93",
  pathPlaceholder: "\u8F93\u5165\u72EC\u7ACB\u7684\u77E5\u8BC6\u5E93\u76EE\u5F55\uFF08Vault\uFF09\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u6216\u9009\u62E9\u6587\u4EF6\u5939",
  preview: "\u9884\u89C8\u76EE\u5F55\u4E0E\u6A21\u677F",
  previewOnly: "\u4EE5\u4E0B\u4EC5\u4E3A\u76EE\u5F55\u548C\u6A21\u677F\u9884\u89C8\uFF0C\u4E0D\u4F1A\u5199\u5165\u3002\u914D\u7F6E\u504F\u597D\u53EA\u8BE2\u95EE\u4E00\u6B21\uFF0C\u6700\u7EC8\u5199\u5165\u7531\u4E00\u5F20\u786E\u8BA4\u5361\u6388\u6743\u3002",
  skillBound: "\u77E5\u8BC6\u5E93\u521D\u59CB\u5316\uFF1A/obsidian-setup\uFF08research-vault\uFF09\u3002\u6587\u732E\u63A5\u5165\u7531\u6280\u80FD\u4E0E\u8FDE\u63A5\u9875\u7684\u5185\u7F6E Zotero \u8FDE\u63A5\u5668\u7BA1\u7406\u3002",
  globalSwitch: "Vault \u662F\u5E94\u7528\u7EA7\u5171\u4EAB\u77E5\u8BC6\u5E93\uFF1A\u6240\u6709\u9879\u76EE\u53EF\u68C0\u7D22\u5171\u4EAB Library\uFF0C\u9879\u76EE\u5185\u5BB9\u5199\u5165\u5404\u81EA Projects \u5206\u533A\u3002\u70B9\u201C\u5207\u6362\u6216\u521B\u5EFA\u77E5\u8BC6\u5E93\u201D\u53EF\u66F4\u6362\u76EE\u5F55\uFF1B\u6B63\u5728\u8FD0\u884C\u7684\u65E7\u4EFB\u52A1\u4E0D\u4F1A\u9759\u9ED8\u6539\u7528\u65B0\u5E93\u3002",
  selectProject: "\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u9879\u76EE\u6216\u6253\u5F00\u4F1A\u8BDD\uFF0C\u4F5C\u4E3A\u521D\u59CB\u5316\u95EE\u7B54\u7684\u4E0A\u4E0B\u6587\u3002",
  pathRequired: "\u8BF7\u8F93\u5165\u6216\u9009\u62E9\u77E5\u8BC6\u5E93\u76EE\u5F55\u8DEF\u5F84\u3002",
  existing: "\u5DF2\u6709\u76EE\u5F55",
  newVault: "\u5C1A\u4E0D\u5B58\u5728\uFF0C\u5C06\u5728\u786E\u8BA4\u540E\u521B\u5EFA",
  truncated: "\u5185\u5BB9\u5DF2\u622A\u65AD\uFF0C\u53EF\u7EE7\u7EED\u8BFB\u53D6",
  templates: "\u5185\u7F6E\u6A21\u677F\u9884\u89C8",
  library: "\u5171\u4EAB Library",
  projectFolders: "\u9879\u76EE\u76EE\u5F55",
  legacy: "\u53D1\u73B0\u65E7\u9879\u76EE\u77E5\u8BC6\u5E93\u76EE\u5F55\u914D\u7F6E\uFF08\u4E0D\u4F1A\u8986\u76D6\u5168\u5C40\u5173\u8054\uFF09",
  legacyHint: "\u8BF7\u6838\u5BF9\u540E\u901A\u8FC7\u521D\u59CB\u5316\u6D41\u7A0B\u9009\u62E9\u9700\u8981\u7684\u77E5\u8BC6\u5E93\uFF1B\u7A0B\u5E8F\u4E0D\u4F1A\u81EA\u52A8\u8FC1\u79FB\u6216\u5220\u9664\u65E7\u7B14\u8BB0\u3002",
  notMcp: "\u539F\u751F\u77E5\u8BC6\u7D22\u5F15\uFF0C\u4E0D\u4EE3\u8868\u539F\u59CB MCP \u5DF2\u8FDE\u63A5",
  literature: "\u6587\u732E\u5E93 \xB7 Zotero",
  literatureHint: "Zotero \u7BA1 PDF\u3001\u6761\u76EE\u548C\u6807\u6CE8\uFF1BObsidian \u7BA1\u53EF\u5F15\u7528\u7684 Library/Papers \u7B14\u8BB0\u3001\u8BC1\u636E\u548C Wiki\u3002\u6587\u732E\u63A5\u5165\u5728\u6280\u80FD\u4E0E\u8FDE\u63A5\u9875\u7684\u5185\u7F6E Zotero \u8FDE\u63A5\u5668\u91CC\u5B8C\u6210\u3002",
  literatureSetup: "\u6253\u5F00 Zotero \u9762\u677F",
  literatureBound: "\u6280\u80FD\u4E0E\u8FDE\u63A5 \xB7 \u5185\u7F6E Zotero \u8FDE\u63A5\u5668",
  literatureSteps: "\u51C6\u5907\u6B65\u9AA4\uFF1A\u542F\u52A8 Zotero \u684C\u9762\u7AEF \u2192 \u6253\u5F00\u672C\u673A\u901A\u4FE1 \u2192 \u5728\u8FDE\u63A5\u5668\u4E2D\u6388\u6743",
  literatureStatus: "\u5B89\u88C5\u6D41\u7A0B\u4F1A\u5728\u5F53\u524D\u4F1A\u8BDD\u4E2D\u663E\u793A\u786E\u8BA4\u3001\u7ED3\u679C\u548C\u9519\u8BEF\u4FE1\u606F\u3002",
  literatureDownload: "\u4E0B\u8F7D Zotero",
  literatureCheck: "\u5B8C\u6210\u540E\u68C0\u67E5\uFF1AZotero \u684C\u9762\u7AEF\u5DF2\u542F\u52A8\u3001\u672C\u673A API \u53EF\u8BBF\u95EE\uFF1B\u5DF2\u6709 Zotero MCP \u4ECD\u4F5C\u4E3A\u666E\u901A MCP \u6761\u76EE\u663E\u793A\u3002",
  empty: "\u6682\u65E0\u6761\u76EE",
  previous: "\u4E0A\u4E00\u9875",
  next: "\u4E0B\u4E00\u9875",
  total: "\u603B\u8BA1",
  originProject: "\u5019\u9009\u53EA\u5728\u53D1\u8D77\u9879\u76EE\u4E2D\u5BA1\u6838\uFF1B\u5DF2\u6279\u51C6\u7684\u5171\u4EAB Wiki \u53EF\u4F9B\u5176\u4ED6\u9879\u76EE\u68C0\u7D22\u3002",
  reviewTitle: "\u5BA1\u6838\u5177\u4F53 Wiki \u4FEE\u6539",
  selectReview: "\u9009\u62E9\u4E00\u4E2A\u5019\u9009\uFF0C\u6309\u9700\u52A0\u8F7D\u5DEE\u5F02\u4E0E\u6765\u6E90\u3002",
  reason: "\u4FEE\u6539\u7406\u7531",
  diff: "\u4FEE\u6539\u5DEE\u5F02",
  both: "\u539F\u6587 / \u62DF\u4FEE\u6539",
  protected: "\u53D7\u4FDD\u62A4\u7684\u4EBA\u5DE5\u5185\u5BB9",
  before: "\u4FEE\u6539\u524D\u6258\u7BA1\u533A",
  after: "\u62DF\u66FF\u6362\u6258\u7BA1\u533A",
  sources: "\u4F9D\u636E\u4E0E\u7248\u672C",
  openSource: "\u8BFB\u53D6\u6765\u6E90",
  handOff: "\u4EA4\u7ED9\u5BF9\u8BDD\u5904\u7406",
  handOffPrompt: "\u8BF7\u590D\u8BFB\u77E5\u8BC6\u5E93\u7B14\u8BB0 {path} \u5F15\u7528\u7684\u6765\u6E90\uFF0C\u6838\u5BF9\u5185\u5BB9\u662F\u5426\u4ECD\u7136\u51C6\u786E\uFF1B\u9700\u8981\u4FEE\u6539\u65F6\uFF0C\u628A\u4FEE\u6539\u4F5C\u4E3A\u5019\u9009\u63D0\u4EA4\u5230 Wiki \u5BA1\u9605\u961F\u5217\uFF0C\u4E0D\u8981\u76F4\u63A5\u6539\u5199\u6B63\u6587\u3002",
  sourceChanged: "\u6765\u6E90\u5DF2\u53D8\u5316\u6216\u4E0D\u53EF\u8BFB",
  targetChanged: "\u76EE\u6807\u7B14\u8BB0\u5DF2\u53D8\u5316",
  expired: "\u5019\u9009\u6216\u9884\u89C8\u5DF2\u8FC7\u671F",
  stalePreview: "\u77E5\u8BC6\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D\u9884\u89C8\u540E\u5BA1\u6838\u3002",
  refreshPreview: "\u91CD\u65B0\u52A0\u8F7D\u9884\u89C8",
  approve: "\u5E94\u7528\u5DF2\u67E5\u770B\u7684\u5019\u9009",
  reject: "\u62D2\u7EDD\u5019\u9009",
  apply: "\u5E94\u7528",
  later: "\u7A0D\u540E",
  reviewLaterHint: "\u7A0D\u540E\u53EF\u4ECE\u77E5\u8BC6\u5E93\u9762\u677F\u6216 /obsidian-review \u518D\u6253\u5F00\u3002",
  reviewQueued: "\u8FD8\u6709 {count} \u4E2A\u5F85\u786E\u8BA4",
  applying: "\u6B63\u5728\u6267\u884C\u2026",
  confirmReview: "\u6211\u5DF2\u67E5\u770B\u5DEE\u5F02\u548C\u6765\u6E90\uFF0C\u540C\u610F\u5E94\u7528\u8FD9\u4E00\u5177\u4F53\u4FEE\u6539\u3002",
  notScience: "\u901A\u8FC7\u9605\u8BFB\u6216\u56DE\u7B54\u68C0\u67E5 \u2260 \u79D1\u5B66\u7ED3\u8BBA\u5DF2\u9A8C\u8BC1\u3002\u6279\u51C6 Wiki \u4EC5\u8868\u793A\u63A5\u53D7\u672C\u6B21\u4FEE\u6539\u3002",
  preserve: "\u53EA\u66FF\u6362\u667A\u80FD\u4F53\u6258\u7BA1\u533A\uFF1B\u6258\u7BA1\u533A\u5916\u7684\u4EBA\u5DE5\u6B63\u6587\u4E0E\u6279\u6CE8\u4FDD\u6301\u4E0D\u53D8\u3002",
  applied: "Wiki \u4FEE\u6539\u5DF2\u5E94\u7528",
  rejected: "\u5019\u9009\u5DF2\u62D2\u7EDD\uFF0C\u7B14\u8BB0\u672A\u4FEE\u6539",
  savedPartial: "\u7B14\u8BB0\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u7D22\u5F15\u6216\u5BA1\u6838\u8BB0\u5F55\u5C1A\u672A\u5B8C\u6210\uFF0C\u8BF7\u67E5\u770B\u9519\u8BEF\u5E76\u5237\u65B0\u3002",
  viewNote: "\u9605\u8BFB\u77E5\u8BC6\u6761\u76EE",
  openObsidian: "\u5728 Obsidian \u4E2D\u6253\u5F00",
  readMore: "\u7EE7\u7EED\u8BFB\u53D6",
  readBack: "\u4ECE\u5F00\u5934\u8BFB\u53D6",
  humanReview: "\u4EBA\u5DE5\u590D\u6838",
  missing: "\u6587\u4EF6\u4E0D\u5B58\u5728\u6216\u5DF2\u79FB\u9664",
  uiRead: "\u8FD9\u91CC\u7684\u9605\u8BFB\u4F9B\u4F60\u67E5\u770B\uFF0C\u4E0D\u8BA1\u4F5C\u6A21\u578B\u672C\u8F6E\u7684\u8BFB\u53D6\u8BB0\u5F55\u3002",
  buildIndex: "\u6838\u5BF9\u76EE\u5F55 / \u91CD\u8BD5\u7D22\u5F15",
  refreshNavigation: "\u66F4\u65B0\u6392\u961F\u4E2D\u7684\u5BFC\u822A",
  maintenanceHint: "\u76F4\u63A5\u64CD\u4F5C\u540E\u7AEF\uFF0C\u4E0D\u8C03\u7528\u6A21\u578B\u3002\u76EE\u5F55\u6838\u5BF9\u4E0D\u6539\u5199 Wiki \u6B63\u6587\uFF1B\u5BFC\u822A\u66F4\u65B0\u53EA\u5904\u7406\u6700\u591A 5 \u4E2A\u4EFB\u52A1\u3002",
  confirmNavigation: "\u786E\u8BA4\u66F4\u65B0\u8FD9\u4E9B\u5BFC\u822A\u7684\u667A\u80FD\u4F53\u6258\u7BA1\u533A\uFF1F\u4EBA\u5DE5\u5185\u5BB9\u4FDD\u7559\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u7EFC\u5408\u6216\u6539\u5199\u4E3B\u9898 Wiki\u3002",
  maintenanceDone: "\u7EF4\u62A4\u64CD\u4F5C\u5DF2\u5B8C\u6210",
  maintenanceBusy: "\u6B63\u5728\u7EF4\u62A4\uFF0C\u8BF7\u52FF\u91CD\u590D\u63D0\u4EA4",
  automaticMaintenance: "\u81EA\u52A8\u7EF4\u62A4",
  automaticMaintenanceHint: "\u9ED8\u8BA4\u5173\u95ED\uFF1B\u6BCF\u5929\u6700\u591A\u8FD0\u884C\u4E00\u6B21\uFF0C\u6B63\u6587\u4FEE\u6539\u53EA\u8FDB\u5165 Wiki \u5BA1\u9605\u961F\u5217\u3002",
  maintenanceModel: "\u6A21\u578B",
  maintenanceModelDefault: "\u4F7F\u7528\u9ED8\u8BA4\u6A21\u578B",
  maintenanceItems: "\u6BCF\u6B21\u9879\u6570",
  maintenanceDailyLimit: "\u6BCF\u65E5\u4E0A\u9650",
  runAutomaticMaintenance: "\u7ACB\u5373\u8FD0\u884C",
  lastAutomaticMaintenance: "\u6700\u8FD1\u4E00\u6B21",
  automaticMaintenanceDone: "\u81EA\u52A8\u7EF4\u62A4\u5DF2\u5B8C\u6210\uFF0C\u7ED3\u679C\u5DF2\u4FDD\u5B58\u3002",
  openTarget: "\u6253\u5F00",
  enable: "\u5F00\u542F",
  disable: "\u5173\u95ED",
  problems: "\u672A\u8986\u76D6\u6216\u5931\u8D25\u7684\u6761\u76EE\uFF08\u6700\u591A\u663E\u793A 20 \u6761\uFF09",
  problemHint: "\u672A\u7D22\u5F15\u3001\u4E0D\u53EF\u8BFB\u548C\u65E0\u547D\u4E2D\u4E0D\u540C\u3002\u4FEE\u590D\u6587\u4EF6\u540E\u53EF\u91CD\u8BD5\u7D22\u5F15\uFF0C\u4E0D\u80FD\u636E\u6B64\u65AD\u8A00\u5E93\u4E2D\u6CA1\u6709\u76F8\u5173\u77E5\u8BC6\u3002",
  coverageReady: "\u5DF2\u5B8C\u6210\u76EE\u5F55\u6838\u5BF9",
  coverageIndexing: "\u6B63\u5728\u5EFA\u7ACB / \u6838\u5BF9\u7D22\u5F15",
  coveragePartial: "\u7D22\u5F15\u8986\u76D6\u4E0D\u5B8C\u6574",
  coverageUninitialized: "\u5C1A\u672A\u5EFA\u7ACB\u7D22\u5F15",
  researchRuns: "\u7814\u7A76\u8FD0\u884C\u4E0E\u8DEF\u7EBF",
  researchRunsHint: "\u5728\u540C\u4E00\u4E2A\u9762\u677F\u91CC\u67E5\u770B\u51C6\u5907\u3001\u5F53\u524D\u8DEF\u7531\u3001\u6765\u6E90\u548C\u4E3B\u5F20\u8986\u76D6\u3002",
  researchRunsLoading: "\u6B63\u5728\u8BFB\u53D6\u7814\u7A76\u8FD0\u884C\u2026",
  researchRunsEmpty: "\u5F53\u524D\u9879\u76EE\u8FD8\u6CA1\u6709\u53EF\u5C55\u793A\u7684\u7814\u7A76\u8FD0\u884C\u3002",
  researchAnswerable: "\u5DF2\u6EE1\u8DB3\u56DE\u7B54\u6761\u4EF6",
  researchInProgress: "\u4ECD\u5728\u8FDB\u884C",
  researchArchive: "\u6765\u6E90",
  researchSources: "\u6765\u6E90\u6570",
  researchClaims: "\u4E3B\u5F20\u6570",
  researchCoverage: "\u8986\u76D6\u7387",
  researchCoverageRecorded: "\u5DF2\u8BB0\u5F55",
  researchCoverageUnknown: "\u5F85\u8BB0\u5F55",
  researchSourceList: "\u6765\u6E90",
  researchIntegrity: "\u5B8C\u6574\u6027",
  researchRouteHint: "\u8DEF\u7EBF\u53EA\u6807\u8BB0\u5B9E\u9645\u53D1\u751F\u8FC7\u7684\u8282\u70B9\uFF1B\u5206\u652F\u6CA1\u6709\u53D1\u751F\u65F6\u4FDD\u6301\u5F85\u5904\u7406\u3002\u70B9\u51FB\u6765\u6E90\u53EF\u5728\u672C\u9762\u677F\u9605\u8BFB\u3002",
  researchProvenance: "\u6765\u6E90\u4E0E\u590D\u73B0",
  researchGaps: "\u8BC1\u636E\u7F3A\u53E3",
  researchTimeline: "\u5B9E\u9645\u4E8B\u4EF6",
  researchGovernance: "\u7814\u7A76\u8BB0\u5F55\u63D0\u9192",
  researchDuplicates: "\u91CD\u590D",
  researchStale: "\u8FC7\u671F\u6216\u5DF2\u64A4\u7A3F",
  researchUnavailable: "\u4E0D\u53EF\u7528",
  evidenceReview: "\u5F85\u7EB3\u5165\u603B\u7ED3\u7684\u8BC1\u636E",
  wikiReview: "Wiki \u9700\u8981\u590D\u6838",
  navigationJob: "\u5BFC\u822A\u5F85\u66F4\u65B0",
  manualReview: "\u9700\u8981\u9605\u8BFB\u8D44\u6599\u5E76\u63D0\u8BAE\u4FEE\u6539\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u6D88\u8017\u6A21\u578B\u8D39\u7528\u3002",
  flow: "\u672C\u8F6E\u77E5\u8BC6\u8BBF\u95EE",
  details: "\u67E5\u770B\u9605\u8BFB\u8BB0\u5F55",
  manage: "\u7BA1\u7406\u77E5\u8BC6\u5E93",
  resume: "\u7EE7\u7EED\u5B8C\u6210\u77E5\u8BC6\u68C0\u67E5",
  resumeHint: "\u5C06\u5411\u5F53\u524D\u6A21\u578B\u53D1\u9001\u7EE7\u7EED\u5904\u7406\u8BF7\u6C42\uFF0C\u53EF\u80FD\u4EA7\u751F\u6A21\u578B\u8D39\u7528\u3002",
  navigation: "\u5BFC\u822A\u4E0E\u9879\u76EE\u80CC\u666F",
  wiki: "\u76F8\u5173 Wiki",
  search: "\u8BC1\u636E\u68C0\u7D22",
  publication: "\u56DE\u7B54\u68C0\u67E5",
  notStarted: "\u5C1A\u65E0\u5B8C\u6210\u8BB0\u5F55",
  matched: "\u8FD4\u56DE\u6761\u76EE",
  readScope: "\u672C\u8F6E\u8BFB\u53D6\u7684\u6587\u4EF6\u4E0E\u7248\u672C",
  checksNotFacts: "\u8FD9\u8BB0\u5F55\u5B9E\u9645\u6B65\u9AA4\uFF0C\u4E0D\u8BC1\u660E\u68C0\u7D22\u5145\u5206\u6216\u7ED3\u8BBA\u6B63\u786E\u3002",
  preparing: "\u6B63\u5728\u51C6\u5907\u77E5\u8BC6\u5E93\u5BFC\u822A",
  navigationPhase: "\u5BFC\u822A\u5DF2\u63D0\u4F9B\uFF0C\u7B49\u5F85\u9605\u8BFB Wiki",
  readingWiki: "\u6B63\u5728\u9605\u8BFB\u76F8\u5173 Wiki",
  searching: "\u6B63\u5728\u68C0\u7D22\u77E5\u8BC6\u5E93",
  readingEvidence: "\u6B63\u5728\u9605\u8BFB\u8BC1\u636E",
  checking: "\u6B63\u5728\u68C0\u67E5\u5F15\u7528\u4E0E\u7248\u672C",
  released: "\u56DE\u7B54\u5DF2\u51C6\u5907\u597D",
  noHits: "\u672C\u6B21\u67E5\u8BE2\u65E0\u547D\u4E2D",
  blocked: "\u56DE\u7B54\u6682\u672A\u5C55\u793A",
  unconfigured: "\u5C1A\u672A\u5173\u8054\u77E5\u8BC6\u5E93",
  evidenceOnly: "\u8865\u5145\u6750\u6599\u5C1A\u672A\u7531\u4E3B\u4F1A\u8BDD\u786E\u8BA4",
  interrupted: "\u672C\u8F6E\u5DF2\u4E2D\u65AD",
  noHitsHint: "\u65E0\u547D\u4E2D\u53EA\u9002\u7528\u4E8E\u672C\u6B21\u67E5\u8BE2\uFF0C\u4E0D\u4EE3\u8868\u6574\u4E2A\u77E5\u8BC6\u5E93\u4E0D\u5B58\u5728\u76F8\u5173\u77E5\u8BC6\u3002",
  errorDetails: "\u67E5\u770B\u9519\u8BEF\u8BE6\u60C5",
  newSetup: "\u91CD\u65B0\u914D\u7F6E",
  notification: "\u77E5\u8BC6\u5E93\u901A\u77E5",
  semantic: "\u76F8\u4F3C\u5185\u5BB9\u68C0\u7D22",
  topics: "\u4E3B\u9898\u8BB0\u5FC6",
  semanticOptIn: "\u76F8\u4F3C\u5185\u5BB9\u68C0\u7D22\u9ED8\u8BA4\u5173\u95ED\uFF1B\u5173\u952E\u8BCD\u68C0\u7D22\uFF08FTS\uFF09\u59CB\u7EC8\u4F5C\u4E3A\u56DE\u9000\u3002",
  provider: "\u6A21\u578B\u670D\u52A1",
  providerNone: "\u65E0\uFF08\u4EC5\u5173\u952E\u8BCD\uFF09",
  providerOllama: "Ollama",
  providerOpenAI: "OpenAI-compatible",
  endpoint: "\u7AEF\u70B9",
  modelName: "\u6A21\u578B\u540D\u79F0",
  credentialEnv: "\u51ED\u636E\u73AF\u5883\u53D8\u91CF\u540D",
  remoteConsent: "\u6211\u540C\u610F\u5C06\u539F\u59CB\u7B14\u8BB0\u7247\u6BB5\u548C\u67E5\u8BE2\u53D1\u9001\u5230\u914D\u7F6E\u7684\u8FDC\u7A0B\u6A21\u578B\u670D\u52A1",
  saveSemantic: "\u4FDD\u5B58\u76F8\u4F3C\u5185\u5BB9\u8BBE\u7F6E",
  testSemantic: "\u6D4B\u8BD5\u6A21\u578B\u670D\u52A1",
  testSemanticHint: "\u6D4B\u8BD5\u53EA\u53D1\u9001\u56FA\u5B9A\u7684\u901A\u7528\u6D4B\u8BD5\u6587\u672C\uFF0C\u4E0D\u4F1A\u53D1\u9001\u77E5\u8BC6\u5E93\u5185\u5BB9\u3002",
  semanticMinSimilarity: "\u6700\u4F4E\u76F8\u4F3C\u5EA6",
  semanticMinSimilarityHint: "\u4F4E\u4E8E\u8BE5\u6587\u672C\u76F8\u4F3C\u5EA6\u7684\u5019\u9009\u4F1A\u88AB\u4E22\u5F03\u3002\u9ED8\u8BA4 0.45\uFF1B\u4E0D\u540C\u5411\u91CF\u6A21\u578B\u53EF\u6309\u4F60\u7684\u9A8C\u8BC1\u7ED3\u679C\u8C03\u6574\uFF08\u8BE6\u60C5\u4FDD\u7559 cosine / embedding \u540D\u79F0\uFF09\u3002",
  semanticSaved: "\u76F8\u4F3C\u5185\u5BB9\u8BBE\u7F6E\u5DF2\u4FDD\u5B58",
  semanticTested: "\u6A21\u578B\u670D\u52A1\u6D4B\u8BD5\u5B8C\u6210",
  semanticIndex: "\u5EFA\u7ACB\u76F8\u4F3C\u5185\u5BB9\u7D22\u5F15",
  semanticIndexHint: "\u6BCF\u6B21\u6700\u591A\u5904\u7406 8 \u4E2A\u7247\u6BB5\uFF1B\u9700\u8981\u518D\u6B21\u70B9\u51FB\u624D\u80FD\u7EE7\u7EED\u3002",
  semanticIndexing: "\u6B63\u5728\u5EFA\u7ACB\u76F8\u4F3C\u5185\u5BB9\u7D22\u5F15",
  semanticCancel: "\u53D6\u6D88\u7D22\u5F15",
  semanticDisabled: "\u8BF7\u5148\u4FDD\u5B58\u5E76\u542F\u7528\u76F8\u4F3C\u5185\u5BB9\u8BBE\u7F6E\u3002",
  semanticFallback: "\u5019\u9009\u6765\u81EA\u6587\u672C\u76F8\u4F3C\u5EA6\u6216\u5173\u952E\u8BCD\u68C0\u7D22\uFF0C\u4E0D\u4EE3\u8868\u6A21\u578B\u5DF2\u7ECF\u8BFB\u53D6\u3002",
  semanticDimension: "\u7EF4\u5EA6",
  processed: "\u5DF2\u5904\u7406",
  topicFilter: "\u7B5B\u9009\u4E3B\u9898",
  topicStatus: "\u72B6\u6001",
  topicEntities: "\u5B9E\u4F53",
  topicQuestions: "\u672A\u89E3\u51B3\u95EE\u9898",
  topicSources: "\u6765\u6E90\u8DEF\u5F84",
  topicArtifacts: "\u6210\u679C",
  topicConflicts: "\u5F85\u6838\u5BF9\u51B2\u7A81",
  topicConflictHint: "\u4FDD\u7559\u53CC\u65B9\u6765\u6E90\uFF1B\u540C\u6761\u4EF6\u76F8\u53CD\u89C2\u5BDF\u4E0D\u4F1A\u81EA\u52A8\u8986\u76D6\u65E7\u77E5\u8BC6\u3002",
  topicConflictReason: "\u5224\u5B9A",
  archiveTopic: "\u5F52\u6863\u4E3B\u9898",
  archiveConfirm: "\u786E\u8BA4\u5F52\u6863\u8FD9\u4E2A\u4E3B\u9898\uFF1F\u6B64\u64CD\u4F5C\u9700\u8981\u6700\u65B0\u6587\u6863\u7248\u672C\u3002",
  topicArchived: "\u4E3B\u9898\u5DF2\u5F52\u6863",
  topicNeutral: "\u4E3B\u9898\u662F\u5019\u9009\u8BB0\u5FC6\uFF0C\u4E0D\u4EE3\u8868\u79D1\u5B66\u9A8C\u8BC1\u3002",
  resumeTopic: "\u51C6\u5907\u5E76\u7EE7\u7EED\u7814\u7A76",
  resumeTopicHint: "\u5C06\u5411\u5F53\u524D\u53EF\u5199\u4F1A\u8BDD\u53D1\u9001\u660E\u786E\u63D0\u793A\uFF0C\u7136\u540E\u7EE7\u7EED\u6307\u5B9A\u4E3B\u9898\u3002",
  resumeUnavailable: "\u9700\u8981\u5F53\u524D\u9879\u76EE\u4E2D\u7684\u53EF\u5199\u4F1A\u8BDD\uFF0C\u4E14\u5F53\u524D\u4EFB\u52A1\u4E0D\u80FD\u6B63\u5728\u6D41\u5F0F\u8FD0\u884C\u3002"
};
var knowledgeEn = {
  cancel: "Cancel",
  specialist_reviewer: "Wiki reviewer",
  modelReviewButton: "Automatic model review",
  modelReviewPreflight: "Model pre-review",
  modelReviewAdviceHint: "Advice from supplied source ranges; you still apply to write the Wiki.",
  modelReviewModel: "Reviewer model",
  modelReviewInherit: "Current session model",
  modelReviewSession: "Open a session in the originating project and select an available model.",
  modelReviewHint: "Review this candidate only, including the proposed block, protected human text and up to 6 source ranges. Independent request: no chat history, whole-knowledge-base search or downloads.",
  modelReviewAck: "Send these contents to the selected model; I understand that model usage may be charged.",
  modelReviewAutoApply: "Apply this candidate when the model review and all application checks pass.",
  modelReviewWriteHint: "Advice only by default. Opting into application updates this managed section only. Insufficient evidence, conflicts, changed versions or cancellation prevent automatic writes. No ongoing background review is enabled.",
  modelReviewStart: "Start review",
  modelReviewRunning: "Independent review (up to 120 seconds)\u2026",
  modelReviewApplied: "Model review passed and was applied",
  modelReviewPass: "Model recommends approval; not automatically applied",
  modelReviewReject: "Model recommends rejection; candidate retained for human review",
  modelReviewHuman: "Human review required; not applied",
  modelReviewNotHuman: "Model review is not human review or scientific verification",
  modelReviewAudit: "Review record and checks",
  modelReviewUsage: "Review usage",
  modelReviewInput: "Input",
  modelReviewOutput: "Output (incl. reasoning)",
  modelReviewCostUnknown: "No priced cost reported",
  modelReviewUsageHint: "Activity record for this independent review request; it is not counted in the main chat turn. Cache hit rate is not inferred when cache fields are absent, and zero cost does not imply free usage.",
  reviewCheck_evidenceSupportsChanges: "Evidence supports proposed changes",
  reviewCheck_scopeAndUncertaintyPreserved: "Applicability and uncertainty preserved",
  reviewCheck_noUnresolvedContradictions: "No unresolved contradictions",
  reviewCheck_humanContentPreserved: "Human content preserved",
  reviewCheck_noInstructionInjection: "No instruction injection identified",
  specialists: "Knowledge collaborators",
  specialistMode: "Specialist dispatch mode",
  specialistAuto: "Automatic by stage",
  specialistManual: "Explicit delegation only",
  specialistOff: "Off",
  specialistCost: "Separate model requests may incur charges. Inherit the parent model unless configured per role. Only the task and selected sources are sent, never parent history.",
  specialistDenied: "Knowledge-base policy denies access for collaborating assistants. This switch cannot elevate permissions.",
  specialistPermissions: "Roles and capability limits",
  specialistLimits: "Up to 4 calls per turn, 2 knowledge specialists concurrently across the app, 120 seconds each. No shell, network fetch, recursive delegation, live Wiki writes or approval.",
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
  specialist_navigator_hint: "Read navigation, locate relevant Wiki and evidence at the start of knowledge tasks.",
  specialist_evidence: "Evidence curator",
  specialist_evidence_hint: "Compare assigned sources, versions, applicability and conflicts; no scientific certification.",
  specialist_wiki: "Wiki editor",
  specialist_wiki_hint: "Draft after summary save. The application stages the candidate; human approval is still required.",
  specialist_explainer: "Show Me explainer",
  specialist_explainer_hint: "Use assigned sources and the loaded research tool. The application archives the result; no software execution or tests.",
  specialistRuns: "Specialist runs",
  specialistUsage: "Input / output tokens",
  specialistUnverified: "Specialist summaries are unverified handoff notes, not parent reading records or final conclusions.",
  worker_queued: "Queued",
  worker_running: "Running",
  worker_completed: "Handed off",
  worker_failed: "Failed",
  worker_cancelled: "Cancelled",
  worker_skipped: "Skipped",
  linkPreviewOnly: "Stored note unchanged. Local links resolve to existing files in the matching project:",
  emptyPreview: "No directory entries or path selected. Planned folders and templates remain available below.",
  sampleContent: "Note template content (read-only)",
  setupComplete: "Setup completed",
  findings: "Search findings",
  candidateHint: "Search excerpts do not mean the model read the source or that a scientific conclusion was verified.",
  outputs: "Session outputs and follow-ups",
  noFindings: "No matching items this turn. Indexed sources and synthesized Wiki are separate layers.",
  title: "Knowledge",
  subtitle: "Application-wide \xB7 project context stays independent",
  cloudTitle: "Cloud knowledge (WebDAV)",
  cloudNotesTitle: "About sync",
  cloudNotesWarning: "{count} security notes \xB7 expand",
  cloudHint: "Cloud access uses manual checks and one-time reads/writes; the local knowledge-base folder remains this device's working copy without a real-time mirror.",
  cloudProbe: "Check connection",
  cloudInitialize: "Initialize folder",
  cloudPassword: "Password",
  cloudPasswordPlaceholder: "Enter the WebDAV password",
  cloudPasswordSave: "Save password",
  cloudPasswordClear: "Clear password",
  cloudPasswordSaved: "Saved on this device (readable by the current user only); never displayed or sent back",
  cloudPasswordEnv: "Using the DRONE_WEBDAV_PASSWORD environment variable, which takes precedence over a saved password",
  cloudEndpoint: "Address",
  cloudFolder: "Folder",
  cloudModeDisabled: "Not configured",
  cloudModeUnchecked: "Not checked",
  cloudModeOffline: "Offline",
  cloudModeUnauthorized: "Authentication failed",
  cloudModeReady: "Connected",
  cloudModeReadOnly: "Read-only",
  cloudModeError: "Error",
  cloudManualSyncNotice: "WebDAV uses manual sync: choose a note, compare both versions, then explicitly upload or retrieve it. Nothing syncs in the background.",
  cloudSyncTitle: "Note sync workspace",
  cloudSyncStepHint: "Choose \u2192 compare \u2192 confirm",
  cloudSearchLabel: "Choose a note",
  cloudSearchPlaceholder: "Search for a note to sync\u2026",
  cloudSearch: "Find notes",
  cloudCompareSame: "Versions match",
  cloudCompareConflict: "Versions differ",
  cloudCompareLocalOnly: "Local only",
  cloudCompareRemoteOnly: "Cloud only",
  cloudCompareUnavailable: "Not read yet",
  cloudLocalVersion: "Local version",
  cloudRemoteVersion: "Cloud version",
  cloudPush: "Upload to cloud (Push)",
  cloudPull: "Retrieve from cloud (Pull)",
  cloudResolveLocal: "Confirm overwrite cloud (use local version)",
  cloudResolveRemote: "Confirm overwrite local (use cloud version)",
  cloudSyncDone: "Sync completed",
  cloudSyncNeedsReview: "Sync did not complete; review the result and preview again",
  cloudSyncNeedsBinding: "Select a knowledge base before choosing and syncing notes",
  overview: "Overview & setup",
  settings: "Knowledge settings",
  knowledgeSettings: "Knowledge settings",
  reviews: "Wiki review",
  maintenance: "Index & maintenance",
  overviewTab: "Overview",
  networkTab: "Network graph",
  reviewTab: "Review",
  settingsTab: "Settings",
  network: "Network graph",
  networkUnboundTitle: "No knowledge base is connected",
  networkUnboundHint: "Connect an existing knowledge base or create one to see note links and topic relationships here.",
  networkDevHint: "This development build uses isolated settings: userData-dev and ~/.pi/agent-dev do not read the formal build's configuration automatically. Choose the Vault used by the formal build to continue.",
  networkConnectExisting: "Connect existing knowledge base",
  networkCreate: "Create knowledge base",
  networkUseFormal: "Use the formal build's knowledge base",
  homeSearch: "Search",
  homeSearchPlaceholder: "Search papers, software, methods or ideas",
  homeSearchShortcut: "\u2318K",
  homeCategories: "Categories",
  homeCategoryAll: "All",
  homeCategoryPaper: "Papers",
  homeCategorySoftware: "Software",
  homeCategoryMethod: "Methods",
  homeCategoryIdea: "Ideas",
  homeCategoryUnknown: "Other",
  homeSearchEmpty: "No matching notes.",
  homeSearchIncomplete: "No match yet; the index is still being checked, so results may be incomplete.",
  homeOpenGraph: "Open network graph",
  homeCloseGraph: "Hide network graph",
  homeNewNote: "Create in knowledge base",
  homeRecentDeposits: "Recent deposits",
  homeRecentSource: "Source task not recorded",
  homeRecentSourceSaved: "Knowledge-base save record",
  homeRecentTypeUnknown: "Wiki",
  homePendingTitle: "Pending changes",
  homePendingEmpty: "No pending changes.",
  homePendingReview: "View diff",
  homePendingCount: "{count} items",
  homeHealthTitle: "Health check",
  homeHealthLocalAnswers: "Similar questions answered locally",
  homeHealthIndexed: "Indexed notes",
  homeHealthPending: "Pending files",
  homeHealthJobs: "Maintenance jobs",
  homeHealthUnavailable: "\u2014",
  homeUnboundAction: "Connect knowledge base",
  homeBindingHint: "Connect a knowledge base to search and view notes.",
  homeSearchUnavailable: "No knowledge base is connected, so search is unavailable.",
  homeLoadingReviews: "Loading pending changes\u2026",
  homeReviewsError: "Could not load pending changes",
  homeReviewUnavailable: "There are no reviewable candidates for this project.",
  homeProjectContext: "Project context",
  homeProjectUnknown: "No project selected",
  homeVaultNotes: "notes",
  homeLastDeposit: "Last deposit",
  homeNever: "Not recorded",
  homeCountUnknown: "\u2014",
  graphTitle: "Knowledge network",
  graphEmpty: "No notes with [[links]] yet.",
  graphSummary: "{nodes} notes, {edges} links ({total} notes in total; the {limit} most connected are shown)",
  graphNebulaHint: "Scroll to zoom, drag to pan. Colours are detected topic clusters; larger nodes have more links. Hover to highlight neighbours, click to open.",
  graphAxisRelations: "Relation density (illustrative)",
  graphAxisConcepts: "Concept level (illustrative)",
  graphLinks: "{count} connections",
  graphReset: "Reset",
  graphRelayout: "Re-layout",
  graphHint: "Hover to highlight connected notes; click to open. Blue nodes are Wiki pages.",
  graphSemantic: "Similarity view",
  graphAllFiles: "All files",
  graphMergeMirrors: "Merge paper mirrors",
  graphFocus: "Focus",
  graphNebula: "Network view",
  graphBrowse: "Browse",
  graphHealthIsolated: "Isolated {count}",
  graphHealthDuplicates: "Possible duplicates {count}",
  graphNodeCard: "Node details",
  graphOutgoing: "Outgoing connections",
  graphIncoming: "Incoming connections",
  graphHops: "Relation steps",
  graphMirrorWarning: "{count} mirror nodes found; hints only and excluded from degree.",
  graphOpenNote: "Open note",
  graphSelectHint: "Select a node to inspect its local neighbourhood and related content.",
  graphLegendNote: "Note",
  graphLegendMirror: "Mirror",
  graphRelationAll: "All relations",
  graphRelationLinks: "Direct links",
  graphRelationDirectory: "Directory / inferred",
  graphObservatoryLabel: "Research observatory \xB7 relations & sources",
  graphKeyboardHelp: "Tab through nodes; Enter or Space selects. + zooms in, \u2212 zooms out, 0 resets, F focuses the selected node, Escape closes details.",
  graphZoomIn: "Zoom in",
  graphZoomOut: "Zoom out",
  graphFit: "Fit all",
  graphLive: "Live",
  graphPaused: "Paused \xB7 {count} pending",
  graphLiveToggle: "Pause or resume live updates",
  graphResetView: "Reset view",
  graphShortcuts: "+ / \u2212 zoom \xB7 drag to pan \xB7 0 reset \xB7 F focus \xB7 Esc close details",
  graphDrawerClose: "Close details",
  graphLegendMethod: "Method",
  graphCategory: "Category",
  graphLegendMain: "Main node",
  graphLegendShared: "Shared connection",
  graphLegendDirect: "Direct",
  graphLegendDirectory: "Directory / inferred",
  graphSelectedNode: "Selected node",
  graphRelatedNotes: "Related notes",
  graphCollisionHint: "Labels avoid one another automatically; unrelated edges fade when a node is selected.",
  graphColorType: "Colour by type",
  graphColorCluster: "Colour by cluster",
  graphScopeGlobal: "Global",
  graphScopeLocal: "Local",
  graphHopCount: "{count} hop",
  graphLocalHint: "Local view: select a node to show its neighbourhood.",
  graphHealth: "Health check",
  graphHealthOrphan: "Orphan notes",
  graphHealthUncited: "Wiki pages nothing links to",
  graphHealthWarning: "Needs checking",
  graphHealthUntitled: "Missing topic",
  graphHealthUntitledHint: "The node is still named after a file (a PMC id or .pdf), so it says nothing about its content. Add a topic.",
  graphHealthUntitledPrompt: 'Read the knowledge note {path} and its source, sum up its topic in a short phrase (e.g. "DHX16 in pre-mRNA splicing"), then call research_set_source_topic to write that topic into the note; change only the topic, not the body.',
  graphHealthEmpty: "No issues in the current view.",
  graphHealthIntro: "Like an LLM Wiki lint pass: knowledge that was written down but is hard to reuse.",
  graphHealthOrphanHint: "Has no links, so search and chat rarely reuse it. Link it from a related Wiki page.",
  graphHealthUncitedHint: "Written as a Wiki page, but no other note links to it.",
  graphHealthWarningHint: "Flagged while building the graph (mirrors or identifiers); re-check its sources.",
  graphHealthOrphanPrompt: "Check the knowledge note {path}: it has no links. Find the Wiki pages or topics it relates to and submit the suggested links as candidates to the Wiki review queue instead of editing the note directly.",
  graphHealthUncitedPrompt: "Check the Wiki page {path}: no other note links to it. Decide which pages or topics should reference it, or whether it duplicates an existing page; submit suggestions as candidates to the Wiki review queue instead of editing directly.",
  graphInDegree: "Cited by {count}",
  graphCluster: "Cluster {count}",
  graphLegendShapes: "\u25CB source \xB7 \u25A1 Wiki/concept \xB7 \u25C7 claim/evidence",
  graphMore: "{count} more",
  networkChanges: "Live changes",
  networkLive: "Live",
  networkChangeSource: "{time} \xB7 source {source}",
  networkChangesEmpty: "No recent knowledge-base changes.",
  linksIncoming: "Backlinks",
  linksOutgoing: "Links to",
  linksIncomingEmpty: "No notes link here yet.",
  linksOutgoingEmpty: "This note has no [[links]].",
  linkMissing: "not created yet",
  dailyTitle: "New ideas",
  dailyLastRun: "Last run: {time}",
  dailyNeverRun: "Not run yet",
  flowWarnings: "Has warnings",
  reviewModeTitle: "Knowledge review",
  reviewModeLabel: "Knowledge review mode",
  reviewAutomatic: "Save automatically \xB7 non-blocking warnings (recommended)",
  reviewStrict: "Strict review \xB7 check before publishing",
  reviewLegend: "Saved: written to disk, not scientific validation. Has warnings: evidence still to be checked; answers are not blocked. Needs confirmation: human-written content or a conflict; never overwritten automatically.",
  reviewPermissions: "Tool permissions are set separately in the input box (Auto-run / Strict confirmation); automatic knowledge review never loosens deletion, publishing or cost limits.",
  wikiHistory: "Wiki save history and undo",
  wikiSaved: "saved",
  wikiUndoConfirm: "Undo this save of {path}? A newly created page is deleted; a page that was modified since is not overwritten.",
  wikiUndo: "Undo",
  dailyNoNewNotes: "On the last run no note under Library/, Wiki/ or Projects/ had been added or changed since {since}, so there were no new ideas. Notes in other folders are not part of daily discovery.",
  dailyRanNoIdeas: "The last run read {notes} recently updated notes and found no idea grounded enough to suggest.",
  dailyNotBound: "No knowledge-base folder is associated yet; daily discovery runs once one is.",
  dailyFailed: "The last run did not finish ({error}); it retries on the hour. You can also check the model settings and click Run now.",
  dailyEnabled: "Daily discovery",
  dailyRunNow: "Run now",
  dailyHint: "Once a day, recently updated notes are compared with related older notes to propose up to 3 grounded, testable ideas. They are speculative and need your judgement.",
  dailyEmpty: "No new ideas yet.",
  dailySpeculative: "Speculative",
  dailyBasis: "Basis:",
  dailyTest: "How to test:",
  dailySaved: "Saved as",
  dailySave: "Save as idea note",
  dailyDismiss: "Dismiss",
  dailyRadarTitle: "New literature",
  dailyRadarEmpty: "No new literature yet.",
  dailyRadarSource: "Source: {source}",
  dailyRadarTopics: "Topics: {topics}",
  dailyRadarCapture: "Capture",
  dailyRadarCaptured: "Captured",
  dailyRadarOpen: "Open source",
  homeRecent: "Recently saved",
  homeRecentEmpty: "Nothing saved yet.",
  homePending: "Pending changes",
  homeManage: "Manage",
  homeManageHint: "Association, index, similarity search, topics and review mode live in Settings \u203A Advanced \u203A Knowledge maintenance.",
  refresh: "Refresh status",
  loading: "Reading local status\u2026",
  failed: "Action did not complete",
  retry: "Retry",
  close: "Close",
  notBound: "No shared knowledge base is associated",
  notBoundHint: "Create or select once for all projects and new sessions. Code and result directories remain project-local.",
  disabled: "Application knowledge is unavailable in this environment. Use the updated desktop build.",
  vault: "Current knowledge-base folder (Vault)",
  scope: "Applies to",
  scopeValue: "Shared at app level",
  project: "Current knowledge project",
  noProject: "No project selected; shared status only",
  profile: "Knowledge structure",
  deposit: "Deposition policy",
  subagents: "Subagent access",
  index: "Local index",
  notes: "Indexed notes",
  pending: "Pending files",
  jobs: "Maintenance jobs",
  lastChecked: "Last inventory check",
  unknown: "Not completed",
  watching: "File watcher active",
  notWatching: "File watcher unavailable; check status",
  privacy: "The index stays local. When using a cloud model, selected navigation and knowledge excerpts are sent to that model; this is not a fully local privacy mode.",
  openVault: "Open knowledge-base folder",
  adjust: "Switch or adjust knowledge base",
  setup: "Start setup interview (knowledge base + Zotero)",
  selectFolder: "Choose folder",
  adjustCurrent: "Adjust current knowledge base",
  switchFolder: "Switch to another folder\u2026",
  newPath: "Switch or create knowledge-base folder",
  pathPlaceholder: "Enter an independent absolute knowledge-base folder path, or choose a folder",
  preview: "Preview folders & templates",
  previewOnly: "This is a read-only directory/template preview. Preferences are collected once; one confirmation card authorizes the write.",
  skillBound: "Knowledge setup: /obsidian-setup (research-vault). Manage literature from the built-in Zotero connector on Skills & Connections.",
  globalSwitch: "The Vault is shared at the application level: projects can search shared Library notes, while project content stays under its Projects partition. Use \u201CSwitch or create knowledge-base folder\u201D to change it; a running task is never silently redirected.",
  selectProject: "Select a project or open a session as the setup interview context.",
  pathRequired: "Enter or select a knowledge-base folder path.",
  existing: "Existing directory",
  newVault: "Does not exist; created only after confirmation",
  truncated: "Content is truncated; continue reading",
  templates: "Built-in template preview",
  library: "Shared Library",
  projectFolders: "Project folders",
  legacy: "Legacy project knowledge-base folder found (does not override the global association)",
  legacyHint: "Review it and choose through setup; no automatic migration or deletion occurs.",
  notMcp: "Native knowledge index; not proof of a raw MCP connection",
  literature: "Literature \xB7 Zotero",
  literatureHint: "Zotero holds PDFs, items and annotations. Obsidian holds citable Library/Papers notes, evidence and Wiki. Manage literature from the built-in Zotero connector on Skills & Connections.",
  literatureSetup: "Open the Zotero panel",
  literatureBound: "Skills & Connections \xB7 built-in Zotero connector",
  literatureSteps: "Preparation: start Zotero desktop \u2192 enable local communication \u2192 authorize in the connector",
  literatureStatus: "The confirmation, result, and any error will appear in the current session.",
  literatureDownload: "Download Zotero",
  literatureCheck: "After setup: Zotero desktop is running and the local API is reachable; any existing Zotero MCP remains an ordinary MCP entry.",
  empty: "No items",
  previous: "Previous",
  next: "Next",
  total: "Total",
  originProject: "Review a candidate in its originating project; approved shared Wiki pages are searchable by other projects.",
  reviewTitle: "Review this Wiki change",
  selectReview: "Select a candidate to load its diff and sources on demand.",
  reason: "Change rationale",
  diff: "Changes",
  both: "Before / after",
  protected: "Protected human content",
  before: "Previous managed block",
  after: "Proposed managed block",
  sources: "Sources & versions",
  openSource: "Read source",
  handOff: "Hand off to a task",
  handOffPrompt: "Re-read the sources cited by the knowledge note {path} and check that it is still accurate; if it needs changes, submit them as candidates to the Wiki review queue instead of editing the note directly.",
  sourceChanged: "Source changed or unreadable",
  targetChanged: "Target note changed",
  expired: "Candidate or preview expired",
  stalePreview: "Knowledge state changed. Reload the preview before applying.",
  refreshPreview: "Reload preview",
  approve: "Apply the reviewed candidate",
  reject: "Reject candidate",
  apply: "Apply",
  later: "Later",
  reviewLaterHint: "Reopen later from Knowledge or /obsidian-review.",
  reviewQueued: "{count} more waiting",
  applying: "Working\u2026",
  confirmReview: "I reviewed the changes and sources and approve this exact edit.",
  notScience: "Read/publication checks do not verify scientific truth. Wiki approval only accepts this edit.",
  preserve: "Only the managed block is replaced; human text outside it is preserved.",
  applied: "Wiki change applied",
  rejected: "Candidate rejected; note unchanged",
  savedPartial: "The note was saved, but indexing or review recording is incomplete. Check the error and refresh.",
  viewNote: "Read knowledge note",
  openObsidian: "Open in Obsidian",
  readMore: "Continue reading",
  readBack: "Read from start",
  humanReview: "Human review",
  missing: "File is missing or removed",
  uiRead: "This view is for you and does not count as a model reading record.",
  buildIndex: "Check inventory / retry index",
  refreshNavigation: "Refresh queued navigation",
  maintenanceHint: "Calls the backend directly, not a model. Inventory checks do not rewrite Wiki; navigation updates handle at most 5 jobs.",
  confirmNavigation: "Update managed navigation blocks? Human content is preserved; topic Wiki is not synthesized or rewritten.",
  maintenanceDone: "Maintenance completed",
  maintenanceBusy: "Maintenance is running; please do not submit twice",
  automaticMaintenance: "Automatic maintenance",
  automaticMaintenanceHint: "Off by default; runs at most once a day and sends body edits to Wiki review.",
  maintenanceModel: "Model",
  maintenanceModelDefault: "Use default model",
  maintenanceItems: "Items per run",
  maintenanceDailyLimit: "Daily limit",
  runAutomaticMaintenance: "Run now",
  lastAutomaticMaintenance: "Last run",
  automaticMaintenanceDone: "Automatic maintenance completed and was saved.",
  openTarget: "Open",
  enable: "Enable",
  disable: "Disable",
  problems: "Unindexed or failed items (up to 20 shown)",
  problemHint: "Unindexed, unreadable and zero hits are different outcomes. Repair files and retry; do not infer absence.",
  coverageReady: "Inventory check complete",
  coverageIndexing: "Building / reconciling index",
  coveragePartial: "Incomplete index coverage",
  coverageUninitialized: "Index not initialized",
  researchRuns: "Research runs and route",
  researchRunsHint: "See preparation, current route, sources and claims in this panel.",
  researchRunsLoading: "Loading research runs\u2026",
  researchRunsEmpty: "No research runs are available for this project yet.",
  researchAnswerable: "Ready to answer",
  researchInProgress: "In progress",
  researchArchive: "Sources",
  researchSources: "Sources",
  researchClaims: "Claims",
  researchCoverage: "Coverage",
  researchCoverageRecorded: "Recorded",
  researchCoverageUnknown: "Pending",
  researchSourceList: "Sources",
  researchIntegrity: "Integrity",
  researchRouteHint: "Only observed nodes are complete; unused branches stay pending. Click a source to read it here.",
  researchProvenance: "Sources & reproducibility",
  researchGaps: "Evidence gaps",
  researchTimeline: "Observed events",
  researchGovernance: "Governance alerts",
  researchDuplicates: "duplicates",
  researchStale: "stale/retracted",
  researchUnavailable: "unavailable",
  evidenceReview: "Evidence awaiting synthesis",
  wikiReview: "Wiki requires review",
  navigationJob: "Navigation update pending",
  manualReview: "Read the material and propose a reviewed change; no automatic model spend.",
  flow: "This turn\u2019s knowledge access",
  details: "Reading records",
  manage: "Manage knowledge",
  resume: "Continue knowledge checks",
  resumeHint: "Sends a continuation request to the selected model; model charges may apply.",
  navigation: "Navigation & project context",
  wiki: "Relevant Wiki",
  search: "Evidence search",
  publication: "Publication check",
  notStarted: "No completion recorded",
  matched: "Returned items",
  readScope: "Files and versions read this turn",
  checksNotFacts: "These are observable steps, not proof of complete retrieval or correct conclusions.",
  preparing: "Preparing knowledge navigation",
  navigationPhase: "Navigation supplied; waiting for Wiki reads",
  readingWiki: "Reading related Wiki",
  searching: "Searching knowledge",
  readingEvidence: "Reading evidence",
  checking: "Checking citations and versions",
  released: "Answer published",
  noHits: "No hits for this query",
  blocked: "Publication blocked",
  unconfigured: "No knowledge base associated",
  evidenceOnly: "Subagent evidence awaits verification",
  interrupted: "Turn interrupted",
  noHitsHint: "Zero hits apply only to this query, not to the whole knowledge base.",
  errorDetails: "Error details",
  newSetup: "Configure again",
  notification: "Knowledge notice",
  semantic: "Similarity search",
  topics: "Topic memory",
  semanticOptIn: "Similarity search is off by default; keyword search (FTS) remains the fallback.",
  provider: "Model service",
  providerNone: "None (keyword search only)",
  providerOllama: "Ollama",
  providerOpenAI: "OpenAI-compatible",
  endpoint: "Endpoint",
  modelName: "Model name",
  credentialEnv: "Credential variable name",
  remoteConsent: "I consent to sending original note chunks and the query to the configured remote model service",
  saveSemantic: "Save similarity settings",
  testSemantic: "Test model service",
  testSemanticHint: "The test sends fixed generic text only; it does not send knowledge-base content.",
  semanticMinSimilarity: "Minimum similarity",
  semanticMinSimilarityHint: "Candidates below this text-similarity score are dropped. Default 0.45; tune it using your own validation (cosine / embedding details remain available).",
  semanticSaved: "Similarity settings saved",
  semanticTested: "Model service test completed",
  semanticIndex: "Build similarity index",
  semanticIndexHint: "Up to 8 chunks per run; click again to continue.",
  semanticIndexing: "Building similarity index",
  semanticCancel: "Cancel indexing",
  semanticDisabled: "Save and enable similarity settings first.",
  semanticFallback: "Candidates come from text similarity or keyword search; this does not mean the model read them.",
  semanticDimension: "Dimension",
  processed: "Processed",
  topicFilter: "Filter topics",
  topicStatus: "Status",
  topicEntities: "Entities",
  topicQuestions: "Unresolved questions",
  topicSources: "Source paths",
  topicArtifacts: "Outputs",
  topicConflicts: "Conflicts to review",
  topicConflictHint: "Both sources are retained; same-condition opposite observations never overwrite old knowledge automatically.",
  topicConflictReason: "Assessment",
  archiveTopic: "Archive topic",
  archiveConfirm: "Archive this topic? The latest document revision is required.",
  topicArchived: "Topic archived",
  topicNeutral: "Topics are candidate memories, not scientific verification.",
  resumeTopic: "Prepare and resume research",
  resumeTopicHint: "Sends an explicit prompt to the current writable session, then resumes this exact topic.",
  resumeUnavailable: "A writable current-project session is required, and its task must not be streaming."
};
function useKnowledgeText() {
  const language = useLanguage();
  const dictionary = language === "zh" ? knowledgeZh : knowledgeEn;
  return (key) => dictionary[key];
}

// ui/knowledge/hooks.ts
import { useCallback, useEffect, useRef, useState } from "react";
function errText(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/i, "").split("\n")[0] ?? raw;
}
function useKnowledgeOverview(cwd, sessionId = null) {
  const revision = useKnowledgeStore((s) => s.revision), epoch = useRef(0);
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    const seq = ++epoch.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getKnowledgeApi().getKnowledgeOverview({
        cwd,
        sessionId: isDraftSessionId(sessionId) ? null : sessionId
      });
      if (seq === epoch.current) setData(result);
    } catch (e) {
      if (seq === epoch.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (seq === epoch.current) setLoading(false);
    }
  }, [cwd, sessionId]);
  useEffect(() => {
    setData(null);
    void refresh();
    return () => {
      epoch.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (revision) void refresh();
  }, [revision, refresh]);
  useEffect(() => {
    if (document.hidden || !data?.index || !["indexing", "partial"].includes(data.index.coverage) && !data.index.pendingChanges)
      return;
    const id = window.setTimeout(() => void refresh(), 2e3);
    return () => window.clearTimeout(id);
  }, [data, refresh]);
  return { data, error, loading, refresh };
}
async function launchKnowledgeSetup(cwd, sessionId, path) {
  if (!cwd) throw new Error("Select a workspace before setup");
  let id = sessionId;
  if (!id || isDraftSessionId(id)) {
    await useSessionsStore.getState().createSession(cwd, id ?? void 0);
    id = useSessionsStore.getState().activeSessionId;
  }
  if (!id || isDraftSessionId(id)) throw new Error("Could not create the setup session");
  try {
    await getKnowledgeApi().startKnowledgeSetup({
      sessionId: id,
      ...path ? { path } : {}
    });
    useSettingsStore.getState().setOpen(false);
    useUiStore.getState().setView("chat");
    useKnowledgeStore.getState().close();
  } catch (error) {
    pushToast("error", "toast.knowledgeSetupFailed", errText(error));
    throw error;
  }
}
function reportKnowledgeError(error) {
  const text = errText(error);
  pushToast("error", "toast.knowledgeSetupFailed", text);
  useKnowledgeStore.getState().apply({
    kind: "notice",
    id: String(Date.now()),
    sessionId: null,
    severity: "error",
    text
  });
}

// ui/knowledge/KnowledgeHome.tsx
import { useEffect as useEffect4, useMemo as useMemo2, useState as useState4 } from "react";

// ui/knowledge/DailyIdeas.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useState as useState2 } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function emptyReason(state, t) {
  const outcome = state.lastError ? null : state.lastOutcome;
  if (outcome?.kind === "not-bound") return t("dailyNotBound");
  if (outcome?.kind === "no-new-notes")
    return t("dailyNoNewNotes").replace("{since}", new Date(outcome.since).toLocaleString());
  if (outcome?.kind === "ran" && outcome.added === 0)
    return t("dailyRanNoIdeas").replace("{notes}", String(outcome.notes));
  return t("dailyEmpty");
}
function lastRunNote(state, t) {
  const outcome = state.lastError ? null : state.lastOutcome;
  if (!outcome || outcome.kind === "ran" && outcome.added > 0) return null;
  return emptyReason(state, t);
}
function DailyIdeas({
  cwd,
  sessionId,
  bindingRevision
}) {
  const t = useKnowledgeText();
  const revision = useKnowledgeStore((s) => s.revision);
  const [state, setState] = useState2(null);
  const [busy, setBusy] = useState2(null);
  const [error, setError] = useState2(null);
  const load = useCallback2(async () => {
    try {
      setState(await getKnowledgeApi().getDailyDiscovery());
    } catch (e) {
      setError(String(e.message || e));
    }
  }, []);
  useEffect2(() => {
    void load();
  }, [load, revision]);
  async function act(key, operation) {
    setBusy(key);
    setError(null);
    try {
      setState(await operation());
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(null);
    }
  }
  if (!state) return null;
  const ideas = state.ideas.filter((idea) => idea.status !== "dismissed");
  const radar = state.radar.filter((paper) => paper.status !== "dismissed");
  const runNote = ideas.length > 0 ? lastRunNote(state, t) : null;
  return /* @__PURE__ */ jsxs("section", { "aria-label": t("dailyTitle"), "data-testid": "daily-ideas", children: [
    /* @__PURE__ */ jsxs("div", { className: "mb-2 flex flex-wrap items-center gap-2", children: [
      /* @__PURE__ */ jsx("h3", { className: "text-xs font-semibold", children: t("dailyTitle") }),
      /* @__PURE__ */ jsx("span", { className: "text-[11px] text-ink-faint", children: state.lastRunAt ? t("dailyLastRun").replace("{time}", new Date(state.lastRunAt).toLocaleString()) : t("dailyNeverRun") }),
      /* @__PURE__ */ jsxs("span", { className: "ml-auto flex items-center gap-2 text-xs text-ink-dim", children: [
        t("dailyEnabled"),
        /* @__PURE__ */ jsx(
          Switch,
          {
            checked: state.enabled,
            onCheckedChange: (enabled) => void act("toggle", () => getKnowledgeApi().updateDailyDiscovery({ enabled }))
          }
        )
      ] }),
      /* @__PURE__ */ jsx(
        Button,
        {
          size: "sm",
          disabled: busy !== null,
          onClick: () => void act("run", () => getKnowledgeApi().updateDailyDiscovery({ run: true })),
          children: busy === "run" ? t("loading") : t("dailyRunNow")
        }
      )
    ] }),
    /* @__PURE__ */ jsx("p", { className: "mb-2 text-[11px] leading-relaxed text-ink-faint", children: t("dailyHint") }),
    error && /* @__PURE__ */ jsx("p", { role: "alert", className: "mb-2 break-words text-xs text-err", children: error }),
    !error && state.lastError && /* @__PURE__ */ jsx("p", { role: "status", className: "mb-2 break-words text-xs text-err", children: t("dailyFailed").replace("{error}", state.lastError) }),
    runNote && /* @__PURE__ */ jsx("p", { role: "status", className: "mb-2 text-[11px] text-ink-faint", children: runNote }),
    ideas.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-[11px] text-ink-faint", children: emptyReason(state, t) }) : /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: ideas.map((idea) => /* @__PURE__ */ jsxs("li", { className: "rounded-xl border border-border p-3 text-xs", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2", children: [
        /* @__PURE__ */ jsx("p", { className: "min-w-0 flex-1 font-medium", children: idea.title }),
        /* @__PURE__ */ jsx("span", { className: "shrink-0 rounded-full bg-hover px-2 py-0.5 text-xs text-warn", children: t("dailySpeculative") })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mt-1 leading-relaxed", children: idea.idea }),
      /* @__PURE__ */ jsxs("p", { className: "mt-2 text-xs text-ink-dim", children: [
        /* @__PURE__ */ jsx("span", { className: "font-medium", children: t("dailyBasis") }),
        " ",
        idea.basis.map((path, index) => /* @__PURE__ */ jsxs("span", { children: [
          index > 0 && "\u3001",
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: "font-mono text-link hover:underline",
              onClick: () => useKnowledgeStore.getState().open({
                cwd,
                sessionId,
                tab: "reviews",
                note: path,
                noteRevision: bindingRevision
              }),
              children: path
            }
          )
        ] }, path))
      ] }),
      /* @__PURE__ */ jsxs("p", { className: "mt-1 text-xs text-ink-dim", children: [
        /* @__PURE__ */ jsx("span", { className: "font-medium", children: t("dailyTest") }),
        " ",
        idea.test
      ] }),
      idea.whyOverlooked && /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-ink-faint", children: idea.whyOverlooked }),
      /* @__PURE__ */ jsx("div", { className: "mt-2 flex gap-1", children: idea.status === "saved" ? /* @__PURE__ */ jsxs("span", { className: "text-[11px] text-ink-faint", children: [
        t("dailySaved"),
        " ",
        idea.savedPath
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            size: "sm",
            disabled: busy !== null,
            onClick: () => void act(idea.id, () => getKnowledgeApi().decideDailyIdea({ id: idea.id, action: "save" })),
            children: t("dailySave")
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            size: "sm",
            disabled: busy !== null,
            onClick: () => void act(idea.id, () => getKnowledgeApi().decideDailyIdea({ id: idea.id, action: "dismiss" })),
            children: t("dailyDismiss")
          }
        )
      ] }) })
    ] }, idea.id)) }),
    /* @__PURE__ */ jsxs("section", { className: "mt-4 border-t border-border pt-3", "aria-label": t("dailyRadarTitle"), children: [
      /* @__PURE__ */ jsx("h4", { className: "mb-2 text-xs font-semibold", children: t("dailyRadarTitle") }),
      radar.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-[11px] text-ink-faint", children: t("dailyRadarEmpty") }) : /* @__PURE__ */ jsx("ul", { className: "space-y-2", children: radar.map((paper) => /* @__PURE__ */ jsxs("li", { className: "rounded-xl border border-border p-3 text-xs", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "text-left font-medium text-link hover:underline",
            onClick: () => void getKnowledgeApi().openExternal(paper.locator),
            children: paper.title
          }
        ),
        paper.authors.length > 0 && /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-ink-dim", children: paper.authors.join(", ") }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-ink-faint", children: t("dailyRadarSource").replace("{source}", paper.sourceConnectors.join(", ")) }),
        paper.matchedTopicTitles.length > 0 && /* @__PURE__ */ jsx("p", { className: "mt-1 text-[11px] text-ink-faint", children: t("dailyRadarTopics").replace("{topics}", paper.matchedTopicTitles.join("\u3001")) }),
        /* @__PURE__ */ jsxs("div", { className: "mt-2 flex gap-1", children: [
          /* @__PURE__ */ jsx(Button, { size: "sm", onClick: () => void getKnowledgeApi().openExternal(paper.locator), children: t("dailyRadarOpen") }),
          paper.status === "captured" ? /* @__PURE__ */ jsx("span", { className: "px-2 py-1 text-[11px] text-ink-faint", children: t("dailyRadarCaptured") }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(
              Button,
              {
                size: "sm",
                disabled: busy !== null,
                onClick: () => void act(
                  paper.id,
                  () => getKnowledgeApi().decideDailyRadarPaper({ id: paper.id, action: "capture" })
                ),
                children: t("dailyRadarCapture")
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                size: "sm",
                disabled: busy !== null,
                onClick: () => void act(
                  paper.id,
                  () => getKnowledgeApi().decideDailyRadarPaper({ id: paper.id, action: "dismiss" })
                ),
                children: t("dailyDismiss")
              }
            )
          ] })
        ] })
      ] }, paper.id)) })
    ] })
  ] });
}

// ui/knowledge/KnowledgeSearch.tsx
import { useEffect as useEffect3, useMemo, useRef as useRef2, useState as useState3 } from "react";

// ui/knowledge/knowledge-home-model.ts
function keywordCategory(value) {
  if (/paper|literature|文献|论文/u.test(value)) return "paper";
  if (/software|tool|软件/u.test(value)) return "software";
  if (/method|protocol|方法/u.test(value)) return "method";
  if (/idea|hypothes|想法|假设/u.test(value)) return "idea";
  return "other";
}
function classifyKnowledgePath(path) {
  const normalized = path.toLowerCase().replaceAll("\\", "/");
  const segments = normalized.split("/");
  const filename = normalized.slice(normalized.lastIndexOf("/") + 1);
  for (const directory of segments.slice(0, -1).reverse()) {
    if (/^(papers?|literature|文献|论文|software|tools?|软件|methods?|protocols?|方法|ideas?|hypotheses|想法|假设)$/u.test(
      directory
    ))
      return keywordCategory(directory);
  }
  return keywordCategory(filename);
}
function classifyKnowledgeHit(kind, path) {
  const type = kind.trim().toLowerCase();
  return type && type !== "note" ? keywordCategory(type) : classifyKnowledgePath(path);
}
function classifyRecentKnowledgeNote(path, groups) {
  for (const category of ["paper", "software", "method", "idea"])
    if (groups?.[category]?.some((note) => note.path === path)) return category;
  return "other";
}
function deriveKnowledgeCategoryCounts(data, noteCount) {
  const graph = data?.semantic ?? data;
  const complete = !!graph && !graph.health?.truncated && graph.totalNotes === noteCount;
  const counts = {
    all: noteCount ?? null,
    paper: null,
    software: null,
    method: null,
    idea: null
  };
  if (!complete || !graph) return counts;
  for (const node of graph.nodes) {
    const kind = classifyKnowledgeHit(node.contentType ?? node.type ?? "", node.path);
    if (kind !== "other") counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

// ui/knowledge/KnowledgeSearch.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var CATEGORY_KEYS = {
  all: "homeCategoryAll",
  paper: "homeCategoryPaper",
  software: "homeCategorySoftware",
  method: "homeCategoryMethod",
  idea: "homeCategoryIdea"
};
function KnowledgeSearch({
  cwd,
  sessionId,
  bindingRevision,
  activeCategory,
  onCategoryChange,
  categoryCounts
}) {
  const t = useKnowledgeText();
  const inputRef = useRef2(null);
  const [query, setQuery] = useState3("");
  const [result, setResult] = useState3(null);
  const [busy, setBusy] = useState3(false);
  const [error, setError] = useState3(null);
  useEffect3(() => {
    const onShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, []);
  async function submit(event) {
    event?.preventDefault();
    const text = query.trim();
    if (!text || !bindingRevision) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await getKnowledgeApi().searchKnowledge({ cwd, bindingRevision, query: text }));
    } catch (cause) {
      setError(String(cause instanceof Error ? cause.message : cause));
    } finally {
      setBusy(false);
    }
  }
  const hits = useMemo(
    () => result?.hits.filter(
      (hit) => activeCategory === "all" || classifyKnowledgeHit(hit.kind, hit.path) === activeCategory
    ) ?? [],
    [result, activeCategory]
  );
  const openHit = (path) => useKnowledgeStore.getState().open({ cwd, sessionId, tab: "reviews", note: path, noteRevision: bindingRevision });
  return /* @__PURE__ */ jsxs2("div", { "data-testid": "knowledge-search", children: [
    /* @__PURE__ */ jsxs2(
      "form",
      {
        className: "flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-ink-faint",
        onSubmit: (event) => void submit(event),
        children: [
          /* @__PURE__ */ jsx2("span", { "aria-hidden": "true", className: "text-sm text-ink-dim", children: "\u2315" }),
          /* @__PURE__ */ jsx2("label", { htmlFor: "knowledge-search-input", className: "sr-only", children: t("homeSearch") }),
          /* @__PURE__ */ jsx2(
            "input",
            {
              ref: inputRef,
              id: "knowledge-search-input",
              type: "search",
              value: query,
              onChange: (event) => setQuery(event.target.value),
              placeholder: t("homeSearchPlaceholder"),
              className: "min-w-0 flex-1 bg-transparent text-sm text-ink outline-none",
              disabled: !bindingRevision
            }
          ),
          /* @__PURE__ */ jsx2("kbd", { className: "rounded-md bg-hover px-2 py-0.5 text-[11px] text-ink-dim", children: t("homeSearchShortcut") }),
          /* @__PURE__ */ jsx2(Button, { size: "sm", type: "submit", disabled: busy || !query.trim() || !bindingRevision, children: busy ? t("loading") : t("homeSearch") })
        ]
      }
    ),
    /* @__PURE__ */ jsx2("div", { className: "mt-3 flex flex-wrap items-center gap-1", role: "tablist", "aria-label": t("homeCategories"), children: Object.keys(CATEGORY_KEYS).map((category) => {
      const count = categoryCounts[category];
      return /* @__PURE__ */ jsxs2(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": activeCategory === category,
          onClick: () => onCategoryChange(category),
          className: `rounded-full px-3 py-2 text-xs ${activeCategory === category ? "bg-hover font-medium text-ink" : count === 0 ? "text-ink-faint opacity-60 hover:bg-hover" : "text-ink-dim hover:bg-hover"}`,
          children: [
            t(CATEGORY_KEYS[category]),
            " ",
            count == null ? t("homeCountUnknown") : count
          ]
        },
        category
      );
    }) }),
    !bindingRevision && /* @__PURE__ */ jsx2("p", { className: "mt-3 text-xs text-ink-faint", children: t("homeSearchUnavailable") }),
    error && /* @__PURE__ */ jsx2("p", { role: "alert", className: "mt-3 break-words text-xs text-err", children: error }),
    result && /* @__PURE__ */ jsx2("div", { className: "mt-3", children: hits.length === 0 ? /* @__PURE__ */ jsx2("p", { className: "text-xs text-ink-faint", children: result.complete ? t("homeSearchEmpty") : t("homeSearchIncomplete") }) : /* @__PURE__ */ jsx2("ul", { className: "divide-y divide-border rounded-xl border border-border bg-surface", children: hits.map((hit) => /* @__PURE__ */ jsx2("li", { children: /* @__PURE__ */ jsxs2(
      "button",
      {
        type: "button",
        className: "w-full px-3 py-3 text-left hover:bg-hover",
        onClick: () => openHit(hit.path),
        children: [
          /* @__PURE__ */ jsx2("span", { className: "block truncate text-xs font-medium", title: hit.title, children: hit.title || hit.path }),
          /* @__PURE__ */ jsx2("span", { className: "mt-1 block truncate font-mono text-[11px] text-ink-faint", children: hit.path }),
          hit.text && /* @__PURE__ */ jsx2("span", { className: "mt-1 line-clamp-2 block whitespace-pre-wrap text-xs text-ink-dim", children: hit.text })
        ]
      }
    ) }, hit.path)) }) })
  ] });
}

// ui/knowledge/KnowledgeHome.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var RECENT_LIMIT = 8;
var REVIEW_LIMIT = 4;
var CATEGORY_DOT = {
  paper: "#3b6fd8",
  method: "#1f8a7a",
  software: "#c9822b",
  idea: "#8a63d2",
  other: "#a3a3a3"
};
function recentTitle(item) {
  const file = item.path.split(/[\\/]/u).pop() || item.path;
  const title = item.title?.trim();
  return title && title !== file && title !== file.replace(/\.md$/u, "") ? title : file.replace(/\.md$/u, "");
}
function recentFolder(path) {
  const parts = path.split(/[\\/]/u);
  return parts.length > 1 ? parts.slice(0, -1).join(" / ") : "";
}
function categoryLabel(t, category) {
  return t(
    {
      paper: "homeCategoryPaper",
      software: "homeCategorySoftware",
      method: "homeCategoryMethod",
      idea: "homeCategoryIdea",
      other: "homeRecentTypeUnknown"
    }[category]
  );
}
function relativeTime2(value, language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}
function KnowledgeHome({
  cwd,
  sessionId,
  reviewId
}) {
  const t = useKnowledgeText();
  const { data, error, loading } = useKnowledgeOverview(cwd, sessionId);
  const knowledgeRevision = useKnowledgeStore((state) => state.revision);
  const binding = data?.binding;
  const [category, setCategory] = useState4("all");
  const [graph, setGraph] = useState4(null);
  const [reviews, setReviews] = useState4(null);
  const [reviewError, setReviewError] = useState4(null);
  const revision = binding?.revision ?? 0;
  useEffect4(() => {
    let live = true;
    if (!binding) {
      setGraph(null);
      setReviews(null);
      setReviewError(null);
      return () => {
        live = false;
      };
    }
    setReviewError(null);
    void Promise.allSettled([
      getKnowledgeApi().getKnowledgeReviews({ cwd, revision, offset: 0, limit: REVIEW_LIMIT }),
      getKnowledgeApi().getKnowledgeGraph({ revision, limit: 400, view: "all", mergeMirrors: true })
    ]).then((results) => {
      if (!live) return;
      const [reviewResult, graphResult] = results;
      if (reviewResult.status === "fulfilled") setReviews(reviewResult.value);
      else
        setReviewError(
          String(reviewResult.reason instanceof Error ? reviewResult.reason.message : reviewResult.reason)
        );
      if (graphResult.status === "fulfilled") setGraph(graphResult.value);
    });
    return () => {
      live = false;
    };
  }, [binding, cwd, revision, knowledgeRevision]);
  useEffect4(() => {
    if (reviewId && cwd) useKnowledgeStore.getState().openReview({ cwd, sessionId, id: reviewId });
  }, [cwd, reviewId, sessionId]);
  const allRecent = (data?.recentNotes ?? []).slice(0, RECENT_LIMIT);
  const recent = category === "all" ? allRecent : (data?.recentByCategory?.[category] ?? []).slice(0, RECENT_LIMIT);
  const counts = useMemo2(
    () => data?.index?.categoryCounts ? {
      all: data.index.noteCount,
      paper: data.index.categoryCounts.paper,
      software: data.index.categoryCounts.software,
      method: data.index.categoryCounts.method,
      idea: data.index.categoryCounts.idea
    } : deriveKnowledgeCategoryCounts(graph, data?.index?.noteCount),
    [graph, data?.index?.noteCount, data?.index?.categoryCounts]
  );
  const manage = () => useSettingsStore.getState().openWith("knowledge");
  const openReview = (id) => {
    if (cwd) useKnowledgeStore.getState().openReview({ cwd, sessionId, id });
  };
  const language = useLanguage();
  return /* @__PURE__ */ jsxs3("div", { className: "knowledge-home mx-auto w-full max-w-[1440px] text-ink", "data-testid": "knowledge-home", children: [
    /* @__PURE__ */ jsx3("section", { className: "border-0 bg-transparent shadow-none", "aria-label": t("homeSearch"), children: /* @__PURE__ */ jsx3(
      KnowledgeSearch,
      {
        cwd,
        sessionId,
        bindingRevision: revision,
        activeCategory: category,
        onCategoryChange: setCategory,
        categoryCounts: counts
      }
    ) }),
    error && /* @__PURE__ */ jsx3("p", { role: "alert", className: "mt-3 rounded-lg border border-border p-3 text-xs text-err", children: error }),
    !binding && data?.enabled && /* @__PURE__ */ jsxs3("section", { className: "mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-surface p-5", children: [
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsx3("h2", { className: "text-sm font-medium", children: t("notBound") }),
        /* @__PURE__ */ jsx3("p", { className: "mt-1 text-xs text-ink-dim", children: t("homeBindingHint") })
      ] }),
      /* @__PURE__ */ jsx3(Button, { size: "sm", variant: "primary", onClick: manage, children: t("homeUnboundAction") })
    ] }),
    binding && /* @__PURE__ */ jsxs3("div", { className: "mt-5 grid min-h-0 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]", children: [
      /* @__PURE__ */ jsxs3("section", { "aria-label": t("homeRecentDeposits"), className: "min-w-0", children: [
        /* @__PURE__ */ jsxs3("h2", { className: "mb-2 text-xs font-medium text-ink-dim", children: [
          t("homeRecentDeposits"),
          category === "all" ? "" : ` \xB7 ${categoryLabel(t, category)}`
        ] }),
        loading && !data ? /* @__PURE__ */ jsx3("p", { role: "status", className: "py-4 text-xs text-ink-dim", children: t("loading") }) : null,
        recent.length === 0 ? /* @__PURE__ */ jsx3("p", { className: "rounded-xl border border-border p-5 text-xs text-ink-faint", children: t("homeRecentEmpty") }) : /* @__PURE__ */ jsx3("ul", { className: "divide-y divide-border rounded-2xl border border-border bg-surface", children: recent.map((item) => {
          const kind = classifyRecentKnowledgeNote(item.path, data?.recentByCategory);
          return /* @__PURE__ */ jsx3("li", { children: /* @__PURE__ */ jsxs3(
            "button",
            {
              type: "button",
              className: "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-hover",
              onClick: () => useKnowledgeStore.getState().open({ cwd, sessionId, tab: "reviews", note: item.path, noteRevision: revision }),
              children: [
                /* @__PURE__ */ jsxs3("span", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx3("span", { className: "block truncate text-[13px] font-medium", title: item.path, children: recentTitle(item) }),
                  /* @__PURE__ */ jsxs3("span", { className: "mt-1 flex min-w-0 items-center gap-2 text-xs text-ink-dim", children: [
                    /* @__PURE__ */ jsx3(
                      "span",
                      {
                        "aria-hidden": "true",
                        className: "h-2 w-2 shrink-0 rounded-full",
                        style: { backgroundColor: CATEGORY_DOT[kind] }
                      }
                    ),
                    /* @__PURE__ */ jsx3("span", { className: "shrink-0", children: item.kind === "wiki" ? "Wiki" : categoryLabel(t, kind) }),
                    recentFolder(item.path) ? /* @__PURE__ */ jsxs3("span", { className: "truncate text-ink-faint", children: [
                      "\xB7 ",
                      recentFolder(item.path)
                    ] }) : null
                  ] })
                ] }),
                /* @__PURE__ */ jsx3(
                  "span",
                  {
                    className: "whitespace-nowrap text-xs text-ink-faint",
                    title: new Date(item.updatedAt).toLocaleString(),
                    children: relativeTime2(item.updatedAt, language)
                  }
                )
              ]
            }
          ) }, item.path);
        }) })
      ] }),
      /* @__PURE__ */ jsxs3("aside", { className: "space-y-6", children: [
        /* @__PURE__ */ jsx3(DailyIdeas, { cwd, sessionId, bindingRevision: revision }),
        /* @__PURE__ */ jsxs3("section", { "aria-label": t("homePendingTitle"), children: [
          /* @__PURE__ */ jsxs3("h2", { className: "mb-2 text-xs font-medium text-ink-dim", children: [
            t("homePendingTitle"),
            " ",
            reviews ? `\xB7 ${reviews.total}` : ""
          ] }),
          reviewError && /* @__PURE__ */ jsx3("p", { role: "alert", className: "rounded-lg border border-border p-3 text-xs text-err", children: t("homeReviewsError") }),
          !reviewError && !reviews && /* @__PURE__ */ jsx3("p", { role: "status", className: "text-xs text-ink-faint", children: t("homeLoadingReviews") }),
          reviews?.items.length === 0 && /* @__PURE__ */ jsx3("p", { className: "rounded-xl border border-border p-4 text-xs text-ink-faint", children: t("homePendingEmpty") }),
          /* @__PURE__ */ jsx3("div", { className: "space-y-2", children: reviews?.items.map((item) => /* @__PURE__ */ jsxs3("article", { className: "rounded-xl border border-border bg-surface p-3", children: [
            /* @__PURE__ */ jsx3("h3", { className: "truncate text-xs font-medium", title: item.title, children: item.title }),
            /* @__PURE__ */ jsx3("p", { className: "mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-dim", children: item.path }),
            /* @__PURE__ */ jsx3("div", { className: "mt-2 flex gap-2", children: /* @__PURE__ */ jsx3(Button, { size: "sm", variant: "primary", onClick: () => openReview(item.id), children: t("homePendingReview") }) })
          ] }, item.id)) })
        ] }),
        /* @__PURE__ */ jsxs3("section", { "aria-label": t("homeHealthTitle"), children: [
          /* @__PURE__ */ jsx3("h2", { className: "mb-2 text-xs font-medium text-ink-dim", children: t("homeHealthTitle") }),
          /* @__PURE__ */ jsxs3("dl", { className: "space-y-2 text-xs text-ink-2", children: [
            /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between gap-3", children: [
              /* @__PURE__ */ jsx3("dt", { children: t("homeHealthLocalAnswers") }),
              /* @__PURE__ */ jsx3("dd", { className: "font-mono text-ink-faint", children: data?.localAnswerRate?.rate == null ? t("homeHealthUnavailable") : `${Math.round(data.localAnswerRate.rate * 100)}% (${data.localAnswerRate.answered}/${data.localAnswerRate.total})` })
            ] }),
            /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between gap-3", children: [
              /* @__PURE__ */ jsx3("dt", { children: t("homeHealthIndexed") }),
              /* @__PURE__ */ jsx3("dd", { className: "font-mono", children: data?.index?.noteCount ?? t("homeHealthUnavailable") })
            ] }),
            /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between gap-3", children: [
              /* @__PURE__ */ jsx3("dt", { children: t("homeHealthPending") }),
              /* @__PURE__ */ jsx3("dd", { className: "font-mono", children: data?.index?.pendingChanges ?? t("homeHealthUnavailable") })
            ] }),
            /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between gap-3", children: [
              /* @__PURE__ */ jsx3("dt", { children: t("homeHealthJobs") }),
              /* @__PURE__ */ jsx3("dd", { className: "font-mono", children: data?.index?.jobs ?? t("homeHealthUnavailable") })
            ] })
          ] })
        ] })
      ] })
    ] })
  ] });
}

// ui/knowledge/KnowledgeNetwork.tsx
import { useEffect as useEffect7, useState as useState7 } from "react";

// ui/knowledge/KnowledgeGraph.tsx
import { useEffect as useEffect6, useMemo as useMemo3, useRef as useRef3, useState as useState6 } from "react";

// ui/knowledge/graph-layout.ts
var GRAPH_WIDTH = 720;
var GRAPH_HEIGHT = 440;
var FORCE_LAYOUT_NODE_LIMIT = 800;
function boundedGridLayout(data) {
  const points = /* @__PURE__ */ new Map();
  const count = data.nodes.length;
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * GRAPH_WIDTH / GRAPH_HEIGHT)));
  const rows = Math.ceil(count / columns);
  const margin = 12;
  const xStep = columns === 1 ? 0 : (GRAPH_WIDTH - margin * 2) / (columns - 1);
  const yStep = rows === 1 ? 0 : (GRAPH_HEIGHT - margin * 2) / (rows - 1);
  for (const [index, node] of data.nodes.entries()) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    points.set(node.path, {
      x: columns === 1 ? GRAPH_WIDTH / 2 : margin + column * xStep,
      y: rows === 1 ? GRAPH_HEIGHT / 2 : margin + row * yStep,
      vx: 0,
      vy: 0
    });
  }
  return points;
}
function layoutGraph(data, iterations = 220) {
  if (data.nodes.length > FORCE_LAYOUT_NODE_LIMIT) return boundedGridLayout(data);
  const points = /* @__PURE__ */ new Map();
  const n = data.nodes.length || 1;
  data.nodes.forEach((node, index) => {
    const angle = 2 * Math.PI * index / n;
    const radius = 40 + 160 * (index * 7919 % n) / n;
    points.set(node.path, {
      x: GRAPH_WIDTH / 2 + radius * Math.cos(angle),
      y: GRAPH_HEIGHT / 2 + radius * Math.sin(angle),
      vx: 0,
      vy: 0
    });
  });
  const list = [...points.values()];
  const ideal = Math.max(28, Math.min(90, Math.sqrt(GRAPH_WIDTH * GRAPH_HEIGHT / n) * 0.7));
  for (let step = 0; step < iterations; step++) {
    const cooling = 1 - step / iterations;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let distance2 = dx * dx + dy * dy;
        if (distance2 < 0.01) {
          dx = 0.1;
          dy = 0.1;
          distance2 = 0.02;
        }
        const force = ideal * ideal / distance2;
        a.vx += dx * force * 0.05;
        a.vy += dy * force * 0.05;
        b.vx -= dx * force * 0.05;
        b.vy -= dy * force * 0.05;
      }
    }
    for (const edge of data.edges) {
      const a = points.get(edge.source);
      const b = points.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const pull = (distance - ideal) / distance * 0.08;
      a.vx += dx * pull;
      a.vy += dy * pull;
      b.vx -= dx * pull;
      b.vy -= dy * pull;
    }
    for (const p of list) {
      p.vx += (GRAPH_WIDTH / 2 - p.x) * 4e-3;
      p.vy += (GRAPH_HEIGHT / 2 - p.y) * 4e-3;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const max = 12 * cooling + 0.5;
      if (speed > max) {
        p.vx = p.vx / speed * max;
        p.vy = p.vy / speed * max;
      }
      p.x = Math.min(GRAPH_WIDTH - 12, Math.max(12, p.x + p.vx));
      p.y = Math.min(GRAPH_HEIGHT - 12, Math.max(12, p.y + p.vy));
      p.vx *= 0.6;
      p.vy *= 0.6;
    }
  }
  return points;
}
function placeGraphLabels(data, points, labelled, selected, options = {}) {
  const placed = [];
  const result = /* @__PURE__ */ new Map();
  const avoidZones = options.avoidZones ?? [];
  const nodes = [...data.nodes].filter((node) => labelled.has(node.path) || node.path === selected).sort(
    (a, b) => a.path === selected ? -1 : b.path === selected ? 1 : b.degree - a.degree || a.path.localeCompare(b.path)
  );
  const overlap = (a, b) => a.x < b.x + b.width + 4 && a.x + a.width + 4 > b.x && a.y < b.y + b.height + 4 && a.y + a.height + 4 > b.y;
  for (const node of nodes) {
    const point = points.get(node.path);
    if (!point) continue;
    const text = node.title.length > 18 ? `${node.title.slice(0, 17)}\u2026` : node.title;
    const width = Math.min(156, Math.max(42, text.length * 6.4));
    const radius = 10;
    const candidates = options.uniformOrientation ? [
      { x: point.x + radius, y: point.y - 15, anchor: "start" },
      { x: point.x + radius, y: point.y + 5, anchor: "start" },
      { x: point.x + radius + 8, y: point.y - 27, anchor: "start" },
      { x: point.x + radius + 8, y: point.y + 17, anchor: "start" }
    ] : [
      { x: point.x + radius, y: point.y - 15, anchor: "start" },
      { x: point.x + radius, y: point.y + 5, anchor: "start" },
      { x: point.x + radius, y: point.y - 42, anchor: "start" },
      { x: point.x + radius, y: point.y + 30, anchor: "start" },
      { x: point.x + radius, y: point.y - 80, anchor: "start" },
      { x: point.x + radius, y: point.y + 60, anchor: "start" },
      { x: point.x - radius - width, y: point.y - 15, anchor: "end" },
      { x: point.x - radius - width, y: point.y + 5, anchor: "end" },
      { x: point.x - radius - width, y: point.y - 42, anchor: "end" },
      { x: point.x - radius - width, y: point.y + 30, anchor: "end" },
      { x: point.x - radius - width, y: point.y - 80, anchor: "end" },
      { x: point.x - radius - width, y: point.y + 60, anchor: "end" },
      { x: point.x - width / 2, y: point.y - 24, anchor: "start" },
      { x: point.x - width / 2, y: point.y + 14, anchor: "start" }
    ];
    let best = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const box = {
        x: candidate.anchor === "end" ? candidate.x - width : candidate.x,
        y: candidate.y - 10,
        width,
        height: 14
      };
      const collisions = placed.reduce((count, other) => count + (overlap(box, other) ? 1 : 0), 0);
      const overlayCollisions = avoidZones.reduce((count, zone) => count + (overlap(box, zone) ? 1 : 0), 0);
      const edgePenalty = Math.max(0, -box.x) + Math.max(0, box.x + width - GRAPH_WIDTH) + Math.max(0, -box.y) + Math.max(0, box.y + box.height - GRAPH_HEIGHT);
      const score = collisions * 1e3 + overlayCollisions * 2500 + edgePenalty * 10 + Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    const finalX = best.anchor === "end" ? Math.min(GRAPH_WIDTH, Math.max(width, best.x)) : Math.min(GRAPH_WIDTH - width, Math.max(0, best.x));
    const finalY = Math.min(GRAPH_HEIGHT - 4, Math.max(12, best.y));
    const finalBox = {
      x: best.anchor === "end" ? finalX - width : finalX,
      y: finalY - 10,
      width,
      height: 14
    };
    placed.push(finalBox);
    result.set(node.path, { x: finalX, y: finalY, anchor: best.anchor, width });
  }
  return result;
}
function mergeIncrementalLayout(previous, base, data, minDistance = 22) {
  if (!previous || previous.size === 0) return base;
  const merged = /* @__PURE__ */ new Map();
  const fresh = [];
  for (const node of data.nodes) {
    const old = previous.get(node.path);
    if (old) merged.set(node.path, { ...old, vx: 0, vy: 0 });
    else fresh.push(node.path);
  }
  if (fresh.length === 0) return merged;
  const neighbours = /* @__PURE__ */ new Map();
  for (const edge of data.edges) {
    if (!neighbours.has(edge.source)) neighbours.set(edge.source, []);
    if (!neighbours.has(edge.target)) neighbours.set(edge.target, []);
    neighbours.get(edge.source)?.push(edge.target);
    neighbours.get(edge.target)?.push(edge.source);
  }
  for (const [index, path] of fresh.entries()) {
    const anchors = (neighbours.get(path) ?? []).map((other) => merged.get(other)).filter((point2) => Boolean(point2));
    const fallback = base.get(path) ?? { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2, vx: 0, vy: 0 };
    const angle = (index + 1) * 2.399963;
    const point = anchors.length > 0 ? {
      x: anchors.reduce((sum, p) => sum + p.x, 0) / anchors.length + Math.cos(angle) * minDistance,
      y: anchors.reduce((sum, p) => sum + p.y, 0) / anchors.length + Math.sin(angle) * minDistance
    } : { x: fallback.x, y: fallback.y };
    merged.set(path, { x: point.x, y: point.y, vx: 0, vy: 0 });
  }
  for (let step = 0; step < 40; step++) {
    for (const path of fresh) {
      const point = merged.get(path);
      if (!point) continue;
      for (const [other, obstacle] of merged) {
        if (other === path) continue;
        const dx = point.x - obstacle.x;
        const dy = point.y - obstacle.y;
        const distance = Math.hypot(dx, dy) || 0.01;
        if (distance >= minDistance) continue;
        const push = (minDistance - distance) / 2;
        point.x += dx / distance * push;
        point.y += dy / distance * push;
      }
      point.x = Math.min(GRAPH_WIDTH - 12, Math.max(12, point.x));
      point.y = Math.min(GRAPH_HEIGHT - 12, Math.max(12, point.y));
    }
  }
  return merged;
}
function graphNodeRadius(degree) {
  return (10 + Math.min(Math.max(degree, 0), 7) * 3) / 2;
}
function declutterLayout(base, degrees, { gap = 6, iterations = 120 } = {}) {
  const entries = [...base.entries()].map(([path, point]) => ({
    path,
    x: point.x,
    y: point.y,
    r: graphNodeRadius(degrees.get(path) ?? 0)
  }));
  const margin = 14;
  for (let step = 0; step < iterations; step++) {
    let moved = false;
    for (let i = 0; i < entries.length; i++) {
      const a = entries[i];
      if (!a) continue;
      for (let j = i + 1; j < entries.length; j++) {
        const b = entries[j];
        if (!b) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        const min = a.r + b.r + gap;
        if (distance >= min) continue;
        if (distance < 0.01) {
          const angle = (i * 7919 + j * 104729) % 360 * (Math.PI / 180);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const push = (min - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        moved = true;
      }
    }
    for (const entry of entries) {
      entry.x = Math.min(GRAPH_WIDTH - margin, Math.max(margin, entry.x));
      entry.y = Math.min(GRAPH_HEIGHT - margin, Math.max(margin, entry.y));
    }
    if (!moved) break;
  }
  return new Map(entries.map((entry) => [entry.path, { x: entry.x, y: entry.y, vx: 0, vy: 0 }]));
}

// ui/knowledge/graph-model.ts
function inDegrees(nodes, edges) {
  const counts = new Map(nodes.map((node) => [node.path, 0]));
  for (const edge of edges) {
    if (edge.type === "directory" || edge.source === edge.target) continue;
    if (counts.has(edge.target)) counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
  }
  return counts;
}
function hubRadius(inDegree, degree) {
  return graphNodeRadius(Math.max(inDegree * 1.5, degree * 0.5));
}
function adjacency(nodes, edges) {
  const map = new Map(nodes.map((node) => [node.path, /* @__PURE__ */ new Set()]));
  for (const edge of edges) {
    if (!map.has(edge.source) || !map.has(edge.target) || edge.source === edge.target) continue;
    map.get(edge.source)?.add(edge.target);
    map.get(edge.target)?.add(edge.source);
  }
  return map;
}
function graphClusters(nodes, edges) {
  const raw = /* @__PURE__ */ new Map();
  const fromWorker = nodes.some((node) => typeof node.community === "number" && node.community >= 0);
  if (fromWorker) {
    let next = -1;
    for (const node of nodes)
      raw.set(node.path, node.community !== void 0 && node.community >= 0 ? node.community : next--);
  } else {
    const adj = adjacency(nodes, edges);
    const order = [...nodes].map((node) => node.path).sort();
    const label = new Map(order.map((path, index) => [path, index]));
    for (let round = 0; round < 12; round++) {
      let changed = false;
      for (const path of order) {
        const counts = /* @__PURE__ */ new Map();
        for (const other of adj.get(path) ?? []) {
          const value = label.get(other);
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        if (counts.size === 0) continue;
        let best = label.get(path);
        let bestCount = counts.get(best) ?? 0;
        for (const [value, count] of counts)
          if (count > bestCount || count === bestCount && value < best) {
            best = value;
            bestCount = count;
          }
        if (best !== label.get(path)) {
          label.set(path, best);
          changed = true;
        }
      }
      if (!changed) break;
    }
    for (const [path, value] of label) raw.set(path, value);
  }
  const sizes = /* @__PURE__ */ new Map();
  for (const value of raw.values()) sizes.set(value, (sizes.get(value) ?? 0) + 1);
  const ranked = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([value]) => value);
  const rank = new Map(ranked.map((value, index) => [value, index]));
  return new Map([...raw].map(([path, value]) => [path, rank.get(value) ?? 0]));
}
function localNeighbourhood(center, nodes, edges, hops = 1) {
  const adj = adjacency(nodes, edges);
  const seen = new Set(adj.has(center) ? [center] : []);
  let frontier = [...seen];
  for (let step = 0; step < hops; step++) {
    const next = [];
    for (const path of frontier)
      for (const other of adj.get(path) ?? [])
        if (!seen.has(other)) {
          seen.add(other);
          next.push(other);
        }
    frontier = next;
  }
  return seen;
}
function layoutCluster(paths, edges, radii, iterations) {
  const points = paths.map((path, index) => {
    const angle = index * 2.399963;
    const r = 8 * Math.sqrt(index);
    return { path, x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0 };
  });
  if (points.length > 1) {
    const byPath = new Map(points.map((point) => [point.path, point]));
    const local = edges.filter((edge) => byPath.has(edge.source) && byPath.has(edge.target));
    const ideal = 26;
    for (let step = 0; step < iterations; step++) {
      const cooling = 1 - step / iterations;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        for (let j = i + 1; j < points.length; j++) {
          const b = points[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = 0.1 * ((i + j) % 3 - 1 || 1);
            dy = 0.1;
            d2 = 0.02;
          }
          const force = Math.min(4, ideal * ideal / d2) * 0.05;
          a.vx += dx * force;
          a.vy += dy * force;
          b.vx -= dx * force;
          b.vy -= dy * force;
        }
      }
      for (const edge of local) {
        const a = byPath.get(edge.source);
        const b = byPath.get(edge.target);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.1;
        const pull = (distance - ideal) / distance * (edge.type === "directory" ? 0.03 : 0.08);
        a.vx += dx * pull;
        a.vy += dy * pull;
        b.vx -= dx * pull;
        b.vy -= dy * pull;
      }
      for (const p of points) {
        p.vx -= p.x * 0.01;
        p.vy -= p.y * 0.01;
        const speed = Math.hypot(p.vx, p.vy);
        const max = 8 * cooling + 0.3;
        if (speed > max) {
          p.vx = p.vx / speed * max;
          p.vy = p.vy / speed * max;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
    }
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    for (const p of points) {
      p.x -= cx;
      p.y -= cy;
    }
  }
  const radius = Math.max(
    ...points.map((p) => Math.hypot(p.x, p.y) + (radii.get(p.path) ?? 6)),
    radii.get(points[0]?.path ?? "") ?? 6
  );
  return { points, radius };
}
function clusterLayout(nodes, edges, clusters, radii, iterations = 160) {
  const result = /* @__PURE__ */ new Map();
  if (nodes.length === 0) return result;
  const members = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    const id = clusters.get(node.path) ?? 0;
    if (!members.has(id)) members.set(id, []);
    members.get(id)?.push(node.path);
  }
  const groups = [...members.entries()].map(([id, paths]) => ({ id, ...layoutCluster(paths, edges, radii, iterations) })).sort((a, b) => b.points.length - a.points.length || a.id - b.id);
  const aspect = GRAPH_WIDTH / GRAPH_HEIGHT;
  const gap = 10;
  const placed = [];
  const centres = /* @__PURE__ */ new Map();
  for (const group of groups) {
    let spot = { x: 0, y: 0 };
    if (placed.length > 0) {
      search: for (let ring = 1; ring < 400; ring++) {
        const step = ring * 6;
        const count = Math.max(12, Math.round(ring * 3));
        for (let k = 0; k < count; k++) {
          const angle = 2 * Math.PI * k / count + ring * 0.37;
          const x = Math.cos(angle) * step * Math.sqrt(aspect);
          const y = Math.sin(angle) * step / Math.sqrt(aspect);
          if (placed.every((other) => Math.hypot(other.x - x, other.y - y) >= other.r + group.radius + gap)) {
            spot = { x, y };
            break search;
          }
        }
      }
    }
    placed.push({ ...spot, r: group.radius });
    centres.set(group.id, spot);
  }
  const minX = Math.min(...placed.map((d) => d.x - d.r));
  const maxX = Math.max(...placed.map((d) => d.x + d.r));
  const minY = Math.min(...placed.map((d) => d.y - d.r));
  const maxY = Math.max(...placed.map((d) => d.y + d.r));
  const margin = 18;
  const scale = Math.min(
    1.6,
    (GRAPH_WIDTH - margin * 2) / Math.max(1, maxX - minX),
    (GRAPH_HEIGHT - margin * 2) / Math.max(1, maxY - minY)
  );
  const offsetX = GRAPH_WIDTH / 2 - (minX + maxX) / 2 * scale;
  const offsetY = GRAPH_HEIGHT / 2 - (minY + maxY) / 2 * scale;
  for (const group of groups) {
    const centre = centres.get(group.id) ?? { x: 0, y: 0 };
    for (const p of group.points) {
      const r = (radii.get(p.path) ?? 6) + 2;
      result.set(p.path, {
        x: Math.min(GRAPH_WIDTH - r, Math.max(r, offsetX + (centre.x + p.x) * scale)),
        y: Math.min(GRAPH_HEIGHT - r, Math.max(r, offsetY + (centre.y + p.y) * scale)),
        vx: 0,
        vy: 0
      });
    }
  }
  return new Map(nodes.map((node) => [node.path, result.get(node.path)]));
}
function looksLikeFileName(title) {
  const value = String(title || "").trim();
  if (!value) return true;
  if (/\.(?:pdf|html?|md|txt|docx?|xlsx?|csv|json|zip|tar|gz)$/i.test(value)) return true;
  if (/^(?:PMC|PMID)?\d[\d.]*$/i.test(value)) return true;
  return /^[a-z0-9]+(?:[-_][a-z0-9]+){2,}$/.test(value) && /\d{4,}|[a-f0-9]{12,}/.test(value);
}
function graphHealth(nodes, edges, incoming = inDegrees(nodes, edges)) {
  const findings = [];
  const linked = /* @__PURE__ */ new Set();
  for (const edge of edges)
    if (edge.type !== "directory") {
      linked.add(edge.source);
      linked.add(edge.target);
    }
  for (const node of nodes) {
    if (node.isInfrastructure || node.nodeType === "infrastructure" || node.nodeType === "navigation")
      continue;
    if (!linked.has(node.path) && node.degree === 0) findings.push({ path: node.path, kind: "orphan" });
    else if ((node.kind === "wiki" || node.nodeType === "wiki") && (incoming.get(node.path) ?? 0) === 0)
      findings.push({ path: node.path, kind: "uncited" });
    if (node.title !== void 0 && looksLikeFileName(node.title))
      findings.push({ path: node.path, kind: "untitled" });
    if (node.warnings?.length) findings.push({ path: node.path, kind: "warning" });
  }
  return findings;
}
function shapeFor(category) {
  if (category === "wiki" || category === "concept" || category === "method" || category === "software")
    return "square";
  if (category === "claim" || category === "evidence" || category === "decision" || category === "question")
    return "diamond";
  return "circle";
}
var CLUSTER_PALETTE = [
  "#3b6fd8",
  "#1f8a7a",
  "#c9822b",
  "#8a63d2",
  "#d0567a",
  "#4f9d3a",
  "#2a9fc2",
  "#b5651d",
  "#6c7bd8",
  "#a3a33a"
];
function clusterColor(cluster, size) {
  if (size <= 1) return "#9aa4b8";
  return CLUSTER_PALETTE[cluster % CLUSTER_PALETTE.length];
}

// ui/knowledge/KnowledgeLinks.tsx
import { useEffect as useEffect5, useState as useState5 } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function openKnowledgeNote(cwd, path, revision) {
  const store = useKnowledgeStore.getState();
  store.open({
    cwd,
    sessionId: store.dialog?.sessionId ?? null,
    tab: "reviews",
    note: path,
    noteRevision: revision
  });
}
function KnowledgeLinks({
  cwd,
  path,
  revision
}) {
  const t = useKnowledgeText();
  const nonce = useKnowledgeStore((s) => s.revision);
  const [links, setLinks] = useState5(null);
  useEffect5(() => {
    let live = true;
    setLinks(null);
    void getKnowledgeApi().getKnowledgeNoteLinks({ path, revision }).then(
      (value) => {
        if (live) setLinks(value);
      },
      () => {
      }
    );
    return () => {
      live = false;
    };
  }, [path, revision, nonce]);
  if (!links) return null;
  const list = (items, empty) => items.length === 0 ? /* @__PURE__ */ jsx4("p", { className: "text-[11px] text-ink-faint", children: empty }) : /* @__PURE__ */ jsx4("ul", { className: "space-y-0.5", children: items.map((item) => /* @__PURE__ */ jsx4("li", { children: item.exists ? /* @__PURE__ */ jsx4(
    "button",
    {
      type: "button",
      className: "text-left text-xs text-link hover:underline",
      title: item.path,
      onClick: () => openKnowledgeNote(cwd, item.path, revision),
      children: item.title
    }
  ) : /* @__PURE__ */ jsxs4("span", { className: "text-[11px] text-ink-faint", title: t("linkMissing"), children: [
    item.title,
    " \xB7 ",
    t("linkMissing")
  ] }) }, item.path)) });
  return /* @__PURE__ */ jsxs4(
    "div",
    {
      className: "mt-3 grid grid-cols-2 gap-3 rounded-lg border border-border p-3",
      "data-testid": "knowledge-links",
      children: [
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsxs4("h5", { className: "mb-1 text-xs font-semibold", children: [
            t("linksIncoming"),
            " \xB7 ",
            links.incoming.length
          ] }),
          list(links.incoming, t("linksIncomingEmpty"))
        ] }),
        /* @__PURE__ */ jsxs4("div", { children: [
          /* @__PURE__ */ jsxs4("h5", { className: "mb-1 text-xs font-semibold", children: [
            t("linksOutgoing"),
            " \xB7 ",
            links.outgoing.length
          ] }),
          list(links.outgoing, t("linksOutgoingEmpty"))
        ] })
      ]
    }
  );
}

// ui/knowledge/KnowledgeGraph.tsx
import { Fragment as Fragment2, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var GRAPH_LIMIT = 400;
var MIN_ZOOM = 0.65;
var MAX_ZOOM = 2.8;
var LIVE_BATCH_MS = 1e3;
var LABEL_LIMIT = 14;
var LIVE_COLOR = "#059669";
var CATEGORY_COLORS = {
  paper: "#3b6fd8",
  method: "#1f8a7a",
  software: "#c9822b",
  dataset: "#7fc5e5",
  concept: "#c58ee8",
  entity: "#e4a0b5",
  idea: "#8a63d2",
  claim: "#f1d36b",
  evidence: "#63d6d0",
  decision: "#ff9f73",
  question: "#b8a1ff",
  wiki: "#9bb5ff",
  other: "#9aa4b8"
};
var CATEGORY_LABELS_ZH = {
  paper: "\u6587\u732E",
  method: "\u65B9\u6CD5",
  software: "\u8F6F\u4EF6",
  dataset: "\u6570\u636E\u96C6",
  concept: "\u6982\u5FF5",
  entity: "\u5B9E\u4F53",
  idea: "\u60F3\u6CD5",
  claim: "\u4E3B\u5F20",
  evidence: "\u8BC1\u636E",
  decision: "\u51B3\u7B56",
  question: "\u95EE\u9898",
  wiki: "Wiki",
  other: "\u5176\u4ED6"
};
var CATEGORY_LABELS_EN = {
  paper: "Paper",
  method: "Method",
  software: "Software",
  dataset: "Dataset",
  concept: "Concept",
  entity: "Entity",
  idea: "Idea",
  claim: "Claim",
  evidence: "Evidence",
  decision: "Decision",
  question: "Question",
  wiki: "Wiki",
  other: "Other"
};
function categoryOf(node) {
  const value = (node.contentType ?? node.type ?? "other").toLowerCase();
  return value in CATEGORY_COLORS ? value : node.kind === "wiki" ? "wiki" : "other";
}
function clampZoom(scale) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}
function clampCamera(camera) {
  return { ...camera, scale: clampZoom(camera.scale) };
}
function graphNodes(data) {
  return data.semantic?.nodes ?? data.nodes;
}
function graphEdges(data) {
  const graph = data.semantic ?? data;
  if (graph.relations)
    return graph.relations.filter((edge) => edge.type !== "duplicate").map((edge) => ({ source: edge.source, target: edge.target, type: edge.type }));
  return graph.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    type: edge.directory ? "directory" : "link"
  }));
}
function nodeColor(node) {
  if (node.isInfrastructure || node.nodeType === "infrastructure") return "#9aa4b8";
  return CATEGORY_COLORS[categoryOf(node)];
}
function labelText(node) {
  return node.title.length > 18 ? `${node.title.slice(0, 17)}\u2026` : node.title;
}
var HEALTH_COLORS = {
  orphan: "#d0564a",
  uncited: "#c9822b",
  untitled: "#7b6fd0",
  warning: "#b8860b"
};
var HEALTH_ORDER = ["untitled", "orphan", "uncited", "warning"];
var HEALTH_COPY = {
  orphan: { label: "graphHealthOrphan", hint: "graphHealthOrphanHint", prompt: "graphHealthOrphanPrompt" },
  uncited: {
    label: "graphHealthUncited",
    hint: "graphHealthUncitedHint",
    prompt: "graphHealthUncitedPrompt"
  },
  untitled: {
    label: "graphHealthUntitled",
    hint: "graphHealthUntitledHint",
    prompt: "graphHealthUntitledPrompt"
  },
  warning: { label: "graphHealthWarning", hint: "graphHealthWarningHint", prompt: "handOffPrompt" }
};
var LOCAL_LABEL_LIMIT = 24;
function NodeMark({
  shape,
  x,
  y,
  r,
  fill,
  stroke,
  strokeWidth,
  strokeDasharray,
  fillOpacity
}) {
  const common = { fill, stroke, strokeWidth, strokeDasharray, fillOpacity };
  if (shape === "square") {
    const side = r * 1.75;
    return /* @__PURE__ */ jsx5("rect", { x: x - side / 2, y: y - side / 2, width: side, height: side, rx: r * 0.35, ...common });
  }
  if (shape === "diamond") {
    const d = r * 1.3;
    return /* @__PURE__ */ jsx5("polygon", { points: `${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}`, ...common });
  }
  return /* @__PURE__ */ jsx5("circle", { cx: x, cy: y, r, ...common });
}
function KnowledgeGraph({
  cwd,
  revision,
  indexKey = ""
}) {
  const t = useKnowledgeText();
  const language = useLanguage();
  const categoryLabels = language === "zh" ? CATEGORY_LABELS_ZH : CATEGORY_LABELS_EN;
  const nonce = useKnowledgeStore((s) => s.revision);
  const [data, setData] = useState6(null);
  const [error, setError] = useState6(null);
  const [selected, setSelected] = useState6(null);
  const [view, setView] = useState6("semantic");
  const [mergeMirrors, setMergeMirrors] = useState6(true);
  const [relationFilter, setRelationFilter] = useState6("all");
  const [categoryFilter, setCategoryFilter] = useState6(null);
  const [links, setLinks] = useState6(null);
  const [hovered, setHovered] = useState6(null);
  const [camera, setCamera] = useState6({ x: 0, y: 0, scale: 1 });
  const [freshPaths, setFreshPaths] = useState6(() => /* @__PURE__ */ new Set());
  const [colorMode, setColorMode] = useState6("cluster");
  const [scope, setScope] = useState6("global");
  const [hops, setHops] = useState6(1);
  const [healthOn, setHealthOn] = useState6(false);
  const rootRef = useRef3(null);
  const dragRef = useRef3(null);
  const dragFrameRef = useRef3(null);
  const pendingCameraRef = useRef3(null);
  const previousGraphRef = useRef3(null);
  const graphSignatureRef = useRef3(null);
  useEffect6(
    () => () => {
      if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    },
    []
  );
  const liveKey = `${revision}:${nonce}:${indexKey}`;
  const [appliedKey, setAppliedKey] = useState6(liveKey);
  const [paused, setPaused] = useState6(false);
  const [pendingEvents, setPendingEvents] = useState6(0);
  const lastKeyRef = useRef3(liveKey);
  useEffect6(() => {
    if (lastKeyRef.current === liveKey) return;
    lastKeyRef.current = liveKey;
    if (paused) {
      setPendingEvents((count) => count + 1);
      return;
    }
    const timer = window.setTimeout(() => setAppliedKey(liveKey), LIVE_BATCH_MS);
    return () => window.clearTimeout(timer);
  }, [liveKey, paused]);
  const togglePaused = () => {
    if (paused) {
      setPendingEvents(0);
      setAppliedKey(lastKeyRef.current);
    }
    setPaused(!paused);
  };
  useEffect6(() => {
    let live = true;
    setError(null);
    void getKnowledgeApi().getKnowledgeGraph({ revision, limit: GRAPH_LIMIT, view, mergeMirrors }).then(
      (value) => live && setData(value),
      (e) => live && setError(String(e.message || e))
    );
    return () => {
      live = false;
    };
  }, [appliedKey, view, mergeMirrors]);
  const nodes = useMemo3(() => data ? graphNodes(data) : [], [data]);
  const edges = useMemo3(() => data ? graphEdges(data) : [], [data]);
  const incoming = useMemo3(() => inDegrees(nodes, edges), [nodes, edges]);
  const clusters = useMemo3(() => graphClusters(nodes, edges), [nodes, edges]);
  const clusterSizes = useMemo3(() => {
    const sizes = /* @__PURE__ */ new Map();
    for (const value of clusters.values()) sizes.set(value, (sizes.get(value) ?? 0) + 1);
    return sizes;
  }, [clusters]);
  const findings = useMemo3(() => graphHealth(nodes, edges, incoming), [nodes, edges, incoming]);
  const findingsByPath = useMemo3(() => {
    const map = /* @__PURE__ */ new Map();
    for (const finding of findings) map.set(finding.path, [...map.get(finding.path) ?? [], finding.kind]);
    return map;
  }, [findings]);
  const radiusOf = (node) => hubRadius(incoming.get(node.path) ?? 0, node.degree) + (node.isMain ? 3 : 0);
  useEffect6(() => {
    if (!selected || !nodes.some((node) => node.path === selected)) setSelected(null);
  }, [nodes, selected]);
  useEffect6(() => {
    if (!selected) {
      setLinks(null);
      return;
    }
    let live = true;
    void getKnowledgeApi().getKnowledgeNoteLinks({ path: selected, revision }).then(
      (value) => live && setLinks(value),
      () => live && setLinks(null)
    );
    return () => {
      live = false;
    };
  }, [selected, revision, nonce]);
  const layoutRef = useRef3(null);
  const points = useMemo3(() => {
    if (!data) return /* @__PURE__ */ new Map();
    const graph2 = data.semantic ?? data;
    const graphNodeList = graphNodes(data);
    const graphEdgeList = graphEdges(data);
    const incomingLinks = inDegrees(graphNodeList, graphEdgeList);
    const sizes = new Map(
      graphNodeList.map((node) => [
        node.path,
        Math.max((incomingLinks.get(node.path) ?? 0) * 1.5, node.degree * 0.5)
      ])
    );
    let base;
    if (graphNodeList.length <= GRAPH_LIMIT)
      base = clusterLayout(
        graphNodeList,
        graphEdgeList,
        graphClusters(graphNodeList, graphEdgeList),
        new Map(graphNodeList.map((node) => [node.path, graphNodeRadius(sizes.get(node.path) ?? 0)]))
      );
    else if (graph2.layout)
      base = new Map(Object.entries(graph2.layout).map(([path, point]) => [path, { ...point, vx: 0, vy: 0 }]));
    else if (graph2.nodes.some((node) => node.x !== void 0 && node.y !== void 0))
      base = new Map(
        graph2.nodes.map((node) => [
          node.path,
          { x: node.x ?? GRAPH_WIDTH / 2, y: node.y ?? GRAPH_HEIGHT / 2, vx: 0, vy: 0 }
        ])
      );
    else base = layoutGraph(graph2);
    base = declutterLayout(base, sizes);
    const key = `${view}:${mergeMirrors}`;
    const previous = layoutRef.current?.key === key ? layoutRef.current.points : null;
    const merged = mergeIncrementalLayout(previous, base, graph2);
    layoutRef.current = { key, points: merged };
    return merged;
  }, [data]);
  const localSet = useMemo3(
    () => scope === "local" && selected ? localNeighbourhood(selected, nodes, edges, hops) : null,
    [scope, selected, nodes, edges, hops]
  );
  const viewNodes = useMemo3(
    () => localSet ? nodes.filter((node) => localSet.has(node.path)) : nodes,
    [localSet, nodes]
  );
  const localPoints = useMemo3(() => {
    if (!localSet || !selected) return null;
    const subEdges = edges.filter((edge) => localSet.has(edge.source) && localSet.has(edge.target));
    const sub = nodes.filter((node) => localSet.has(node.path));
    const placed = clusterLayout(
      sub,
      subEdges,
      new Map(sub.map((node) => [node.path, 0])),
      new Map(sub.map((node) => [node.path, hubRadius(incoming.get(node.path) ?? 0, node.degree) + 4])),
      160
    );
    const centre = placed.get(selected);
    if (!centre) return placed;
    const dx = GRAPH_WIDTH / 2 - centre.x;
    const dy = GRAPH_HEIGHT / 2 - centre.y;
    for (const point of placed.values()) {
      point.x = Math.min(GRAPH_WIDTH - 16, Math.max(16, point.x + dx));
      point.y = Math.min(GRAPH_HEIGHT - 16, Math.max(16, point.y + dy));
    }
    return placed;
  }, [localSet, selected, nodes, edges, incoming]);
  const viewPoints = localPoints ?? points;
  const clusterHeads = useMemo3(() => {
    const best = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      const cluster = clusters.get(node.path) ?? 0;
      if ((clusterSizes.get(cluster) ?? 0) < 3) continue;
      const current = best.get(cluster);
      const score = (incoming.get(node.path) ?? 0) * 2 + node.degree;
      const currentScore = current ? (incoming.get(current.path) ?? 0) * 2 + current.degree : -1;
      if (score > currentScore || score === currentScore && current && node.path < current.path)
        best.set(cluster, node);
    }
    return best;
  }, [nodes, clusters, clusterSizes, incoming]);
  const labelled = useMemo3(
    () => new Set(
      localSet ? [...viewNodes].sort(
        (a, b) => (incoming.get(b.path) ?? 0) - (incoming.get(a.path) ?? 0) || b.degree - a.degree || a.path.localeCompare(b.path)
      ).slice(0, LOCAL_LABEL_LIMIT).map((node) => node.path).concat(selected ? [selected] : []) : (
        // Most-cited notes plus one head per topic cluster get a permanent label; the rest on hover.
        [...nodes].filter((node) => node.degree >= 2).sort(
          (a, b) => (incoming.get(b.path) ?? 0) - (incoming.get(a.path) ?? 0) || b.degree - a.degree || a.path.localeCompare(b.path)
        ).slice(0, LABEL_LIMIT).concat([...clusterHeads.values()]).concat(nodes.filter((node) => node.isMain)).concat(nodes.filter((node) => node.path === selected || node.path === hovered)).map((node) => node.path)
      )
    ),
    [nodes, viewNodes, localSet, selected, hovered, incoming, clusterHeads]
  );
  const labels = useMemo3(
    () => data ? placeGraphLabels({ nodes: viewNodes }, viewPoints, labelled, selected, {
      avoidZones: [
        // The controls are absolutely positioned over the SVG's bottom-right corner.
        { x: GRAPH_WIDTH - 224, y: GRAPH_HEIGHT - 72, width: 224, height: 72 },
        // The legend occupies the lower-left corner of the canvas.
        { x: 0, y: GRAPH_HEIGHT - 82, width: 270, height: 82 }
      ]
    }) : /* @__PURE__ */ new Map(),
    [data, viewNodes, viewPoints, labelled, selected]
  );
  useEffect6(() => {
    setCamera({ x: 0, y: 0, scale: 1 });
  }, [scope, hops, scope === "local" ? selected : null]);
  const fillOf = (node) => {
    if (freshPaths.has(node.path)) return LIVE_COLOR;
    if (colorMode === "type" || node.isInfrastructure || node.nodeType === "infrastructure")
      return nodeColor(node);
    const cluster = clusters.get(node.path) ?? 0;
    return clusterColor(cluster, clusterSizes.get(cluster) ?? 0);
  };
  const handOff = (path, kind) => {
    useSessionsStore.getState().createDraftSession(cwd ?? void 0);
    const id = useSessionsStore.getState().activeSessionId;
    if (!id) return;
    const template = t(HEALTH_COPY[kind].prompt);
    useDraftStore.getState().updateDraft(id, (entry) => ({ ...entry, text: template.replace("{path}", path) }));
    useKnowledgeStore.getState().close();
    useUiStore.getState().setView("chat");
    window.dispatchEvent(new Event(COMPOSER_FOCUS_EVENT));
  };
  useEffect6(() => {
    if (!data) return;
    const current = new Map(nodes.map((node) => [node.path, { title: node.title, degree: node.degree }]));
    const graphSignature = `${view}:${mergeMirrors}:${[...current].map(([path, value]) => `${path}:${value.title}:${value.degree}`).join("|")}`;
    const previous = previousGraphRef.current;
    const previousSignature = graphSignatureRef.current;
    previousGraphRef.current = current;
    graphSignatureRef.current = graphSignature;
    if (previous && previousSignature !== graphSignature) {
      const changed = /* @__PURE__ */ new Set();
      for (const [path, value] of current) {
        const old = previous.get(path);
        if (!old || old.title !== value.title || old.degree !== value.degree) changed.add(path);
      }
      if (changed.size > 0) {
        setFreshPaths(changed);
        const timer = window.setTimeout(() => setFreshPaths(/* @__PURE__ */ new Set()), 3200);
        return () => window.clearTimeout(timer);
      }
    }
  }, [data, mergeMirrors, nodes, view]);
  const neighbours = useMemo3(() => {
    const map = /* @__PURE__ */ new Map();
    for (const edge of edges) {
      if (!map.has(edge.source)) map.set(edge.source, /* @__PURE__ */ new Set());
      if (!map.has(edge.target)) map.set(edge.target, /* @__PURE__ */ new Set());
      map.get(edge.source)?.add(edge.target);
      map.get(edge.target)?.add(edge.source);
    }
    return map;
  }, [edges]);
  const focusPath = selected ?? hovered;
  const active = focusPath ? /* @__PURE__ */ new Set([focusPath, ...neighbours.get(focusPath) ?? []]) : null;
  const visibleEdges = edges.filter(
    (edge) => (relationFilter === "all" || edge.type === relationFilter) && (!localSet || localSet.has(edge.source) && localSet.has(edge.target))
  );
  const nodeByPath = new Map(nodes.map((node) => [node.path, node]));
  const selectedNode = selected ? nodeByPath.get(selected) : void 0;
  const graph = data?.semantic ?? data;
  const isolated = graph?.health?.isolated ?? nodes.filter((node) => node.degree === 0).length;
  const duplicates = graph?.health?.duplicates ?? graph?.duplicates?.length ?? 0;
  const resetCamera = () => setCamera({ x: 0, y: 0, scale: 1 });
  const zoomBy = (factor) => setCamera((current) => clampCamera({ ...current, scale: current.scale * factor }));
  const fitCamera = () => {
    if (!viewPoints.size) return resetCamera();
    const values = [...viewPoints.values()];
    const minX = Math.min(...values.map((point) => point.x));
    const maxX = Math.max(...values.map((point) => point.x));
    const minY = Math.min(...values.map((point) => point.y));
    const maxY = Math.max(...values.map((point) => point.y));
    const padding = 72;
    const scale = clampZoom(
      Math.min(
        (GRAPH_WIDTH - padding * 2) / Math.max(1, maxX - minX),
        (GRAPH_HEIGHT - padding * 2) / Math.max(1, maxY - minY)
      )
    );
    setCamera({
      x: GRAPH_WIDTH / 2 - (minX + maxX) / 2 * scale,
      y: GRAPH_HEIGHT / 2 - (minY + maxY) / 2 * scale,
      scale
    });
  };
  const focusNode = (path) => {
    if (!path) return resetCamera();
    const point = viewPoints.get(path);
    if (!point) return;
    const scale = Math.max(1.15, camera.scale);
    setCamera({ x: GRAPH_WIDTH / 2 - point.x * scale, y: GRAPH_HEIGHT / 2 - point.y * scale, scale });
  };
  const onCanvasWheel = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = {
      x: (event.clientX - rect.left) / rect.width * GRAPH_WIDTH,
      y: (event.clientY - rect.top) / rect.height * GRAPH_HEIGHT
    };
    const factor = event.deltaY > 0 ? 0.88 : 1.14;
    setCamera((current) => {
      const scale = clampZoom(current.scale * factor);
      const worldX = (anchor.x - current.x) / current.scale;
      const worldY = (anchor.y - current.y) / current.scale;
      return { x: anchor.x - worldX * scale, y: anchor.y - worldY * scale, scale };
    });
  };
  const onCanvasPointerDown = (event) => {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX, y: event.clientY, camera };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onCanvasPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - drag.x) / rect.width * GRAPH_WIDTH;
    const dy = (event.clientY - drag.y) / rect.height * GRAPH_HEIGHT;
    pendingCameraRef.current = { ...drag.camera, x: drag.camera.x + dx, y: drag.camera.y + dy };
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      if (pendingCameraRef.current) setCamera(pendingCameraRef.current);
    });
  };
  const onCanvasPointerUp = (event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect6(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !rootRef.current?.contains(target))
        return;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable)
        return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomBy(1.14);
      } else if (event.key === "-") {
        event.preventDefault();
        zoomBy(0.88);
      } else if (event.key === "0") {
        event.preventDefault();
        resetCamera();
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        focusNode(selected);
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (selected) event.stopImmediatePropagation();
        setSelected(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [camera, points, selected]);
  if (error)
    return /* @__PURE__ */ jsx5("p", { className: "knowledge-state-card knowledge-state-card--error rounded-lg border p-3 text-xs text-err", children: error });
  if (!data || !graph)
    return /* @__PURE__ */ jsx5("p", { className: "knowledge-state-card rounded-lg border p-3 text-[11px] text-ink-faint", children: t("loading") });
  if (nodes.length === 0)
    return /* @__PURE__ */ jsx5("p", { className: "knowledge-state-card rounded-lg border p-4 text-[11px] text-ink-faint", children: t("graphEmpty") });
  return /* @__PURE__ */ jsxs5(
    "div",
    {
      ref: rootRef,
      "data-testid": "knowledge-graph",
      className: "knowledge-observatory space-y-3",
      "aria-describedby": "knowledge-graph-summary knowledge-graph-keyboard-help",
      children: [
        /* @__PURE__ */ jsxs5("header", { className: "knowledge-network-header", "data-testid": "knowledge-network-header", children: [
          /* @__PURE__ */ jsx5("h3", { className: "sr-only", children: t("graphTitle") }),
          /* @__PURE__ */ jsxs5("div", { className: "knowledge-network-stats", children: [
            /* @__PURE__ */ jsxs5("span", { children: [
              /* @__PURE__ */ jsx5("strong", { children: nodes.length }),
              " ",
              t("graphLegendNote")
            ] }),
            /* @__PURE__ */ jsxs5("span", { children: [
              /* @__PURE__ */ jsx5("strong", { children: edges.length }),
              " ",
              t("graphLinks").replace("{count}", "")
            ] }),
            /* @__PURE__ */ jsxs5("span", { children: [
              /* @__PURE__ */ jsx5("strong", { children: isolated }),
              " ",
              t("graphHealthIsolated").replace("{count}", "")
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "knowledge-graph-toolbar flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsx5(Button, { size: "sm", "aria-pressed": view === "semantic", onClick: () => setView("semantic"), children: t("graphSemantic") }),
          /* @__PURE__ */ jsx5(Button, { size: "sm", "aria-pressed": view === "all", onClick: () => setView("all"), children: t("graphAllFiles") }),
          /* @__PURE__ */ jsxs5("label", { className: "ml-1 flex items-center gap-1 text-xs text-ink-dim", children: [
            /* @__PURE__ */ jsx5(
              "input",
              {
                type: "checkbox",
                checked: mergeMirrors,
                onChange: (event) => setMergeMirrors(event.target.checked)
              }
            ),
            t("graphMergeMirrors")
          ] }),
          /* @__PURE__ */ jsx5("span", { className: "ml-auto flex gap-1", children: ["all", "link", "directory"].map((filter) => /* @__PURE__ */ jsx5(
            Button,
            {
              size: "sm",
              "aria-pressed": relationFilter === filter,
              onClick: () => setRelationFilter(filter),
              children: filter === "all" ? t("graphRelationAll") : filter === "link" ? t("graphRelationLinks") : t("graphRelationDirectory")
            },
            filter
          )) })
        ] }),
        /* @__PURE__ */ jsxs5(
          "div",
          {
            className: "knowledge-graph-toolbar flex flex-wrap items-center gap-2",
            "data-testid": "knowledge-graph-modes",
            children: [
              /* @__PURE__ */ jsxs5("span", { className: "flex gap-1", children: [
                /* @__PURE__ */ jsx5(Button, { size: "sm", "aria-pressed": colorMode === "cluster", onClick: () => setColorMode("cluster"), children: t("graphColorCluster") }),
                /* @__PURE__ */ jsx5(Button, { size: "sm", "aria-pressed": colorMode === "type", onClick: () => setColorMode("type"), children: t("graphColorType") })
              ] }),
              /* @__PURE__ */ jsxs5("span", { className: "flex gap-1", children: [
                /* @__PURE__ */ jsx5(Button, { size: "sm", "aria-pressed": scope === "global", onClick: () => setScope("global"), children: t("graphScopeGlobal") }),
                /* @__PURE__ */ jsx5(Button, { size: "sm", "aria-pressed": scope === "local", onClick: () => setScope("local"), children: t("graphScopeLocal") }),
                scope === "local" && [1, 2].map((count) => /* @__PURE__ */ jsx5(Button, { size: "sm", "aria-pressed": hops === count, onClick: () => setHops(count), children: t("graphHopCount").replace("{count}", String(count)) }, count))
              ] }),
              /* @__PURE__ */ jsxs5(
                Button,
                {
                  size: "sm",
                  "aria-pressed": healthOn,
                  "data-testid": "knowledge-graph-health-toggle",
                  onClick: () => setHealthOn((value) => !value),
                  children: [
                    t("graphHealth"),
                    findings.length ? ` \xB7 ${findings.length}` : ""
                  ]
                }
              ),
              scope === "local" && !selected && /* @__PURE__ */ jsx5("span", { className: "text-[11px] text-ink-faint", children: t("graphLocalHint") })
            ]
          }
        ),
        /* @__PURE__ */ jsxs5("div", { className: "flex flex-wrap items-center gap-1 text-[11px] text-ink-faint", children: [
          /* @__PURE__ */ jsx5("span", { className: "mr-1 uppercase tracking-[0.12em]", children: t("graphCategory") }),
          [...new Set(nodes.map(categoryOf))].map((category) => /* @__PURE__ */ jsxs5(
            "button",
            {
              type: "button",
              className: `knowledge-graph-category-filter ${categoryFilter === category ? "is-active" : ""}`,
              "aria-pressed": categoryFilter === category,
              onClick: () => setCategoryFilter((current) => current === category ? null : category),
              children: [
                /* @__PURE__ */ jsx5("i", { style: { backgroundColor: CATEGORY_COLORS[category] } }),
                categoryLabels[category]
              ]
            },
            category
          ))
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "flex flex-wrap gap-1 text-[11px] text-ink-faint", children: [
          /* @__PURE__ */ jsx5("span", { id: "knowledge-graph-summary", className: "rounded-full border border-border px-2 py-0.5", children: t("graphSummary").replace("{nodes}", String(nodes.length)).replace("{edges}", String(edges.length)).replace("{total}", String(graph.totalNotes)).replace("{limit}", String(GRAPH_LIMIT)) }),
          /* @__PURE__ */ jsx5("span", { className: "rounded-full border border-border px-2 py-0.5", children: t("graphHealthIsolated").replace("{count}", String(isolated)) }),
          /* @__PURE__ */ jsx5("span", { className: "rounded-full border border-border px-2 py-0.5", children: t("graphHealthDuplicates").replace("{count}", String(duplicates)) })
        ] }),
        /* @__PURE__ */ jsx5("p", { id: "knowledge-graph-keyboard-help", className: "sr-only", children: t("graphKeyboardHelp") }),
        /* @__PURE__ */ jsxs5("div", { className: "relative", children: [
          /* @__PURE__ */ jsxs5("div", { className: "knowledge-observatory-canvas relative overflow-hidden rounded-xl", children: [
            /* @__PURE__ */ jsxs5("div", { className: "knowledge-graph-canvas-tools absolute inset-3 z-10", children: [
              /* @__PURE__ */ jsxs5(
                "button",
                {
                  type: "button",
                  className: "knowledge-graph-live-toggle absolute right-0 top-0 flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
                  "aria-pressed": paused,
                  title: t("graphLiveToggle"),
                  "data-testid": "knowledge-graph-live-toggle",
                  onClick: togglePaused,
                  children: [
                    /* @__PURE__ */ jsx5(
                      "span",
                      {
                        "aria-hidden": "true",
                        className: `knowledge-graph-live-dot${paused ? " knowledge-graph-live-dot--paused" : ""}`
                      }
                    ),
                    paused ? t("graphPaused").replace("{count}", String(pendingEvents)) : t("graphLive")
                  ]
                }
              ),
              /* @__PURE__ */ jsxs5("div", { className: "knowledge-graph-controls absolute bottom-0 right-0 flex items-center gap-1 rounded-lg p-1", children: [
                /* @__PURE__ */ jsxs5(
                  "button",
                  {
                    type: "button",
                    className: "knowledge-graph-zoom-button",
                    onClick: () => zoomBy(1.14),
                    title: `${t("graphZoomIn")} (+)`,
                    children: [
                      /* @__PURE__ */ jsx5("span", { "aria-hidden": "true", children: "\uFF0B" }),
                      /* @__PURE__ */ jsx5("span", { className: "sr-only", children: t("graphZoomIn") })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs5("span", { className: "knowledge-graph-zoom-value", "aria-live": "polite", children: [
                  Math.round(camera.scale * 100),
                  "%"
                ] }),
                /* @__PURE__ */ jsxs5(
                  "button",
                  {
                    type: "button",
                    className: "knowledge-graph-zoom-button",
                    onClick: () => zoomBy(0.88),
                    title: `${t("graphZoomOut")} (-)`,
                    children: [
                      /* @__PURE__ */ jsx5("span", { "aria-hidden": "true", children: "\uFF0D" }),
                      /* @__PURE__ */ jsx5("span", { className: "sr-only", children: t("graphZoomOut") })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs5(
                  "button",
                  {
                    type: "button",
                    className: "knowledge-graph-zoom-button px-2",
                    onClick: resetCamera,
                    title: t("graphResetView"),
                    children: [
                      /* @__PURE__ */ jsx5("span", { "aria-hidden": "true", children: "\u2302" }),
                      /* @__PURE__ */ jsx5("span", { className: "sr-only", children: t("graphResetView") })
                    ]
                  }
                ),
                /* @__PURE__ */ jsx5(
                  "button",
                  {
                    type: "button",
                    className: "knowledge-graph-fit-button",
                    onClick: fitCamera,
                    title: t("graphFit"),
                    children: t("graphFit")
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs5(
              "svg",
              {
                viewBox: `0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`,
                className: "knowledge-graph-svg h-[clamp(520px,68vh,760px)] w-full touch-none select-none",
                "aria-labelledby": "knowledge-graph-title",
                "aria-describedby": "knowledge-graph-summary knowledge-graph-keyboard-help",
                "aria-keyshortcuts": "+ - 0 F Escape",
                onWheel: onCanvasWheel,
                onPointerDown: onCanvasPointerDown,
                onPointerMove: onCanvasPointerMove,
                onPointerUp: onCanvasPointerUp,
                onPointerCancel: onCanvasPointerUp,
                children: [
                  /* @__PURE__ */ jsx5("title", { id: "knowledge-graph-title", children: t("graphTitle") }),
                  /* @__PURE__ */ jsxs5("defs", { children: [
                    /* @__PURE__ */ jsx5("pattern", { id: "knowledge-grid", width: "32", height: "32", patternUnits: "userSpaceOnUse", children: /* @__PURE__ */ jsx5(
                      "path",
                      {
                        d: "M 32 0 L 0 0 0 32",
                        fill: "none",
                        stroke: "var(--knowledge-grid)",
                        strokeOpacity: ".8",
                        strokeWidth: "1"
                      }
                    ) }),
                    /* @__PURE__ */ jsxs5("radialGradient", { id: "knowledge-glow", children: [
                      /* @__PURE__ */ jsx5("stop", { offset: "0", stopColor: "var(--knowledge-accent)", stopOpacity: ".2" }),
                      /* @__PURE__ */ jsx5("stop", { offset: "1", stopColor: "var(--knowledge-canvas)", stopOpacity: "0" })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx5("rect", { width: GRAPH_WIDTH, height: GRAPH_HEIGHT, fill: "url(#knowledge-grid)" }),
                  /* @__PURE__ */ jsx5("ellipse", { cx: GRAPH_WIDTH / 2, cy: GRAPH_HEIGHT / 2, rx: "300", ry: "210", fill: "url(#knowledge-glow)" }),
                  /* @__PURE__ */ jsxs5(
                    "g",
                    {
                      className: "knowledge-graph-scene",
                      transform: `translate(${camera.x} ${camera.y}) scale(${camera.scale})`,
                      children: [
                        viewNodes.filter((node) => node.isMain).map((node) => {
                          const point = viewPoints.get(node.path);
                          if (!point) return null;
                          return /* @__PURE__ */ jsx5(
                            "circle",
                            {
                              cx: point.x,
                              cy: point.y,
                              r: "40",
                              fill: "none",
                              stroke: nodeColor(node),
                              strokeOpacity: ".18",
                              strokeDasharray: "2 7"
                            },
                            `main-orbit-${node.path}`
                          );
                        }),
                        /* @__PURE__ */ jsx5("g", { children: visibleEdges.map((edge) => {
                          const a = viewPoints.get(edge.source), b = viewPoints.get(edge.target);
                          if (!a || !b) return null;
                          const categoryOn = !categoryFilter || categoryOf(
                            nodeByPath.get(edge.source) ?? { kind: "note" }
                          ) === categoryFilter || categoryOf(
                            nodeByPath.get(edge.target) ?? { kind: "note" }
                          ) === categoryFilter;
                          const on = categoryOn && (!active || active.has(edge.source) && active.has(edge.target));
                          const fresh = freshPaths.has(edge.source) || freshPaths.has(edge.target);
                          return /* @__PURE__ */ jsx5(
                            "line",
                            {
                              className: `knowledge-graph-edge${on && focusPath ? " knowledge-graph-edge--active" : ""}${fresh ? " knowledge-graph-edge--fresh" : ""}`,
                              x1: a.x,
                              y1: a.y,
                              x2: b.x,
                              y2: b.y,
                              stroke: fresh ? LIVE_COLOR : edge.type === "directory" ? "var(--knowledge-directory)" : "var(--knowledge-edge)",
                              strokeOpacity: on ? edge.type === "directory" ? 0.6 : 0.5 : categoryOn ? 0.08 : 0.025,
                              strokeWidth: fresh ? 2 : edge.type === "directory" ? 1 : 1.4,
                              strokeDasharray: edge.type === "directory" ? "4 4" : void 0
                            },
                            `${edge.source}|${edge.target}|${edge.type}`
                          );
                        }) }),
                        viewNodes.map((node) => {
                          const point = viewPoints.get(node.path);
                          if (!point) return null;
                          const categoryOn = !categoryFilter || categoryOf(node) === categoryFilter;
                          const nodeFindings = healthOn ? findingsByPath.get(node.path) : void 0;
                          const healthDim = healthOn && !nodeFindings && !(active?.has(node.path) ?? false);
                          const on = categoryOn && (!active || active.has(node.path)) && !healthDim;
                          const fresh = freshPaths.has(node.path);
                          const radius = radiusOf(node);
                          const shape = shapeFor(categoryOf(node));
                          const placement = labels.get(node.path);
                          const showLabel = Boolean(placement);
                          const showMetadata = camera.scale >= 1.15 || selected === node.path || hovered === node.path;
                          return (
                            // biome-ignore lint/a11y/useSemanticElements: SVG nodes do not support native button elements
                            /* @__PURE__ */ jsxs5(
                              "g",
                              {
                                role: "button",
                                tabIndex: 0,
                                "aria-label": `${node.title} \xB7 ${categoryLabels[categoryOf(node)]} \xB7 ${t("graphLinks").replace("{count}", String(node.degree))}`,
                                "aria-pressed": selected === node.path,
                                "aria-keyshortcuts": "Enter Space",
                                opacity: on ? 1 : healthDim ? 0.28 : categoryOn ? 0.2 : 0.14,
                                style: { cursor: "pointer" },
                                onClick: () => setSelected(node.path),
                                onMouseEnter: () => setHovered(node.path),
                                onMouseLeave: () => setHovered(null),
                                onPointerDown: (event) => event.stopPropagation(),
                                onFocus: () => setSelected(node.path),
                                onKeyDown: (event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    setSelected(node.path);
                                  }
                                },
                                children: [
                                  /* @__PURE__ */ jsx5("title", { children: `${node.title}
${node.path}` }),
                                  selected === node.path && /* @__PURE__ */ jsx5(
                                    "circle",
                                    {
                                      className: "knowledge-graph-selection-halo",
                                      cx: point.x,
                                      cy: point.y,
                                      r: radius + 8,
                                      fill: "none",
                                      stroke: "var(--knowledge-accent)",
                                      strokeOpacity: ".35",
                                      strokeDasharray: "2 3"
                                    }
                                  ),
                                  /* @__PURE__ */ jsx5(
                                    "circle",
                                    {
                                      className: `knowledge-graph-node-aura${fresh ? " knowledge-graph-node-aura--fresh" : ""}`,
                                      cx: point.x,
                                      cy: point.y,
                                      r: radius + 5,
                                      fill: fillOf(node),
                                      fillOpacity: ".1"
                                    }
                                  ),
                                  nodeFindings?.map((kind, index) => /* @__PURE__ */ jsx5(
                                    "circle",
                                    {
                                      className: "knowledge-graph-health-ring",
                                      cx: point.x,
                                      cy: point.y,
                                      r: radius + 4 + index * 3,
                                      fill: "none",
                                      stroke: HEALTH_COLORS[kind],
                                      strokeWidth: "1.6",
                                      strokeDasharray: kind === "warning" ? void 0 : kind === "orphan" ? "2 2" : "5 3"
                                    },
                                    `health-${kind}`
                                  )),
                                  node.isMain && /* @__PURE__ */ jsx5(
                                    "circle",
                                    {
                                      cx: point.x,
                                      cy: point.y,
                                      r: radius + 6,
                                      fill: "none",
                                      stroke: nodeColor(node),
                                      strokeOpacity: ".78",
                                      strokeWidth: "1.5",
                                      strokeDasharray: "7 4"
                                    }
                                  ),
                                  (node.sharedWith?.length ?? 0) > 1 && /* @__PURE__ */ jsx5(
                                    "circle",
                                    {
                                      cx: point.x,
                                      cy: point.y,
                                      r: radius + 4,
                                      fill: "none",
                                      stroke: "var(--knowledge-edge)",
                                      strokeOpacity: ".45",
                                      strokeWidth: "1",
                                      strokeDasharray: "2 3"
                                    }
                                  ),
                                  /* @__PURE__ */ jsx5(
                                    NodeMark,
                                    {
                                      shape,
                                      x: point.x,
                                      y: point.y,
                                      r: radius,
                                      fill: fillOf(node),
                                      stroke: "var(--knowledge-surface)",
                                      strokeWidth: "2"
                                    }
                                  ),
                                  showLabel && placement && /* @__PURE__ */ jsxs5(Fragment2, { children: [
                                    /* @__PURE__ */ jsx5(
                                      "rect",
                                      {
                                        x: placement.anchor === "end" ? placement.x - placement.width - 4 : placement.x - 4,
                                        y: placement.y - 11,
                                        width: placement.width + 8,
                                        height: showMetadata ? 27 : 16,
                                        rx: "4",
                                        fill: "var(--knowledge-surface)",
                                        fillOpacity: ".82",
                                        stroke: "var(--knowledge-border)",
                                        strokeOpacity: ".7"
                                      }
                                    ),
                                    /* @__PURE__ */ jsxs5(
                                      "text",
                                      {
                                        x: placement.x,
                                        y: placement.y,
                                        textAnchor: placement.anchor,
                                        fontSize: "10",
                                        fill: "var(--knowledge-ink)",
                                        children: [
                                          /* @__PURE__ */ jsx5("tspan", { children: labelText(node) }),
                                          showMetadata && /* @__PURE__ */ jsxs5("tspan", { x: placement.x, dy: "12", fontSize: "8", fill: "var(--knowledge-ink-muted)", children: [
                                            t("graphInDegree").replace("{count}", String(incoming.get(node.path) ?? 0)),
                                            " \xB7",
                                            " ",
                                            categoryLabels[categoryOf(node)]
                                          ] })
                                        ]
                                      }
                                    )
                                  ] })
                                ]
                              },
                              node.path
                            )
                          );
                        })
                      ]
                    }
                  )
                ]
              }
            ),
            /* @__PURE__ */ jsx5("div", { className: "sr-only", "aria-live": "polite", "aria-atomic": "true", children: selectedNode ? `${selectedNode.title} \xB7 ${selectedNode.path}` : "" }),
            /* @__PURE__ */ jsxs5("div", { className: "knowledge-graph-legend absolute bottom-2 left-3 flex max-w-[calc(100%-24px)] flex-wrap gap-x-3 gap-y-1 rounded-md px-2 py-2 text-xs", children: [
              colorMode === "cluster" && /* @__PURE__ */ jsxs5(Fragment2, { children: [
                [...clusterHeads.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6).map(([cluster, head]) => /* @__PURE__ */ jsxs5("span", { title: head.title, children: [
                  /* @__PURE__ */ jsx5(
                    "i",
                    {
                      className: "mr-1 inline-block h-2 w-2 rounded-full",
                      style: {
                        backgroundColor: clusterColor(cluster, clusterSizes.get(cluster) ?? 0)
                      }
                    }
                  ),
                  labelText(head)
                ] }, `legend-cluster-${cluster}`)),
                /* @__PURE__ */ jsx5("span", { children: t("graphLegendShapes") })
              ] }),
              colorMode === "type" && [...new Set(nodes.map(categoryOf))].map((category) => /* @__PURE__ */ jsxs5("span", { children: [
                /* @__PURE__ */ jsx5(
                  "i",
                  {
                    className: "mr-1 inline-block h-2 w-2 rounded-full",
                    style: { backgroundColor: CATEGORY_COLORS[category] }
                  }
                ),
                categoryLabels[category]
              ] }, `legend-${category}`)),
              /* @__PURE__ */ jsxs5("span", { children: [
                /* @__PURE__ */ jsx5("i", { className: "knowledge-graph-legend-main mr-1 inline-block h-2 w-2 rounded-full border" }),
                t("graphLegendMain")
              ] }),
              /* @__PURE__ */ jsxs5("span", { children: [
                /* @__PURE__ */ jsx5("i", { className: "mr-1 inline-block h-2 w-2 rounded-full border border-[var(--knowledge-edge)] border-dashed" }),
                t("graphLegendShared")
              ] }),
              /* @__PURE__ */ jsxs5("span", { children: [
                /* @__PURE__ */ jsx5("i", { className: "mr-1 inline-block h-[1px] w-3 align-middle bg-[var(--knowledge-edge)]" }),
                t("graphLegendDirect")
              ] }),
              /* @__PURE__ */ jsxs5("span", { children: [
                /* @__PURE__ */ jsx5("i", { className: "knowledge-graph-legend-directory mr-1 inline-block w-3 border-t border-dashed align-middle" }),
                t("graphLegendDirectory")
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx5(
            "aside",
            {
              className: `knowledge-node-drawer absolute right-3 top-16 bottom-12 z-20 w-[min(360px,calc(100%-24px))] overflow-y-auto rounded-xl p-4 transition duration-200 ${selectedNode || healthOn ? "is-open" : ""}`,
              "aria-label": selectedNode || !healthOn ? t("graphNodeCard") : t("graphHealth"),
              "aria-hidden": !selectedNode && !healthOn,
              children: selectedNode ? /* @__PURE__ */ jsxs5(Fragment2, { children: [
                /* @__PURE__ */ jsx5(
                  "button",
                  {
                    type: "button",
                    className: "absolute right-3 top-3 rounded-md px-2 py-1 text-xs text-ink-faint hover:bg-hover hover:text-ink",
                    onClick: () => setSelected(null),
                    "aria-label": t("graphDrawerClose"),
                    title: t("graphDrawerClose"),
                    children: "\xD7"
                  }
                ),
                /* @__PURE__ */ jsx5("p", { className: "text-[11px] uppercase tracking-[0.12em] text-ink-faint", children: t("graphSelectedNode") }),
                /* @__PURE__ */ jsx5("h4", { className: "mt-1 truncate text-xs font-semibold", children: selectedNode.title }),
                /* @__PURE__ */ jsx5("p", { className: "mt-1 break-all font-mono text-[11px] text-ink-faint", children: selectedNode.path }),
                /* @__PURE__ */ jsxs5("div", { className: "mt-2 flex flex-wrap gap-1", children: [
                  /* @__PURE__ */ jsx5("span", { className: "rounded border border-border px-2 py-0.5 text-xs text-ink-dim", children: categoryLabels[categoryOf(selectedNode)] }),
                  /* @__PURE__ */ jsx5("span", { className: "rounded border border-border px-2 py-0.5 text-xs text-ink-dim", children: t("graphLinks").replace("{count}", String(selectedNode.degree)) }),
                  /* @__PURE__ */ jsx5("span", { className: "rounded border border-border px-2 py-0.5 text-xs text-ink-dim", children: t("graphInDegree").replace("{count}", String(incoming.get(selectedNode.path) ?? 0)) }),
                  (clusterSizes.get(clusters.get(selectedNode.path) ?? 0) ?? 0) > 1 && /* @__PURE__ */ jsxs5("span", { className: "flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-ink-dim", children: [
                    /* @__PURE__ */ jsx5(
                      "i",
                      {
                        className: "inline-block h-2 w-2 rounded-full",
                        style: {
                          backgroundColor: clusterColor(
                            clusters.get(selectedNode.path) ?? 0,
                            clusterSizes.get(clusters.get(selectedNode.path) ?? 0) ?? 0
                          )
                        }
                      }
                    ),
                    t("graphCluster").replace("{count}", String((clusters.get(selectedNode.path) ?? 0) + 1))
                  ] })
                ] }),
                (findingsByPath.get(selectedNode.path) ?? []).map((kind) => /* @__PURE__ */ jsxs5(
                  "div",
                  {
                    className: "mt-3 rounded border border-border px-2 py-2 text-xs",
                    style: { borderColor: HEALTH_COLORS[kind] },
                    children: [
                      /* @__PURE__ */ jsx5("p", { className: "font-semibold", style: { color: HEALTH_COLORS[kind] }, children: t(HEALTH_COPY[kind].label) }),
                      /* @__PURE__ */ jsx5("p", { className: "mt-1 text-ink-dim", children: t(HEALTH_COPY[kind].hint) }),
                      /* @__PURE__ */ jsx5(
                        Button,
                        {
                          className: "mt-2",
                          size: "sm",
                          variant: "primary",
                          onClick: () => handOff(selectedNode.path, kind),
                          children: t("handOff")
                        }
                      )
                    ]
                  },
                  `finding-${kind}`
                )),
                /* @__PURE__ */ jsxs5("dl", { className: "mt-3 space-y-2 text-xs text-ink-dim", children: [
                  /* @__PURE__ */ jsxs5("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx5("dt", { children: t("graphOutgoing") }),
                    /* @__PURE__ */ jsx5("dd", { children: links?.outgoing.length ?? 0 })
                  ] }),
                  /* @__PURE__ */ jsxs5("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx5("dt", { children: t("graphIncoming") }),
                    /* @__PURE__ */ jsx5("dd", { children: links?.incoming.length ?? 0 })
                  ] }),
                  /* @__PURE__ */ jsxs5("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx5("dt", { children: t("graphHops") }),
                    /* @__PURE__ */ jsx5("dd", { children: neighbours.get(selected ?? "")?.size ? 1 : 0 })
                  ] })
                ] }),
                selectedNode.warnings?.length || selectedNode.mirrors?.length ? /* @__PURE__ */ jsx5("p", { className: "mt-3 rounded bg-hover px-2 py-2 text-xs text-warn", children: t("graphMirrorWarning").replace("{count}", String(selectedNode.mirrors?.length ?? 0)) }) : null,
                links && /* @__PURE__ */ jsxs5("div", { className: "mt-3 border-t border-border pt-2", children: [
                  /* @__PURE__ */ jsx5("p", { className: "text-xs font-semibold text-ink-dim", children: t("graphRelatedNotes") }),
                  [...links.outgoing, ...links.incoming].slice(0, 4).map((link) => /* @__PURE__ */ jsxs5(
                    "button",
                    {
                      type: "button",
                      className: "mt-1 block w-full truncate text-left text-[11px] text-ink-faint hover:text-ink",
                      onClick: () => setSelected(link.path),
                      children: [
                        link.exists ? "\u2197" : "\uFF0B",
                        " ",
                        link.title
                      ]
                    },
                    `${link.path}-${link.exists}`
                  ))
                ] }),
                /* @__PURE__ */ jsx5(
                  Button,
                  {
                    className: "mt-3 w-full",
                    size: "sm",
                    onClick: () => openKnowledgeNote(cwd, selectedNode.path, revision),
                    children: t("graphOpenNote")
                  }
                )
              ] }) : healthOn ? /* @__PURE__ */ jsxs5("div", { "data-testid": "knowledge-graph-health-list", children: [
                /* @__PURE__ */ jsx5(
                  "button",
                  {
                    type: "button",
                    className: "absolute right-3 top-3 rounded-md px-2 py-1 text-xs text-ink-faint hover:bg-hover hover:text-ink",
                    onClick: () => setHealthOn(false),
                    "aria-label": t("graphDrawerClose"),
                    title: t("graphDrawerClose"),
                    children: "\xD7"
                  }
                ),
                /* @__PURE__ */ jsx5("p", { className: "text-[11px] uppercase tracking-[0.12em] text-ink-faint", children: t("graphHealth") }),
                /* @__PURE__ */ jsx5("p", { className: "mt-1 text-[11px] leading-relaxed text-ink-faint", children: t("graphHealthIntro") }),
                findings.length === 0 && /* @__PURE__ */ jsx5("p", { className: "mt-3 text-xs text-ink-dim", children: t("graphHealthEmpty") }),
                HEALTH_ORDER.map((kind) => {
                  const rows = findings.filter((finding) => finding.kind === kind);
                  if (rows.length === 0) return null;
                  return /* @__PURE__ */ jsxs5("section", { className: "mt-3 border-t border-border pt-2", children: [
                    /* @__PURE__ */ jsxs5("p", { className: "flex items-center gap-2 text-xs font-semibold text-ink-dim", children: [
                      /* @__PURE__ */ jsx5(
                        "i",
                        {
                          className: "inline-block h-2 w-2 rounded-full",
                          style: { backgroundColor: HEALTH_COLORS[kind] }
                        }
                      ),
                      t(HEALTH_COPY[kind].label),
                      /* @__PURE__ */ jsx5("span", { className: "font-normal text-ink-faint", children: rows.length })
                    ] }),
                    rows.slice(0, 12).map((finding) => /* @__PURE__ */ jsx5(
                      "button",
                      {
                        type: "button",
                        className: "mt-1 block w-full truncate text-left text-[11px] text-ink-faint hover:text-ink",
                        title: finding.path,
                        onClick: () => {
                          setSelected(finding.path);
                          focusNode(finding.path);
                        },
                        children: nodeByPath.get(finding.path)?.title ?? finding.path
                      },
                      `${kind}-${finding.path}`
                    )),
                    rows.length > 12 && /* @__PURE__ */ jsx5("p", { className: "mt-1 text-[11px] text-ink-faint", children: t("graphMore").replace("{count}", String(rows.length - 12)) })
                  ] }, `health-${kind}`);
                })
              ] }) : /* @__PURE__ */ jsxs5("div", { className: "flex h-full min-h-[220px] flex-col justify-between", children: [
                /* @__PURE__ */ jsx5("p", { className: "text-[11px] uppercase tracking-[0.12em] text-ink-faint", children: t("graphSelectedNode") }),
                /* @__PURE__ */ jsx5("p", { className: "mt-3 text-[11px] leading-relaxed text-ink-faint", children: t("graphSelectHint") }),
                /* @__PURE__ */ jsx5("p", { className: "text-[11px] leading-relaxed text-ink-faint", children: t("graphCollisionHint") })
              ] })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs5("p", { className: "text-[11px] text-ink-faint", children: [
          t("graphHint"),
          " \xB7 ",
          t("graphShortcuts")
        ] })
      ]
    }
  );
}

// ui/knowledge/KnowledgeNetwork.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function KnowledgeNetwork({ cwd, sessionId }) {
  const t = useKnowledgeText();
  const language = useLanguage();
  const { data, error, loading } = useKnowledgeOverview(cwd, sessionId);
  const [busy, setBusy] = useState7(false);
  const binding = data?.binding;
  const revision = binding?.revision ?? 0;
  const indexKey = `${data?.index?.noteCount ?? 0}:${data?.index?.lastReconciledAt ?? ""}`;
  const [formalVault, setFormalVault] = useState7(null);
  const isDevelopment = formalVault !== null;
  useEffect7(() => {
    if (binding) return;
    let live = true;
    void getKnowledgeApi().formalKnowledgeVault().then(
      (path) => live && setFormalVault(path),
      () => live && setFormalVault(null)
    );
    return () => {
      live = false;
    };
  }, [binding]);
  async function startSetup(path) {
    if (!cwd) return;
    setBusy(true);
    try {
      await launchKnowledgeSetup(cwd, sessionId, path);
    } catch (cause) {
      reportKnowledgeError(cause);
    } finally {
      setBusy(false);
    }
  }
  async function connectExisting() {
    if (!cwd) return;
    setBusy(true);
    try {
      const path = await getKnowledgeApi().pickDirectory();
      if (path) await launchKnowledgeSetup(cwd, sessionId, path);
    } catch (cause) {
      reportKnowledgeError(cause);
    } finally {
      setBusy(false);
    }
  }
  if (loading && !data) {
    return /* @__PURE__ */ jsx6("section", { className: "space-y-3", "data-testid": "knowledge-network", "aria-label": t("network"), children: /* @__PURE__ */ jsx6("p", { role: "status", className: "text-xs text-ink-dim", children: t("loading") }) });
  }
  if (error) {
    return /* @__PURE__ */ jsx6("section", { className: "space-y-3", "data-testid": "knowledge-network", "aria-label": t("network"), children: /* @__PURE__ */ jsx6("p", { role: "alert", className: "rounded-lg border border-border p-3 text-xs text-err", children: error }) });
  }
  if (!binding) {
    return /* @__PURE__ */ jsx6("section", { className: "space-y-4", "data-testid": "knowledge-network", "aria-label": t("network"), children: /* @__PURE__ */ jsxs6("div", { className: "rounded-2xl border border-dashed border-border bg-surface p-6", children: [
      /* @__PURE__ */ jsx6("p", { className: "text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint", children: t("network") }),
      /* @__PURE__ */ jsx6("h2", { className: "mt-2 text-base font-semibold", children: t("networkUnboundTitle") }),
      /* @__PURE__ */ jsx6("p", { className: "mt-2 max-w-2xl text-xs leading-relaxed text-ink-dim", children: data?.enabled ? t("networkUnboundHint") : t("disabled") }),
      isDevelopment && /* @__PURE__ */ jsxs6("p", { className: "mt-3 rounded-lg bg-hover p-3 text-xs leading-relaxed text-ink-dim", children: [
        t("networkDevHint"),
        formalVault && /* @__PURE__ */ jsx6("span", { className: "mt-1 block font-mono text-[11px] text-ink-faint", children: formalVault })
      ] }),
      !cwd && /* @__PURE__ */ jsx6("p", { className: "mt-3 text-xs text-warn", children: t("selectProject") }),
      /* @__PURE__ */ jsxs6("div", { className: "mt-4 flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx6(
          Button,
          {
            size: "sm",
            variant: "primary",
            disabled: !cwd || !data?.enabled || busy,
            onClick: () => void connectExisting(),
            children: t("networkConnectExisting")
          }
        ),
        /* @__PURE__ */ jsx6(Button, { size: "sm", disabled: !cwd || !data?.enabled || busy, onClick: () => void startSetup(), children: t("networkCreate") }),
        formalVault && /* @__PURE__ */ jsx6(
          Button,
          {
            size: "sm",
            variant: "secondary",
            title: formalVault,
            disabled: !cwd || !data?.enabled || busy,
            onClick: () => void startSetup(formalVault),
            children: t("networkUseFormal")
          }
        )
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsx6("section", { "data-testid": "knowledge-network", "aria-label": t("network"), children: /* @__PURE__ */ jsxs6("div", { className: "knowledge-network-layout", children: [
    /* @__PURE__ */ jsx6(KnowledgeGraph, { cwd, revision, indexKey }),
    /* @__PURE__ */ jsxs6("aside", { className: "knowledge-network-changes", "aria-label": t("networkChanges"), children: [
      /* @__PURE__ */ jsxs6("div", { className: "knowledge-network-changes-head", children: [
        /* @__PURE__ */ jsx6("h2", { children: t("networkChanges") }),
        /* @__PURE__ */ jsxs6("span", { className: "knowledge-live-indicator", children: [
          /* @__PURE__ */ jsx6("i", { "aria-hidden": "true" }),
          t("networkLive")
        ] })
      ] }),
      data?.recentNotes?.length ? /* @__PURE__ */ jsx6("ul", { className: "knowledge-network-changes-list", children: data.recentNotes.slice(0, 8).map((note) => /* @__PURE__ */ jsxs6("li", { className: "knowledge-network-change", children: [
        /* @__PURE__ */ jsx6("span", { className: "knowledge-network-change-title", title: note.title, children: note.title }),
        /* @__PURE__ */ jsx6("span", { className: "knowledge-network-change-source", title: note.path, children: t("networkChangeSource").replace("{time}", relativeTime(note.updatedAt, language)).replace("{source}", note.path) })
      ] }, note.path)) }) : /* @__PURE__ */ jsx6("p", { className: "knowledge-network-changes-empty", children: t("networkChangesEmpty") })
    ] })
  ] }) });
}

// ui/knowledge/KnowledgeNoteViewer.tsx
import { useEffect as useEffect8, useState as useState8 } from "react";

// ui/knowledge/note-display.ts
var FRONTMATTER = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/u;
function noteDisplayText(raw) {
  let text = raw.replace(/^﻿/u, "").replace(FRONTMATTER, "").replace(/^\s+/u, "");
  text = text.replace(/^<!-- pi-agent:managed:(?:start|end) -->[ \t]*\n?/gmu, "");
  const title = text.match(/^#[ \t]+([^\n]+)\n/u);
  if (!title?.[1]) return text;
  const head = title[0];
  let rest = text.slice(head.length).replace(/^\s+/u, "").replace(FRONTMATTER, "").replace(/^\s+/u, "");
  const repeated = rest.match(/^#[ \t]+([^\n]+)(?:\n|$)/u);
  if (repeated?.[1]) {
    const a = title[1].trim();
    const b = repeated[1].trim();
    if (a === b || a.startsWith(b) || b.startsWith(a))
      rest = rest.slice(repeated[0].length).replace(/^\s+/u, "");
  }
  return `${head}
${rest}`;
}

// ui/knowledge/KnowledgeNoteViewer.tsx
import { Fragment as Fragment3, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function KnowledgeNoteViewer({
  cwd,
  revision,
  path,
  onClose
}) {
  const t = useKnowledgeText();
  const [line, setLine] = useState8(1), [note, setNote] = useState8(null), [error, setError] = useState8(null), [loading, setLoading] = useState8(false);
  useEffect8(() => setLine(1), []);
  useEffect8(() => {
    let live = true;
    setLoading(true);
    setNote(null);
    setError(null);
    void getKnowledgeApi().readKnowledgeNote({ cwd, path, startLine: line, revision }).then(
      (value) => {
        if (live) setNote(value);
      },
      (e) => {
        if (live) setError(String(e.message || e));
      }
    ).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [cwd, path, line, revision]);
  return /* @__PURE__ */ jsxs7(
    "section",
    {
      className: "rounded-xl border border-border bg-surface p-3",
      "aria-label": t("viewNote"),
      "data-testid": "knowledge-note",
      children: [
        /* @__PURE__ */ jsxs7("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsxs7("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx7("h4", { className: "text-xs font-semibold", children: t("viewNote") }),
            /* @__PURE__ */ jsx7("p", { className: "mt-1 break-all font-mono text-[11px] text-ink-dim", children: path })
          ] }),
          /* @__PURE__ */ jsx7(Button, { size: "sm", onClick: onClose, "aria-label": t("close"), children: "\xD7" })
        ] }),
        /* @__PURE__ */ jsx7("p", { className: "my-2 text-xs text-ink-dim", children: t("uiRead") }),
        loading && /* @__PURE__ */ jsx7("p", { role: "status", className: "text-xs", children: t("loading") }),
        error && /* @__PURE__ */ jsx7("p", { role: "alert", className: "whitespace-pre-wrap break-words text-xs text-err", children: error }),
        note?.missing && /* @__PURE__ */ jsx7("p", { className: "text-xs text-warn", children: t("missing") }),
        note?.text && /* @__PURE__ */ jsxs7(Fragment3, { children: [
          /* @__PURE__ */ jsxs7("p", { className: "mb-1 font-mono text-[11px] text-ink-faint", children: [
            "L",
            note.startLine,
            "\u2013",
            note.endLine,
            " \xB7 ",
            note.hash?.slice(0, 12),
            " ",
            note.truncated ? ` \xB7 ${t("truncated")}` : ""
          ] }),
          /* @__PURE__ */ jsxs7("div", { className: "max-h-80 overflow-auto rounded-lg bg-hover p-3", children: [
            legacyEvidenceNotice(note.text) && /* @__PURE__ */ jsx7(
              "p",
              {
                "data-testid": "legacy-evidence-status",
                className: "mb-2 rounded border border-border p-2 text-xs text-warn",
                children: legacyEvidenceNotice(note.text)
              }
            ),
            /* @__PURE__ */ jsx7(Markdown, { text: noteDisplayText(note.displayText || note.text) })
          ] })
        ] }),
        note?.displayLinkBase && /* @__PURE__ */ jsxs7("p", { className: "my-2 break-words text-[11px] text-ink-faint", children: [
          t("linkPreviewOnly"),
          " ",
          note.displayLinkBase
        ] }),
        note?.humanReview?.text && /* @__PURE__ */ jsxs7("details", { className: "mt-2 text-xs", children: [
          /* @__PURE__ */ jsx7("summary", { className: "cursor-pointer font-medium", children: t("humanReview") }),
          /* @__PURE__ */ jsx7("pre", { className: "mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-ink-2", children: note.humanReview.text })
        ] }),
        note && !note.missing && /* @__PURE__ */ jsx7(KnowledgeLinks, { cwd, path, revision }),
        /* @__PURE__ */ jsxs7("div", { className: "mt-2 flex flex-wrap gap-1", children: [
          line > 1 && /* @__PURE__ */ jsx7(Button, { size: "sm", onClick: () => setLine(1), children: t("readBack") }),
          note?.truncated && note.endLine < (note.totalLines || 0) && note.endLine >= line && /* @__PURE__ */ jsx7(Button, { size: "sm", onClick: () => setLine(note.endLine + 1), children: t("readMore") }),
          /* @__PURE__ */ jsx7(
            Button,
            {
              size: "sm",
              disabled: loading || note?.missing,
              onClick: () => void getKnowledgeApi().openKnowledgeTarget({ cwd, path, revision }).catch((e) => setError(String(e.message || e))),
              children: t("openObsidian")
            }
          )
        ] })
      ]
    }
  );
}

// ui/knowledge/KnowledgePanel.tsx
import { useEffect as useEffect16, useState as useState17 } from "react";

// ui/knowledge/KnowledgeCloudSection.tsx
import { useCallback as useCallback3, useEffect as useEffect9, useState as useState9 } from "react";
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
var MODE_COPY_KEYS = {
  disabled: "cloudModeDisabled",
  unchecked: "cloudModeUnchecked",
  offline: "cloudModeOffline",
  unauthorized: "cloudModeUnauthorized",
  "read-only": "cloudModeReadOnly",
  ready: "cloudModeReady",
  error: "cloudModeError"
};
function modeLabel(mode, t) {
  return t(MODE_COPY_KEYS[mode]);
}
function isNotFound(error) {
  return /not.?found|不存在|404/u.test(error instanceof Error ? error.message : String(error));
}
function compactText(text, max = 7e3) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}
\u2026` : text;
}
function comparison(local, remote, remoteMissing) {
  if (local?.hash && remote?.hash && local.hash === remote.hash) return "same";
  if (local && remote) return "conflict";
  if (local && remoteMissing) return "local-only";
  if (!local && remote) return "remote-only";
  return "unavailable";
}
function KnowledgeCloudSection({
  cwd,
  bindingRevision
}) {
  const t = useKnowledgeText();
  const [status, setStatus] = useState9(null);
  const [busy, setBusy] = useState9(null);
  const [password, setPassword] = useState9("");
  const [error, setError] = useState9(null);
  const [query, setQuery] = useState9("");
  const [searchResult, setSearchResult] = useState9(null);
  const [selectedPath, setSelectedPath] = useState9(null);
  const [localNote, setLocalNote] = useState9(null);
  const [remoteNote, setRemoteNote] = useState9(null);
  const [remoteMissing, setRemoteMissing] = useState9(false);
  const [remoteError, setRemoteError] = useState9(null);
  const [syncResult, setSyncResult] = useState9(null);
  const refresh = useCallback3(async () => {
    try {
      setStatus(await getKnowledgeApi().getKnowledgeCloudStatus());
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    }
  }, []);
  useEffect9(() => {
    void refresh();
  }, [refresh]);
  async function run(kind) {
    setBusy(kind);
    setError(null);
    try {
      setStatus(
        await (kind === "probe" ? getKnowledgeApi().probeKnowledgeCloud() : getKnowledgeApi().initializeKnowledgeCloud())
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(null);
    }
  }
  async function savePassword(value) {
    setBusy("password");
    setError(null);
    try {
      setStatus(await getKnowledgeApi().setKnowledgeCloudPassword({ password: value }));
      setPassword("");
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    } finally {
      setBusy(null);
    }
  }
  async function searchNotes() {
    if (!bindingRevision || !query.trim()) return;
    setBusy("search");
    setError(null);
    try {
      setSearchResult(await getKnowledgeApi().searchKnowledge({ cwd, bindingRevision, query: query.trim(), limit: 8 }));
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(null);
    }
  }
  async function preview(path) {
    if (!bindingRevision) return;
    setSelectedPath(path);
    setLocalNote(null);
    setRemoteNote(null);
    setRemoteMissing(false);
    setRemoteError(null);
    setSyncResult(null);
    setBusy("preview");
    setError(null);
    const [local, remote] = await Promise.allSettled([
      getKnowledgeApi().readKnowledgeNote({ cwd, path, startLine: 1, revision: bindingRevision }),
      getKnowledgeApi().readKnowledgeCloudNote({ path })
    ]);
    if (local.status === "fulfilled" && !local.value.missing) setLocalNote(local.value);
    else if (local.status === "rejected")
      setError(local.reason instanceof Error ? local.reason.message : String(local.reason));
    if (remote.status === "fulfilled") setRemoteNote(remote.value);
    else if (isNotFound(remote.reason)) setRemoteMissing(true);
    else setRemoteError(remote.reason instanceof Error ? remote.reason.message : String(remote.reason));
    setBusy(null);
  }
  async function sync(mode, resolution) {
    if (!bindingRevision || !selectedPath) return;
    if (resolution) {
      const label = t(resolution === "local" ? "cloudResolveLocal" : "cloudResolveRemote");
      if (!window.confirm(`${label}?`)) return;
    }
    setBusy("sync");
    setError(null);
    try {
      const result = await getKnowledgeApi().syncKnowledgeCloud({
        cwd,
        mode,
        bindingRevision,
        paths: [selectedPath],
        previews: [
          {
            path: selectedPath,
            localHash: localNote?.hash ?? null,
            remoteHash: remoteNote?.hash ?? null,
            remoteVersion: remoteNote?.version ?? null
          }
        ],
        ...resolution ? { resolution } : {}
      });
      await preview(selectedPath);
      setSyncResult(result);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy(null);
    }
  }
  if (!status) return null;
  const state = comparison(localNote, remoteNote, remoteMissing);
  const canOperate = Boolean(bindingRevision && status.mode === "ready" && selectedPath && !busy);
  return /* @__PURE__ */ jsxs8("section", { className: "knowledge-cloud-section space-y-3", "data-testid": "knowledge-cloud", children: [
    /* @__PURE__ */ jsxs8("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsx8("h3", { className: "text-xs font-semibold", children: t("cloudTitle") }),
      /* @__PURE__ */ jsx8("span", { className: `text-xs ${status.mode === "ready" ? "text-ok" : "text-warn"}`, role: "status", children: modeLabel(status.mode, t) })
    ] }),
    /* @__PURE__ */ jsx8("p", { className: "text-xs leading-relaxed text-ink-dim", children: t("cloudManualSyncNotice") }),
    /* @__PURE__ */ jsxs8("dl", { className: "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs", children: [
      /* @__PURE__ */ jsx8("dt", { className: "text-ink-dim", children: t("cloudEndpoint") }),
      /* @__PURE__ */ jsx8("dd", { className: "break-all font-mono", children: status.endpoint }),
      /* @__PURE__ */ jsx8("dt", { className: "text-ink-dim", children: t("cloudFolder") }),
      /* @__PURE__ */ jsx8("dd", { className: "font-mono", children: status.folder })
    ] }),
    /* @__PURE__ */ jsxs8(
      "form",
      {
        className: "flex flex-wrap items-center gap-2",
        onSubmit: (event) => {
          event.preventDefault();
          if (password) void savePassword(password);
        },
        children: [
          /* @__PURE__ */ jsx8("label", { className: "text-xs text-ink-dim", htmlFor: "knowledge-cloud-password", children: t("cloudPassword") }),
          /* @__PURE__ */ jsx8(
            "input",
            {
              id: "knowledge-cloud-password",
              type: "password",
              autoComplete: "off",
              maxLength: 256,
              value: password,
              onChange: (event) => setPassword(event.target.value),
              placeholder: t("cloudPasswordPlaceholder"),
              className: "min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 font-mono text-[11px]"
            }
          ),
          /* @__PURE__ */ jsx8(Button, { size: "sm", type: "submit", disabled: busy !== null || !password, children: t("cloudPasswordSave") }),
          /* @__PURE__ */ jsx8(
            Button,
            {
              size: "sm",
              type: "button",
              disabled: busy !== null || status.passwordSource !== "saved",
              onClick: () => void savePassword(null),
              children: t("cloudPasswordClear")
            }
          )
        ]
      }
    ),
    status.passwordSource === "saved" && /* @__PURE__ */ jsx8("p", { className: "text-xs text-ink-dim", children: t("cloudPasswordSaved") }),
    status.passwordSource === "env" && /* @__PURE__ */ jsx8("p", { className: "text-xs text-ink-dim", children: t("cloudPasswordEnv") }),
    /* @__PURE__ */ jsxs8("details", { className: "rounded-lg bg-hover px-3 py-2 text-xs", children: [
      /* @__PURE__ */ jsx8(
        "summary",
        {
          className: `cursor-pointer select-none ${status.warnings.length ? "text-warn" : "text-ink-dim"}`,
          children: status.warnings.length ? t("cloudNotesWarning").replace("{count}", String(status.warnings.length)) : t("cloudNotesTitle")
        }
      ),
      /* @__PURE__ */ jsxs8("ul", { className: "mt-2 space-y-2 leading-relaxed text-ink-dim", children: [
        /* @__PURE__ */ jsx8("li", { children: t("cloudHint") }),
        status.message ? /* @__PURE__ */ jsx8("li", { className: "break-words", children: status.message }) : null,
        status.warnings.map((warning) => /* @__PURE__ */ jsx8("li", { className: "break-words", children: warning }, warning))
      ] })
    ] }),
    /* @__PURE__ */ jsxs8("div", { className: "flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsx8(Button, { size: "sm", disabled: busy !== null, onClick: () => void run("probe"), children: busy === "probe" ? t("loading") : t("cloudProbe") }),
      /* @__PURE__ */ jsx8(
        Button,
        {
          size: "sm",
          disabled: busy !== null || status.initialized,
          onClick: () => void run("initialize"),
          children: busy === "initialize" ? t("loading") : t("cloudInitialize")
        }
      )
    ] }),
    bindingRevision ? /* @__PURE__ */ jsxs8("div", { className: "space-y-2 rounded-lg border border-border bg-surface/40 p-3", children: [
      /* @__PURE__ */ jsxs8("div", { className: "flex items-center justify-between gap-2", children: [
        /* @__PURE__ */ jsx8("h4", { className: "text-xs font-semibold", children: t("cloudSyncTitle") }),
        /* @__PURE__ */ jsx8("span", { className: "text-[11px] text-ink-faint", children: t("cloudSyncStepHint") })
      ] }),
      /* @__PURE__ */ jsxs8(
        "form",
        {
          className: "flex gap-2",
          onSubmit: (event) => {
            event.preventDefault();
            void searchNotes();
          },
          children: [
            /* @__PURE__ */ jsx8(
              "input",
              {
                "aria-label": t("cloudSearchLabel"),
                value: query,
                onChange: (event) => setQuery(event.target.value),
                placeholder: t("cloudSearchPlaceholder"),
                className: "min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-2 text-xs"
              }
            ),
            /* @__PURE__ */ jsx8(Button, { size: "sm", type: "submit", disabled: busy !== null || !query.trim(), children: busy === "search" ? t("loading") : t("cloudSearch") })
          ]
        }
      ),
      searchResult && /* @__PURE__ */ jsx8("ul", { className: "max-h-40 divide-y divide-border overflow-auto rounded-md border border-border", children: searchResult.hits.length ? searchResult.hits.map((hit) => /* @__PURE__ */ jsx8("li", { children: /* @__PURE__ */ jsxs8(
        "button",
        {
          type: "button",
          className: "w-full px-3 py-2 text-left hover:bg-hover",
          onClick: () => void preview(hit.path),
          children: [
            /* @__PURE__ */ jsx8("span", { className: "block truncate text-xs font-medium", children: hit.title || hit.path }),
            /* @__PURE__ */ jsx8("span", { className: "block truncate font-mono text-[11px] text-ink-faint", children: hit.path })
          ]
        }
      ) }, hit.path)) : /* @__PURE__ */ jsx8("li", { className: "px-3 py-2 text-[11px] text-ink-faint", children: t("homeSearchEmpty") }) }),
      selectedPath && /* @__PURE__ */ jsxs8("div", { className: "space-y-2 rounded-md border border-border p-3", children: [
        /* @__PURE__ */ jsxs8("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsx8("span", { className: "min-w-0 truncate font-mono text-[11px]", title: selectedPath, children: selectedPath }),
          busy === "preview" ? /* @__PURE__ */ jsx8("span", { className: "text-[11px] text-ink-faint", children: t("loading") }) : /* @__PURE__ */ jsx8("span", { className: "text-xs text-ink-dim", children: t(
            `cloudCompare${state === "same" ? "Same" : state === "conflict" ? "Conflict" : state === "local-only" ? "LocalOnly" : state === "remote-only" ? "RemoteOnly" : "Unavailable"}`
          ) })
        ] }),
        remoteError && /* @__PURE__ */ jsx8("p", { className: "text-xs text-err", children: remoteError }),
        state === "conflict" && /* @__PURE__ */ jsxs8("div", { className: "grid gap-2 md:grid-cols-2", children: [
          /* @__PURE__ */ jsxs8("div", { children: [
            /* @__PURE__ */ jsx8("p", { className: "mb-1 text-[11px] uppercase tracking-wide text-ink-faint", children: t("cloudLocalVersion") }),
            /* @__PURE__ */ jsx8("pre", { className: "max-h-40 overflow-auto whitespace-pre-wrap rounded bg-hover p-2 text-xs", children: compactText(localNote?.text) })
          ] }),
          /* @__PURE__ */ jsxs8("div", { children: [
            /* @__PURE__ */ jsx8("p", { className: "mb-1 text-[11px] uppercase tracking-wide text-ink-faint", children: t("cloudRemoteVersion") }),
            /* @__PURE__ */ jsx8("pre", { className: "max-h-40 overflow-auto whitespace-pre-wrap rounded bg-hover p-2 text-xs", children: compactText(remoteNote?.text) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs8("div", { className: "flex flex-wrap gap-2", children: [
          state !== "conflict" && /* @__PURE__ */ jsx8(Button, { size: "sm", disabled: !canOperate || !localNote, onClick: () => void sync("push"), children: t("cloudPush") }),
          state !== "conflict" && /* @__PURE__ */ jsx8(Button, { size: "sm", disabled: !canOperate || !remoteNote, onClick: () => void sync("pull"), children: t("cloudPull") }),
          state === "conflict" && /* @__PURE__ */ jsx8(
            Button,
            {
              size: "sm",
              disabled: !canOperate || !remoteNote,
              onClick: () => void sync("push", "local"),
              children: t("cloudResolveLocal")
            }
          ),
          state === "conflict" && /* @__PURE__ */ jsx8(
            Button,
            {
              size: "sm",
              disabled: !canOperate || !remoteNote,
              onClick: () => void sync("pull", "remote"),
              children: t("cloudResolveRemote")
            }
          )
        ] })
      ] }),
      syncResult && /* @__PURE__ */ jsx8("p", { className: "text-xs text-ink-dim", children: syncResult.items[0]?.message || (syncResult.completed ? t("cloudSyncDone") : t("cloudSyncNeedsReview")) })
    ] }) : /* @__PURE__ */ jsx8("p", { className: "text-[11px] text-ink-faint", children: t("cloudSyncNeedsBinding") }),
    error && /* @__PURE__ */ jsx8("p", { role: "alert", className: "break-words text-xs text-err", children: error })
  ] });
}

// ui/knowledge/KnowledgeMaintenance.tsx
import { useEffect as useEffect10, useState as useState10 } from "react";
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
function KnowledgeMaintenance({
  cwd,
  revision,
  index
}) {
  const t = useKnowledgeText(), nonce = useKnowledgeStore((s) => s.revision);
  const [offset, setOffset] = useState10(0), [page, setPage] = useState10(null), [busy, setBusy] = useState10(false), [loading, setLoading] = useState10(false);
  const [error, setError] = useState10(null), [message, setMessage] = useState10(null), [confirm, setConfirm] = useState10(false);
  const [automatic, setAutomatic] = useState10({
    enabled: false,
    maxItems: 5,
    dailyLimit: 20,
    model: null
  });
  const models = useSessionsStore((s) => s.models);
  const [runs, setRuns] = useState10([]);
  const [expandedRun, setExpandedRun] = useState10(null);
  useEffect10(() => {
    setOffset(0);
    setPage(null);
    setMessage(null);
    setError(null);
    setConfirm(false);
  }, []);
  useEffect10(() => {
    let live = true;
    setLoading(true);
    void getKnowledgeApi().getKnowledgeJobs({ cwd, revision, offset, limit: 20 }).then(
      (value) => {
        if (live) setPage(value);
      },
      (e) => {
        if (live) setError(String(e.message || e));
      }
    ).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [cwd, revision, offset, nonce]);
  useEffect10(() => {
    let live = true;
    void Promise.all([getKnowledgeApi().getKnowledgeMaintenanceSettings(), getKnowledgeApi().getKnowledgeMaintenanceRuns()]).then(([settings, history]) => {
      if (!live) return;
      setAutomatic({ ...settings, model: settings.model ?? null });
      setRuns(history);
    }).catch((e) => live && setError(String(e?.message || e)));
    return () => {
      live = false;
    };
  }, [nonce]);
  function handOff(notePath) {
    useSessionsStore.getState().createDraftSession(cwd ?? void 0);
    const id = useSessionsStore.getState().activeSessionId;
    if (!id) return;
    useDraftStore.getState().updateDraft(id, (entry) => ({
      ...entry,
      text: t("handOffPrompt").replace("{path}", notePath)
    }));
    useKnowledgeStore.getState().close();
    useUiStore.getState().setView("chat");
    window.dispatchEvent(new Event(COMPOSER_FOCUS_EVENT));
  }
  async function run(action) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setConfirm(false);
    try {
      const result = await getKnowledgeApi().maintainKnowledge({ cwd, revision, action });
      const failed = result.navigation?.filter((row) => row.error).map((row) => row.error).join("\n");
      if (failed) setError(failed);
      else setMessage(t("maintenanceDone"));
      useKnowledgeStore.getState().invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveAutomatic(next) {
    setAutomatic(next);
    try {
      await getKnowledgeApi().saveKnowledgeMaintenanceSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function runAutomatic() {
    setBusy(true);
    setError(null);
    try {
      const run2 = await getKnowledgeApi().runKnowledgeMaintenance({ cwd: cwd || "" });
      setRuns((current) => [run2, ...current]);
      setMessage(t("automaticMaintenanceDone"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const latestRun = runs[0];
  return /* @__PURE__ */ jsxs9("div", { className: "space-y-4", "data-testid": "knowledge-maintenance", children: [
    /* @__PURE__ */ jsxs9("section", { className: "rounded-xl border border-border p-3", "data-testid": "automatic-knowledge-maintenance", children: [
      /* @__PURE__ */ jsxs9("div", { className: "flex items-center justify-between gap-2", children: [
        /* @__PURE__ */ jsxs9("div", { children: [
          /* @__PURE__ */ jsx9("h4", { className: "text-xs font-semibold", children: t("automaticMaintenance") }),
          /* @__PURE__ */ jsx9("p", { className: "mt-1 text-[11px] text-ink-dim", children: t("automaticMaintenanceHint") })
        ] }),
        /* @__PURE__ */ jsx9(Button, { size: "sm", onClick: () => void saveAutomatic({ ...automatic, enabled: !automatic.enabled }), children: automatic.enabled ? t("disable") : t("enable") })
      ] }),
      /* @__PURE__ */ jsxs9("div", { className: "mt-3 flex flex-wrap items-center gap-2 text-xs", children: [
        /* @__PURE__ */ jsxs9("label", { children: [
          t("maintenanceModel"),
          " ",
          /* @__PURE__ */ jsxs9(
            "select",
            {
              className: "rounded border border-border bg-transparent px-1",
              value: automatic.model ?? "",
              onChange: (e) => void saveAutomatic({ ...automatic, model: e.target.value || null }),
              children: [
                /* @__PURE__ */ jsx9("option", { value: "", children: t("maintenanceModelDefault") }),
                models.map((model) => /* @__PURE__ */ jsx9("option", { value: `${model.provider}/${model.id}`, children: model.label || model.id }, `${model.provider}/${model.id}`))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxs9("label", { children: [
          t("maintenanceItems"),
          " ",
          /* @__PURE__ */ jsx9(
            "input",
            {
              className: "ml-1 w-16 rounded border border-border bg-transparent px-1",
              type: "number",
              min: 1,
              max: 50,
              value: automatic.maxItems,
              onChange: (e) => setAutomatic({ ...automatic, maxItems: Number(e.target.value) || 1 }),
              onBlur: () => void saveAutomatic(automatic)
            }
          )
        ] }),
        /* @__PURE__ */ jsxs9("label", { children: [
          t("maintenanceDailyLimit"),
          " ",
          /* @__PURE__ */ jsx9(
            "input",
            {
              className: "ml-1 w-16 rounded border border-border bg-transparent px-1",
              type: "number",
              min: 1,
              max: 100,
              value: automatic.dailyLimit,
              onChange: (e) => setAutomatic({ ...automatic, dailyLimit: Number(e.target.value) || 1 }),
              onBlur: () => void saveAutomatic(automatic)
            }
          )
        ] }),
        /* @__PURE__ */ jsx9(
          Button,
          {
            size: "sm",
            variant: "primary",
            disabled: busy || !automatic.enabled,
            onClick: () => void runAutomatic(),
            children: t("runAutomaticMaintenance")
          }
        )
      ] }),
      latestRun && /* @__PURE__ */ jsxs9("div", { className: "mt-2 text-[11px] text-ink-faint", children: [
        /* @__PURE__ */ jsxs9(
          "button",
          {
            type: "button",
            className: "underline",
            onClick: () => setExpandedRun((current) => current === latestRun.startedAt ? null : latestRun.startedAt),
            children: [
              t("lastAutomaticMaintenance"),
              ": ",
              latestRun.processed,
              " \xB7 ",
              latestRun.modelCalls
            ]
          }
        ),
        expandedRun === latestRun.startedAt && /* @__PURE__ */ jsx9("ul", { className: "mt-2 space-y-1 text-ink-dim", children: latestRun.items.map((item) => /* @__PURE__ */ jsxs9("li", { className: "flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsxs9("span", { className: "truncate", children: [
            item.kind,
            " \xB7 ",
            item.status,
            item.reason ? ` \xB7 ${item.reason}` : ""
          ] }),
          /* @__PURE__ */ jsx9(
            "button",
            {
              type: "button",
              className: "shrink-0 underline",
              onClick: () => void getKnowledgeApi().openKnowledgeTarget({ cwd, path: item.id, revision }),
              children: t("openTarget")
            }
          )
        ] }, item.id)) })
      ] })
    ] }),
    /* @__PURE__ */ jsx9("p", { className: "text-xs leading-relaxed text-ink-dim", children: t("maintenanceHint") }),
    /* @__PURE__ */ jsxs9("div", { className: "flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsx9(Button, { className: "border border-border", disabled: busy, onClick: () => void run("reconcile"), children: t("buildIndex") }),
      /* @__PURE__ */ jsx9(Button, { className: "border border-border", disabled: busy, onClick: () => setConfirm(true), children: t("refreshNavigation") })
    ] }),
    confirm && /* @__PURE__ */ jsxs9("div", { className: "rounded-xl border border-border p-3", children: [
      /* @__PURE__ */ jsx9("p", { className: "text-xs", children: t("confirmNavigation") }),
      /* @__PURE__ */ jsxs9("div", { className: "mt-2 flex justify-end gap-2", children: [
        /* @__PURE__ */ jsx9(Button, { onClick: () => setConfirm(false), children: t("close") }),
        /* @__PURE__ */ jsx9(Button, { variant: "primary", onClick: () => void run("refresh-navigation"), children: t("refreshNavigation") })
      ] })
    ] }),
    busy && /* @__PURE__ */ jsx9("p", { role: "status", className: "text-xs", children: t("maintenanceBusy") }),
    message && /* @__PURE__ */ jsx9("p", { role: "status", className: "rounded-lg bg-hover p-2 text-xs", children: message }),
    error && /* @__PURE__ */ jsx9("p", { role: "alert", className: "whitespace-pre-wrap break-words text-xs text-err", children: error }),
    !!index?.problems.length && /* @__PURE__ */ jsxs9("section", { className: "rounded-xl border border-border p-3", children: [
      /* @__PURE__ */ jsx9("h4", { className: "text-xs font-semibold", children: t("problems") }),
      /* @__PURE__ */ jsx9("p", { className: "mt-1 text-xs text-ink-dim", children: t("problemHint") }),
      /* @__PURE__ */ jsx9("ul", { className: "mt-2 max-h-48 overflow-auto space-y-2", children: index.problems.map((item) => /* @__PURE__ */ jsxs9("li", { className: "break-words text-xs", children: [
        /* @__PURE__ */ jsx9("span", { className: "block font-mono text-[11px]", children: item.path }),
        /* @__PURE__ */ jsx9("span", { className: "text-warn", children: item.message })
      ] }, item.path)) })
    ] }),
    /* @__PURE__ */ jsxs9("section", { children: [
      /* @__PURE__ */ jsxs9("div", { className: "mb-2 flex items-center justify-between", children: [
        /* @__PURE__ */ jsxs9("h4", { className: "text-xs font-semibold", children: [
          t("jobs"),
          " \xB7 ",
          page?.total ?? "\u2014"
        ] }),
        loading && /* @__PURE__ */ jsx9("span", { role: "status", className: "text-[11px] text-ink-faint", children: t("loading") })
      ] }),
      /* @__PURE__ */ jsx9("div", { className: "max-h-72 space-y-1 overflow-auto", children: page?.items.map((item) => /* @__PURE__ */ jsxs9(
        "div",
        {
          className: "flex items-start justify-between gap-2 rounded-lg border border-border p-3",
          children: [
            /* @__PURE__ */ jsxs9("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsx9("p", { className: "text-xs font-medium", children: item.kind === "navigation" ? t("navigationJob") : item.kind === "wiki-review" ? t("wikiReview") : t("evidenceReview") }),
              /* @__PURE__ */ jsx9("p", { className: "mt-1 break-all font-mono text-[11px] text-ink-dim", children: item.path }),
              item.kind !== "navigation" && /* @__PURE__ */ jsx9("p", { className: "mt-1 text-[11px] text-ink-faint", children: t("manualReview") })
            ] }),
            /* @__PURE__ */ jsxs9("div", { className: "flex shrink-0 gap-1", children: [
              item.kind !== "navigation" ? /* @__PURE__ */ jsx9(Button, { size: "sm", variant: "primary", onClick: () => handOff(item.path), children: t("handOff") }) : null,
              /* @__PURE__ */ jsx9(
                Button,
                {
                  size: "sm",
                  onClick: () => useKnowledgeStore.getState().open({ cwd, sessionId: null, tab: "reviews", note: item.path, noteRevision: revision }),
                  children: t("openSource")
                }
              )
            ] })
          ]
        },
        item.key
      )) }),
      page && !page.items.length && !loading && /* @__PURE__ */ jsx9(StatePanel, { compact: true, title: t("empty") }),
      /* @__PURE__ */ jsxs9("div", { className: "mt-2 flex justify-between", children: [
        /* @__PURE__ */ jsx9(Button, { size: "sm", disabled: !offset || loading, onClick: () => setOffset(Math.max(0, offset - 20)), children: t("previous") }),
        /* @__PURE__ */ jsx9(
          Button,
          {
            size: "sm",
            disabled: page?.nextOffset == null || loading,
            onClick: () => setOffset(page?.nextOffset ?? 0),
            children: t("next")
          }
        )
      ] })
    ] })
  ] });
}

// ui/knowledge/KnowledgeSpecialists.tsx
import { useState as useState11 } from "react";
import { jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
function KnowledgeSpecialists({
  settings,
  bindingRevision,
  permitted,
  refresh,
  runs = []
}) {
  const t = useKnowledgeText();
  const [busy, setBusy] = useState11(false), [error, setError] = useState11(null);
  const prefs = useSettingsStore((s) => s.modelPrefs);
  const setSubagentModel = useSettingsStore((s) => s.setSubagentModel);
  const setSubagentThinking = useSettingsStore((s) => s.setSubagentThinking);
  const models = useSessionsStore((s) => s.models);
  async function change(mode) {
    if (!settings) return;
    setBusy(true);
    setError(null);
    try {
      await getKnowledgeApi().setKnowledgeSpecialistSettings({ mode, revision: settings.revision, bindingRevision });
      await refresh();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsxs10("section", { className: "rounded-xl border border-border p-4", "data-testid": "knowledge-specialists-settings", children: [
    /* @__PURE__ */ jsxs10("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsx10("h3", { className: "text-xs font-semibold", children: t("specialists") }),
      /* @__PURE__ */ jsxs10(
        "select",
        {
          "aria-label": t("specialistMode"),
          value: settings?.mode || "off",
          disabled: busy || !settings || !permitted,
          onChange: (e) => void change(e.target.value),
          className: "rounded-lg border border-border bg-surface px-2 py-1 text-xs",
          children: [
            /* @__PURE__ */ jsx10("option", { value: "automatic", children: t("specialistAuto") }),
            /* @__PURE__ */ jsx10("option", { value: "manual", children: t("specialistManual") }),
            /* @__PURE__ */ jsx10("option", { value: "off", children: t("specialistOff") })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx10("p", { className: "mt-2 text-xs leading-relaxed text-ink-dim", children: t("specialistCost") }),
    !permitted && /* @__PURE__ */ jsx10("p", { className: "mt-2 text-xs text-warn", children: t("specialistDenied") }),
    error && /* @__PURE__ */ jsx10("p", { role: "alert", className: "mt-2 break-words text-xs text-err", children: error }),
    /* @__PURE__ */ jsx10("div", { className: "mt-3 grid gap-3", "data-testid": "knowledge-specialist-cards", children: PROTECTED_KNOWLEDGE_AGENTS.map((agent) => {
      const selected = prefs?.subagentModels[agent.name] ?? "";
      const selectedThinking = prefs?.subagentThinking[agent.name] ?? "";
      const selectedModel = models.find((m) => `${m.provider}/${m.id}` === selected);
      const supportedThinking = selectedModel?.thinkingLevels?.length ? selectedModel.thinkingLevels : SUBAGENT_THINKING_LEVELS;
      const last = [...runs].reverse().find((run) => run.role === agent.role);
      const trigger = agent.role === "reviewer" ? t("specialistTriggerReview") : settings?.mode === "automatic" ? t("specialistAuto") : settings?.mode === "manual" ? t("specialistManual") : t("specialistOff");
      return /* @__PURE__ */ jsxs10("article", { className: "rounded-xl border border-border bg-hover/30 p-3", children: [
        /* @__PURE__ */ jsxs10("div", { className: "flex items-start justify-between gap-2", children: [
          /* @__PURE__ */ jsxs10("div", { children: [
            /* @__PURE__ */ jsx10("strong", { className: "text-[12px]", children: t(`specialist_${agent.role}`) }),
            /* @__PURE__ */ jsx10("p", { className: "font-mono text-[11px] text-ink-faint", children: agent.name })
          ] }),
          /* @__PURE__ */ jsx10("span", { className: "rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-faint", children: trigger })
        ] }),
        /* @__PURE__ */ jsx10("p", { className: "mt-1 text-xs leading-relaxed text-ink-dim", children: agent.role === "reviewer" ? agent.description : t(`specialist_${agent.role}_hint`) }),
        /* @__PURE__ */ jsxs10("div", { className: "mt-2 grid gap-2 sm:grid-cols-2", children: [
          /* @__PURE__ */ jsxs10("label", { className: "text-[11px] text-ink-faint", children: [
            /* @__PURE__ */ jsx10("span", { className: "mb-1 block", children: t("specialistModel") }),
            /* @__PURE__ */ jsxs10(
              "select",
              {
                value: selected,
                onChange: (e) => void setSubagentModel(agent.name, e.target.value || null),
                className: "w-full rounded-lg border border-border bg-surface px-2 py-2 text-xs text-ink",
                children: [
                  /* @__PURE__ */ jsx10("option", { value: "", children: t("specialistFollowMain") }),
                  selected && !selectedModel && /* @__PURE__ */ jsxs10("option", { value: selected, children: [
                    selected,
                    " \xB7 ",
                    t("specialistUnavailable")
                  ] }),
                  models.map((m) => /* @__PURE__ */ jsxs10("option", { value: `${m.provider}/${m.id}`, children: [
                    m.providerName,
                    " \xB7 ",
                    m.label
                  ] }, `${m.provider}/${m.id}`))
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs10("label", { className: "text-[11px] text-ink-faint", children: [
            /* @__PURE__ */ jsx10("span", { className: "mb-1 block", children: t("specialistThinking") }),
            /* @__PURE__ */ jsxs10(
              "select",
              {
                value: selectedThinking,
                onChange: (e) => void setSubagentThinking(
                  agent.name,
                  e.target.value || null
                ),
                className: "w-full rounded-lg border border-border bg-surface px-2 py-2 text-xs text-ink",
                children: [
                  /* @__PURE__ */ jsx10("option", { value: "", children: t("specialistFollowMain") }),
                  selectedThinking && !supportedThinking.includes(selectedThinking) && /* @__PURE__ */ jsxs10("option", { value: selectedThinking, children: [
                    selectedThinking,
                    " \xB7 ",
                    t("specialistUnavailable")
                  ] }),
                  SUBAGENT_THINKING_LEVELS.filter((level) => supportedThinking.includes(level)).map(
                    (level) => /* @__PURE__ */ jsx10("option", { value: level, children: level }, level)
                  )
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs10("div", { className: "mt-2 rounded-lg bg-surface/70 p-2 text-[11px] text-ink-faint", children: [
          /* @__PURE__ */ jsxs10("div", { children: [
            t("specialistPermissions"),
            ":",
            " ",
            /* @__PURE__ */ jsx10("span", { className: "font-mono", children: agent.permissions.join(" \xB7 ") })
          ] }),
          /* @__PURE__ */ jsxs10("div", { className: "mt-1", children: [
            t("specialistBudget"),
            ": ",
            agent.maxTurns,
            " turns \xB7 ",
            agent.maxTokens.toLocaleString(),
            " output tokens \xB7 ",
            settings?.timeoutMs ? `${Math.round(settings.timeoutMs / 1e3)}s` : "120s"
          ] })
        ] }),
        /* @__PURE__ */ jsxs10("div", { className: "mt-2 text-[11px] text-ink-faint", children: [
          t("specialistLastRun"),
          ":",
          " ",
          last ? `${t(`worker_${last.status}`)}${last.model ? ` \xB7 ${last.model}` : ""}${last.thinkingLevel ? ` \xB7 ${last.thinkingLevel}` : ""}${last.totalTokens !== void 0 ? ` \xB7 ${last.totalTokens.toLocaleString()} tokens` : ""}` : t("specialistNeverRun")
        ] })
      ] }, agent.name);
    }) }),
    /* @__PURE__ */ jsx10("p", { className: "mt-3 text-xs text-ink-dim", children: t("specialistLimits") }),
    /* @__PURE__ */ jsx10(
      Button,
      {
        size: "sm",
        className: "mt-2",
        onClick: () => {
          useKnowledgeStore.getState().close();
          useSettingsStore.getState().openWith("models");
        },
        children: t("specialistModels")
      }
    )
  ] });
}

// ui/knowledge/ResearchRunsCard.tsx
import { useEffect as useEffect11, useState as useState12 } from "react";
import { jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
function ResearchRunsCard({
  cwd,
  project,
  revision = 0
}) {
  const t = useKnowledgeText();
  const [runs, setRuns] = useState12([]);
  const [selected, setSelected] = useState12(null);
  const [loading, setLoading] = useState12(false);
  const [error, setError] = useState12(null);
  const [sourcePath, setSourcePath] = useState12(null);
  useEffect11(() => {
    let cancelled = false;
    if (!cwd) {
      setRuns([]);
      setSelected(null);
      setSourcePath(null);
      return;
    }
    setLoading(true);
    setError(null);
    void getKnowledgeApi().getResearchRuns({ cwd, project, limit: 8 }).then(async (result) => {
      if (cancelled) return;
      setRuns(result.items);
      if (!result.items.length) {
        setSelected(null);
        return;
      }
      const current = result.items.find((item) => item.runId === selected?.runId) ?? result.items.at(0);
      if (!current) return;
      const detail = await getKnowledgeApi().getResearchRun({ cwd, runId: current.runId });
      if (!cancelled) setSelected(detail);
    }).catch((reason) => {
      if (!cancelled) setError(String(reason?.message || reason));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [cwd, project, selected?.runId]);
  async function select(run) {
    if (!cwd) return;
    setError(null);
    try {
      setSelected(await getKnowledgeApi().getResearchRun({ cwd, runId: run.runId }));
    } catch (reason) {
      setError(String(reason?.message || reason));
    }
  }
  return /* @__PURE__ */ jsxs11("section", { className: "rounded-xl border border-border p-4", "data-testid": "research-runs-card", children: [
    /* @__PURE__ */ jsxs11("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxs11("div", { children: [
        /* @__PURE__ */ jsx11("h3", { className: "text-xs font-semibold", children: t("researchRuns") }),
        /* @__PURE__ */ jsx11("p", { className: "mt-1 text-xs text-ink-dim", children: t("researchRunsHint") })
      ] }),
      selected && /* @__PURE__ */ jsx11("span", { className: "rounded-full bg-hover px-2 py-0.5 text-xs text-ink-dim", children: selected.answerable ? t("researchAnswerable") : t("researchInProgress") })
    ] }),
    loading && /* @__PURE__ */ jsx11("p", { className: "mt-3 text-xs text-ink-dim", children: t("researchRunsLoading") }),
    error && /* @__PURE__ */ jsx11("p", { className: "mt-3 break-words text-xs text-err", children: error }),
    !loading && !runs.length && /* @__PURE__ */ jsx11("p", { className: "mt-3 text-xs text-ink-dim", children: t("researchRunsEmpty") }),
    runs.length > 0 && /* @__PURE__ */ jsxs11("div", { className: "mt-3 grid gap-3 lg:grid-cols-[minmax(180px,0.35fr)_minmax(0,1fr)]", children: [
      /* @__PURE__ */ jsx11("div", { className: "space-y-1", children: runs.map((run) => /* @__PURE__ */ jsxs11(
        "button",
        {
          type: "button",
          onClick: () => void select(run),
          className: `w-full rounded-lg border px-3 py-2 text-left text-xs ${selected?.runId === run.runId ? "border-ink-faint bg-[var(--highlight)]" : "border-border hover:bg-hover"}`,
          children: [
            /* @__PURE__ */ jsxs11("div", { className: "flex items-center justify-between gap-2", children: [
              /* @__PURE__ */ jsx11("span", { className: "truncate font-medium", children: run.resultSlug }),
              /* @__PURE__ */ jsx11("span", { className: "text-[11px] text-ink-faint", children: run.stage })
            ] }),
            /* @__PURE__ */ jsx11("p", { className: "mt-1 line-clamp-2 text-xs text-ink-dim", children: run.query || run.runId })
          ]
        },
        run.runId
      )) }),
      selected && /* @__PURE__ */ jsxs11("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsxs11("div", { className: "rounded-lg bg-hover px-3 py-2 text-xs", children: [
          /* @__PURE__ */ jsxs11("div", { className: "flex flex-wrap items-center gap-x-3 gap-y-1", children: [
            /* @__PURE__ */ jsx11("strong", { children: selected.runId }),
            /* @__PURE__ */ jsx11("span", { className: "text-ink-dim", children: selected.status }),
            /* @__PURE__ */ jsxs11("span", { className: "text-ink-dim", children: [
              t("researchArchive"),
              ": ",
              selected.archive.count + selected.archive.reused
            ] }),
            /* @__PURE__ */ jsxs11("span", { className: "text-ink-dim", children: [
              t("researchIntegrity"),
              ":",
              " ",
              selected.integrity ? `${selected.integrity.verified}/${selected.integrity.checked}` : t("researchCoverageUnknown")
            ] })
          ] }),
          /* @__PURE__ */ jsx11("p", { className: "mt-1 text-ink-dim", children: selected.query })
        ] }),
        /* @__PURE__ */ jsx11("div", { className: "mt-3", children: /* @__PURE__ */ jsx11(
          RoadmapLane,
          {
            testId: "research-route",
            nodes: selected.route.map((node) => ({
              key: node.key,
              label: node.label,
              status: roadmapStatus(node.state),
              detail: node.state
            }))
          }
        ) }),
        /* @__PURE__ */ jsx11("p", { className: "mt-2 text-xs text-ink-dim", children: t("researchRouteHint") }),
        selected.gaps && selected.gaps.length > 0 && /* @__PURE__ */ jsxs11("div", { className: "mt-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn", children: [
          /* @__PURE__ */ jsxs11("span", { className: "font-medium", children: [
            t("researchGaps"),
            ": "
          ] }),
          selected.gaps.join(" \xB7 ")
        ] }),
        selected.governance && (selected.governance.duplicateSources.length > 0 || selected.governance.staleSources.length > 0 || selected.governance.unavailableSources.length > 0) && /* @__PURE__ */ jsxs11("p", { className: "mt-2 text-xs text-warn", children: [
          t("researchGovernance"),
          ": ",
          selected.governance.duplicateSources.length,
          " ",
          t("researchDuplicates"),
          ", ",
          selected.governance.staleSources.length,
          " ",
          t("researchStale"),
          ",",
          " ",
          selected.governance.unavailableSources.length,
          " ",
          t("researchUnavailable")
        ] }),
        selected.timeline && selected.timeline.length > 0 && /* @__PURE__ */ jsxs11("details", { className: "mt-2 text-xs", children: [
          /* @__PURE__ */ jsxs11("summary", { className: "cursor-pointer font-medium", children: [
            t("researchTimeline"),
            " (",
            selected.timeline.length,
            ")"
          ] }),
          /* @__PURE__ */ jsx11("ol", { className: "mt-2 space-y-1 border-l border-border pl-3", children: selected.timeline.slice(-12).map((event) => /* @__PURE__ */ jsxs11(
            "li",
            {
              className: event.status === "failed" ? "text-err" : "text-ink-dim",
              children: [
                /* @__PURE__ */ jsx11("span", { className: "font-medium", children: event.type }),
                event.detail ? ` \xB7 ${event.detail}` : ""
              ]
            },
            `${event.at || "event"}-${event.type}`
          )) })
        ] }),
        /* @__PURE__ */ jsxs11("div", { className: "mt-3 grid gap-2 sm:grid-cols-3", children: [
          /* @__PURE__ */ jsxs11("div", { className: "rounded-lg border border-border px-3 py-2 text-xs", children: [
            /* @__PURE__ */ jsx11("span", { className: "text-ink-dim", children: t("researchSources") }),
            /* @__PURE__ */ jsx11("strong", { className: "ml-2", children: selected.sources.length })
          ] }),
          /* @__PURE__ */ jsxs11("div", { className: "rounded-lg border border-border px-3 py-2 text-xs", children: [
            /* @__PURE__ */ jsx11("span", { className: "text-ink-dim", children: t("researchClaims") }),
            /* @__PURE__ */ jsx11("strong", { className: "ml-2", children: selected.claims.length })
          ] }),
          /* @__PURE__ */ jsxs11("div", { className: "rounded-lg border border-border px-3 py-2 text-xs", children: [
            /* @__PURE__ */ jsx11("span", { className: "text-ink-dim", children: t("researchCoverage") }),
            /* @__PURE__ */ jsx11("strong", { className: "ml-2", children: selected.coverage ? t("researchCoverageRecorded") : t("researchCoverageUnknown") })
          ] })
        ] }),
        selected.warnings.length > 0 && /* @__PURE__ */ jsx11("p", { className: "mt-2 text-xs text-warn", children: selected.warnings.join(" \xB7 ") }),
        selected.sources.length > 0 && /* @__PURE__ */ jsxs11("div", { className: "mt-2 space-y-1 text-xs", children: [
          /* @__PURE__ */ jsx11("p", { className: "text-ink-dim", children: t("researchSourceList") }),
          selected.sources.slice(0, 8).map((source) => /* @__PURE__ */ jsxs11(
            "button",
            {
              type: "button",
              onClick: () => setSourcePath(source.path),
              className: "block max-w-full truncate text-left text-link hover:underline",
              children: [
                source.verified ? "\u2713" : "!",
                " ",
                source.path
              ]
            },
            source.path
          ))
        ] }),
        selected.claims.length > 0 && /* @__PURE__ */ jsx11("ul", { className: "mt-2 space-y-1 text-xs text-ink-dim", children: selected.claims.slice(0, 6).map((claim) => /* @__PURE__ */ jsxs11("li", { children: [
          /* @__PURE__ */ jsxs11("span", { className: "font-medium", children: [
            "[",
            claim.relationship || claim.status,
            "]"
          ] }),
          " ",
          claim.claim,
          claim.limitations ? /* @__PURE__ */ jsxs11("span", { className: "text-ink-faint", children: [
            " \xB7 ",
            claim.limitations
          ] }) : null
        ] }, claim.id || claim.claim)) }),
        selected.provenance && /* @__PURE__ */ jsxs11("div", { className: "mt-3 rounded-lg border border-border px-3 py-2 text-xs", children: [
          /* @__PURE__ */ jsxs11("span", { className: "text-ink-dim", children: [
            t("researchProvenance"),
            ": "
          ] }),
          /* @__PURE__ */ jsx11("span", { children: selected.provenance.status }),
          selected.provenance.limitations.length > 0 && /* @__PURE__ */ jsx11("span", { className: "ml-2 text-ink-faint", children: selected.provenance.limitations.join(" \xB7 ") })
        ] }),
        sourcePath && revision > 0 && /* @__PURE__ */ jsx11("div", { className: "mt-3", children: /* @__PURE__ */ jsx11(
          KnowledgeNoteViewer,
          {
            cwd,
            revision,
            path: sourcePath,
            onClose: () => setSourcePath(null)
          }
        ) })
      ] })
    ] })
  ] });
}

// ui/knowledge/SemanticManagement.tsx
import { useEffect as useEffect12, useRef as useRef4, useState as useState13 } from "react";
import { jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
var EMPTY_CONFIG = {
  provider: "none",
  enabled: false,
  baseUrl: "",
  model: "",
  credentialEnv: "",
  remoteConsent: false,
  minSimilarity: 0.45
};
function SemanticManagement({
  cwd,
  bindingRevision
}) {
  const t = useKnowledgeText();
  const [status, setStatus] = useState13(null);
  const [config, setConfig] = useState13(EMPTY_CONFIG);
  const [busy, setBusy] = useState13(false);
  const [indexing, setIndexing] = useState13(false);
  const [result, setResult] = useState13(null);
  const [message, setMessage] = useState13(null);
  const [error, setError] = useState13(null);
  const epoch = useRef4(0);
  const requestIdRef = useRef4(null);
  useEffect12(() => {
    const current = ++epoch.current;
    setStatus(null);
    setError(null);
    void getKnowledgeApi().getKnowledgeSemanticStatus({ cwd, bindingRevision }).then((next) => {
      if (current !== epoch.current) return;
      setStatus(next);
      setConfig({ ...EMPTY_CONFIG, ...next.settings });
    }).catch((e) => current === epoch.current && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      epoch.current++;
    };
  }, [cwd, bindingRevision]);
  function update(key, value) {
    setConfig((current) => ({ ...current, [key]: value }));
  }
  const saved = Boolean(
    status && [
      "provider",
      "enabled",
      "baseUrl",
      "model",
      "credentialEnv",
      "remoteConsent",
      "minSimilarity"
    ].every((key) => config[key] === status.settings[key])
  );
  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const safe = await getKnowledgeApi().saveKnowledgeSemanticSettings({
        config,
        bindingRevision,
        expectedSettingsRevision: status?.settings.revision ?? 0
      });
      setStatus((current) => current ? { ...current, settings: safe } : current);
      setConfig({ ...EMPTY_CONFIG, ...safe });
      setMessage(t("semanticSaved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await getKnowledgeApi().testKnowledgeSemanticProvider({ config, bindingRevision });
      setMessage(t("semanticTested"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function startIndex() {
    const projectCwd = cwd;
    if (!projectCwd || busy || indexing || !saved || !config.enabled || config.provider === "none") return;
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const scopeEpoch = epoch.current;
    requestIdRef.current = requestId;
    setIndexing(true);
    setError(null);
    setMessage(null);
    try {
      const next = await getKnowledgeApi().indexKnowledgeSemantic({
        cwd: projectCwd,
        bindingRevision,
        requestId,
        limit: 8
      });
      if (scopeEpoch === epoch.current) {
        setResult(next);
        setMessage(t("semanticIndex"));
      }
    } catch (e) {
      if (scopeEpoch === epoch.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (scopeEpoch === epoch.current) {
        setIndexing(false);
        requestIdRef.current = null;
      }
    }
  }
  async function cancelIndex() {
    if (!indexing || !cwd) return;
    setError(null);
    try {
      const requestId = requestIdRef.current;
      if (!requestId) return;
      await getKnowledgeApi().cancelKnowledgeSemanticIndex({ cwd, bindingRevision, requestId });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return /* @__PURE__ */ jsxs12("section", { className: "space-y-3", "data-testid": "knowledge-semantic", children: [
    /* @__PURE__ */ jsx12("p", { className: "text-xs text-ink-dim", children: t("semanticOptIn") }),
    /* @__PURE__ */ jsxs12("div", { className: "grid gap-2 sm:grid-cols-2", children: [
      /* @__PURE__ */ jsxs12("label", { className: "text-xs text-ink-dim", children: [
        t("provider"),
        /* @__PURE__ */ jsxs12(
          "select",
          {
            value: config.provider,
            onChange: (e) => update("provider", e.target.value),
            className: "mt-1 w-full rounded-lg border border-border bg-surface px-2 py-2 text-xs text-ink",
            children: [
              /* @__PURE__ */ jsx12("option", { value: "none", children: t("providerNone") }),
              /* @__PURE__ */ jsx12("option", { value: "ollama", children: t("providerOllama") }),
              /* @__PURE__ */ jsx12("option", { value: "openai-compatible", children: t("providerOpenAI") })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxs12("label", { className: "flex items-center gap-2 pt-5 text-xs", children: [
        /* @__PURE__ */ jsx12(
          "input",
          {
            type: "checkbox",
            checked: config.enabled,
            onChange: (e) => update("enabled", e.target.checked)
          }
        ),
        t("semantic")
      ] })
    ] }),
    /* @__PURE__ */ jsxs12("label", { className: "block text-xs text-ink-dim", children: [
      t("endpoint"),
      /* @__PURE__ */ jsx12(
        "input",
        {
          value: config.baseUrl,
          onChange: (e) => update("baseUrl", e.target.value),
          className: "mt-1 w-full rounded-lg border border-border bg-surface px-2 py-2 text-xs text-ink"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs12("label", { className: "block text-xs text-ink-dim", children: [
      t("modelName"),
      /* @__PURE__ */ jsx12(
        "input",
        {
          value: config.model,
          onChange: (e) => update("model", e.target.value),
          className: "mt-1 w-full rounded-lg border border-border bg-surface px-2 py-2 text-xs text-ink"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs12("label", { className: "block text-xs text-ink-dim", children: [
      t("semanticMinSimilarity"),
      /* @__PURE__ */ jsx12(
        "input",
        {
          type: "number",
          min: "0",
          max: "1",
          step: "0.05",
          value: config.minSimilarity ?? 0.45,
          onChange: (e) => update("minSimilarity", Number(e.target.value)),
          className: "mt-1 w-full rounded-lg border border-border bg-surface px-2 py-2 text-xs text-ink"
        }
      ),
      /* @__PURE__ */ jsx12("span", { className: "mt-1 block text-[11px] text-ink-faint", children: t("semanticMinSimilarityHint") })
    ] }),
    /* @__PURE__ */ jsxs12("label", { className: "block text-xs text-ink-dim", children: [
      t("credentialEnv"),
      /* @__PURE__ */ jsx12(
        "input",
        {
          value: config.credentialEnv,
          onChange: (e) => update("credentialEnv", e.target.value),
          autoComplete: "off",
          className: "mt-1 w-full rounded-lg border border-border bg-surface px-2 py-2 font-mono text-xs text-ink"
        }
      )
    ] }),
    /* @__PURE__ */ jsxs12("label", { className: "flex items-start gap-2 text-xs", children: [
      /* @__PURE__ */ jsx12(
        "input",
        {
          type: "checkbox",
          checked: config.remoteConsent,
          onChange: (e) => update("remoteConsent", e.target.checked)
        }
      ),
      /* @__PURE__ */ jsx12("span", { children: t("remoteConsent") })
    ] }),
    /* @__PURE__ */ jsx12("p", { className: "text-xs text-ink-dim", children: t("testSemanticHint") }),
    /* @__PURE__ */ jsxs12("div", { className: "flex flex-wrap gap-1", children: [
      /* @__PURE__ */ jsx12(Button, { size: "sm", disabled: busy, onClick: () => void save(), children: t("saveSemantic") }),
      /* @__PURE__ */ jsx12(
        Button,
        {
          size: "sm",
          disabled: busy || !config.enabled || config.provider === "none",
          onClick: () => void test(),
          children: t("testSemantic")
        }
      )
    ] }),
    /* @__PURE__ */ jsxs12("div", { className: "border-t border-border pt-3", children: [
      /* @__PURE__ */ jsx12("p", { className: "text-xs text-ink-dim", children: t("semanticIndexHint") }),
      /* @__PURE__ */ jsxs12("div", { className: "mt-2 flex flex-wrap gap-1", children: [
        /* @__PURE__ */ jsx12(
          Button,
          {
            size: "sm",
            variant: "primary",
            disabled: !cwd || busy || indexing || !saved || !config.enabled || config.provider === "none",
            onClick: () => void startIndex(),
            children: indexing ? t("semanticIndexing") : t("semanticIndex")
          }
        ),
        /* @__PURE__ */ jsx12(Button, { size: "sm", disabled: !indexing, onClick: () => void cancelIndex(), children: t("semanticCancel") })
      ] }),
      (!config.enabled || !saved) && /* @__PURE__ */ jsx12("p", { className: "mt-2 text-xs text-warn", children: t("semanticDisabled") })
    ] }),
    status?.index && /* @__PURE__ */ jsxs12("p", { className: "text-xs text-ink-dim", children: [
      t("topicStatus"),
      ": ",
      String(status.index.coverage ?? status.index.status ?? t("unknown")),
      status.index.semantic?.vectors !== void 0 ? ` \xB7 ${t("processed")}: ${status.index.semantic.vectors}` : ""
    ] }),
    result && /* @__PURE__ */ jsxs12("p", { className: "text-xs text-ink-dim", children: [
      t("processed"),
      ": ",
      result.processed ?? "\u2014",
      result.dimension ? ` \xB7 ${t("semanticDimension")}: ${result.dimension}` : "",
      ".",
      " ",
      t("semanticFallback")
    ] }),
    message && /* @__PURE__ */ jsx12("p", { role: "status", className: "text-xs text-ok", children: message }),
    error && /* @__PURE__ */ jsx12("p", { role: "alert", className: "break-words text-xs text-err", children: error })
  ] });
}

// ui/knowledge/TopicManagement.tsx
import { useCallback as useCallback4, useEffect as useEffect13, useRef as useRef5, useState as useState14 } from "react";
import { jsx as jsx13, jsxs as jsxs13 } from "react/jsx-runtime";
function TopicManagement({
  cwd,
  bindingRevision,
  sessionId
}) {
  const t = useKnowledgeText();
  const [query, setQuery] = useState14("");
  const [data, setData] = useState14(null);
  const [error, setError] = useState14(null);
  const [busy, setBusy] = useState14(false);
  const epoch = useRef5(0);
  const session = useSessionsStore((s) => s.sessions.find((item) => item.sessionId === sessionId));
  const streaming = useAgentActive(sessionId);
  const load = useCallback4(
    async (filter = "") => {
      if (!cwd) return;
      const current = ++epoch.current;
      setError(null);
      try {
        const next = await getKnowledgeApi().getKnowledgeTopics({ cwd, bindingRevision, query: filter });
        if (current === epoch.current) setData(next);
      } catch (e) {
        if (current === epoch.current) setError(e instanceof Error ? e.message : String(e));
      }
    },
    [bindingRevision, cwd]
  );
  useEffect13(() => {
    void load("");
    return () => {
      epoch.current++;
    };
  }, [load]);
  async function archive(topic) {
    const projectCwd = cwd;
    if (!data || !projectCwd || busy || !window.confirm(t("archiveConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      await getKnowledgeApi().archiveKnowledgeTopic({
        cwd: projectCwd,
        bindingRevision,
        id: topic.id,
        expectedRevision: data.revision
      });
      await load(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function resume(topic) {
    if (!sessionId || !session || session.readOnly || streaming) return;
    const text = `Prepare the knowledge context for topic "${topic.id}" from its recorded sources, then call research_resume_topic with the exact quoted topic id "${topic.id}" and reread the sources before continuing research.`;
    void getKnowledgeApi().prompt(sessionId, text).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }
  return /* @__PURE__ */ jsxs13("section", { className: "space-y-3", "data-testid": "knowledge-topics", children: [
    /* @__PURE__ */ jsx13("p", { className: "text-xs text-ink-dim", children: t("topicNeutral") }),
    /* @__PURE__ */ jsxs13("div", { className: "flex gap-1", children: [
      /* @__PURE__ */ jsx13(
        "input",
        {
          value: query,
          onChange: (e) => setQuery(e.target.value),
          placeholder: t("topicFilter"),
          className: "min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-xs text-ink"
        }
      ),
      /* @__PURE__ */ jsx13(Button, { size: "sm", disabled: !cwd, onClick: () => void load(query), children: t("refresh") })
    ] }),
    !cwd && /* @__PURE__ */ jsx13("p", { className: "text-xs text-warn", children: t("selectProject") }),
    data?.topics.map((topic) => /* @__PURE__ */ jsxs13("article", { className: "rounded-lg border border-border p-3", children: [
      /* @__PURE__ */ jsxs13("div", { className: "flex items-start justify-between gap-2", children: [
        /* @__PURE__ */ jsxs13("div", { children: [
          /* @__PURE__ */ jsx13("h3", { className: "text-sm font-medium", children: topic.title }),
          /* @__PURE__ */ jsxs13("p", { className: "mt-1 text-xs text-ink-dim", children: [
            t("topicStatus"),
            ": ",
            topic.status,
            " \xB7 ",
            topic.updatedAt
          ] })
        ] }),
        /* @__PURE__ */ jsxs13("div", { className: "flex gap-1", children: [
          /* @__PURE__ */ jsx13(
            Button,
            {
              size: "sm",
              disabled: busy || topic.status === "archived",
              onClick: () => void archive(topic),
              children: topic.status === "archived" ? t("topicArchived") : t("archiveTopic")
            }
          ),
          /* @__PURE__ */ jsx13(
            Button,
            {
              size: "sm",
              disabled: !sessionId || !session || session.readOnly || streaming || topic.status === "archived",
              onClick: () => resume(topic),
              children: t("resumeTopic")
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx13("p", { className: "mt-2 text-xs leading-relaxed", children: topic.summary }),
      /* @__PURE__ */ jsxs13("dl", { className: "mt-2 grid gap-1 text-xs sm:grid-cols-2", children: [
        /* @__PURE__ */ jsx13("dt", { className: "text-ink-dim", children: t("topicEntities") }),
        /* @__PURE__ */ jsx13("dd", { children: topic.entities.join(", ") || "\u2014" }),
        /* @__PURE__ */ jsx13("dt", { className: "text-ink-dim", children: t("topicQuestions") }),
        /* @__PURE__ */ jsx13("dd", { children: topic.unresolvedQuestions.join("; ") || "\u2014" }),
        /* @__PURE__ */ jsx13("dt", { className: "text-ink-dim", children: t("topicSources") }),
        /* @__PURE__ */ jsx13("dd", { className: "break-words", children: topic.sources.map((source) => source.path).join(", ") || "\u2014" }),
        /* @__PURE__ */ jsx13("dt", { className: "text-ink-dim", children: t("topicArtifacts") }),
        /* @__PURE__ */ jsx13("dd", { children: topic.artifacts.join(", ") || "\u2014" })
      ] }),
      topic.conflicts?.length ? /* @__PURE__ */ jsxs13(
        "details",
        {
          className: "mt-3 rounded-lg border border-warn/30 bg-warn/5 p-3",
          open: topic.status === "conflict-candidate",
          children: [
            /* @__PURE__ */ jsxs13("summary", { className: "cursor-pointer text-xs font-medium text-warn", children: [
              t("topicConflicts"),
              " \xB7 ",
              topic.conflicts.length
            ] }),
            /* @__PURE__ */ jsx13("p", { className: "mt-1 text-xs leading-relaxed text-ink-dim", children: t("topicConflictHint") }),
            /* @__PURE__ */ jsx13("ul", { className: "mt-2 space-y-2", children: topic.conflicts.slice(-4).map((conflict) => /* @__PURE__ */ jsxs13(
              "li",
              {
                className: "text-xs leading-relaxed",
                children: [
                  /* @__PURE__ */ jsxs13("div", { className: "font-medium text-ink-2", children: [
                    conflict.relation,
                    " \xB7 ",
                    conflict.confidence
                  ] }),
                  /* @__PURE__ */ jsx13("div", { className: "mt-0.5 break-words text-ink-dim", children: conflict.reason }),
                  /* @__PURE__ */ jsxs13("div", { className: "mt-0.5 break-all font-mono text-[11px] text-ink-faint", children: [
                    conflict.previousSourcePath,
                    " \u2194 ",
                    conflict.incomingSourcePath
                  ] })
                ]
              },
              `${conflict.detectedAt}-${conflict.previousSourcePath}-${conflict.incomingSourcePath}-${conflict.relation}`
            )) })
          ]
        }
      ) : null
    ] }, topic.id)),
    data && data.topics.length === 0 && /* @__PURE__ */ jsx13(StatePanel, { compact: true, title: t("empty") }),
    error && /* @__PURE__ */ jsx13("p", { role: "alert", className: "break-words text-xs text-err", children: error })
  ] });
}

// ui/knowledge/WikiReviewPanel.tsx
import { useCallback as useCallback5, useEffect as useEffect15, useMemo as useMemo4, useRef as useRef7, useState as useState16 } from "react";

// ui/knowledge/line-diff.ts
function knowledgeLineDiff(before, after) {
  const a = before ? before.split("\n") : [], b = after ? after.split("\n") : [];
  let start = 0, end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end])
    end++;
  const out = [];
  for (let i = 0; i < start; i++)
    out.push({ kind: "same", text: a[i] ?? "", oldLine: i + 1, newLine: i + 1 });
  for (let i = start; i < a.length - end; i++) out.push({ kind: "remove", text: a[i] ?? "", oldLine: i + 1 });
  for (let i = start; i < b.length - end; i++) out.push({ kind: "add", text: b[i] ?? "", newLine: i + 1 });
  for (let i = 0; i < end; i++)
    out.push({
      kind: "same",
      text: a[a.length - end + i] ?? "",
      oldLine: a.length - end + i + 1,
      newLine: b.length - end + i + 1
    });
  return out;
}

// ui/knowledge/WikiModelReview.tsx
import { useEffect as useEffect14, useRef as useRef6, useState as useState15 } from "react";
import { jsx as jsx14, jsxs as jsxs14 } from "react/jsx-runtime";
function compactTokens(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}
function WikiModelReview({
  cwd,
  preview,
  disabled,
  onBusy,
  onComplete,
  onFailure,
  adviceOnly = false,
  defaultExpanded = false
}) {
  const t = useKnowledgeText(), sessionId = useSessionsStore((s) => s.activeSessionId), sessions = useSessionsStore((s) => s.sessions);
  const chosen = sessions.find((s) => s.sessionId === sessionId && s.cwd === cwd);
  const pref = useSettingsStore((s) => s.modelPrefs?.subagentModels?.["knowledge-wiki-reviewer"]);
  const [expanded, setExpanded] = useState15(defaultExpanded || adviceOnly), [ack, setAck] = useState15(false), [auto, setAuto] = useState15(false), [busy, setBusy] = useState15(false), [error, setError] = useState15(null);
  const [report, setReport] = useState15(preview.modelReview || null);
  const active = useRef6(null), generation = useRef6(0);
  useEffect14(() => {
    generation.current++;
    setAck(false);
    setAuto(false);
    setExpanded(defaultExpanded || adviceOnly);
    setReport(preview.modelReview || null);
    setError(null);
    return () => {
      generation.current++;
      if (active.current) {
        void getKnowledgeApi().cancelKnowledgeModelReview(active.current).catch(reportKnowledgeError);
        active.current = null;
      }
    };
  }, [preview.modelReview, adviceOnly, defaultExpanded]);
  async function review() {
    if (!ack || !chosen || !sessionId || busy || disabled) return;
    const epoch = generation.current;
    const request = { sessionId, requestId: crypto.randomUUID() };
    active.current = request;
    setBusy(true);
    onBusy(true);
    setError(null);
    try {
      const value = await getKnowledgeApi().reviewKnowledgeWithModel({
        cwd,
        ...request,
        token: preview.reviewToken,
        acknowledged: true,
        autoApply: adviceOnly ? false : auto
      });
      if (epoch !== generation.current) return;
      setReport(value);
      setExpanded(false);
      setAck(false);
      await onComplete(value);
    } catch (e) {
      if (epoch === generation.current) {
        setError(String(e.message || e));
        onFailure();
      }
    } finally {
      if (active.current === request) active.current = null;
      setBusy(false);
      onBusy(false);
    }
  }
  return /* @__PURE__ */ jsxs14("section", { className: "space-y-2 rounded-xl border border-border p-3", "data-testid": "wiki-model-review", children: [
    /* @__PURE__ */ jsxs14("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
      adviceOnly ? /* @__PURE__ */ jsx14("p", { className: "text-xs font-medium", children: t("modelReviewPreflight") }) : /* @__PURE__ */ jsx14(
        Button,
        {
          disabled: disabled || busy || preview.status !== "pending",
          onClick: () => setExpanded(!expanded),
          children: t("modelReviewButton")
        }
      ),
      /* @__PURE__ */ jsxs14("span", { className: "break-all text-xs text-ink-dim", children: [
        t("modelReviewModel"),
        "\uFF1A",
        pref || t("modelReviewInherit")
      ] })
    ] }),
    !chosen && /* @__PURE__ */ jsx14("p", { className: "text-xs text-warn", children: t("modelReviewSession") }),
    (adviceOnly || expanded) && /* @__PURE__ */ jsxs14("div", { className: "space-y-2 text-xs", children: [
      /* @__PURE__ */ jsx14("p", { className: "leading-relaxed text-ink-dim", children: adviceOnly ? t("modelReviewAdviceHint") : t("modelReviewHint") }),
      /* @__PURE__ */ jsxs14("label", { className: "flex items-start gap-2", children: [
        /* @__PURE__ */ jsx14("input", { type: "checkbox", checked: ack, disabled: busy, onChange: (e) => setAck(e.target.checked) }),
        t("modelReviewAck")
      ] }),
      !adviceOnly && /* @__PURE__ */ jsxs14("label", { className: "flex items-start gap-2", children: [
        /* @__PURE__ */ jsx14(
          "input",
          {
            type: "checkbox",
            checked: auto,
            disabled: busy,
            onChange: (e) => setAuto(e.target.checked)
          }
        ),
        t("modelReviewAutoApply")
      ] }),
      /* @__PURE__ */ jsx14("p", { className: "text-xs text-ink-dim", children: adviceOnly ? t("modelReviewNotHuman") : t("modelReviewWriteHint") }),
      /* @__PURE__ */ jsxs14("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsx14(Button, { disabled: !ack || !chosen || busy || disabled, onClick: () => void review(), children: t("modelReviewStart") }),
        /* @__PURE__ */ jsx14(Button, { disabled: busy, onClick: () => setExpanded(false), children: t("cancel") })
      ] })
    ] }),
    busy && /* @__PURE__ */ jsxs14("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsx14("span", { role: "status", className: "text-xs", children: t("modelReviewRunning") }),
      /* @__PURE__ */ jsx14(
        Button,
        {
          onClick: () => {
            if (active.current) void getKnowledgeApi().cancelKnowledgeModelReview(active.current);
          },
          children: t("cancel")
        }
      )
    ] }),
    error && /* @__PURE__ */ jsx14("p", { role: "alert", className: "break-words text-xs text-err", children: error }),
    report && /* @__PURE__ */ jsxs14("div", { className: "space-y-2 text-xs", "data-testid": "wiki-model-review-result", children: [
      /* @__PURE__ */ jsx14("strong", { children: report.applied ? t("modelReviewApplied") : report.verdict === "approve" ? t("modelReviewPass") : report.verdict === "reject" ? t("modelReviewReject") : t("modelReviewHuman") }),
      /* @__PURE__ */ jsx14("p", { className: "whitespace-pre-wrap break-words", children: report.summary }),
      [...new Set(report.cautions)].map((item) => /* @__PURE__ */ jsx14("p", { className: "text-warn", children: item }, item)),
      (report.applyError || report.auditSaveError) && /* @__PURE__ */ jsx14("p", { className: "text-warn", children: report.applyError || report.auditSaveError }),
      /* @__PURE__ */ jsxs14("p", { className: "text-xs text-ink-dim", children: [
        t("modelReviewNotHuman"),
        " \xB7 ",
        report.model
      ] }),
      report.usage && /* @__PURE__ */ jsxs14(
        "details",
        {
          className: "rounded-lg border border-border px-3 py-2 text-xs text-ink-dim",
          "data-testid": "wiki-model-review-usage",
          children: [
            /* @__PURE__ */ jsxs14("summary", { className: "cursor-pointer list-none tabular-nums", children: [
              /* @__PURE__ */ jsx14("span", { className: "font-medium text-ink-2", children: t("modelReviewUsage") }),
              " \xB7 ",
              compactTokens(report.usage.inputTokens + report.usage.outputTokens),
              " tokens",
              " \xB7 ",
              report.usage.cost > 0 ? `$${report.usage.cost.toFixed(4)}` : t("modelReviewCostUnknown")
            ] }),
            /* @__PURE__ */ jsxs14("div", { className: "mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2 tabular-nums", children: [
              /* @__PURE__ */ jsxs14("span", { children: [
                t("modelReviewInput"),
                " ",
                report.usage.inputTokens.toLocaleString()
              ] }),
              /* @__PURE__ */ jsxs14("span", { children: [
                t("modelReviewOutput"),
                " ",
                report.usage.outputTokens.toLocaleString()
              ] })
            ] }),
            /* @__PURE__ */ jsx14("p", { className: "mt-1 leading-relaxed", children: t("modelReviewUsageHint") })
          ]
        }
      ),
      /* @__PURE__ */ jsxs14("details", { children: [
        /* @__PURE__ */ jsx14("summary", { className: "cursor-pointer text-xs", children: t("modelReviewAudit") }),
        /* @__PURE__ */ jsx14("p", { className: "break-all font-mono text-[11px]", children: report.auditId }),
        /* @__PURE__ */ jsx14("p", { children: new Date(report.completedAt).toLocaleString() }),
        Object.entries(report.checks).map(([key, value]) => /* @__PURE__ */ jsxs14("p", { children: [
          value ? "\u2713" : "!",
          " ",
          t(`reviewCheck_${key}`)
        ] }, key))
      ] })
    ] })
  ] });
}

// ui/knowledge/WikiReviewPanel.tsx
import { jsx as jsx15, jsxs as jsxs15 } from "react/jsx-runtime";
function WikiReviewPanel({
  cwd,
  revision,
  initialId
}) {
  const t = useKnowledgeText(), nonce = useKnowledgeStore((s) => s.revision);
  const [page, setPage] = useState16(null), [offset, setOffset] = useState16(0), [loading, setLoading] = useState16(false);
  const [selected, setSelected] = useState16(initialId || ""), [preview, setPreview] = useState16(null), [previewNonce, setPreviewNonce] = useState16(-1), [pending, setPending] = useState16(false);
  const [error, setError] = useState16(null), [result, setResult] = useState16(null), [checked, setChecked] = useState16(false), [expired, setExpired] = useState16(false), [view, setView] = useState16("diff"), [readPath, setReadPath] = useState16(null);
  const request = useRef7(0);
  useEffect15(() => {
    setSelected(initialId || "");
    setPreview(null);
    setOffset(0);
    setError(null);
    setResult(null);
    setReadPath(null);
    request.current++;
  }, [initialId]);
  useEffect15(() => {
    let live = true;
    setLoading(true);
    void getKnowledgeApi().getKnowledgeReviews({ cwd, revision, offset, limit: 12 }).then(
      (value) => {
        if (live) setPage(value);
      },
      (e) => {
        if (live) setError(String(e.message || e));
      }
    ).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [cwd, revision, offset]);
  const load = useCallback5(
    async (id) => {
      if (!cwd) return;
      const seq = ++request.current;
      setSelected(id);
      setPreview(null);
      setChecked(false);
      setError(null);
      setExpired(false);
      setReadPath(null);
      setPending(true);
      try {
        const value = await getKnowledgeApi().previewKnowledgeReview({ cwd, id, revision });
        if (seq === request.current) {
          setPreview(value);
          setPreviewNonce(useKnowledgeStore.getState().revision);
        }
      } catch (e) {
        if (seq === request.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (seq === request.current) setPending(false);
      }
    },
    [cwd, revision]
  );
  useEffect15(() => {
    if (initialId && cwd) void load(initialId);
    return () => {
      request.current++;
    };
  }, [cwd, initialId, load]);
  useEffect15(() => {
    if (!preview) return;
    const delay = Math.min(preview.expiresAt, preview.tokenExpiresAt) - Date.now();
    if (delay <= 0) {
      setExpired(true);
      return;
    }
    const timer = window.setTimeout(() => setExpired(true), delay);
    return () => window.clearTimeout(timer);
  }, [preview]);
  const lines = useMemo4(() => knowledgeLineDiff(preview?.before || "", preview?.after || ""), [preview]);
  const stale = !!preview && previewNonce !== nonce;
  async function decide(decision) {
    if (!cwd || !preview || pending) return;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const value = await getKnowledgeApi().decideKnowledgeReview({ cwd, token: preview.reviewToken, decision });
      const text = value.status === "rejected" ? t("rejected") : value.indexed === false || value.reviewRecorded === false ? `${t("savedPartial")} ${value.indexError || value.recordError || ""}` : t("applied");
      setResult(text);
      setPreview(null);
      setSelected("");
      setChecked(false);
      useKnowledgeStore.getState().invalidate();
      useKnowledgeStore.getState().apply({
        kind: "notice",
        id: String(Date.now()),
        sessionId: null,
        severity: value.indexed === false ? "warning" : "info",
        text
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setChecked(false);
      setExpired(true);
    } finally {
      setPending(false);
    }
  }
  return /* @__PURE__ */ jsxs15("div", { className: "space-y-3", "data-testid": "wiki-review-panel", children: [
    /* @__PURE__ */ jsx15("p", { className: "text-xs leading-relaxed text-ink-dim", children: t("originProject") }),
    !cwd && /* @__PURE__ */ jsx15("p", { className: "text-xs text-warn", children: t("selectProject") }),
    result && /* @__PURE__ */ jsx15("p", { role: "status", className: "rounded-lg bg-hover p-3 text-xs", children: result }),
    error && /* @__PURE__ */ jsxs15("div", { role: "alert", className: "rounded-lg border border-border p-3 text-xs text-err", children: [
      error,
      selected && /* @__PURE__ */ jsx15(Button, { size: "sm", disabled: pending, onClick: () => void load(selected), children: t("refreshPreview") })
    ] }),
    /* @__PURE__ */ jsxs15("div", { className: "grid gap-4 min-[950px]:grid-cols-[240px_minmax(0,1fr)]", children: [
      /* @__PURE__ */ jsxs15("aside", { children: [
        /* @__PURE__ */ jsxs15("div", { className: "flex items-center justify-between text-xs", children: [
          /* @__PURE__ */ jsxs15("span", { children: [
            t("reviews"),
            " \xB7 ",
            page?.total ?? "\u2014"
          ] }),
          loading && /* @__PURE__ */ jsx15("span", { role: "status", children: t("loading") })
        ] }),
        /* @__PURE__ */ jsxs15("div", { className: "mt-2 max-h-60 space-y-1 overflow-auto min-[950px]:max-h-[52vh]", children: [
          page?.items.map((item) => /* @__PURE__ */ jsxs15(
            "button",
            {
              type: "button",
              disabled: pending,
              onClick: () => void load(item.id),
              className: `w-full rounded-lg border p-3 text-left transition-colors ${selected === item.id ? "border-ink-faint bg-[var(--highlight)]" : "border-border hover:bg-hover"}`,
              children: [
                /* @__PURE__ */ jsx15("span", { className: "block break-words text-xs font-medium", children: item.title }),
                /* @__PURE__ */ jsx15("span", { className: "mt-1 block break-all font-mono text-[11px] text-ink-dim", children: item.path }),
                (item.expired || item.bindingChanged) && /* @__PURE__ */ jsx15("span", { className: "mt-1 block text-xs text-warn", children: item.expired ? t("expired") : t("stalePreview") })
              ]
            },
            item.id
          )),
          page && !page.items.length && !loading && /* @__PURE__ */ jsx15(StatePanel, { compact: true, title: t("empty") })
        ] }),
        /* @__PURE__ */ jsxs15("div", { className: "mt-2 flex justify-between", children: [
          /* @__PURE__ */ jsx15(
            Button,
            {
              size: "sm",
              disabled: !offset || loading,
              onClick: () => setOffset(Math.max(0, offset - 12)),
              children: t("previous")
            }
          ),
          /* @__PURE__ */ jsx15(
            Button,
            {
              size: "sm",
              disabled: page?.nextOffset == null || loading,
              onClick: () => setOffset(page?.nextOffset ?? 0),
              children: t("next")
            }
          )
        ] }),
        page?.problems?.length ? /* @__PURE__ */ jsxs15("details", { className: "mt-2 text-xs text-warn", children: [
          /* @__PURE__ */ jsx15("summary", { children: t("problems") }),
          page.problems.map((p) => /* @__PURE__ */ jsx15("p", { className: "break-words", children: p.error }, p.id))
        ] }) : null
      ] }),
      /* @__PURE__ */ jsxs15("div", { className: "min-w-0", children: [
        !preview && /* @__PURE__ */ jsx15("p", { className: "rounded-xl bg-hover p-6 text-center text-xs text-ink-dim", role: "status", children: pending ? t("loading") : t("selectReview") }),
        preview && /* @__PURE__ */ jsxs15("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxs15("div", { children: [
            /* @__PURE__ */ jsx15("h3", { className: "break-words text-sm font-semibold", children: preview.title }),
            /* @__PURE__ */ jsx15("p", { className: "mt-1 break-all font-mono text-[11px] text-ink-dim", children: preview.path }),
            /* @__PURE__ */ jsxs15("p", { className: "mt-2 whitespace-pre-wrap break-words text-xs", children: [
              t("reason"),
              "\uFF1A",
              preview.rationale
            ] })
          ] }),
          /* @__PURE__ */ jsx15("p", { className: "rounded-lg bg-hover p-2 text-xs text-ink-dim", children: t("preserve") }),
          /* @__PURE__ */ jsx15("div", { className: "flex flex-wrap gap-1", role: "tablist", "aria-label": t("reviewTitle"), children: ["diff", "both", "protected"].map((tab) => /* @__PURE__ */ jsx15(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": view === tab,
              onClick: () => setView(tab),
              className: `rounded-lg px-3 py-2 text-xs ${view === tab ? "bg-ink text-on-ink" : "text-ink-dim hover:bg-hover"}`,
              children: t(tab)
            },
            tab
          )) }),
          view === "diff" && /* @__PURE__ */ jsx15(
            "section",
            {
              className: "max-h-[38vh] overflow-auto rounded-lg border border-border font-mono text-[11px]",
              "aria-label": t("diff"),
              children: lines.map((row) => /* @__PURE__ */ jsxs15(
                "div",
                {
                  className: `flex gap-2 px-2 leading-6 ${row.kind === "add" ? "bg-ok/10" : row.kind === "remove" ? "bg-err/8" : "text-ink-dim"}`,
                  children: [
                    /* @__PURE__ */ jsxs15("span", { className: "w-12 shrink-0 select-none text-right text-ink-faint", children: [
                      row.oldLine || "",
                      " ",
                      row.newLine || ""
                    ] }),
                    /* @__PURE__ */ jsx15("span", { title: row.kind, className: "w-3 shrink-0", children: row.kind === "add" ? "+" : row.kind === "remove" ? "\u2212" : " " }),
                    /* @__PURE__ */ jsx15("span", { className: "min-w-0 whitespace-pre-wrap break-words", children: row.text || " " })
                  ]
                },
                `${row.kind}:${row.oldLine}:${row.newLine}:${row.text}`
              ))
            }
          ),
          view === "both" && /* @__PURE__ */ jsx15("div", { className: "grid gap-2 min-[1100px]:grid-cols-2", children: ["before", "after"].map((side) => /* @__PURE__ */ jsxs15("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsx15("p", { className: "mb-1 text-xs font-medium", children: t(side) }),
            /* @__PURE__ */ jsx15("pre", { className: "max-h-[38vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-3 text-xs leading-relaxed", children: preview[side] || "\u2014" })
          ] }, side)) }),
          view === "protected" && /* @__PURE__ */ jsx15("pre", { className: "max-h-[38vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-3 text-xs leading-relaxed", children: preview.protectedText || "\u2014" }),
          /* @__PURE__ */ jsxs15("div", { children: [
            /* @__PURE__ */ jsx15("h4", { className: "mb-2 text-xs font-semibold", children: t("sources") }),
            /* @__PURE__ */ jsx15("div", { className: "space-y-1", children: preview.sources.map((source) => /* @__PURE__ */ jsxs15(
              "div",
              {
                className: "flex flex-wrap items-start justify-between gap-1 rounded-lg border border-border px-2 py-2",
                children: [
                  /* @__PURE__ */ jsxs15("div", { className: "min-w-0", children: [
                    /* @__PURE__ */ jsx15("p", { className: "break-all text-xs", children: source.path }),
                    /* @__PURE__ */ jsxs15("p", { className: "font-mono text-[11px] text-ink-faint", children: [
                      "L",
                      source.startLine,
                      "\u2013",
                      source.endLine,
                      " \xB7 ",
                      source.hash?.slice(0, 12)
                    ] }),
                    source.changed && /* @__PURE__ */ jsx15("p", { className: "text-xs text-warn", children: t("sourceChanged") })
                  ] }),
                  /* @__PURE__ */ jsx15(Button, { size: "sm", onClick: () => setReadPath(source.path), children: t("openSource") })
                ]
              },
              source.path
            )) })
          ] }),
          readPath && /* @__PURE__ */ jsx15(
            KnowledgeNoteViewer,
            {
              cwd,
              revision,
              path: readPath,
              onClose: () => setReadPath(null)
            }
          ),
          preview.status === "pending" && (preview.expired || expired || preview.targetChanged || stale) && /* @__PURE__ */ jsxs15("p", { role: "alert", className: "text-xs text-warn", children: [
            preview.targetChanged ? t("targetChanged") : stale ? t("stalePreview") : t("expired"),
            " ",
            /* @__PURE__ */ jsx15(Button, { size: "sm", disabled: pending, onClick: () => void load(preview.id), children: t("refreshPreview") })
          ] }),
          cwd && /* @__PURE__ */ jsx15(
            WikiModelReview,
            {
              cwd,
              preview,
              disabled: pending || !preview.canApply || expired || stale,
              onBusy: setPending,
              onFailure: () => setExpired(true),
              onComplete: async (value) => {
                setResult(
                  value.applied ? t("modelReviewApplied") : value.verdict === "approve" ? t("modelReviewPass") : value.verdict === "reject" ? t("modelReviewReject") : t("modelReviewHuman")
                );
                await load(preview.id);
              }
            }
          ),
          /* @__PURE__ */ jsx15("p", { className: "text-xs text-ink-dim", children: t("notScience") }),
          /* @__PURE__ */ jsxs15("label", { className: "flex items-start gap-2 text-xs", children: [
            /* @__PURE__ */ jsx15(
              "input",
              {
                type: "checkbox",
                checked,
                onChange: (e) => setChecked(e.target.checked),
                disabled: pending || !preview.canApply || expired || stale,
                className: "mt-0.5"
              }
            ),
            t("confirmReview")
          ] }),
          /* @__PURE__ */ jsxs15("div", { className: "flex flex-wrap justify-end gap-2", children: [
            /* @__PURE__ */ jsx15(Button, { disabled: pending, onClick: () => void decide("reject"), children: t("reject") }),
            /* @__PURE__ */ jsx15(
              Button,
              {
                variant: "primary",
                disabled: pending || !preview.canApply || !checked || expired || stale,
                onClick: () => void decide("apply"),
                children: pending ? t("applying") : t("approve")
              }
            )
          ] })
        ] })
      ] })
    ] })
  ] });
}

// ui/knowledge/KnowledgePanel.tsx
import { jsx as jsx16, jsxs as jsxs16 } from "react/jsx-runtime";
function KnowledgePanel({
  context,
  headless = false,
  hideTabs = false
}) {
  const activeCwd = useSessionsStore((s) => s.cwd), activeSession = useSessionsStore((s) => s.activeSessionId);
  const cwd = context ? context.cwd : activeCwd, sessionId = context ? context.sessionId : activeSession, t = useKnowledgeText();
  const { data, error, loading, refresh } = useKnowledgeOverview(cwd, sessionId);
  const [tab, setTab] = useState17(
    context?.tab || "overview"
  );
  const [path, setPath] = useState17(""), [preview, setPreview] = useState17(null), [busy, setBusy] = useState17(false), [actionError, setActionError] = useState17(null);
  useEffect16(() => {
    setTab(context?.tab || "overview");
    setPreview(null);
    setPath("");
    setActionError(null);
  }, [context?.tab]);
  const binding = data?.binding, index = data?.index;
  const coverage = index?.coverage === "ready" ? t("coverageReady") : index?.coverage === "indexing" ? t("coverageIndexing") : index?.coverage === "partial" ? t("coveragePartial") : t("coverageUninitialized");
  async function switchFolder() {
    setActionError(null);
    try {
      const selected = await getKnowledgeApi().pickDirectory();
      if (selected) setup(selected);
    } catch (e) {
      setActionError(String(e.message || e));
    }
  }
  async function folders() {
    setActionError(null);
    try {
      const selected = await getKnowledgeApi().pickDirectory();
      if (selected) {
        setPath(selected);
        setPreview(null);
      }
    } catch (e) {
      setActionError(String(e.message || e));
    }
  }
  async function inspect() {
    setBusy(true);
    setActionError(null);
    try {
      setPreview(await getKnowledgeApi().previewKnowledgeSetup({ cwd, path: path.trim() || binding?.vault || null }));
    } catch (e) {
      setActionError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }
  function setup(target) {
    void launchKnowledgeSetup(cwd, sessionId, target).catch(reportKnowledgeError);
  }
  return /* @__PURE__ */ jsxs16("div", { className: "knowledge-panel text-ink", "data-testid": "knowledge-panel", children: [
    /* @__PURE__ */ jsxs16("header", { className: `flex items-start gap-3 ${headless ? "justify-end" : "justify-between"}`, children: [
      !headless && /* @__PURE__ */ jsxs16("div", { children: [
        /* @__PURE__ */ jsx16("h2", { className: "text-base font-semibold", children: t("title") }),
        /* @__PURE__ */ jsx16("p", { className: "mt-1 text-xs text-ink-dim", children: t("subtitle") })
      ] }),
      /* @__PURE__ */ jsx16(Button, { size: "sm", disabled: loading || busy, onClick: () => void refresh(), children: loading ? t("loading") : t("refresh") })
    ] }),
    !hideTabs && /* @__PURE__ */ jsx16(
      "div",
      {
        className: "my-4 flex flex-wrap gap-1 border-b border-border pb-2",
        role: "tablist",
        "aria-label": t("title"),
        children: ["overview", "settings", "reviews", "maintenance", "semantic", "topics"].map((item) => /* @__PURE__ */ jsx16(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": tab === item,
            disabled: item !== "overview" && !binding,
            onClick: () => setTab(item),
            className: `rounded-lg px-3 py-2 text-xs disabled:opacity-40 ${tab === item ? "bg-hover font-semibold" : "text-ink-dim hover:bg-hover"}`,
            children: t(item)
          },
          item
        ))
      }
    ),
    error && /* @__PURE__ */ jsx16("p", { role: "alert", className: "mb-3 break-words rounded-lg border border-border p-3 text-xs text-err", children: error }),
    !data && loading && /* @__PURE__ */ jsx16("p", { role: "status", className: "text-xs", children: t("loading") }),
    tab === "settings" && /* @__PURE__ */ jsxs16("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsxs16("section", { className: "rounded-xl border border-border p-4", children: [
        /* @__PURE__ */ jsx16("h3", { className: "text-xs font-semibold", children: t("vault") }),
        /* @__PURE__ */ jsx16("p", { className: "mt-1 break-all font-mono text-xs", children: binding?.vault || t("notBound") }),
        /* @__PURE__ */ jsx16("p", { className: "mt-1 text-[11px] text-ink-faint", children: t("scopeValue") }),
        /* @__PURE__ */ jsxs16("div", { className: "mt-3 flex flex-wrap gap-1", children: [
          /* @__PURE__ */ jsx16(Button, { size: "sm", disabled: !cwd, onClick: () => setup(binding?.vault), children: binding ? t("adjustCurrent") : t("setup") }),
          /* @__PURE__ */ jsx16(Button, { size: "sm", disabled: busy || !cwd, onClick: () => void switchFolder(), children: t("switchFolder") })
        ] }),
        /* @__PURE__ */ jsx16("p", { className: "mt-2 text-xs text-ink-dim", children: t("globalSwitch") })
      ] }),
      /* @__PURE__ */ jsx16(KnowledgeCloudSection, { cwd, bindingRevision: binding?.revision }),
      binding && /* @__PURE__ */ jsx16(KnowledgeMaintenance, { cwd, revision: binding.revision, index }),
      binding && /* @__PURE__ */ jsxs16("details", { className: "rounded-xl border border-border p-4", "data-testid": "knowledge-semantic-section", children: [
        /* @__PURE__ */ jsx16("summary", { className: "cursor-pointer select-none text-xs font-semibold", children: t("semantic") }),
        /* @__PURE__ */ jsx16("div", { className: "mt-3", children: /* @__PURE__ */ jsx16(SemanticManagement, { cwd, bindingRevision: binding.revision }) })
      ] }),
      binding && /* @__PURE__ */ jsxs16("details", { className: "rounded-xl border border-border p-4", "data-testid": "knowledge-topics-section", children: [
        /* @__PURE__ */ jsx16("summary", { className: "cursor-pointer select-none text-xs font-semibold", children: t("topics") }),
        /* @__PURE__ */ jsx16("div", { className: "mt-3", children: /* @__PURE__ */ jsx16(TopicManagement, { cwd, bindingRevision: binding.revision, sessionId }) })
      ] })
    ] }),
    tab === "overview" && /* @__PURE__ */ jsxs16("div", { className: "space-y-4", children: [
      /* @__PURE__ */ jsx16(KnowledgeCloudSection, { cwd, bindingRevision: binding?.revision }),
      /* @__PURE__ */ jsx16(ResearchRunsCard, { cwd, project: data?.project || null, revision: binding?.revision || 0 }),
      data && !data.enabled && /* @__PURE__ */ jsx16("p", { className: "rounded-lg bg-hover p-3 text-xs text-warn", children: t("disabled") }),
      data?.enabled && !data.bound && /* @__PURE__ */ jsxs16("div", { className: "rounded-xl border border-dashed border-border-strong p-5", children: [
        /* @__PURE__ */ jsx16("h3", { className: "text-sm font-medium", children: t("notBound") }),
        /* @__PURE__ */ jsx16("p", { className: "mt-2 text-xs leading-relaxed text-ink-dim", children: t("notBoundHint") })
      ] }),
      binding && /* @__PURE__ */ jsxs16("section", { className: "rounded-xl border border-border p-4", children: [
        /* @__PURE__ */ jsxs16("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsx16("h3", { className: "text-xs font-semibold", children: t("vault") }),
          /* @__PURE__ */ jsx16("span", { className: "rounded-full bg-hover px-2 py-0.5 text-xs text-ink-2", children: t("scopeValue") })
        ] }),
        /* @__PURE__ */ jsx16("p", { className: "mt-2 break-all font-mono text-xs", children: binding.vault }),
        /* @__PURE__ */ jsx16("p", { className: "mt-1 text-[11px] text-ink-faint", children: t("notMcp") }),
        /* @__PURE__ */ jsxs16("dl", { className: "my-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs", children: [
          /* @__PURE__ */ jsx16("dt", { className: "text-ink-dim", children: t("project") }),
          /* @__PURE__ */ jsx16("dd", { className: "break-all", children: data.project || t("noProject") }),
          /* @__PURE__ */ jsx16("dt", { className: "text-ink-dim", children: t("profile") }),
          /* @__PURE__ */ jsx16("dd", { children: binding.profile }),
          /* @__PURE__ */ jsx16("dt", { className: "text-ink-dim", children: t("deposit") }),
          /* @__PURE__ */ jsx16("dd", { children: binding.depositMode }),
          /* @__PURE__ */ jsx16("dt", { className: "text-ink-dim", children: t("subagents") }),
          /* @__PURE__ */ jsx16("dd", { children: binding.subagentPolicy })
        ] }),
        /* @__PURE__ */ jsxs16("div", { className: "flex flex-wrap gap-1", children: [
          /* @__PURE__ */ jsx16(
            Button,
            {
              size: "sm",
              onClick: () => void getKnowledgeApi().openKnowledgeTarget({ cwd, revision: binding.revision }).catch(reportKnowledgeError),
              children: t("openVault")
            }
          ),
          /* @__PURE__ */ jsx16(Button, { size: "sm", disabled: !cwd, onClick: () => setup(binding.vault), children: t("adjust") })
        ] })
      ] }),
      /* @__PURE__ */ jsxs16("section", { className: "rounded-xl border border-border p-4", children: [
        /* @__PURE__ */ jsxs16("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsx16("h3", { className: "text-xs font-semibold", children: t("literature") }),
          /* @__PURE__ */ jsx16("span", { className: "rounded-full bg-hover px-2 py-0.5 text-xs text-ink-dim", children: t("literatureBound") })
        ] }),
        /* @__PURE__ */ jsx16("p", { className: "mt-2 text-xs leading-relaxed text-ink-dim", children: t("literatureHint") }),
        /* @__PURE__ */ jsxs16("div", { className: "mt-3 flex flex-wrap gap-1", children: [
          /* @__PURE__ */ jsx16(Button, { size: "sm", onClick: () => useSettingsStore.getState().openWith("zotero"), children: t("literatureSetup") }),
          /* @__PURE__ */ jsx16(
            Button,
            {
              size: "sm",
              onClick: () => void getKnowledgeApi().openExternal("https://www.zotero.org/download").catch(reportKnowledgeError),
              children: t("literatureDownload")
            }
          )
        ] })
      ] }),
      binding && /* @__PURE__ */ jsxs16("section", { className: "rounded-xl border border-edge p-3 space-y-2", children: [
        /* @__PURE__ */ jsxs16("label", { className: "flex items-center justify-between text-xs", children: [
          t("reviewModeTitle"),
          /* @__PURE__ */ jsxs16(
            "select",
            {
              "aria-label": t("reviewModeLabel"),
              value: data.reviewMode ?? "automatic",
              disabled: busy,
              onChange: async (e) => {
                const action = e.target.value === "strict" ? "review-strict" : "review-automatic";
                setBusy(true);
                setActionError(null);
                try {
                  await getKnowledgeApi().maintainKnowledge({ cwd, revision: binding.revision, action });
                  refresh();
                } catch (err) {
                  setActionError(String(err));
                } finally {
                  setBusy(false);
                }
              },
              className: "rounded bg-surface px-2 py-1",
              children: [
                /* @__PURE__ */ jsx16("option", { value: "automatic", children: t("reviewAutomatic") }),
                /* @__PURE__ */ jsx16("option", { value: "strict", children: t("reviewStrict") })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsx16("p", { className: "text-xs text-ink-dim", children: t("reviewLegend") }),
        /* @__PURE__ */ jsx16("p", { className: "text-xs text-ink-dim", children: t("reviewPermissions") }),
        actionError && /* @__PURE__ */ jsx16("p", { role: "alert", className: "text-xs text-err", children: actionError }),
        (data.wikiHistory ?? []).length > 0 && /* @__PURE__ */ jsxs16("details", { children: [
          /* @__PURE__ */ jsx16("summary", { className: "text-xs cursor-pointer", children: t("wikiHistory") }),
          data.wikiHistory?.map((item) => /* @__PURE__ */ jsxs16("div", { className: "flex gap-2 items-center text-xs py-1", children: [
            /* @__PURE__ */ jsxs16("span", { className: "flex-1 break-all", children: [
              item.path,
              " \xB7 ",
              t("wikiSaved"),
              " \xB7 ",
              new Date(item.reviewedAt).toLocaleString()
            ] }),
            /* @__PURE__ */ jsx16(
              Button,
              {
                size: "sm",
                disabled: busy,
                onClick: async () => {
                  if (!window.confirm(t("wikiUndoConfirm").replace("{path}", item.path))) return;
                  setBusy(true);
                  setActionError(null);
                  try {
                    await getKnowledgeApi().maintainKnowledge({
                      cwd,
                      revision: binding.revision,
                      action: "undo-wiki",
                      id: item.id,
                      expectedHash: item.afterHash
                    });
                    refresh();
                  } catch (err) {
                    setActionError(String(err));
                  } finally {
                    setBusy(false);
                  }
                },
                children: t("wikiUndo")
              }
            )
          ] }, item.id))
        ] })
      ] }),
      binding && /* @__PURE__ */ jsx16(
        KnowledgeSpecialists,
        {
          settings: data.specialistSettings,
          bindingRevision: binding.revision,
          permitted: binding.subagentPolicy === "read-local",
          refresh,
          runs: data.flow?.specialists ?? []
        }
      ),
      data?.specialistSettingsError && /* @__PURE__ */ jsx16("p", { role: "alert", className: "text-xs text-err", children: data.specialistSettingsError }),
      binding && /* @__PURE__ */ jsxs16("section", { children: [
        /* @__PURE__ */ jsxs16("div", { className: "mb-2 flex flex-wrap items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsx16("h3", { className: "text-xs font-semibold", children: t("index") }),
          /* @__PURE__ */ jsx16("span", { className: "text-xs text-ink-dim", children: index ? coverage : t("unknown") })
        ] }),
        /* @__PURE__ */ jsx16("div", { className: "grid grid-cols-3 gap-2", children: [
          [t("notes"), index?.noteCount],
          [t("pending"), index?.pendingChanges],
          [t("jobs"), index?.jobs]
        ].map(([label, value]) => /* @__PURE__ */ jsxs16("div", { className: "rounded-lg bg-hover px-3 py-2", children: [
          /* @__PURE__ */ jsx16("p", { className: "text-xs text-ink-dim", children: label }),
          /* @__PURE__ */ jsx16("p", { className: "mt-1 text-lg font-medium tabular-nums", children: value ?? "\u2014" })
        ] }, String(label))) }),
        /* @__PURE__ */ jsxs16("p", { className: "mt-2 text-xs text-ink-dim", children: [
          t("lastChecked"),
          "\uFF1A",
          index?.lastReconciledAt ? new Date(index.lastReconciledAt).toLocaleString() : t("unknown")
        ] }),
        index && /* @__PURE__ */ jsx16("p", { className: `mt-1 text-xs ${index.watching ? "text-ink-dim" : "text-warn"}`, children: index.watching ? t("watching") : t("notWatching") }),
        data?.error && /* @__PURE__ */ jsx16("p", { role: "alert", className: "mt-2 break-words text-xs text-err", children: data.error }),
        /* @__PURE__ */ jsx16(Button, { size: "sm", className: "mt-1", onClick: () => setTab("maintenance"), children: t("maintenance") })
      ] }),
      data?.legacyProjectVault && /* @__PURE__ */ jsxs16("aside", { className: "rounded-xl border border-border p-3", children: [
        /* @__PURE__ */ jsx16("h3", { className: "text-xs font-medium text-warn", children: t("legacy") }),
        /* @__PURE__ */ jsx16("p", { className: "my-1 break-all font-mono text-[11px]", children: data.legacyProjectVault }),
        /* @__PURE__ */ jsx16("p", { className: "text-xs text-ink-dim", children: t("legacyHint") })
      ] }),
      /* @__PURE__ */ jsxs16("section", { className: "rounded-xl border border-border p-4", children: [
        /* @__PURE__ */ jsx16("h3", { className: "text-xs font-semibold", children: t("newPath") }),
        /* @__PURE__ */ jsx16("p", { className: "mt-1 text-xs text-ink-dim", children: t("skillBound") }),
        /* @__PURE__ */ jsx16("p", { className: "my-2 text-xs leading-relaxed text-ink-dim", children: t("globalSwitch") }),
        /* @__PURE__ */ jsxs16("label", { className: "block text-xs text-ink-dim", children: [
          t("vault"),
          /* @__PURE__ */ jsx16(
            "input",
            {
              "aria-label": t("vault"),
              value: path,
              onChange: (e) => {
                setPath(e.target.value);
                setPreview(null);
              },
              placeholder: t("pathPlaceholder"),
              className: "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs16("div", { className: "mt-2 flex flex-wrap gap-1", children: [
          /* @__PURE__ */ jsx16(Button, { size: "sm", disabled: busy, onClick: () => void folders(), children: t("selectFolder") }),
          /* @__PURE__ */ jsx16(Button, { size: "sm", disabled: busy, onClick: () => void inspect(), children: busy ? t("loading") : t("preview") })
        ] }),
        !cwd && /* @__PURE__ */ jsx16("p", { className: "mt-2 text-xs text-warn", children: t("selectProject") }),
        actionError && /* @__PURE__ */ jsx16("p", { role: "alert", className: "mt-2 whitespace-pre-wrap break-words text-xs text-err", children: actionError }),
        preview && /* @__PURE__ */ jsxs16("div", { className: "mt-3 space-y-3", children: [
          /* @__PURE__ */ jsx16("p", { className: "text-xs text-ink-dim", children: t("previewOnly") }),
          /* @__PURE__ */ jsxs16("div", { children: [
            /* @__PURE__ */ jsx16("p", { className: "text-xs font-medium", children: preview.context.vault?.exists ? t("existing") : t("newVault") }),
            /* @__PURE__ */ jsx16("pre", { className: "mt-1 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-3 text-xs", children: (preview.context.vault?.entries || []).map((e) => (e.type === "directory" ? "\u25B8 " : "  ") + e.path).join("\n") || t("emptyPreview") }),
            preview.context.vault?.truncated && /* @__PURE__ */ jsx16("p", { className: "text-xs text-warn", children: t("truncated") })
          ] }),
          /* @__PURE__ */ jsxs16("div", { children: [
            /* @__PURE__ */ jsx16("h4", { className: "mb-1 text-xs font-semibold", children: t("templates") }),
            preview.options.profiles.map((profile) => /* @__PURE__ */ jsxs16(
              "details",
              {
                open: profile.id === (binding?.profile || "hybrid"),
                className: "mt-1 rounded-lg border border-border p-2 text-xs",
                children: [
                  /* @__PURE__ */ jsx16("summary", { className: "cursor-pointer", children: profile.label }),
                  /* @__PURE__ */ jsx16("p", { className: "mt-2 text-ink-dim", children: profile.description }),
                  /* @__PURE__ */ jsxs16("p", { className: "mt-2 text-xs", children: [
                    t("library"),
                    "\uFF1A",
                    profile.libraryTypes.join(" \xB7 ")
                  ] }),
                  /* @__PURE__ */ jsxs16("p", { className: "mt-1 text-xs", children: [
                    t("projectFolders"),
                    "\uFF1A",
                    profile.projectTypes.join(" \xB7 ")
                  ] }),
                  /* @__PURE__ */ jsx16("pre", { className: "mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-hover p-3 font-mono text-[11px]", children: profile.directories.join("\n") })
                ]
              },
              profile.id
            ))
          ] }),
          /* @__PURE__ */ jsxs16("div", { children: [
            /* @__PURE__ */ jsx16("h4", { className: "text-xs font-semibold", children: t("sampleContent") }),
            preview.templateSamples.map((sample) => /* @__PURE__ */ jsxs16("details", { className: "mt-1 rounded-lg border border-border p-2", children: [
              /* @__PURE__ */ jsx16("summary", { className: "cursor-pointer font-mono text-xs", children: sample.path }),
              /* @__PURE__ */ jsx16("pre", { className: "mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words bg-hover p-3 text-xs", children: sample.text })
            ] }, sample.path))
          ] })
        ] }),
        /* @__PURE__ */ jsx16("div", { className: "mt-3 flex justify-end", children: /* @__PURE__ */ jsx16(
          Button,
          {
            variant: "primary",
            disabled: !cwd || !data?.enabled || busy,
            onClick: () => setup(path.trim() || void 0),
            children: t("setup")
          }
        ) })
      ] }),
      /* @__PURE__ */ jsx16("p", { className: "text-xs leading-relaxed text-ink-dim", children: t("privacy") })
    ] }),
    tab === "reviews" && binding && /* @__PURE__ */ jsx16(WikiReviewPanel, { cwd, revision: binding.revision, initialId: context?.id }),
    tab === "reviews" && !binding && /* @__PURE__ */ jsxs16("section", { className: "rounded-xl border border-dashed border-border p-5", children: [
      /* @__PURE__ */ jsx16("h3", { className: "text-sm font-medium", children: t("notBound") }),
      /* @__PURE__ */ jsx16("p", { className: "mt-2 text-xs leading-relaxed text-ink-dim", children: t("notBoundHint") })
    ] }),
    tab === "maintenance" && binding && /* @__PURE__ */ jsx16(KnowledgeMaintenance, { cwd, revision: binding.revision, index }),
    tab === "semantic" && binding && /* @__PURE__ */ jsx16(SemanticManagement, { cwd, bindingRevision: binding.revision }),
    tab === "topics" && binding && /* @__PURE__ */ jsx16(TopicManagement, { cwd, bindingRevision: binding.revision, sessionId })
  ] });
}

// ui/knowledge/KnowledgeView.tsx
import { jsx as jsx17, jsxs as jsxs17 } from "react/jsx-runtime";
function KnowledgeView() {
  const t = useKnowledgeText();
  const dialog = useKnowledgeStore((s) => s.dialog);
  const close = useKnowledgeStore((s) => s.close);
  const open = useKnowledgeStore((s) => s.open);
  const cwd = useSessionsStore((s) => s.cwd);
  const activeSessionId = useSessionsStore((s) => s.activeSessionId);
  const lastSession = useRef8({ cwd, sessionId: activeSessionId });
  const contextChanged = lastSession.current.cwd !== cwd || lastSession.current.sessionId !== activeSessionId;
  const requestedTab = useUiStore((s) => s.knowledgeTab);
  const setRequestedTab = useUiStore((s) => s.setKnowledgeTab);
  const [tab, setTab] = useState18(requestedTab);
  const pluginTabs = usePluginEntries(UI_REGIONS.KnowledgeTab);
  const [pluginTab, setPluginTab] = useState18(null);
  const selectedPlugin = pluginTabs.find((entry) => entry.id === pluginTab);
  useEffect17(() => {
    if (pluginTab && !pluginTabs.some((entry) => entry.id === pluginTab)) setPluginTab(null);
  }, [pluginTab, pluginTabs]);
  useEffect17(() => setTab(requestedTab), [requestedTab]);
  const selectTab = (next) => {
    setPluginTab(null);
    setTab(next);
    setRequestedTab(next);
  };
  useEffect17(() => {
    const changed = lastSession.current.cwd !== cwd || lastSession.current.sessionId !== activeSessionId;
    lastSession.current = { cwd, sessionId: activeSessionId };
    if (!dialog || changed) {
      setPluginTab(null);
      open({ cwd, sessionId: activeSessionId, tab: "reviews" });
    }
  }, [dialog, open, cwd, activeSessionId]);
  useEffect17(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (useKnowledgeStore.getState().review) return;
      const target = event.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))
        return;
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  const overview = useKnowledgeOverview(dialog?.cwd ?? null, dialog?.sessionId ?? null).data;
  const binding = overview?.binding;
  if (!dialog || contextChanged) return null;
  const vault = binding?.vault?.replace(/[\\/]$/u, "") ?? "";
  const vaultLabel = vault.slice(Math.max(vault.lastIndexOf("/"), vault.lastIndexOf("\\")) + 1) || vault;
  const description = binding ? `${vaultLabel} \xB7 ${overview?.index?.noteCount ?? t("homeCountUnknown")} ${t("homeVaultNotes")}${overview?.project ? ` \xB7 ${t("homeProjectContext")}: ${overview.project}` : ""}` : t("homeBindingHint");
  const builtinPage = /* @__PURE__ */ jsx17("section", { className: "knowledge-view", "aria-label": t("title"), children: /* @__PURE__ */ jsx17("div", { className: "knowledge-view-body", children: /* @__PURE__ */ jsxs17("div", { className: "mx-auto w-full max-w-5xl", children: [
    !dialog.note && /* @__PURE__ */ jsx17(
      PageHeader,
      {
        title: t("title"),
        description,
        actions: /* @__PURE__ */ jsx17(
          Button,
          {
            size: "sm",
            variant: "primary",
            disabled: !binding,
            onClick: () => {
              if (binding)
                void getKnowledgeApi().openKnowledgeTarget({ cwd: dialog.cwd, revision: binding.revision }).catch(reportKnowledgeError);
            },
            children: t("homeNewNote")
          }
        ),
        tabs: /* @__PURE__ */ jsxs17("div", { className: "flex gap-1", role: "tablist", "aria-label": t("title"), children: [
          ["overview", "network", "reviews", "settings"].map((item) => /* @__PURE__ */ jsx17(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": !pluginTab && tab === item,
              className: `-mb-px border-b-2 px-3 py-2 text-[13px] ${tab === item ? "border-ink font-semibold text-ink" : "border-transparent text-ink-dim hover:text-ink"}`,
              onClick: () => selectTab(item),
              children: t(
                {
                  overview: "overviewTab",
                  network: "networkTab",
                  reviews: "reviewTab",
                  settings: "settingsTab"
                }[item]
              )
            },
            item
          )),
          pluginTabs.map((entry) => /* @__PURE__ */ jsx17(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": pluginTab === entry.id,
              className: `-mb-px border-b-2 px-3 py-2 text-[13px] ${pluginTab === entry.id ? "border-ink font-semibold text-ink" : "border-transparent text-ink-dim hover:text-ink"}`,
              onClick: () => setPluginTab(entry.id),
              "data-plugin": entry.pluginName,
              children: entry.title
            },
            entry.id
          ))
        ] })
      }
    ),
    selectedPlugin ? /* @__PURE__ */ jsx17(PluginEntryHost, { entry: selectedPlugin }) : dialog.note && dialog.noteRevision ? /* @__PURE__ */ jsx17(
      KnowledgeNoteViewer,
      {
        cwd: dialog.cwd,
        path: dialog.note,
        revision: dialog.noteRevision,
        onClose: () => open({ cwd: dialog.cwd, sessionId: dialog.sessionId, tab: "reviews" })
      }
    ) : tab === "network" ? /* @__PURE__ */ jsx17(KnowledgeNetwork, { cwd: dialog.cwd, sessionId: dialog.sessionId }) : tab === "reviews" ? /* @__PURE__ */ jsx17(
      KnowledgePanel,
      {
        context: { cwd: dialog.cwd, sessionId: dialog.sessionId, tab: "reviews", id: dialog.id },
        headless: true,
        hideTabs: true
      }
    ) : tab === "settings" ? /* @__PURE__ */ jsx17(
      KnowledgePanel,
      {
        context: { cwd: dialog.cwd, sessionId: dialog.sessionId, tab: "settings" },
        headless: true,
        hideTabs: true
      }
    ) : /* @__PURE__ */ jsx17(KnowledgeHome, { cwd: dialog.cwd, sessionId: dialog.sessionId, reviewId: dialog.id })
  ] }) }) });
  return builtinPage;
}

// ui/knowledge/KnowledgeUiRoot.tsx
import { useEffect as useEffect19 } from "react";
import { createPortal as createPortal2 } from "react-dom";

// ui/knowledge/WikiReviewDialog.tsx
import { useEffect as useEffect18, useMemo as useMemo5, useRef as useRef9, useState as useState19 } from "react";
import { createPortal } from "react-dom";
import { Fragment as Fragment4, jsx as jsx18, jsxs as jsxs18 } from "react/jsx-runtime";
function WikiReviewDialog({
  cwd,
  id,
  queued,
  onLater
}) {
  const t = useKnowledgeText();
  const box = useRef9(null);
  const revision = useKnowledgeStore((s) => s.revision);
  const [preview, setPreview] = useState19(null);
  const [error, setError] = useState19(null);
  const [pending, setPending] = useState19(false);
  const [tick, setTick] = useState19(0);
  const [view, setView] = useState19("diff");
  const [reviewing, setReviewing] = useState19(false);
  const [verdict, setVerdict] = useState19(null);
  useEffect18(() => {
    let live = true;
    setPreview(null);
    setError(null);
    setView("diff");
    setReviewing(false);
    setVerdict(null);
    setPending(true);
    void getKnowledgeApi().getKnowledgeOverview({ cwd }).then((overview) => {
      const binding = overview.binding?.revision;
      if (binding == null) throw new Error("not-bound");
      if (id) return getKnowledgeApi().previewKnowledgeReview({ cwd, id, revision: binding });
      return getKnowledgeApi().getKnowledgeReviews({ cwd, revision: binding, offset: 0, limit: 1 }).then((page) => {
        const first = page.items[0];
        if (!first) throw new Error("empty");
        return getKnowledgeApi().previewKnowledgeReview({ cwd, id: first.id, revision: binding });
      });
    }).then(
      (value) => {
        if (live) setPreview(value);
      },
      (cause) => {
        if (!live) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    ).finally(() => {
      if (live) setPending(false);
    });
    return () => {
      live = false;
    };
  }, [cwd, id, revision, tick]);
  useEffect18(() => {
    const node = box.current?.querySelector("button:not([disabled])");
    node?.focus();
  }, [preview, error]);
  const lines = useMemo5(() => knowledgeLineDiff(preview?.before || "", preview?.after || ""), [preview]);
  const visible = lines.slice(0, 200);
  async function decide(decision) {
    if (!preview || pending) return;
    setPending(true);
    setError(null);
    try {
      const value = await getKnowledgeApi().decideKnowledgeReview({ cwd, token: preview.reviewToken, decision });
      const text = value.status === "rejected" ? t("rejected") : value.indexed === false || value.reviewRecorded === false ? `${t("savedPartial")} ${value.indexError || value.recordError || ""}` : t("applied");
      useKnowledgeStore.getState().invalidate();
      useKnowledgeStore.getState().apply({
        kind: "notice",
        id: String(Date.now()),
        sessionId: null,
        severity: value.indexed === false ? "warning" : "info",
        text
      });
      onLater();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPending(false);
    }
  }
  const blocked = !preview?.canApply || preview.expired || preview.targetChanged;
  const errorText = error === "not-bound" ? t("notBound") : error === "empty" ? t("empty") : error;
  return createPortal(
    /* @__PURE__ */ jsx18("div", { className: "drone-knowledge-ui", children: /* @__PURE__ */ jsxs18(
      ActionSurface,
      {
        contentRef: box,
        ariaLabel: t("reviewTitle"),
        tone: "warn",
        width: "wide",
        testId: "wiki-review-dialog",
        onEscape: pending ? void 0 : onLater,
        children: [
          /* @__PURE__ */ jsxs18("div", { className: "shrink-0 border-b border-border px-5 py-4", children: [
            /* @__PURE__ */ jsxs18("p", { className: "text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint", children: [
              "Obsidian \xB7 ",
              t("reviews")
            ] }),
            /* @__PURE__ */ jsx18("h3", { className: "mt-1 text-base font-semibold text-ink", children: preview?.title || t("reviewTitle") }),
            preview && /* @__PURE__ */ jsx18("p", { className: "mt-1 break-all font-mono text-[11px] text-ink-dim select-text", children: preview.path })
          ] }),
          /* @__PURE__ */ jsxs18("div", { className: "min-h-0 flex-1 space-y-3 scroll-fade overflow-y-auto px-5 py-4", children: [
            pending && !preview && /* @__PURE__ */ jsx18("p", { className: "text-xs text-ink-dim", children: t("loading") }),
            errorText && /* @__PURE__ */ jsxs18("div", { role: "alert", className: "rounded-lg border border-border p-3 text-xs text-err", children: [
              /* @__PURE__ */ jsx18("p", { children: errorText }),
              /* @__PURE__ */ jsx18(Button, { size: "sm", className: "mt-2", disabled: pending, onClick: () => setTick((n) => n + 1), children: t("retry") })
            ] }),
            preview && /* @__PURE__ */ jsxs18(Fragment4, { children: [
              /* @__PURE__ */ jsxs18("p", { className: "whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink", children: [
                t("reason"),
                "\uFF1A",
                preview.rationale
              ] }),
              /* @__PURE__ */ jsx18("p", { className: "rounded-lg bg-hover px-3 py-2 text-xs leading-relaxed text-ink-dim", children: t("preserve") }),
              /* @__PURE__ */ jsx18("div", { className: "flex flex-wrap gap-1", role: "tablist", "aria-label": t("reviewTitle"), children: ["diff", "both", "protected"].map((tab) => /* @__PURE__ */ jsx18(
                "button",
                {
                  type: "button",
                  role: "tab",
                  "aria-selected": view === tab,
                  onClick: () => setView(tab),
                  className: `rounded-lg px-3 py-2 text-xs ${view === tab ? "bg-ink text-on-ink" : "text-ink-dim hover:bg-hover"}`,
                  children: t(tab)
                },
                tab
              )) }),
              view === "diff" && /* @__PURE__ */ jsxs18(
                "section",
                {
                  className: "max-h-[32vh] overflow-auto rounded-lg border border-border font-mono text-[11px]",
                  "aria-label": t("diff"),
                  children: [
                    visible.map((row) => /* @__PURE__ */ jsxs18(
                      "div",
                      {
                        className: `flex gap-2 px-2 leading-6 ${row.kind === "add" ? "bg-ok/10" : row.kind === "remove" ? "bg-err/8" : "text-ink-dim"}`,
                        children: [
                          /* @__PURE__ */ jsxs18("span", { className: "w-12 shrink-0 select-none text-right text-ink-faint", children: [
                            row.oldLine || "",
                            " ",
                            row.newLine || ""
                          ] }),
                          /* @__PURE__ */ jsx18("span", { title: row.kind, className: "w-3 shrink-0", children: row.kind === "add" ? "+" : row.kind === "remove" ? "\u2212" : " " }),
                          /* @__PURE__ */ jsx18("span", { className: "min-w-0 whitespace-pre-wrap break-words", children: row.text || " " })
                        ]
                      },
                      `${row.kind}:${row.oldLine}:${row.newLine}:${row.text}`
                    )),
                    lines.length > 200 && /* @__PURE__ */ jsx18("p", { className: "px-2 py-2 text-[11px] text-ink-faint", children: t("truncated") })
                  ]
                }
              ),
              view === "both" && /* @__PURE__ */ jsx18("div", { className: "grid gap-2", children: ["before", "after"].map((side) => /* @__PURE__ */ jsxs18("div", { className: "min-w-0", children: [
                /* @__PURE__ */ jsx18("p", { className: "mb-1 text-xs font-medium", children: t(side) }),
                /* @__PURE__ */ jsx18("pre", { className: "max-h-[22vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-3 text-xs leading-relaxed", children: preview[side] || "\u2014" })
              ] }, side)) }),
              view === "protected" && /* @__PURE__ */ jsx18("pre", { className: "max-h-[32vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-3 text-xs leading-relaxed", children: preview.protectedText || "\u2014" }),
              /* @__PURE__ */ jsxs18("div", { children: [
                /* @__PURE__ */ jsxs18("h4", { className: "mb-2 text-xs font-semibold", children: [
                  t("sources"),
                  " \xB7 ",
                  preview.sources.length
                ] }),
                /* @__PURE__ */ jsx18("div", { className: "max-h-28 space-y-1 overflow-auto", children: preview.sources.map((source) => /* @__PURE__ */ jsxs18("div", { className: "rounded-lg border border-border px-2 py-2", children: [
                  /* @__PURE__ */ jsx18("p", { className: "break-all text-xs", children: source.path }),
                  /* @__PURE__ */ jsxs18("p", { className: "font-mono text-[11px] text-ink-faint", children: [
                    "L",
                    source.startLine,
                    "\u2013",
                    source.endLine,
                    source.hash ? ` \xB7 ${source.hash.slice(0, 12)}` : ""
                  ] }),
                  source.changed && /* @__PURE__ */ jsx18("p", { className: "text-xs text-warn", children: t("sourceChanged") })
                ] }, source.path)) })
              ] }),
              (preview.expired || preview.targetChanged) && /* @__PURE__ */ jsxs18("p", { role: "alert", className: "text-xs text-warn", children: [
                preview.targetChanged ? t("targetChanged") : t("expired"),
                " ",
                /* @__PURE__ */ jsx18(Button, { size: "sm", disabled: pending, onClick: () => setTick((n) => n + 1), children: t("refreshPreview") })
              ] }),
              /* @__PURE__ */ jsx18(
                WikiModelReview,
                {
                  cwd,
                  preview,
                  adviceOnly: true,
                  defaultExpanded: true,
                  disabled: pending || blocked || reviewing,
                  onBusy: setReviewing,
                  onFailure: () => {
                  },
                  onComplete: async (value) => {
                    setVerdict(
                      value.applied ? t("modelReviewApplied") : value.verdict === "approve" ? t("modelReviewPass") : value.verdict === "reject" ? t("modelReviewReject") : t("modelReviewHuman")
                    );
                    if (value.applied) {
                      useKnowledgeStore.getState().invalidate();
                      useKnowledgeStore.getState().apply({
                        kind: "notice",
                        id: String(Date.now()),
                        sessionId: null,
                        severity: "info",
                        text: t("modelReviewApplied")
                      });
                      onLater();
                    }
                  }
                }
              ),
              /* @__PURE__ */ jsx18("p", { className: "text-xs text-ink-dim", children: t("notScience") })
            ] })
          ] }),
          /* @__PURE__ */ jsx18("div", { className: "shrink-0 border-t border-border px-5 py-3", children: /* @__PURE__ */ jsxs18("div", { className: "flex items-center justify-between gap-3", children: [
            /* @__PURE__ */ jsx18("p", { className: "min-w-0 truncate text-[11px] text-ink-faint", children: verdict || (queued > 0 ? t("reviewQueued").replace("{count}", String(queued)) : t("reviewLaterHint")) }),
            /* @__PURE__ */ jsxs18("div", { className: "flex shrink-0 gap-2", children: [
              /* @__PURE__ */ jsx18(Button, { disabled: pending && !!preview, onClick: onLater, children: t("later") }),
              /* @__PURE__ */ jsx18(
                Button,
                {
                  tone: "danger",
                  disabled: pending || reviewing || !preview,
                  onClick: () => void decide("reject"),
                  children: t("reject")
                }
              ),
              /* @__PURE__ */ jsx18(
                Button,
                {
                  variant: "primary",
                  disabled: pending || reviewing || !preview || blocked,
                  onClick: () => void decide("apply"),
                  children: pending && preview ? t("applying") : t("apply")
                }
              )
            ] })
          ] }) })
        ]
      }
    ) }),
    document.body
  );
}

// ui/knowledge/KnowledgeUiRoot.tsx
import { Fragment as Fragment5, jsx as jsx19, jsxs as jsxs19 } from "react/jsx-runtime";
function KnowledgeUiRoot() {
  const t = useKnowledgeText(), review = useKnowledgeStore((s) => s.review), reviewQueue = useKnowledgeStore((s) => s.reviewQueue), notice = useKnowledgeStore((s) => s.notice);
  const deferReview = useKnowledgeStore((s) => s.deferReview), dismiss = useKnowledgeStore((s) => s.dismiss);
  useEffect19(() => {
    if (!notice || notice.severity === "error") return;
    const timer = setTimeout(dismiss, 6500);
    return () => clearTimeout(timer);
  }, [notice, dismiss]);
  return /* @__PURE__ */ jsxs19(Fragment5, { children: [
    review && /* @__PURE__ */ jsx19(WikiReviewDialog, { cwd: review.cwd, id: review.id, queued: reviewQueue.length, onLater: deferReview }),
    notice && createPortal2(
      /* @__PURE__ */ jsx19("div", { className: "drone-knowledge-ui", children: /* @__PURE__ */ jsxs19(
        "div",
        {
          role: notice.severity === "error" ? "alert" : "status",
          className: "fixed bottom-5 right-4 z-(--z-toast) w-[min(420px,calc(100vw-32px))] rounded-xl border border-border bg-surface p-4 text-ink shadow-dialog",
          "data-testid": "knowledge-notice",
          children: [
            /* @__PURE__ */ jsxs19("div", { className: "flex items-start justify-between gap-2", children: [
              /* @__PURE__ */ jsx19(
                "p",
                {
                  className: `text-xs font-semibold ${notice.severity === "error" ? "text-err" : notice.severity === "warning" ? "text-warn" : ""}`,
                  children: t("notification")
                }
              ),
              /* @__PURE__ */ jsx19(Button, { size: "sm", onClick: dismiss, "aria-label": t("close"), children: "\xD7" })
            ] }),
            /* @__PURE__ */ jsx19("p", { className: "mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed", children: notice.text })
          ]
        }
      ) }),
      document.body
    )
  ] });
}

// ui/knowledge/KnowledgeFlowCard.tsx
import { useEffect as useEffect20, useState as useState20 } from "react";

// ui/knowledge/artifacts.ts
function mergeKnowledgeArtifacts(cards, tasks, cwd = "") {
  const key = (path) => {
    let p = path.replaceAll("\\", "/");
    if (!/^(?:[a-z]:\/|\/)/i.test(p) && cwd)
      p = `${cwd.replaceAll("\\", "/").replace(/\/$/, "")}/${p.replace(/^\.\//, "")}`;
    return /^[a-z]:/i.test(p) ? p.toLowerCase() : p;
  };
  const merged = /* @__PURE__ */ new Map();
  for (const card of cards) if (card.path) merged.set(key(card.path), card);
  for (const task of tasks)
    for (const file of taskArtifactLinks(task)) {
      const k = key(file.path);
      if (!merged.has(k))
        merged.set(k, {
          key: k,
          kind: "artifact",
          title: file.path.split(/[\\/]/).pop() || file.path,
          path: file.path,
          status: file.state,
          detail: "\u5DE5\u4F5C\u53F0\u8BB0\u5F55\u7684\u6587\u4EF6\u4EA7\u7269\uFF1B\u4E0D\u4EE3\u8868\u79D1\u5B66\u7ED3\u8BBA\u5DF2\u6838\u9A8C\u3002",
          at: 0
        });
    }
  return [...merged.values()];
}

// ui/knowledge/KnowledgeFlowCard.tsx
import { jsx as jsx20, jsxs as jsxs20 } from "react/jsx-runtime";
var phases = {
  "setup-complete": "setupComplete",
  preparing: "preparing",
  navigation: "navigationPhase",
  "reading-wiki": "readingWiki",
  searching: "searching",
  "reading-evidence": "readingEvidence",
  checking: "checking",
  released: "released",
  "no-hits": "noHits",
  blocked: "blocked",
  unconfigured: "unconfigured",
  "evidence-only": "evidenceOnly",
  interrupted: "interrupted"
};
function KnowledgeFlowCard({ sessionId }) {
  const t = useKnowledgeText(), appT = useT(), cwd = useSessionsStore((s) => s.cwd);
  const flow = useKnowledgeStore((s) => sessionId ? s.flows[sessionId] : void 0);
  const transcript = useTranscriptStore((s) => selectTranscript(s, sessionId));
  const latest = [...transcript.messages].reverse().find((m) => m.kind === "assistant" && m.taskView);
  const artifacts = mergeKnowledgeArtifacts(
    flow?.cards || [],
    latest?.kind === "assistant" ? latest.taskView?.tasks || [] : [],
    cwd || ""
  );
  const [open, setOpen] = useState20(false), [path, setPath] = useState20(null), [resuming, setResuming] = useState20(false);
  useEffect20(() => {
    setOpen(false);
    setPath(null);
    setResuming(false);
    if (!sessionId || isDraftSessionId(sessionId)) return;
    let live = true;
    void getKnowledgeApi().getKnowledgeOverview({ cwd, sessionId }).then((value) => {
      if (live && value.flow) useKnowledgeStore.getState().apply({ kind: "flow", flow: value.flow });
    }).catch(reportKnowledgeError);
    return () => {
      live = false;
    };
  }, [sessionId, cwd]);
  if (!sessionId) return null;
  if (!flow)
    return artifacts.length ? /* @__PURE__ */ jsx20(
      "section",
      {
        className: "mx-3 my-0.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs",
        "data-testid": "knowledge-flow-card",
        children: /* @__PURE__ */ jsxs20("div", { className: "flex flex-wrap items-center gap-x-2 gap-y-1", children: [
          /* @__PURE__ */ jsxs20("p", { className: "text-xs font-medium text-ink-dim", children: [
            t("outputs"),
            " ",
            artifacts.length
          ] }),
          artifacts.map(
            (item) => item.path && /* @__PURE__ */ jsx20(
              "button",
              {
                type: "button",
                className: "block max-w-full truncate text-left text-xs underline underline-offset-2",
                onClick: () => useUiStore.getState().openResourcePreview({
                  href: item.path || "",
                  label: item.title,
                  cwd: cwd || void 0
                }),
                children: item.title
              },
              item.key
            )
          )
        ] })
      }
    ) : null;
  const records = [...flow.navigation, ...flow.reads];
  const activeSpecialist = flow.specialists?.find(
    (agent) => agent.status === "running" || agent.status === "queued"
  );
  const title = activeSpecialist ? `${t(`specialist_${activeSpecialist.role}`)} \xB7 ${t(`worker_${activeSpecialist.status}`)}` : flow.publication?.warnings?.length ? t("flowWarnings") : t(phases[flow.phase] || "flow");
  const stages = [
    ["navigation", flow.stages?.navigation ?? false],
    ["wiki", flow.stages?.wiki ?? false],
    ["search", flow.stages?.search ?? false],
    ["publication", flow.stages?.publication ?? false]
  ];
  const activeStage = stages.findIndex(([, done]) => !done);
  function manage(tab = "overview") {
    if (tab === "maintenance") useSettingsStore.getState().openWith("knowledge");
    else useKnowledgeStore.getState().open({ cwd, sessionId, tab });
  }
  async function resume() {
    if (resuming || !sessionId) return;
    setResuming(true);
    try {
      await getKnowledgeApi().resumeKnowledgeCheck(sessionId);
    } catch (e) {
      reportKnowledgeError(e);
    } finally {
      setResuming(false);
    }
  }
  return /* @__PURE__ */ jsxs20(
    "section",
    {
      className: "sunburst-flow-card mx-3 mb-1 mt-1 shrink-0 rounded-xl border border-border bg-surface text-ink",
      "data-testid": "knowledge-flow-card",
      "aria-label": t("flow"),
      children: [
        /* @__PURE__ */ jsxs20("div", { className: "sunburst-flow-head", children: [
          /* @__PURE__ */ jsxs20(
            "button",
            {
              type: "button",
              "aria-expanded": open,
              onClick: () => setOpen(!open),
              className: "sunburst-flow-title",
              children: [
                /* @__PURE__ */ jsx20("span", { className: "sunburst-flow-icon", children: /* @__PURE__ */ jsx20(ObsidianIcon, { size: 16 }) }),
                /* @__PURE__ */ jsxs20("span", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx20("strong", { children: appT("workbench.wikiReport") }),
                  /* @__PURE__ */ jsx20("span", { children: appT("workbench.wikiDescription") })
                ] }),
                /* @__PURE__ */ jsx20("span", { className: "sunburst-flow-chevron", children: /* @__PURE__ */ jsx20(ChevronDownIcon, { size: 11 }) })
              ]
            }
          ),
          /* @__PURE__ */ jsxs20("div", { className: "sunburst-flow-meta", children: [
            /* @__PURE__ */ jsxs20("button", { type: "button", onClick: () => manage("overview"), children: [
              appT("workbench.openInWiki"),
              " ",
              /* @__PURE__ */ jsx20("span", { "aria-hidden": true, children: "\u2192" })
            ] }),
            /* @__PURE__ */ jsxs20("span", { role: "status", "aria-live": "polite", children: [
              title,
              " \xB7 ",
              t("matched"),
              " ",
              flow.search?.hits ?? 0
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx20("div", { className: "sunburst-stage-grid", children: stages.map(([label, done], index) => {
          const active = !done && index === activeStage;
          return /* @__PURE__ */ jsxs20("div", { className: `sunburst-stage ${done ? "is-done" : active ? "is-active" : ""}`, children: [
            /* @__PURE__ */ jsx20("span", { className: "sunburst-stage-mark", children: done ? "\u2713" : index + 1 }),
            /* @__PURE__ */ jsxs20("span", { className: "min-w-0", children: [
              /* @__PURE__ */ jsx20("strong", { children: t(label) }),
              /* @__PURE__ */ jsx20("span", { children: done ? appT("workbench.stage.completed") : active ? appT("workbench.stage.inProgress") : appT("workbench.stage.pending") })
            ] })
          ] }, label);
        }) }),
        open && /* @__PURE__ */ jsxs20("div", { className: "max-h-[28vh] overflow-auto border-t border-border px-2 py-2", children: [
          flow.vault && /* @__PURE__ */ jsx20("p", { className: "mb-2 break-all font-mono text-[11px] text-ink-dim", children: flow.vault }),
          flow.search && /* @__PURE__ */ jsxs20("p", { className: "mb-2 break-words text-xs", children: [
            t("search"),
            "\uFF1A",
            flow.search.query,
            " \xB7 ",
            t("matched"),
            " ",
            flow.search.hits,
            " \xB7",
            " ",
            flow.search.complete ? t("coverageReady") : t("coveragePartial")
          ] }),
          !!flow.specialists?.length && /* @__PURE__ */ jsxs20("div", { className: "mb-3", "data-testid": "knowledge-specialist-runs", children: [
            /* @__PURE__ */ jsx20("h4", { className: "mb-2 text-xs font-semibold", children: t("specialistRuns") }),
            flow.specialists.map((agent) => /* @__PURE__ */ jsxs20("div", { className: "mb-2 rounded-lg border border-border p-2 text-xs", children: [
              /* @__PURE__ */ jsxs20("div", { className: "flex justify-between gap-2", children: [
                /* @__PURE__ */ jsx20("strong", { children: t(`specialist_${agent.role}`) }),
                /* @__PURE__ */ jsx20("span", { children: t(`worker_${agent.status}`) })
              ] }),
              /* @__PURE__ */ jsxs20("p", { className: "mt-1 break-all text-[11px] text-ink-faint", children: [
                agent.model || agent.name,
                agent.action ? ` \xB7 ${agent.action}` : ""
              ] }),
              agent.summary && /* @__PURE__ */ jsx20("p", { className: "mt-1 break-words", children: agent.summary }),
              agent.error && /* @__PURE__ */ jsx20("p", { className: "mt-1 break-words text-warn", children: agent.error }),
              agent.sources?.map((ref) => /* @__PURE__ */ jsxs20("div", { className: "mt-2 border-t border-border pt-1", children: [
                /* @__PURE__ */ jsxs20("div", { className: "flex items-center justify-between gap-2", children: [
                  /* @__PURE__ */ jsxs20("span", { className: "min-w-0 truncate font-mono text-[11px]", title: ref.path, children: [
                    ref.path,
                    " \xB7 L",
                    ref.startLine,
                    "\u2013",
                    ref.endLine
                  ] }),
                  /* @__PURE__ */ jsx20(Button, { size: "sm", onClick: () => setPath(ref.path), children: t("openSource") })
                ] }),
                ref.excerpt && /* @__PURE__ */ jsx20("p", { className: "break-words text-xs text-ink-dim", children: ref.excerpt })
              ] }, ref.path)),
              agent.inputTokens !== void 0 && /* @__PURE__ */ jsxs20("p", { className: "mt-1 text-xs text-ink-dim", children: [
                t("specialistUsage"),
                " ",
                agent.inputTokens,
                " / ",
                agent.outputTokens ?? 0,
                " \xB7 ",
                t("sources"),
                " ",
                agent.sourceCount ?? 0
              ] })
            ] }, agent.id)),
            /* @__PURE__ */ jsx20("p", { className: "text-[11px] text-ink-faint", children: t("specialistUnverified") })
          ] }),
          /* @__PURE__ */ jsx20("h4", { className: "mb-2 text-xs font-semibold", children: t("findings") }),
          (flow.search?.previews || []).map((row) => /* @__PURE__ */ jsxs20("div", { className: "mb-2 rounded-lg border border-border p-2 text-xs", children: [
            /* @__PURE__ */ jsxs20("div", { className: "flex items-start justify-between gap-2", children: [
              /* @__PURE__ */ jsx20("strong", { className: "min-w-0 break-words", children: row.title || row.path }),
              /* @__PURE__ */ jsx20(Button, { size: "sm", onClick: () => setPath(row.path), children: t("openSource") })
            ] }),
            /* @__PURE__ */ jsx20("p", { className: "whitespace-pre-wrap break-words text-ink-dim", children: row.excerpt }),
            /* @__PURE__ */ jsxs20("p", { className: "mt-1 break-all font-mono text-[11px] text-ink-faint", children: [
              row.path,
              " \xB7 L",
              row.startLine,
              "\u2013",
              row.endLine
            ] })
          ] }, row.path)),
          !flow.search?.hits && /* @__PURE__ */ jsx20("p", { className: "mb-2 text-xs text-ink-dim", children: t("noFindings") }),
          /* @__PURE__ */ jsx20("p", { className: "mb-3 text-[11px] text-ink-faint", children: t("candidateHint") }),
          !!artifacts.length && /* @__PURE__ */ jsxs20("div", { className: "mb-3", children: [
            /* @__PURE__ */ jsx20("h4", { className: "mb-1 text-xs font-semibold", children: t("outputs") }),
            artifacts.map((item) => /* @__PURE__ */ jsxs20("div", { className: "mb-1 rounded-lg bg-hover p-2 text-xs", children: [
              /* @__PURE__ */ jsxs20("div", { className: "flex items-start justify-between gap-2", children: [
                /* @__PURE__ */ jsxs20("span", { className: "min-w-0 break-words", children: [
                  item.title,
                  " \xB7 ",
                  item.status
                ] }),
                item.path && /* @__PURE__ */ jsx20(
                  Button,
                  {
                    size: "sm",
                    onClick: () => {
                      if (/^(Wiki|Library|Projects|Inbox|Indexes)\//.test(item.path || ""))
                        setPath(item.path ?? null);
                      else
                        useUiStore.getState().openResourcePreview({
                          href: item.path || "",
                          label: item.title,
                          cwd: cwd || void 0
                        });
                    },
                    children: t("openSource")
                  }
                )
              ] }),
              /* @__PURE__ */ jsx20("p", { className: "break-words text-ink-dim", children: item.detail })
            ] }, item.key))
          ] }),
          flow.phase === "no-hits" && /* @__PURE__ */ jsx20("p", { className: "mb-2 text-xs text-warn", children: t("noHitsHint") }),
          (flow.error || flow.publication?.reason) && /* @__PURE__ */ jsx20("p", { className: "mb-2 break-words rounded-lg bg-hover p-2 text-xs text-warn", children: flow.error || flow.publication?.reason }),
          !!flow.publication?.warnings?.length && /* @__PURE__ */ jsx20("div", { className: "mb-2 space-y-1 rounded-lg bg-hover p-2 text-xs text-warn", children: flow.publication.warnings.map((warning) => /* @__PURE__ */ jsx20("p", { children: warning.message }, `${warning.code}:${warning.message}`)) }),
          /* @__PURE__ */ jsx20("h4", { className: "mb-1 text-xs font-semibold", children: t("readScope") }),
          /* @__PURE__ */ jsx20("div", { className: "space-y-1", children: records.map((row) => /* @__PURE__ */ jsxs20(
            "div",
            {
              className: "flex items-center justify-between gap-2 text-xs",
              children: [
                /* @__PURE__ */ jsxs20("div", { className: "min-w-0", children: [
                  /* @__PURE__ */ jsx20("span", { className: "block truncate font-mono", title: row.path, children: row.path }),
                  row.excerpt && /* @__PURE__ */ jsx20("p", { className: "my-1 line-clamp-2 break-words text-ink-dim", children: row.excerpt }),
                  /* @__PURE__ */ jsxs20("span", { className: "text-ink-faint", children: [
                    row.missing ? t("missing") : `L${row.startLine}\u2013${row.endLine} \xB7 ${row.hash?.slice(0, 12) || "\u2014"}`,
                    row.truncated ? ` \xB7 ${t("truncated")}` : ""
                  ] })
                ] }),
                /* @__PURE__ */ jsx20(
                  Button,
                  {
                    size: "sm",
                    disabled: !!row.missing || !flow.bindingRevision,
                    onClick: () => setPath(row.path),
                    children: t("openSource")
                  }
                )
              ]
            },
            `${row.path}:${row.startLine}:${row.endLine}:${row.hash ?? "missing"}`
          )) }),
          path && flow.bindingRevision && /* @__PURE__ */ jsx20("div", { className: "mt-3", children: /* @__PURE__ */ jsx20(
            KnowledgeNoteViewer,
            {
              cwd,
              path,
              revision: flow.bindingRevision,
              onClose: () => setPath(null)
            }
          ) }),
          /* @__PURE__ */ jsx20("p", { className: "mt-3 text-xs text-ink-dim", children: t("checksNotFacts") }),
          !!flow.publication?.paths?.length && /* @__PURE__ */ jsx20("div", { className: "my-2 text-xs text-warn", children: flow.publication.paths.map((p) => /* @__PURE__ */ jsx20("code", { className: "block break-all", children: p }, p)) }),
          flow.phase === "blocked" && /* @__PURE__ */ jsxs20("div", { className: "mt-2", children: [
            /* @__PURE__ */ jsxs20("div", { className: "flex flex-wrap gap-2", children: [
              /* @__PURE__ */ jsx20(Button, { size: "sm", onClick: () => manage("maintenance"), children: t("maintenance") }),
              /* @__PURE__ */ jsx20(Button, { size: "sm", disabled: resuming, onClick: () => void resume(), children: t("resume") })
            ] }),
            /* @__PURE__ */ jsx20("p", { className: "mt-1 text-[11px] text-ink-faint", children: t("resumeHint") })
          ] })
        ] })
      ]
    }
  );
}

// ui/knowledge/ZoteroPanel.tsx
import { useCallback as useCallback8, useEffect as useEffect23, useState as useState23 } from "react";

// ui/knowledge/ZoteroLocalWriteSection.tsx
import { useCallback as useCallback6, useEffect as useEffect21, useState as useState21 } from "react";

// ui/knowledge/zotero-copy.ts
var zoteroZh = {
  title: "Zotero \u6587\u732E\u5E93",
  subtitle: "Zotero \u7BA1\u6765\u6E90\uFF08PDF\u3001\u6761\u76EE\u3001\u6807\u6CE8\uFF09\uFF1BObsidian \u7BA1\u53EF\u5F15\u7528\u7684\u77E5\u8BC6\u3002\u4E8C\u8005\u5206\u5F00\u63A5\u5165\u3002",
  refresh: "\u5237\u65B0",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  statusTitle: "\u63A5\u5165\u72B6\u6001",
  statusLine: "Zotero \u684C\u9762\u7AEF \xB7 \u672C\u673A API \xB7 \u5199\u5165\u65B9\u5F0F",
  localApiOk: "\u672C\u673A API \u53EF\u8FBE",
  localApiNo: "\u672C\u673A API \u4E0D\u53EF\u8FBE",
  desktopMissing: "\u672A\u68C0\u6D4B\u5230 Zotero \u684C\u9762\u7AEF",
  version: "\u7248\u672C {version}",
  writeModeLocal: "\u672C\u673A\u5199\u5165\uFF08Zotero 10+\uFF09",
  writeModeWeb: "\u7F51\u9875 API\uFF08Zotero 9 \u53CA\u4EE5\u4E0B\uFF09",
  advancedLegacy: "\u65E7\u7248 Zotero / \u9AD8\u7EA7\u5199\u5165\u65B9\u5F0F",
  crossTitle: "\u4E0E\u77E5\u8BC6\u5E93\u7684\u5173\u7CFB",
  crossHint: "Zotero \u53EA\u662F\u6765\u6E90\u4E0A\u6E38\uFF1B\u547D\u4E2D\u7684\u6587\u732E\u8981\u6574\u7406\u4E3A Obsidian \u7684 Library/Papers \u7B14\u8BB0\u540E\u624D\u53EF\u88AB\u5F15\u7528\u3002\u5148\u5EFA Vault\u3002",
  gotoObsidian: "\u6253\u5F00 Obsidian \u77E5\u8BC6\u5E93",
  statusUnavailable: "\u672C\u673A API \u4E0D\u53EF\u8FBE\uFF0C\u8BF7\u542F\u52A8 Zotero \u540E\u5237\u65B0\u3002",
  localTitle: "\u672C\u673A\u5199\u5165\uFF08Zotero 10+\uFF0C\u63A8\u8350\uFF09",
  localHint: "\u5728 Zotero \u91CC\u6388\u6743\u4E00\u6B21\uFF0CAgent \u5C31\u80FD\u5728\u672C\u673A\u628A\u5DF2\u6709\u6761\u76EE\u5F52\u5165\u5206\u7C7B\u3001\u6302 PDF\uFF0C\u4E0D\u9700\u8981\u7F51\u9875 API \u5BC6\u94A5\uFF0CPDF \u4E0D\u5360 Zotero \u4E91\u5B58\u50A8\u3002\u6BCF\u6B21\u4FEE\u6539\u4ECD\u4F1A\u5148\u5F81\u6C42\u4F60\u7684\u540C\u610F\u3002",
  localAuthorize: "\u5728 Zotero \u4E2D\u6388\u6743",
  localAuthorizing: "\u8BF7\u5230 Zotero \u5F39\u51FA\u7684\u5BF9\u8BDD\u6846\u91CC\u9009\u300C\u59CB\u7EC8\u5141\u8BB8\u300D\u2026",
  localAuthorized: "\u5DF2\u6388\u6743\uFF1AAgent \u53EF\u4EE5\u5728\u672C\u673A\u4FEE\u6539\u5DF2\u6709\u6761\u76EE\u3002",
  localFromEnv: "\u6765\u81EA\u73AF\u5883\u53D8\u91CF ZOTERO_LOCAL_API_KEY\uFF0C\u5728\u8BBE\u7F6E\u91CC\u4E0D\u53EF\u66F4\u6539\u3002",
  localNotAuthorized: "\u672A\u6388\u6743\u3002\u70B9\u6309\u94AE\u540E Zotero \u4F1A\u5F39\u51FA\u5BF9\u8BDD\u6846\uFF0C\u8BF7\u9009\u300C\u59CB\u7EC8\u5141\u8BB8\u300D\uFF08\u300C\u5141\u8BB8\u300D\u53EA\u80FD\u7528\u4E00\u6B21\uFF0C\u4E0D\u4F1A\u4FDD\u5B58\uFF09\u3002",
  localStale: "\u5DF2\u4FDD\u5B58\u7684\u6388\u6743\u5C5E\u4E8E\u53E6\u4E00\u4E2A Zotero \u6570\u636E\u5E93\uFF08\u6362\u8FC7\u6570\u636E\u76EE\u5F55\uFF09\uFF0C\u8BF7\u91CD\u65B0\u6388\u6743\u3002",
  localUnsupported: "\u5F53\u524D Zotero \u7248\u672C\u4E0D\u652F\u6301\u672C\u673A\u5199\u5165\uFF08\u9700\u8981 Zotero 10 \u6216\u66F4\u65B0\uFF09\uFF0C\u8BF7\u7528\u4E0B\u9762\u7684\u7F51\u9875 API\u3002",
  localUnreachable: "\u8FDE\u4E0D\u4E0A Zotero \u684C\u9762\u7AEF\uFF1A\u8BF7\u5148\u542F\u52A8 Zotero\uFF0C\u5E76\u5728 \u8BBE\u7F6E \u2192 \u9AD8\u7EA7 \u52FE\u9009\u300C\u5141\u8BB8\u6B64\u8BA1\u7B97\u673A\u4E0A\u7684\u5176\u4ED6\u5E94\u7528\u7A0B\u5E8F\u4E0E Zotero \u901A\u8BAF\u300D\u3002",
  localClear: "\u79FB\u9664\u6388\u6743",
  localClearHint: "\u79FB\u9664\u540E Drone \u4E0D\u518D\u4FDD\u5B58\u8FD9\u628A key\uFF1BZotero \u81EA\u5DF1\u7684\u6388\u6743\u8BB0\u5F55\u53EF\u5728 Zotero \u8BBE\u7F6E \u2192 \u9AD8\u7EA7 \u2192\u300C\u6E05\u9664\u5199\u5165\u6388\u6743\u300D\u91CC\u6E05\u9664\u3002",
  webTitle: "\u7F51\u9875 API\uFF08\u4FEE\u6539\u5DF2\u6709\u6761\u76EE\uFF09",
  webHint: "Zotero 9 \u53CA\u66F4\u65E9\u7248\u672C\u7684\u672C\u673A API \u662F\u53EA\u8BFB\u7684\uFF1A\u628A\u5DF2\u6709\u6761\u76EE\u5F52\u5165\u5206\u7C7B\u3001\u6302 PDF \u8981\u8D70\u7F51\u9875 API\u3002Zotero 10+ \u4F18\u5148\u7528\u4E0A\u9762\u7684\u672C\u673A\u5199\u5165\uFF0C\u4E0D\u9700\u8981\u8FD9\u4E2A\u5BC6\u94A5\u3002\u65B0\u5EFA\u6761\u76EE\u4E5F\u4E0D\u9700\u8981\u5B83\u3002",
  webSteps: "\u5728 Zotero \u7F51\u7AD9 \u2192 Settings \u2192 Security \u2192 Applications \u2192 Create new private key\uFF0C\u52FE\u9009\u300CAllow library access\u300D\u548C\u300CAllow write access\u300D\uFF0C\u590D\u5236\u5BC6\u94A5\u7C98\u8D34\u5230\u8FD9\u91CC\u3002",
  webKeyLabel: "API \u5BC6\u94A5",
  webKeyPlaceholder: "\u7C98\u8D34\u79C1\u94A5\uFF08\u53EA\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u4E0D\u8FDB\u5BF9\u8BDD\uFF09",
  webGroupLabel: "\u7FA4\u7EC4\u5E93 ID\uFF08\u53EF\u9009\uFF0C\u7559\u7A7A = \u4E2A\u4EBA\u5E93\uFF09",
  webSave: "\u6821\u9A8C\u5E76\u4FDD\u5B58",
  webClear: "\u79FB\u9664\u5BC6\u94A5",
  webConfigured: "\u5DF2\u914D\u7F6E\uFF1A{library}\uFF08\u5BC6\u94A5 \u2026{hint}\uFF09",
  webNotConfigured: "\u672A\u914D\u7F6E\uFF1AAgent \u53EA\u80FD\u65B0\u5EFA\u6761\u76EE\uFF0C\u4E0D\u80FD\u4FEE\u6539\u5DF2\u6709\u6761\u76EE\u7684\u5206\u7C7B\u6216\u9644\u4EF6\u3002",
  webFromEnv: "\u6765\u81EA\u73AF\u5883\u53D8\u91CF ZOTERO_API_KEY\uFF08\u2026{hint}\uFF09\uFF0C\u5728\u8BBE\u7F6E\u91CC\u4E0D\u53EF\u66F4\u6539\u3002",
  webSaved: "\u5DF2\u4FDD\u5B58\uFF0CAgent \u73B0\u5728\u53EF\u4EE5\u4FEE\u6539\u5DF2\u6709\u6761\u76EE\uFF08\u6BCF\u6B21\u4FEE\u6539\u4ECD\u4F1A\u5148\u5F81\u6C42\u4F60\u7684\u540C\u610F\uFF09\u3002",
  webInvalidInput: "\u6CA1\u6709\u4FDD\u5B58\uFF1A\u5BC6\u94A5\u5E94\u4E3A 16\u201364 \u4F4D\u5B57\u6BCD\u6216\u6570\u5B57\uFF0C\u7FA4\u7EC4\u5E93 ID \u6700\u591A 20 \u4F4D\u6570\u5B57\u3002",
  instTitle: "\u673A\u6784\u8BBF\u95EE\uFF08\u4E00\u6B21\u767B\u5F55\uFF0C\u81EA\u52A8\u4FDD\u5B58\u6A21\u677F\uFF09",
  instIntro: "Agent \u5728\u5F52\u6863\u6587\u732E\u65F6\u82E5\u9047\u5230\u4ED8\u8D39\u5899\uFF0C\u4F1A\u81EA\u52A8\u8BF7\u6C42\u673A\u6784\u767B\u5F55\u3002\u70B9\u201C\u767B\u5F55\u673A\u6784\u8D26\u53F7\u201D\u540E\u5728\u5F39\u51FA\u7A97\u53E3\u5B8C\u6210\u5B66\u6821/\u56FE\u4E66\u9986\u767B\u5F55\uFF08\u652F\u6301 EZproxy / Shibboleth / CARSI / OpenAthens / WebVPN\uFF09\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u4ECE URL \u4E2D\u8BC6\u522B\u5E76\u4FDD\u5B58 EZproxy \u6A21\u677F\uFF08\u4F8B\u5982 .../login?url=%s\uFF09\uFF0C\u65E0\u9700\u624B\u52A8\u586B\u5199\u3002\u767B\u5F55\u6001\u4FDD\u5B58\u5728\u6301\u4E45\u5206\u533A\uFF0C\u91CD\u542F\u4ECD\u6709\u6548\u3002\u4EFB\u52A1\u6388\u6743\u540E\u4F1A\u81EA\u52A8\u5C1D\u8BD5\u4E0B\u8F7D\uFF08\u6BCF\u4EFB\u52A1\u6700\u591A {limit} \u7BC7\uFF09\uFF0C\u4EC5\u5728\u8FC7\u671F\u6216\u9A8C\u8BC1\u7801\u65F6\u518D\u6B21\u5F39\u7A97\u3002",
  instLoginState: "\u767B\u5F55\u72B6\u6001",
  instLoggedIn: "\u5DF2\u767B\u5F55",
  instLoggedOut: "\u672A\u767B\u5F55",
  instCookies: "Cookie \u6570",
  instLastLogin: "\u4E0A\u6B21\u767B\u5F55",
  instNever: "\u4ECE\u672A",
  instTemplate: "\u81EA\u52A8\u6A21\u677F",
  instNoTemplate: "\u672A\u81EA\u52A8\u8BC6\u522B\uFF08\u76F4\u8FDE\u4F1A\u8BDD\uFF09",
  instName: "\u673A\u6784\u540D",
  instUnset: "\u672A\u586B",
  instAutoDownload: "\u81EA\u52A8\u4E0B\u8F7D",
  instOn: "\u5F00\u542F",
  instOff: "\u5173\u95ED",
  instPerTask: "\u6BCF\u4EFB\u52A1\u4E0A\u9650",
  instPapers: "{n} \u7BC7",
  instLogin: "\u767B\u5F55\u673A\u6784\u8D26\u53F7\uFF08\u81EA\u52A8\u4FDD\u5B58\u6A21\u677F\uFF09",
  instRefresh: "\u5237\u65B0\u72B6\u6001",
  instClear: "\u6E05\u9664\u767B\u5F55\u72B6\u6001",
  instTestTitle: "\u6D4B\u8BD5\u8BBF\u95EE\uFF08\u7ECF\u673A\u6784\u4F1A\u8BDD/\u81EA\u52A8\u6A21\u677F\u5C1D\u8BD5\uFF09",
  instTesting: "\u6D4B\u8BD5\u4E2D\u2026",
  instTest: "\u6D4B\u8BD5",
  instWorkflow: "\u5DE5\u4F5C\u6D41\uFF1AAgent \u8C03\u7528 research_archive_source \u2192 OA \u5931\u8D25 \u2192 \u8FD4\u56DE institutional_auth_required \u2192 Agent \u81EA\u52A8\u8C03\u7528 research_institutional_login \u6253\u5F00\u7A97\u53E3 \u2192 \u4F60\u767B\u5F55 \u2192 \u7CFB\u7EDF\u81EA\u52A8\u8BC6\u522B\u6A21\u677F\uFF08\u5982 https://ezproxy.xxx.edu/login?url=%s\uFF09\u5E76\u4FDD\u5B58\u5230 ~/.pi/agent/institutional.json \u2192 \u91CD\u8BD5\u4E0B\u8F7D\u3002\u4E0D\u9700\u8981\u624B\u52A8\u8BBE\u7F6E\u6A21\u677F\u3002",
  instWebvpn: "\u63D0\u793A\uFF1A\u82E5\u4F60\u7684\u5B66\u6821\u4F7F\u7528 WebVPN\uFF08\u5982 https://webvpn.xxx.edu.cn/https/443/www.nature.com/...\uFF09\uFF0C\u76F4\u63A5\u767B\u5F55\u5373\u53EF\uFF0C\u65E0\u9700\u6A21\u677F\uFF0C\u7CFB\u7EDF\u9760\u6301\u4E45 Cookie \u76F4\u8FDE\u3002EZproxy \u4F1A\u81EA\u52A8\u4FDD\u5B58\uFF0C\u4E0B\u6B21\u65E0\u9700\u518D\u767B\u5F55\u3002"
};
var zoteroEn = {
  title: "Zotero Library",
  subtitle: "Zotero holds sources (PDFs, items, annotations); Obsidian holds citable knowledge. Set up separately.",
  refresh: "Refresh",
  loading: "Loading\u2026",
  statusTitle: "Connection status",
  statusLine: "Zotero desktop \xB7 local API \xB7 write mode",
  localApiOk: "Local API reachable",
  localApiNo: "Local API unreachable",
  desktopMissing: "Zotero desktop was not detected",
  version: "Version {version}",
  writeModeLocal: "Local writes (Zotero 10+)",
  writeModeWeb: "Web API (Zotero 9 and older)",
  advancedLegacy: "Older Zotero / advanced write mode",
  crossTitle: "Relationship to the knowledge base",
  crossHint: "Zotero is only the source upstream; hits must be deposited as Obsidian Library/Papers notes before they can be cited. Set up the Vault first.",
  gotoObsidian: "Open Obsidian knowledge",
  statusUnavailable: "The local API is unreachable. Start Zotero and refresh.",
  localTitle: "Local writes (Zotero 10+, recommended)",
  localHint: "Authorize once in Zotero and the agent can file existing items into collections and attach PDFs on this computer \u2014 no Web API key, and PDFs do not use Zotero storage. It still asks you before each change.",
  localAuthorize: "Authorize in Zotero",
  localAuthorizing: "In the dialog Zotero shows, choose \u201CAlways Allow\u201D\u2026",
  localAuthorized: "Authorized: the agent can change existing items locally.",
  localFromEnv: "From the ZOTERO_LOCAL_API_KEY environment variable; not editable here.",
  localNotAuthorized: "Not authorized. Zotero will show a dialog \u2014 choose \u201CAlways Allow\u201D (\u201CAllow\u201D works for one write only and is not saved).",
  localStale: "The saved authorization belongs to a different Zotero database (data directory changed); authorize again.",
  localUnsupported: "This Zotero version has no local write support (Zotero 10 or newer is needed); use the Web API below.",
  localUnreachable: "Zotero desktop is not reachable: start Zotero and enable Settings \u2192 Advanced \u2192 \u201CAllow other applications on this computer to communicate with Zotero\u201D.",
  localClear: "Remove authorization",
  localClearHint: "Drone forgets the key; Zotero's own record of the grant is cleared under Zotero Settings \u2192 Advanced \u2192 \u201CClear Write Authorizations\u201D.",
  webTitle: "Web API (change existing items)",
  webHint: "On Zotero 9 and older the local API is read-only, so filing an existing item into a collection or attaching a PDF goes through the Web API. On Zotero 10+ local writes above are used first and this key is not needed. Creating new items does not need it either.",
  webSteps: "On zotero.org \u2192 Settings \u2192 Security \u2192 Applications \u2192 Create new private key, tick \u201CAllow library access\u201D and \u201CAllow write access\u201D, then paste the key here.",
  webKeyLabel: "API key",
  webKeyPlaceholder: "Paste the private key (stored on this computer only, never in chat)",
  webGroupLabel: "Group library ID (optional; empty = personal library)",
  webSave: "Verify and save",
  webClear: "Remove key",
  webConfigured: "Configured: {library} (key \u2026{hint})",
  webNotConfigured: "Not configured: the agent can create items but cannot change collections or attachments of existing ones.",
  webFromEnv: "From the ZOTERO_API_KEY environment variable (\u2026{hint}); not editable here.",
  webSaved: "Saved. The agent can now change existing items (it still asks you before each change).",
  webInvalidInput: "Not saved: the key must be 16\u201364 letters or digits and the group library ID at most 20 digits.",
  instTitle: "Institutional access (log in once, template saved automatically)",
  instIntro: "When the agent hits a paywall while archiving literature, it asks for an institutional login. Click \u201CLog in to institution\u201D and sign in to your university/library in the pop-up (EZproxy / Shibboleth / CARSI / OpenAthens / WebVPN); the EZproxy template (e.g. .../login?url=%s) is recognised from the URL and saved automatically. The login lives in a persistent partition and survives restarts. After a task is authorized, downloads are tried automatically (up to {limit} per task); you are only asked again when the login expires or a CAPTCHA appears.",
  instLoginState: "Login state",
  instLoggedIn: "Logged in",
  instLoggedOut: "Not logged in",
  instCookies: "Cookies",
  instLastLogin: "Last login",
  instNever: "Never",
  instTemplate: "Template",
  instNoTemplate: "Not detected (direct session)",
  instName: "Institution",
  instUnset: "Not set",
  instAutoDownload: "Automatic download",
  instOn: "On",
  instOff: "Off",
  instPerTask: "Per-task limit",
  instPapers: "{n} papers",
  instLogin: "Log in to institution (saves the template)",
  instRefresh: "Refresh status",
  instClear: "Clear login",
  instTestTitle: "Test access (through the institutional session / template)",
  instTesting: "Testing\u2026",
  instTest: "Test",
  instWorkflow: "Workflow: the agent calls research_archive_source \u2192 open access fails \u2192 institutional_auth_required \u2192 the agent calls research_institutional_login to open the window \u2192 you log in \u2192 the template (e.g. https://ezproxy.xxx.edu/login?url=%s) is detected and saved to ~/.pi/agent/institutional.json \u2192 the download is retried. No manual template setup is needed.",
  instWebvpn: "Tip: if your university uses WebVPN (e.g. https://webvpn.xxx.edu.cn/https/443/www.nature.com/...), just log in \u2014 no template is needed; the persistent cookies are used directly. EZproxy is saved automatically so you do not need to log in again."
};
function formatZoteroText(template, params = {}) {
  return template.replace(
    /\{([a-zA-Z0-9_]+)\}/gu,
    (placeholder, key) => Object.hasOwn(params, key) ? String(params[key]) : placeholder
  );
}
function useZoteroText() {
  const language = useLanguage();
  const dictionary = language === "zh" ? zoteroZh : zoteroEn;
  return (key, params) => formatZoteroText(dictionary[key], params);
}

// ui/knowledge/ZoteroLocalWriteSection.tsx
import { jsx as jsx21, jsxs as jsxs21 } from "react/jsx-runtime";
function isZoteroLocalWriteStatus(value) {
  return typeof value?.authorized === "boolean";
}
function localWriteStateKey(status) {
  if (!status.reachable) return "localUnreachable";
  if (status.supported === false) return "localUnsupported";
  if (status.staleServer) return "localStale";
  if (status.authorized) return status.source === "env" ? "localFromEnv" : "localAuthorized";
  return "localNotAuthorized";
}
function ZoteroLocalWriteSection() {
  const t = useZoteroText();
  const [status, setStatus] = useState21(null);
  const [busy, setBusy] = useState21(null);
  const [error, setError] = useState21(null);
  const refresh = useCallback6(async () => {
    try {
      const next = await getKnowledgeApi().getZoteroLocalWrite();
      if (isZoteroLocalWriteStatus(next)) setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect21(() => {
    void refresh();
  }, [refresh]);
  const act = async (kind, operation) => {
    setBusy(kind);
    setError(null);
    try {
      const next = await operation();
      if (isZoteroLocalWriteStatus(next)) setStatus(next);
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : String(e)).replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          ""
        )
      );
    } finally {
      setBusy(null);
    }
  };
  if (!status) return null;
  const state = localWriteStateKey(status);
  const canAuthorize = status.reachable && status.supported !== false && status.source !== "env";
  return /* @__PURE__ */ jsxs21("section", { className: "space-y-2 rounded-xl border border-border p-3", "data-testid": "zotero-local-write", children: [
    /* @__PURE__ */ jsx21("h4", { className: "text-xs font-semibold", children: t("localTitle") }),
    /* @__PURE__ */ jsx21("p", { className: "text-xs leading-relaxed text-ink-dim", children: t("localHint") }),
    /* @__PURE__ */ jsx21(
      "p",
      {
        role: "status",
        className: `text-xs ${state === "localAuthorized" || state === "localFromEnv" ? "text-ok" : "text-warn"}`,
        children: busy === "authorize" ? t("localAuthorizing") : t(state)
      }
    ),
    /* @__PURE__ */ jsxs21("div", { className: "flex flex-wrap gap-2", children: [
      canAuthorize && !status.authorized && /* @__PURE__ */ jsx21(
        Button,
        {
          size: "sm",
          disabled: busy !== null,
          onClick: () => void act("authorize", () => getKnowledgeApi().authorizeZoteroLocalWrite()),
          children: busy === "authorize" ? t("loading") : t("localAuthorize")
        }
      ),
      status.source === "settings" && /* @__PURE__ */ jsx21(
        Button,
        {
          size: "sm",
          disabled: busy !== null,
          onClick: () => void act("clear", () => getKnowledgeApi().clearZoteroLocalWrite()),
          children: t("localClear")
        }
      )
    ] }),
    status.source === "settings" && /* @__PURE__ */ jsx21("p", { className: "text-[11px] leading-relaxed text-ink-faint", children: t("localClearHint") }),
    error && /* @__PURE__ */ jsx21("p", { role: "alert", className: "break-words text-xs text-err", children: error })
  ] });
}

// ui/knowledge/ZoteroWebApiSection.tsx
import { useCallback as useCallback7, useEffect as useEffect22, useState as useState22 } from "react";
import { Fragment as Fragment6, jsx as jsx22, jsxs as jsxs22 } from "react/jsx-runtime";
function isZoteroWebApiStatus(value) {
  return typeof value?.configured === "boolean";
}
function ZoteroWebApiSection() {
  const t = useZoteroText();
  const [status, setStatus] = useState22(null);
  const [apiKey, setApiKey] = useState22("");
  const [groupId, setGroupId] = useState22("");
  const [busy, setBusy] = useState22(false);
  const [error, setError] = useState22(null);
  const [notice, setNotice] = useState22(null);
  const refresh = useCallback7(async () => {
    try {
      setStatus(await getKnowledgeApi().getZoteroWebApi());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect22(() => {
    void refresh();
  }, [refresh]);
  const act = async (operation, done) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await operation();
      if (!isZoteroWebApiStatus(next)) throw new Error(t("webInvalidInput"));
      setStatus(next);
      setApiKey("");
      if (done) setNotice(done);
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : String(e)).replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          ""
        )
      );
    } finally {
      setBusy(false);
    }
  };
  const library = status?.libraryType === "groups" ? `group ${status.libraryId}` : status?.username || status?.libraryId || "";
  return /* @__PURE__ */ jsxs22("section", { className: "space-y-2 rounded-xl border border-border p-3", "data-testid": "zotero-web-api", children: [
    /* @__PURE__ */ jsx22("h4", { className: "text-xs font-semibold", children: t("webTitle") }),
    /* @__PURE__ */ jsx22("p", { className: "text-xs leading-relaxed text-ink-dim", children: t("webHint") }),
    status?.source === "env" ? /* @__PURE__ */ jsx22("p", { className: "text-xs text-ok", children: t("webFromEnv").replace("{hint}", status.keyHint ?? "") }) : status?.configured ? /* @__PURE__ */ jsxs22("div", { className: "flex flex-wrap items-center gap-2", children: [
      /* @__PURE__ */ jsx22("p", { className: "flex-1 text-xs text-ok", children: t("webConfigured").replace("{library}", library).replace("{hint}", status.keyHint ?? "") }),
      /* @__PURE__ */ jsx22(Button, { size: "sm", disabled: busy, onClick: () => void act(() => getKnowledgeApi().clearZoteroWebApi()), children: t("webClear") })
    ] }) : /* @__PURE__ */ jsxs22(Fragment6, { children: [
      /* @__PURE__ */ jsx22("p", { className: "text-xs text-warn", children: t("webNotConfigured") }),
      /* @__PURE__ */ jsx22("p", { className: "text-[11px] leading-relaxed text-ink-faint", children: t("webSteps") }),
      /* @__PURE__ */ jsxs22("label", { className: "block text-xs text-ink-dim", children: [
        t("webKeyLabel"),
        /* @__PURE__ */ jsx22(
          "input",
          {
            type: "password",
            autoComplete: "off",
            spellCheck: false,
            className: "mt-1 w-full rounded-md border border-border bg-transparent px-2 py-1 font-mono text-xs",
            placeholder: t("webKeyPlaceholder"),
            value: apiKey,
            onChange: (event) => setApiKey(event.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ jsxs22("label", { className: "block text-xs text-ink-dim", children: [
        t("webGroupLabel"),
        /* @__PURE__ */ jsx22(
          "input",
          {
            inputMode: "numeric",
            className: "mt-1 w-full rounded-md border border-border bg-transparent px-2 py-1 font-mono text-xs",
            value: groupId,
            onChange: (event) => setGroupId(event.target.value.replace(/\D/g, ""))
          }
        )
      ] }),
      /* @__PURE__ */ jsx22(
        Button,
        {
          size: "sm",
          disabled: busy || apiKey.trim().length < 16,
          onClick: () => void act(
            () => getKnowledgeApi().saveZoteroWebApi(
              groupId ? { apiKey: apiKey.trim(), libraryType: "groups", libraryId: groupId } : { apiKey: apiKey.trim() }
            ),
            t("webSaved")
          ),
          children: busy ? t("loading") : t("webSave")
        }
      )
    ] }),
    notice && /* @__PURE__ */ jsx22("p", { className: "text-xs text-ok", children: notice }),
    error && /* @__PURE__ */ jsx22("p", { role: "alert", className: "break-words text-xs text-err", children: error })
  ] });
}

// ui/knowledge/ZoteroPanel.tsx
import { jsx as jsx23, jsxs as jsxs23 } from "react/jsx-runtime";
function ZoteroPanel() {
  const t = useZoteroText();
  const [status, setStatus] = useState23(null);
  const [error, setError] = useState23(null);
  const [loading, setLoading] = useState23(false);
  const refresh = useCallback8(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getKnowledgeApi().getZoteroStatus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect23(() => {
    void refresh();
  }, [refresh]);
  const major = Number.parseInt(status?.version?.split(".")[0] ?? "", 10);
  const localPreferred = Number.isFinite(major) && major >= 10;
  return /* @__PURE__ */ jsxs23("div", { className: "text-ink", "data-testid": "zotero-panel", children: [
    /* @__PURE__ */ jsxs23("header", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxs23("div", { children: [
        /* @__PURE__ */ jsx23("h2", { className: "text-base font-semibold", children: t("title") }),
        /* @__PURE__ */ jsx23("p", { className: "mt-1 text-xs text-ink-dim", children: t("subtitle") })
      ] }),
      /* @__PURE__ */ jsx23(Button, { size: "sm", disabled: loading, onClick: () => void refresh(), children: t("refresh") })
    ] }),
    error && /* @__PURE__ */ jsx23("p", { role: "alert", className: "mt-4 break-words rounded-lg border border-border p-3 text-xs text-err", children: error }),
    !status && loading && /* @__PURE__ */ jsx23("p", { role: "status", className: "mt-4 text-xs", children: t("loading") }),
    status && /* @__PURE__ */ jsxs23("div", { className: "mt-4 space-y-4", children: [
      /* @__PURE__ */ jsxs23("section", { className: "rounded-xl border border-border p-4", children: [
        /* @__PURE__ */ jsx23("h3", { className: "text-xs font-semibold", children: t("statusTitle") }),
        /* @__PURE__ */ jsxs23("div", { className: "mt-3 flex flex-wrap items-center gap-2 text-xs", children: [
          /* @__PURE__ */ jsx23(
            "span",
            {
              className: `h-1.5 w-1.5 rounded-full ${status.localApiReachable ? "bg-ok" : "bg-warn"}`
            }
          ),
          /* @__PURE__ */ jsx23("span", { children: status.desktopDetected ? "Zotero" : t("desktopMissing") }),
          /* @__PURE__ */ jsx23("span", { className: "text-ink-faint", children: "\xB7" }),
          /* @__PURE__ */ jsx23("span", { children: status.localApiReachable ? t("localApiOk") : t("localApiNo") }),
          status.version ? /* @__PURE__ */ jsxs23("span", { className: "text-ink-faint", children: [
            "\xB7 ",
            t("version", { version: status.version })
          ] }) : null,
          /* @__PURE__ */ jsx23("span", { className: "text-ink-faint", children: "\xB7" }),
          /* @__PURE__ */ jsx23("span", { children: localPreferred ? t("writeModeLocal") : t("writeModeWeb") })
        ] }),
        !status.localApiReachable && /* @__PURE__ */ jsx23("p", { className: "mt-2 text-xs text-warn", children: t("statusUnavailable") })
      ] }),
      localPreferred ? /* @__PURE__ */ jsx23(ZoteroLocalWriteSection, {}) : /* @__PURE__ */ jsx23(ZoteroWebApiSection, {}),
      /* @__PURE__ */ jsxs23("details", { className: "rounded-xl border border-border p-4", children: [
        /* @__PURE__ */ jsx23("summary", { className: "cursor-pointer text-xs font-semibold", children: t("advancedLegacy") }),
        /* @__PURE__ */ jsx23("div", { className: "mt-3", children: localPreferred ? /* @__PURE__ */ jsx23(ZoteroWebApiSection, {}) : /* @__PURE__ */ jsx23(ZoteroLocalWriteSection, {}) })
      ] }),
      /* @__PURE__ */ jsx23("section", { className: "rounded-xl border border-dashed border-border-strong px-4 py-3", children: /* @__PURE__ */ jsx23("p", { className: "text-xs text-ink-dim", children: t("crossHint") }) })
    ] })
  ] });
}

// ui/knowledge/InstitutionalAccessSection.tsx
import { useCallback as useCallback9, useEffect as useEffect24, useState as useState24 } from "react";
import { jsx as jsx24, jsxs as jsxs24 } from "react/jsx-runtime";
function Row({ label, value, ok }) {
  return /* @__PURE__ */ jsxs24("div", { className: "flex items-center justify-between gap-2 text-xs", children: [
    /* @__PURE__ */ jsx24("span", { className: "text-ink-dim", children: label }),
    /* @__PURE__ */ jsx24("span", { className: `truncate ${ok === true ? "text-ok" : ok === false ? "text-warn" : "text-ink"}`, children: value })
  ] });
}
function InstitutionalAccessSection() {
  const t = useZoteroText();
  const [status, setStatus] = useState24(null);
  const [loading, setLoading] = useState24(false);
  const [error, setError] = useState24(null);
  const [testUrl, setTestUrl] = useState24("https://doi.org/10.1038/nature12373");
  const [testResult, setTestResult] = useState24(null);
  const [testing, setTesting] = useState24(false);
  const refresh = useCallback9(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getKnowledgeApi().getInstitutionalStatus();
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect24(() => {
    void refresh();
  }, [refresh]);
  const openLogin = async (url) => {
    setError(null);
    try {
      await getKnowledgeApi().openInstitutionalLogin(url);
      setTimeout(() => void refresh(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const clear = async () => {
    setError(null);
    try {
      const next = await getKnowledgeApi().clearInstitutionalSession();
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const doTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await getKnowledgeApi().testInstitutionalAccess(testUrl);
      setTestResult(JSON.stringify(res, null, 2));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };
  return /* @__PURE__ */ jsxs24("section", { className: "rounded-xl border border-border p-4", "data-testid": "institutional-section", children: [
    /* @__PURE__ */ jsx24("h3", { className: "text-xs font-semibold", children: t("instTitle") }),
    /* @__PURE__ */ jsx24("p", { className: "mt-1 text-xs leading-relaxed text-ink-dim", children: t("instIntro").replace("{limit}", String(status?.config.perTaskLimit ?? 20)) }),
    error && /* @__PURE__ */ jsx24(
      "p",
      {
        role: "alert",
        className: "mt-3 break-words rounded-lg border border-border bg-err/10 p-2 text-xs text-err",
        children: error
      }
    ),
    status && /* @__PURE__ */ jsxs24("div", { className: "mt-3 grid gap-2 rounded-lg bg-hover p-2", children: [
      /* @__PURE__ */ jsx24(
        Row,
        {
          label: t("instLoginState"),
          value: status.loggedIn ? t("instLoggedIn") : t("instLoggedOut"),
          ok: status.loggedIn
        }
      ),
      /* @__PURE__ */ jsx24(
        Row,
        {
          label: t("instCookies"),
          value: `${status.session.cookiesCount}`,
          ok: status.session.cookiesCount > 0
        }
      ),
      /* @__PURE__ */ jsx24(
        Row,
        {
          label: t("instLastLogin"),
          value: status.config.lastLoginAt ? new Date(status.config.lastLoginAt).toLocaleString() : t("instNever")
        }
      ),
      /* @__PURE__ */ jsx24(
        Row,
        {
          label: t("instTemplate"),
          value: status.config.ezproxyTemplate || t("instNoTemplate"),
          ok: Boolean(status.config.ezproxyTemplate)
        }
      ),
      /* @__PURE__ */ jsx24(Row, { label: t("instName"), value: status.config.institutionName || t("instUnset") }),
      /* @__PURE__ */ jsx24(
        Row,
        {
          label: t("instAutoDownload"),
          value: status.config.autoDownloadEnabled ? t("instOn") : t("instOff"),
          ok: status.config.autoDownloadEnabled
        }
      ),
      /* @__PURE__ */ jsx24(
        Row,
        {
          label: t("instPerTask"),
          value: t("instPapers").replace("{n}", String(status.config.perTaskLimit))
        }
      )
    ] }),
    /* @__PURE__ */ jsxs24("div", { className: "mt-4 space-y-3", children: [
      /* @__PURE__ */ jsxs24("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsx24(Button, { size: "sm", variant: "primary", onClick: () => void openLogin(), children: t("instLogin") }),
        /* @__PURE__ */ jsx24(Button, { size: "sm", disabled: loading, onClick: () => void refresh(), children: t("instRefresh") }),
        /* @__PURE__ */ jsx24(Button, { size: "sm", onClick: () => void clear(), children: t("instClear") })
      ] }),
      /* @__PURE__ */ jsxs24("div", { className: "rounded-lg border border-dashed border-border p-2", children: [
        /* @__PURE__ */ jsx24("div", { className: "text-xs font-medium text-ink", children: t("instTestTitle") }),
        /* @__PURE__ */ jsxs24("div", { className: "mt-1 flex gap-1", children: [
          /* @__PURE__ */ jsx24(
            "input",
            {
              className: "flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs",
              value: testUrl,
              onChange: (e) => setTestUrl(e.target.value),
              placeholder: "https://doi.org/..."
            }
          ),
          /* @__PURE__ */ jsx24(Button, { size: "sm", disabled: testing, onClick: () => void doTest(), children: testing ? t("instTesting") : t("instTest") })
        ] }),
        testResult && /* @__PURE__ */ jsx24("pre", { className: "mt-2 max-h-48 overflow-auto rounded bg-hover p-2 text-xs leading-relaxed", children: testResult }),
        /* @__PURE__ */ jsx24("p", { className: "mt-2 text-[11px] leading-relaxed text-ink-faint", children: t("instWorkflow") })
      ] }),
      /* @__PURE__ */ jsx24("p", { className: "text-[11px] text-ink-faint", children: t("instWebvpn") })
    ] })
  ] });
}

// generated-style:./styles/generated
var knowledgeStyles = '/*! tailwindcss v4.3.3 | MIT License | https://tailwindcss.com */\n@layer drone-knowledge-properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){:where(.drone-knowledge-ui) *,:where(.drone-knowledge-ui) :before,:where(.drone-knowledge-ui) :after,:where(.drone-knowledge-ui) ::backdrop{--drone-knowledge-tw-rotate-x:initial;--drone-knowledge-tw-rotate-y:initial;--drone-knowledge-tw-rotate-z:initial;--drone-knowledge-tw-skew-x:initial;--drone-knowledge-tw-skew-y:initial;--drone-knowledge-tw-space-y-reverse:0;--drone-knowledge-tw-divide-y-reverse:0;--drone-knowledge-tw-border-style:solid;--drone-knowledge-tw-leading:initial;--drone-knowledge-tw-font-weight:initial;--drone-knowledge-tw-tracking:initial;--drone-knowledge-tw-ordinal:initial;--drone-knowledge-tw-slashed-zero:initial;--drone-knowledge-tw-numeric-figure:initial;--drone-knowledge-tw-numeric-spacing:initial;--drone-knowledge-tw-numeric-fraction:initial;--drone-knowledge-tw-shadow:0 0 #0000;--drone-knowledge-tw-shadow-color:initial;--drone-knowledge-tw-shadow-alpha:100%;--drone-knowledge-tw-inset-shadow:0 0 #0000;--drone-knowledge-tw-inset-shadow-color:initial;--drone-knowledge-tw-inset-shadow-alpha:100%;--drone-knowledge-tw-ring-color:initial;--drone-knowledge-tw-ring-shadow:0 0 #0000;--drone-knowledge-tw-inset-ring-color:initial;--drone-knowledge-tw-inset-ring-shadow:0 0 #0000;--drone-knowledge-tw-ring-inset:initial;--drone-knowledge-tw-ring-offset-width:0px;--drone-knowledge-tw-ring-offset-color:#fff;--drone-knowledge-tw-ring-offset-shadow:0 0 #0000;--drone-knowledge-tw-blur:initial;--drone-knowledge-tw-brightness:initial;--drone-knowledge-tw-contrast:initial;--drone-knowledge-tw-grayscale:initial;--drone-knowledge-tw-hue-rotate:initial;--drone-knowledge-tw-invert:initial;--drone-knowledge-tw-opacity:initial;--drone-knowledge-tw-saturate:initial;--drone-knowledge-tw-sepia:initial;--drone-knowledge-tw-drop-shadow:initial;--drone-knowledge-tw-drop-shadow-color:initial;--drone-knowledge-tw-drop-shadow-alpha:100%;--drone-knowledge-tw-drop-shadow-size:initial;--drone-knowledge-tw-duration:initial}}}@layer drone-knowledge-theme{:where(.drone-knowledge-ui),:where(.drone-knowledge-ui){--color-white:#fff;--spacing:.25rem;--container-2xl:42rem;--container-5xl:64rem;--text-xs:.75rem;--text-xs--line-height:calc(1 / .75);--text-sm:.875rem;--text-sm--line-height:calc(1.25 / .875);--text-base:1rem;--text-base--line-height:calc(1.5 / 1);--text-lg:1.125rem;--text-lg--line-height:calc(1.75 / 1.125);--font-weight-normal:400;--font-weight-medium:500;--font-weight-semibold:600;--tracking-wide:.025em;--leading-relaxed:1.625;--radius-2xl:1rem;--default-transition-duration:.15s;--default-transition-timing-function:cubic-bezier(.4, 0, .2, 1)}}@layer drone-knowledge-utilities{:where(.drone-knowledge-ui) .pointer-events-none{pointer-events:none}:where(.drone-knowledge-ui) .visible{visibility:visible}:where(.drone-knowledge-ui) .sr-only{clip-path:inset(50%);white-space:nowrap;border-width:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}:where(.drone-knowledge-ui) .absolute{position:absolute}:where(.drone-knowledge-ui) .fixed{position:fixed}:where(.drone-knowledge-ui) .relative{position:relative}:where(.drone-knowledge-ui) .sticky{position:sticky}:where(.drone-knowledge-ui) .inset-3{inset:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .top-0{top:0}:where(.drone-knowledge-ui) .top-2{top:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .top-3{top:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .top-16{top:calc(var(--spacing) * 16)}:where(.drone-knowledge-ui) .right-0{right:0}:where(.drone-knowledge-ui) .right-2{right:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .right-3{right:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .right-4{right:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .bottom-0{bottom:0}:where(.drone-knowledge-ui) .bottom-2{bottom:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .bottom-5{bottom:calc(var(--spacing) * 5)}:where(.drone-knowledge-ui) .bottom-12{bottom:calc(var(--spacing) * 12)}:where(.drone-knowledge-ui) .left-2{left:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .left-3{left:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .z-\\(--z-toast\\){z-index:var(--z-toast)}:where(.drone-knowledge-ui) .z-10{z-index:10}:where(.drone-knowledge-ui) .z-20{z-index:20}:where(.drone-knowledge-ui) .z-60{z-index:60}:where(.drone-knowledge-ui) .container{width:100%}@media (min-width:40rem){:where(.drone-knowledge-ui) .container{max-width:40rem}}@media (min-width:48rem){:where(.drone-knowledge-ui) .container{max-width:48rem}}@media (min-width:64rem){:where(.drone-knowledge-ui) .container{max-width:64rem}}@media (min-width:80rem){:where(.drone-knowledge-ui) .container{max-width:80rem}}@media (min-width:96rem){:where(.drone-knowledge-ui) .container{max-width:96rem}}:where(.drone-knowledge-ui) .mx-3{margin-inline:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .mx-auto{margin-inline:auto}:where(.drone-knowledge-ui) .my-0\\.5{margin-block:calc(var(--spacing) * .5)}:where(.drone-knowledge-ui) .my-1{margin-block:var(--spacing)}:where(.drone-knowledge-ui) .my-2{margin-block:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .my-3{margin-block:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .my-4{margin-block:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .mt-0\\.5{margin-top:calc(var(--spacing) * .5)}:where(.drone-knowledge-ui) .mt-1{margin-top:var(--spacing)}:where(.drone-knowledge-ui) .mt-2{margin-top:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .mt-3{margin-top:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .mt-4{margin-top:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .mt-5{margin-top:calc(var(--spacing) * 5)}:where(.drone-knowledge-ui) .mr-1{margin-right:var(--spacing)}:where(.drone-knowledge-ui) .-mb-px{margin-bottom:-1px}:where(.drone-knowledge-ui) .mb-1{margin-bottom:var(--spacing)}:where(.drone-knowledge-ui) .mb-2{margin-bottom:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .mb-3{margin-bottom:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .ml-1{margin-left:var(--spacing)}:where(.drone-knowledge-ui) .ml-2{margin-left:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .ml-auto{margin-left:auto}:where(.drone-knowledge-ui) .line-clamp-2{-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}:where(.drone-knowledge-ui) .block{display:block}:where(.drone-knowledge-ui) .contents{display:contents}:where(.drone-knowledge-ui) .flex{display:flex}:where(.drone-knowledge-ui) .grid{display:grid}:where(.drone-knowledge-ui) .hidden{display:none}:where(.drone-knowledge-ui) .inline{display:inline}:where(.drone-knowledge-ui) .inline-block{display:inline-block}:where(.drone-knowledge-ui) .h-1\\.5{height:calc(var(--spacing) * 1.5)}:where(.drone-knowledge-ui) .h-2{height:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .h-11{height:calc(var(--spacing) * 11)}:where(.drone-knowledge-ui) .h-\\[1px\\]{height:1px}:where(.drone-knowledge-ui) .h-\\[clamp\\(520px\\,68vh\\,760px\\)\\]{height:clamp(520px,68vh,760px)}:where(.drone-knowledge-ui) .h-full{height:100%}:where(.drone-knowledge-ui) .max-h-28{max-height:calc(var(--spacing) * 28)}:where(.drone-knowledge-ui) .max-h-36{max-height:calc(var(--spacing) * 36)}:where(.drone-knowledge-ui) .max-h-40{max-height:calc(var(--spacing) * 40)}:where(.drone-knowledge-ui) .max-h-44{max-height:calc(var(--spacing) * 44)}:where(.drone-knowledge-ui) .max-h-48{max-height:calc(var(--spacing) * 48)}:where(.drone-knowledge-ui) .max-h-52{max-height:calc(var(--spacing) * 52)}:where(.drone-knowledge-ui) .max-h-60{max-height:calc(var(--spacing) * 60)}:where(.drone-knowledge-ui) .max-h-64{max-height:calc(var(--spacing) * 64)}:where(.drone-knowledge-ui) .max-h-72{max-height:calc(var(--spacing) * 72)}:where(.drone-knowledge-ui) .max-h-80{max-height:calc(var(--spacing) * 80)}:where(.drone-knowledge-ui) .max-h-\\[22vh\\]{max-height:22vh}:where(.drone-knowledge-ui) .max-h-\\[28vh\\]{max-height:28vh}:where(.drone-knowledge-ui) .max-h-\\[32vh\\]{max-height:32vh}:where(.drone-knowledge-ui) .max-h-\\[38vh\\]{max-height:38vh}:where(.drone-knowledge-ui) .min-h-0{min-height:0}:where(.drone-knowledge-ui) .min-h-\\[220px\\]{min-height:220px}:where(.drone-knowledge-ui) .w-1\\.5{width:calc(var(--spacing) * 1.5)}:where(.drone-knowledge-ui) .w-2{width:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .w-3{width:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .w-12{width:calc(var(--spacing) * 12)}:where(.drone-knowledge-ui) .w-16{width:calc(var(--spacing) * 16)}:where(.drone-knowledge-ui) .w-\\[min\\(360px\\,calc\\(100\\%-24px\\)\\)\\]{width:min(360px,100% - 24px)}:where(.drone-knowledge-ui) .w-\\[min\\(420px\\,calc\\(100vw-32px\\)\\)\\]{width:min(420px,100vw - 32px)}:where(.drone-knowledge-ui) .w-full{width:100%}:where(.drone-knowledge-ui) .max-w-2xl{max-width:var(--container-2xl)}:where(.drone-knowledge-ui) .max-w-5xl{max-width:var(--container-5xl)}:where(.drone-knowledge-ui) .max-w-\\[1440px\\]{max-width:1440px}:where(.drone-knowledge-ui) .max-w-\\[calc\\(100\\%-24px\\)\\]{max-width:calc(100% - 24px)}:where(.drone-knowledge-ui) .max-w-full{max-width:100%}:where(.drone-knowledge-ui) .min-w-0{min-width:0}:where(.drone-knowledge-ui) .flex-1{flex:1}:where(.drone-knowledge-ui) .shrink-0{flex-shrink:0}:where(.drone-knowledge-ui) .transform{transform:var(--drone-knowledge-tw-rotate-x,) var(--drone-knowledge-tw-rotate-y,) var(--drone-knowledge-tw-rotate-z,) var(--drone-knowledge-tw-skew-x,) var(--drone-knowledge-tw-skew-y,)}:where(.drone-knowledge-ui) .cursor-pointer{cursor:pointer}:where(.drone-knowledge-ui) .touch-none{touch-action:none}:where(.drone-knowledge-ui) .list-none{list-style-type:none}:where(.drone-knowledge-ui) .grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}:where(.drone-knowledge-ui) .grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}:where(.drone-knowledge-ui) .grid-cols-\\[auto_1fr\\]{grid-template-columns:auto 1fr}:where(.drone-knowledge-ui) .grid-cols-\\[minmax\\(0\\,1fr\\)_auto\\]{grid-template-columns:minmax(0,1fr) auto}:where(.drone-knowledge-ui) .flex-col{flex-direction:column}:where(.drone-knowledge-ui) .flex-wrap{flex-wrap:wrap}:where(.drone-knowledge-ui) .items-center{align-items:center}:where(.drone-knowledge-ui) .items-start{align-items:flex-start}:where(.drone-knowledge-ui) .justify-between{justify-content:space-between}:where(.drone-knowledge-ui) .justify-end{justify-content:flex-end}:where(.drone-knowledge-ui) .gap-1{gap:var(--spacing)}:where(.drone-knowledge-ui) .gap-2{gap:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .gap-3{gap:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .gap-4{gap:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .gap-8{gap:calc(var(--spacing) * 8)}:where(.drone-knowledge-ui) :where(.space-y-0\\.5>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * .5) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * .5) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) :where(.space-y-1>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(var(--spacing) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(var(--spacing) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) :where(.space-y-2>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 2) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 2) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) :where(.space-y-3>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 3) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 3) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) :where(.space-y-4>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 4) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 4) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) :where(.space-y-6>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 6) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 6) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) .gap-x-2{column-gap:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .gap-x-3{column-gap:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .gap-y-1{row-gap:var(--spacing)}:where(.drone-knowledge-ui) .gap-y-2{row-gap:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) :where(.divide-y>:not(:last-child)){--drone-knowledge-tw-divide-y-reverse:0;border-bottom-style:var(--drone-knowledge-tw-border-style);border-top-style:var(--drone-knowledge-tw-border-style);border-top-width:calc(1px * var(--drone-knowledge-tw-divide-y-reverse));border-bottom-width:calc(1px * calc(1 - var(--drone-knowledge-tw-divide-y-reverse)))}:where(.drone-knowledge-ui) :where(.divide-border>:not(:last-child)){border-color:var(--color-border)}:where(.drone-knowledge-ui) .truncate{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}:where(.drone-knowledge-ui) .overflow-auto{overflow:auto}:where(.drone-knowledge-ui) .overflow-hidden{overflow:hidden}:where(.drone-knowledge-ui) .overflow-y-auto{overflow-y:auto}:where(.drone-knowledge-ui) .rounded{border-radius:.25rem}:where(.drone-knowledge-ui) .rounded-2xl{border-radius:var(--radius-2xl)}:where(.drone-knowledge-ui) .rounded-full{border-radius:3.40282e38px}:where(.drone-knowledge-ui) .rounded-lg{border-radius:10px}:where(.drone-knowledge-ui) .rounded-md{border-radius:8px}:where(.drone-knowledge-ui) .rounded-xl{border-radius:14px}:where(.drone-knowledge-ui) .border{border-style:var(--drone-knowledge-tw-border-style);border-width:1px}:where(.drone-knowledge-ui) .border-0{border-style:var(--drone-knowledge-tw-border-style);border-width:0}:where(.drone-knowledge-ui) .border-t{border-top-style:var(--drone-knowledge-tw-border-style);border-top-width:1px}:where(.drone-knowledge-ui) .border-b{border-bottom-style:var(--drone-knowledge-tw-border-style);border-bottom-width:1px}:where(.drone-knowledge-ui) .border-b-2{border-bottom-style:var(--drone-knowledge-tw-border-style);border-bottom-width:2px}:where(.drone-knowledge-ui) .border-l{border-left-style:var(--drone-knowledge-tw-border-style);border-left-width:1px}:where(.drone-knowledge-ui) .border-dashed{--drone-knowledge-tw-border-style:dashed;border-style:dashed}:where(.drone-knowledge-ui) .border-\\[var\\(--knowledge-edge\\)\\]{border-color:var(--knowledge-edge)}:where(.drone-knowledge-ui) .border-border{border-color:var(--color-border)}:where(.drone-knowledge-ui) .border-border-strong{border-color:var(--color-border-strong)}:where(.drone-knowledge-ui) .border-ink{border-color:var(--color-ink)}:where(.drone-knowledge-ui) .border-ink-faint{border-color:var(--color-ink-faint)}:where(.drone-knowledge-ui) .border-transparent{border-color:#0000}:where(.drone-knowledge-ui) .border-warn\\/30{border-color:var(--color-warn)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .border-warn\\/30{border-color:color-mix(in oklab, var(--color-warn) 30%, transparent)}}:where(.drone-knowledge-ui) .bg-\\[var\\(--highlight\\)\\]{background-color:var(--highlight)}:where(.drone-knowledge-ui) .bg-\\[var\\(--knowledge-edge\\)\\]{background-color:var(--knowledge-edge)}:where(.drone-knowledge-ui) .bg-err\\/8{background-color:var(--color-err)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-err\\/8{background-color:color-mix(in oklab, var(--color-err) 8%, transparent)}}:where(.drone-knowledge-ui) .bg-err\\/10{background-color:var(--color-err)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-err\\/10{background-color:color-mix(in oklab, var(--color-err) 10%, transparent)}}:where(.drone-knowledge-ui) .bg-hover,:where(.drone-knowledge-ui) .bg-hover\\/30{background-color:var(--color-hover)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-hover\\/30{background-color:color-mix(in oklab, var(--color-hover) 30%, transparent)}}:where(.drone-knowledge-ui) .bg-ink{background-color:var(--color-ink)}:where(.drone-knowledge-ui) .bg-ok,:where(.drone-knowledge-ui) .bg-ok\\/10{background-color:var(--color-ok)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-ok\\/10{background-color:color-mix(in oklab, var(--color-ok) 10%, transparent)}}:where(.drone-knowledge-ui) .bg-surface,:where(.drone-knowledge-ui) .bg-surface\\/40{background-color:var(--color-surface)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-surface\\/40{background-color:color-mix(in oklab, var(--color-surface) 40%, transparent)}}:where(.drone-knowledge-ui) .bg-surface\\/70{background-color:var(--color-surface)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-surface\\/70{background-color:color-mix(in oklab, var(--color-surface) 70%, transparent)}}:where(.drone-knowledge-ui) .bg-transparent{background-color:#0000}:where(.drone-knowledge-ui) .bg-warn,:where(.drone-knowledge-ui) .bg-warn\\/5{background-color:var(--color-warn)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-warn\\/5{background-color:color-mix(in oklab, var(--color-warn) 5%, transparent)}}:where(.drone-knowledge-ui) .bg-white\\/10{background-color:#ffffff1a}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-white\\/10{background-color:color-mix(in oklab, var(--color-white) 10%, transparent)}}:where(.drone-knowledge-ui) .p-1{padding:var(--spacing)}:where(.drone-knowledge-ui) .p-2{padding:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .p-3{padding:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .p-4{padding:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .p-5{padding:calc(var(--spacing) * 5)}:where(.drone-knowledge-ui) .p-6{padding:calc(var(--spacing) * 6)}:where(.drone-knowledge-ui) .px-1{padding-inline:var(--spacing)}:where(.drone-knowledge-ui) .px-2{padding-inline:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .px-3{padding-inline:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .px-4{padding-inline:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .px-5{padding-inline:calc(var(--spacing) * 5)}:where(.drone-knowledge-ui) .py-0\\.5{padding-block:calc(var(--spacing) * .5)}:where(.drone-knowledge-ui) .py-1{padding-block:var(--spacing)}:where(.drone-knowledge-ui) .py-2{padding-block:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .py-3{padding-block:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .py-4{padding-block:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .pt-1{padding-top:var(--spacing)}:where(.drone-knowledge-ui) .pt-2{padding-top:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .pt-3{padding-top:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .pt-5{padding-top:calc(var(--spacing) * 5)}:where(.drone-knowledge-ui) .pb-2{padding-bottom:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .pl-3{padding-left:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .text-center{text-align:center}:where(.drone-knowledge-ui) .text-left{text-align:left}:where(.drone-knowledge-ui) .text-right{text-align:right}:where(.drone-knowledge-ui) .align-middle{vertical-align:middle}:where(.drone-knowledge-ui) .font-mono{font-family:ui-monospace,SF Mono,SFMono-Regular,JetBrains Mono,Menlo,Consolas,Liberation Mono,Noto Sans Mono CJK SC,monospace}:where(.drone-knowledge-ui) .text-base{font-size:var(--text-base);line-height:var(--drone-knowledge-tw-leading,var(--text-base--line-height))}:where(.drone-knowledge-ui) .text-lg{font-size:var(--text-lg);line-height:var(--drone-knowledge-tw-leading,var(--text-lg--line-height))}:where(.drone-knowledge-ui) .text-sm{font-size:var(--text-sm);line-height:var(--drone-knowledge-tw-leading,var(--text-sm--line-height))}:where(.drone-knowledge-ui) .text-xs{font-size:var(--text-xs);line-height:var(--drone-knowledge-tw-leading,var(--text-xs--line-height))}:where(.drone-knowledge-ui) .text-\\[11px\\]{font-size:11px}:where(.drone-knowledge-ui) .text-\\[12px\\]{font-size:12px}:where(.drone-knowledge-ui) .text-\\[13px\\]{font-size:13px}:where(.drone-knowledge-ui) .leading-6{--drone-knowledge-tw-leading:calc(var(--spacing) * 6);line-height:calc(var(--spacing) * 6)}:where(.drone-knowledge-ui) .leading-relaxed{--drone-knowledge-tw-leading:var(--leading-relaxed);line-height:var(--leading-relaxed)}:where(.drone-knowledge-ui) .font-medium{--drone-knowledge-tw-font-weight:var(--font-weight-medium);font-weight:var(--font-weight-medium)}:where(.drone-knowledge-ui) .font-normal{--drone-knowledge-tw-font-weight:var(--font-weight-normal);font-weight:var(--font-weight-normal)}:where(.drone-knowledge-ui) .font-semibold{--drone-knowledge-tw-font-weight:var(--font-weight-semibold);font-weight:var(--font-weight-semibold)}:where(.drone-knowledge-ui) .tracking-\\[0\\.08em\\]{--drone-knowledge-tw-tracking:.08em;letter-spacing:.08em}:where(.drone-knowledge-ui) .tracking-\\[0\\.12em\\]{--drone-knowledge-tw-tracking:.12em;letter-spacing:.12em}:where(.drone-knowledge-ui) .tracking-\\[0\\.16em\\]{--drone-knowledge-tw-tracking:.16em;letter-spacing:.16em}:where(.drone-knowledge-ui) .tracking-wide{--drone-knowledge-tw-tracking:var(--tracking-wide);letter-spacing:var(--tracking-wide)}:where(.drone-knowledge-ui) .break-words{overflow-wrap:break-word}:where(.drone-knowledge-ui) .break-all{word-break:break-all}:where(.drone-knowledge-ui) .whitespace-nowrap{white-space:nowrap}:where(.drone-knowledge-ui) .whitespace-pre-wrap{white-space:pre-wrap}:where(.drone-knowledge-ui) .text-err{color:var(--color-err)}:where(.drone-knowledge-ui) .text-ink{color:var(--color-ink)}:where(.drone-knowledge-ui) .text-ink-2{color:var(--color-ink-2)}:where(.drone-knowledge-ui) .text-ink-dim{color:var(--color-ink-dim)}:where(.drone-knowledge-ui) .text-ink-faint{color:var(--color-ink-faint)}:where(.drone-knowledge-ui) .text-link{color:var(--link)}:where(.drone-knowledge-ui) .text-ok{color:var(--color-ok)}:where(.drone-knowledge-ui) .text-on-ink{color:var(--color-on-ink)}:where(.drone-knowledge-ui) .text-warn{color:var(--color-warn)}:where(.drone-knowledge-ui) .text-white\\/80{color:#fffc}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .text-white\\/80{color:color-mix(in oklab, var(--color-white) 80%, transparent)}}:where(.drone-knowledge-ui) .text-white\\/90{color:#ffffffe6}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .text-white\\/90{color:color-mix(in oklab, var(--color-white) 90%, transparent)}}:where(.drone-knowledge-ui) .uppercase{text-transform:uppercase}:where(.drone-knowledge-ui) .tabular-nums{--drone-knowledge-tw-numeric-spacing:tabular-nums;font-variant-numeric:var(--drone-knowledge-tw-ordinal,) var(--drone-knowledge-tw-slashed-zero,) var(--drone-knowledge-tw-numeric-figure,) var(--drone-knowledge-tw-numeric-spacing,) var(--drone-knowledge-tw-numeric-fraction,)}:where(.drone-knowledge-ui) .underline{text-decoration-line:underline}:where(.drone-knowledge-ui) .underline-offset-2{text-underline-offset:2px}:where(.drone-knowledge-ui) .opacity-60{opacity:.6}:where(.drone-knowledge-ui) .shadow-dialog{--drone-knowledge-tw-shadow:var(--shadow-dialog);box-shadow:var(--drone-knowledge-tw-inset-shadow), var(--drone-knowledge-tw-inset-ring-shadow), var(--drone-knowledge-tw-ring-offset-shadow), var(--drone-knowledge-tw-ring-shadow), var(--drone-knowledge-tw-shadow)}:where(.drone-knowledge-ui) .shadow-none{--drone-knowledge-tw-shadow:0 0 #0000;box-shadow:var(--drone-knowledge-tw-inset-shadow), var(--drone-knowledge-tw-inset-ring-shadow), var(--drone-knowledge-tw-ring-offset-shadow), var(--drone-knowledge-tw-ring-shadow), var(--drone-knowledge-tw-shadow)}:where(.drone-knowledge-ui) .ring{--drone-knowledge-tw-ring-shadow:var(--drone-knowledge-tw-ring-inset,) 0 0 0 calc(1px + var(--drone-knowledge-tw-ring-offset-width)) var(--drone-knowledge-tw-ring-color,currentcolor);box-shadow:var(--drone-knowledge-tw-inset-shadow), var(--drone-knowledge-tw-inset-ring-shadow), var(--drone-knowledge-tw-ring-offset-shadow), var(--drone-knowledge-tw-ring-shadow), var(--drone-knowledge-tw-shadow)}:where(.drone-knowledge-ui) .filter{filter:var(--drone-knowledge-tw-blur,) var(--drone-knowledge-tw-brightness,) var(--drone-knowledge-tw-contrast,) var(--drone-knowledge-tw-grayscale,) var(--drone-knowledge-tw-hue-rotate,) var(--drone-knowledge-tw-invert,) var(--drone-knowledge-tw-saturate,) var(--drone-knowledge-tw-sepia,) var(--drone-knowledge-tw-drop-shadow,)}:where(.drone-knowledge-ui) .transition{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--drone-knowledge-tw-gradient-from,--drone-knowledge-tw-gradient-via,--drone-knowledge-tw-gradient-to,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;transition-timing-function:var(--drone-knowledge-tw-ease,var(--default-transition-timing-function));transition-duration:var(--drone-knowledge-tw-duration,var(--default-transition-duration))}:where(.drone-knowledge-ui) .transition-colors{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--drone-knowledge-tw-gradient-from,--drone-knowledge-tw-gradient-via,--drone-knowledge-tw-gradient-to;transition-timing-function:var(--drone-knowledge-tw-ease,var(--default-transition-timing-function));transition-duration:var(--drone-knowledge-tw-duration,var(--default-transition-duration))}:where(.drone-knowledge-ui) .duration-200{--drone-knowledge-tw-duration:.2s;transition-duration:.2s}:where(.drone-knowledge-ui) .outline-none{--drone-knowledge-tw-outline-style:none;outline-style:none}:where(.drone-knowledge-ui) .select-none{-webkit-user-select:none;user-select:none}:where(.drone-knowledge-ui) .select-text{-webkit-user-select:text;user-select:text}:where(.drone-knowledge-ui) .focus-within\\:border-ink-faint:focus-within{border-color:var(--color-ink-faint)}@media (hover:hover){:where(.drone-knowledge-ui) .hover\\:bg-hover:hover{background-color:var(--color-hover)}:where(.drone-knowledge-ui) .hover\\:bg-white\\/20:hover{background-color:#fff3}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .hover\\:bg-white\\/20:hover{background-color:color-mix(in oklab, var(--color-white) 20%, transparent)}}:where(.drone-knowledge-ui) .hover\\:text-ink:hover{color:var(--color-ink)}:where(.drone-knowledge-ui) .hover\\:underline:hover{text-decoration-line:underline}}:where(.drone-knowledge-ui) .focus\\:border-accent:focus{border-color:var(--color-accent)}:where(.drone-knowledge-ui) .disabled\\:opacity-40:disabled{opacity:.4}@media (min-width:950px){:where(.drone-knowledge-ui) .min-\\[950px\\]\\:max-h-\\[52vh\\]{max-height:52vh}:where(.drone-knowledge-ui) .min-\\[950px\\]\\:grid-cols-\\[240px_minmax\\(0\\,1fr\\)\\]{grid-template-columns:240px minmax(0,1fr)}}@media (min-width:1100px){:where(.drone-knowledge-ui) .min-\\[1100px\\]\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:40rem){:where(.drone-knowledge-ui) .sm\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}:where(.drone-knowledge-ui) .sm\\:grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (min-width:48rem){:where(.drone-knowledge-ui) .md\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:64rem){:where(.drone-knowledge-ui) .lg\\:grid-cols-\\[minmax\\(0\\,1fr\\)_360px\\]{grid-template-columns:minmax(0,1fr) 360px}:where(.drone-knowledge-ui) .lg\\:grid-cols-\\[minmax\\(180px\\,0\\.35fr\\)_minmax\\(0\\,1fr\\)\\]{grid-template-columns:minmax(180px,.35fr) minmax(0,1fr)}}}@property --drone-knowledge-tw-rotate-x{syntax:"*";inherits:false}@property --drone-knowledge-tw-rotate-y{syntax:"*";inherits:false}@property --drone-knowledge-tw-rotate-z{syntax:"*";inherits:false}@property --drone-knowledge-tw-skew-x{syntax:"*";inherits:false}@property --drone-knowledge-tw-skew-y{syntax:"*";inherits:false}@property --drone-knowledge-tw-space-y-reverse{syntax:"*";inherits:false;initial-value:0}@property --drone-knowledge-tw-divide-y-reverse{syntax:"*";inherits:false;initial-value:0}@property --drone-knowledge-tw-border-style{syntax:"*";inherits:false;initial-value:solid}@property --drone-knowledge-tw-leading{syntax:"*";inherits:false}@property --drone-knowledge-tw-font-weight{syntax:"*";inherits:false}@property --drone-knowledge-tw-tracking{syntax:"*";inherits:false}@property --drone-knowledge-tw-ordinal{syntax:"*";inherits:false}@property --drone-knowledge-tw-slashed-zero{syntax:"*";inherits:false}@property --drone-knowledge-tw-numeric-figure{syntax:"*";inherits:false}@property --drone-knowledge-tw-numeric-spacing{syntax:"*";inherits:false}@property --drone-knowledge-tw-numeric-fraction{syntax:"*";inherits:false}@property --drone-knowledge-tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --drone-knowledge-tw-shadow-color{syntax:"*";inherits:false}@property --drone-knowledge-tw-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --drone-knowledge-tw-inset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --drone-knowledge-tw-inset-shadow-color{syntax:"*";inherits:false}@property --drone-knowledge-tw-inset-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --drone-knowledge-tw-ring-color{syntax:"*";inherits:false}@property --drone-knowledge-tw-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --drone-knowledge-tw-inset-ring-color{syntax:"*";inherits:false}@property --drone-knowledge-tw-inset-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --drone-knowledge-tw-ring-inset{syntax:"*";inherits:false}@property --drone-knowledge-tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0}@property --drone-knowledge-tw-ring-offset-color{syntax:"*";inherits:false;initial-value:#fff}@property --drone-knowledge-tw-ring-offset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --drone-knowledge-tw-blur{syntax:"*";inherits:false}@property --drone-knowledge-tw-brightness{syntax:"*";inherits:false}@property --drone-knowledge-tw-contrast{syntax:"*";inherits:false}@property --drone-knowledge-tw-grayscale{syntax:"*";inherits:false}@property --drone-knowledge-tw-hue-rotate{syntax:"*";inherits:false}@property --drone-knowledge-tw-invert{syntax:"*";inherits:false}@property --drone-knowledge-tw-opacity{syntax:"*";inherits:false}@property --drone-knowledge-tw-saturate{syntax:"*";inherits:false}@property --drone-knowledge-tw-sepia{syntax:"*";inherits:false}@property --drone-knowledge-tw-drop-shadow{syntax:"*";inherits:false}@property --drone-knowledge-tw-drop-shadow-color{syntax:"*";inherits:false}@property --drone-knowledge-tw-drop-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --drone-knowledge-tw-drop-shadow-size{syntax:"*";inherits:false}@property --drone-knowledge-tw-duration{syntax:"*";inherits:false}\n\n.drone-knowledge-ui {\n--knowledge-canvas: var(--color-canvas);\n--knowledge-surface: var(--color-surface);\n--knowledge-surface-muted: var(--color-hover);\n--knowledge-border: var(--color-border);\n--knowledge-border-strong: var(--color-border-strong);\n--knowledge-ink: var(--color-ink);\n--knowledge-ink-muted: var(--color-ink-dim);\n--knowledge-ink-faint: var(--color-ink-faint);\n--knowledge-accent: #2e6f8e;\n--knowledge-accent-soft: #e8f2f5;\n--knowledge-grid: #e6edf3;\n--knowledge-edge: #9bafbe;\n--knowledge-main: #b88a3a;\n--knowledge-directory: #9b7ac6;\n--knowledge-shadow: 0 10px 28px rgba(35, 58, 78, 0.08);\n--knowledge-shadow-soft: 0 3px 12px rgba(35, 58, 78, 0.07);\n}\n[data-theme="dark"] .drone-knowledge-ui {\n--knowledge-canvas: var(--color-canvas);\n--knowledge-surface: var(--color-surface);\n--knowledge-surface-muted: var(--color-hover);\n--knowledge-border: var(--color-border);\n--knowledge-border-strong: var(--color-border-strong);\n--knowledge-ink: var(--color-ink);\n--knowledge-ink-muted: var(--color-ink-dim);\n--knowledge-ink-faint: var(--color-ink-faint);\n--knowledge-accent: #7eb5c8;\n--knowledge-accent-soft: #263940;\n--knowledge-grid: #39434d;\n--knowledge-edge: #6f8190;\n--knowledge-main: #d4ad68;\n--knowledge-directory: #b899de;\n--knowledge-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);\n--knowledge-shadow-soft: 0 3px 12px rgba(0, 0, 0, 0.22);\n}\n.knowledge-view {\n--knowledge-shadow: 0 1px 2px rgba(35, 58, 78, 0.04);\n--knowledge-shadow-soft: none;\n}\n/* Migrated from Drone renderer styles at e5ec4f01. Domain selectors are owned by this package. */\n.panel-flow > .drone-knowledge-ui > [data-testid="knowledge-flow-card"] {\n	margin: 0 0 var(--space-3);\n	border-radius: var(--radius-lg);\n	box-shadow: var(--shadow-soft);\n}\n.panel-flow > .drone-knowledge-ui > [data-testid="knowledge-flow-card"]:not(.sunburst-flow-card) {\n	padding: var(--space-3) var(--space-3);\n}\n.knowledge-view {\n	display: flex;\n	min-height: 0;\n	min-width: 0;\n	flex: 1;\n	flex-direction: column;\n	background: var(--knowledge-canvas);\n	color: var(--knowledge-ink);\n}\n.knowledge-view-head {\n	flex: none;\n	display: flex;\n	align-items: center;\n	justify-content: space-between;\n	gap: var(--space-3);\n	padding: var(--space-3) var(--space-5);\n	border-bottom: 1px solid var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 94%, transparent);\n}\n.knowledge-view-close {\n	display: inline-flex;\n	align-items: center;\n	gap: var(--space-2);\n	border-radius: var(--radius-md);\n	padding: 5px 9px;\n	font-size: 12px;\n	color: var(--knowledge-ink-muted);\n	transition:\n		background-color 0.15s,\n		color 0.15s;\n}\n.knowledge-view-close:hover {\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-ink);\n}\n.knowledge-view-body {\n	min-height: 0;\n	flex: 1;\n	overflow-y: auto;\n	padding: var(--space-4) var(--space-5) var(--space-10);\n	background:\n		linear-gradient(180deg, color-mix(in srgb, var(--knowledge-surface) 76%, transparent), transparent 190px),\n		var(--knowledge-canvas);\n}\n.knowledge-view-body > div {\n	/* Same content width as PageShell (max-w-5xl). */\n	max-width: 64rem;\n}\n.knowledge-home,\n.knowledge-panel {\n	color: var(--knowledge-ink);\n}\n.knowledge-home > section,\n.knowledge-panel > section,\n.knowledge-panel .knowledge-card {\n	border-color: var(--knowledge-border);\n	background: var(--knowledge-surface);\n	box-shadow: var(--knowledge-shadow);\n}\n.knowledge-home > section,\n.knowledge-panel > section {\n	border-radius: var(--radius-xl);\n}\n.knowledge-home [data-testid="knowledge-graph"] {\n	min-width: 0;\n}\n.knowledge-panel > header {\n	padding: 2px 2px var(--space-2);\n}\n.knowledge-panel [role="tablist"] {\n	border-color: var(--knowledge-border);\n	gap: 3px;\n}\n.knowledge-panel [role="tab"] {\n	border-radius: var(--radius-md);\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-panel [role="tab"][aria-selected="true"] {\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-accent);\n}\n.knowledge-panel [role="tab"]:focus-visible,\n.knowledge-home button:focus-visible,\n.knowledge-panel button:focus-visible,\n.knowledge-cloud-section input:focus-visible,\n.knowledge-cloud-section button:focus-visible {\n	outline: 2px solid color-mix(in srgb, var(--knowledge-accent) 72%, white);\n	outline-offset: 2px;\n}\n.knowledge-cloud-section {\n	border: 1px solid var(--knowledge-border);\n	border-radius: var(--radius-xl);\n	background: var(--knowledge-surface);\n	box-shadow: var(--knowledge-shadow);\n	padding: var(--space-4);\n}\n.knowledge-cloud-section input,\n.knowledge-cloud-section select {\n	border-color: var(--knowledge-border);\n	background: var(--knowledge-surface-muted);\n	color: var(--knowledge-ink);\n}\n.knowledge-cloud-section input::placeholder {\n	color: var(--knowledge-ink-faint);\n}\n.knowledge-cloud-section ul,\n.knowledge-cloud-section [class*="rounded-md border"] {\n	border-color: var(--knowledge-border);\n}\n.knowledge-cloud-section pre {\n	border: 1px solid var(--knowledge-border);\n	background: var(--knowledge-surface-muted);\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-cloud-section [role="status"] {\n	font-weight: 600;\n}\n.knowledge-nebula canvas.sigma-nodes {\n	filter: drop-shadow(0 0 3px color-mix(in srgb, var(--knowledge-accent) 55%, transparent))\n		drop-shadow(0 0 8px color-mix(in srgb, var(--knowledge-accent) 25%, transparent));\n}\n.knowledge-observatory {\n	--knowledge-chart-ink: var(--knowledge-ink);\n	--knowledge-chart-muted: var(--knowledge-ink-muted);\n	min-width: 0;\n}\n.knowledge-network-layout {\n	display: grid;\n	grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);\n	gap: var(--space-4);\n	align-items: start;\n}\n.knowledge-network-changes {\n	min-width: 0;\n	border: 1px solid var(--knowledge-border);\n	border-radius: var(--radius-lg);\n	background: var(--knowledge-surface);\n	box-shadow: var(--knowledge-shadow-soft);\n	color: var(--knowledge-ink);\n}\n.knowledge-network-changes-head {\n	display: flex;\n	align-items: center;\n	justify-content: space-between;\n	gap: var(--space-2);\n	border-bottom: 1px solid var(--knowledge-border);\n	padding: var(--space-3) var(--space-4);\n}\n.knowledge-network-changes-head h2 {\n	margin: 0;\n	font-size: 13px;\n	font-weight: 650;\n}\n.knowledge-live-indicator {\n	display: inline-flex;\n	align-items: center;\n	gap: 5px;\n	color: var(--knowledge-ink-muted);\n	font-size: 10px;\n	white-space: nowrap;\n}\n.knowledge-live-indicator i {\n	display: inline-block;\n	width: 7px;\n	height: 7px;\n	border-radius: 999px;\n	background: var(--color-ok);\n}\n.knowledge-network-changes-list {\n	margin: 0;\n	padding: 0 var(--space-4);\n	list-style: none;\n}\n.knowledge-network-change {\n	min-width: 0;\n	padding: var(--space-3) 0;\n	border-bottom: 1px solid var(--knowledge-border);\n}\n.knowledge-network-change:last-child {\n	border-bottom: 0;\n}\n.knowledge-network-change-title,\n.knowledge-network-change-source {\n	display: block;\n	min-width: 0;\n	overflow: hidden;\n	text-overflow: ellipsis;\n	white-space: nowrap;\n}\n.knowledge-network-change-title {\n	font-size: 12px;\n	font-weight: 600;\n}\n.knowledge-network-change-source {\n	margin-top: 4px;\n	color: var(--knowledge-ink-muted);\n	font-size: 10px;\n	line-height: 1.3;\n}\n.knowledge-network-changes-empty {\n	margin: 0;\n	padding: var(--space-4);\n	color: var(--knowledge-ink-muted);\n	font-size: 11px;\n}\n.knowledge-observatory-canvas {\n	min-height: clamp(520px, 68vh, 760px);\n	border: 1px solid var(--knowledge-border);\n	background:\n		linear-gradient(180deg, color-mix(in srgb, var(--knowledge-surface) 85%, transparent), transparent 180px),\n		var(--knowledge-surface);\n	box-shadow: var(--knowledge-shadow);\n}\n.knowledge-graph-canvas-tools {\n	pointer-events: none;\n}\n.knowledge-graph-canvas-tools > * {\n	pointer-events: auto;\n}\n.knowledge-graph-observatory-label,\n.knowledge-graph-controls {\n	border: 1px solid var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 94%, transparent);\n	box-shadow: var(--knowledge-shadow-soft);\n	backdrop-filter: blur(8px);\n}\n.knowledge-graph-observatory-label {\n	color: var(--knowledge-ink-muted);\n	font-weight: 600;\n	letter-spacing: 0.01em;\n}\n.knowledge-graph-toolbar > button,\n.knowledge-graph-toolbar label,\n.knowledge-graph-toolbar span > button {\n	min-height: 32px;\n}\n.knowledge-graph-zoom-button,\n.knowledge-graph-fit-button {\n	display: inline-flex;\n	min-height: 32px;\n	align-items: center;\n	justify-content: center;\n	border-radius: var(--radius-sm);\n	color: var(--knowledge-ink-muted);\n	font-size: 12px;\n	line-height: 1;\n	transition:\n		background-color 0.15s,\n		color 0.15s,\n		transform 0.15s;\n}\n.knowledge-graph-zoom-button {\n	width: 32px;\n	font-size: 18px;\n}\n.knowledge-graph-fit-button {\n	padding: 0 var(--space-3);\n	font-size: 11px;\n}\n.knowledge-graph-zoom-button:hover,\n.knowledge-graph-fit-button:hover {\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-accent);\n}\n.knowledge-graph-zoom-button:active,\n.knowledge-graph-fit-button:active {\n	transform: scale(0.95);\n}\n.knowledge-graph-zoom-value {\n	min-width: 42px;\n	color: var(--knowledge-ink-muted);\n	font:\n		10px ui-monospace,\n		SFMono-Regular,\n		Menlo,\n		monospace;\n	text-align: center;\n}\n.knowledge-graph-scene {\n	transform-box: fill-box;\n	transform-origin: center;\n}\n.knowledge-graph-svg {\n	overscroll-behavior: contain;\n	background: transparent;\n}\n.knowledge-graph-axis-labels {\n	fill: var(--knowledge-ink-faint);\n	font-size: 11px;\n	opacity: 0.85;\n}\n.knowledge-graph-legend {\n	border: 1px solid var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 94%, transparent);\n	box-shadow: var(--knowledge-shadow-soft);\n	color: var(--knowledge-ink-muted);\n	line-height: 1.2;\n	backdrop-filter: blur(8px);\n}\n.knowledge-graph-legend-main {\n	border-color: var(--knowledge-main);\n}\n.knowledge-graph-legend-directory {\n	border-color: var(--knowledge-directory);\n}\n.knowledge-graph-category-filter {\n	display: inline-flex;\n	align-items: center;\n	gap: var(--space-1);\n	border: 1px solid transparent;\n	border-radius: 999px;\n	padding: 2px 7px;\n	color: var(--knowledge-ink-muted);\n	transition:\n		border-color 160ms ease,\n		background-color 160ms ease,\n		color 160ms ease;\n}\n.knowledge-graph-category-filter i {\n	display: inline-block;\n	height: 7px;\n	width: 7px;\n	border-radius: 999px;\n}\n.knowledge-graph-category-filter:hover,\n.knowledge-graph-category-filter.is-active {\n	border-color: color-mix(in srgb, var(--knowledge-accent) 38%, var(--knowledge-border));\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-accent);\n}\n.knowledge-graph-edge {\n	transition:\n		stroke-opacity 0.2s,\n		stroke-width 0.2s;\n}\n.knowledge-graph-edge--active {\n	stroke-dasharray: 3 7;\n	animation: knowledge-graph-flow 1.8s linear infinite;\n}\n.knowledge-graph-edge--fresh {\n	animation: knowledge-graph-fresh 0.7s ease-in-out 3;\n}\n.knowledge-graph-node-aura {\n	animation: knowledge-graph-pulse 3.2s ease-in-out infinite;\n}\n.knowledge-graph-node-aura--fresh {\n	animation: knowledge-graph-fresh 0.7s ease-in-out 3;\n}\n.knowledge-graph-selection-halo {\n	animation: knowledge-graph-selection 1.8s ease-in-out infinite;\n}\n.knowledge-node-drawer {\n	border: 1px solid var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 96%, transparent);\n	box-shadow: var(--knowledge-shadow);\n	color: var(--knowledge-ink);\n	backdrop-filter: blur(12px);\n	opacity: 0;\n	pointer-events: none;\n	transform: translateX(calc(100% + 24px));\n}\n.knowledge-node-drawer.is-open {\n	opacity: 1;\n	pointer-events: auto;\n	transform: translateX(0);\n}\n@keyframes knowledge-graph-flow {\n	to {\n		stroke-dashoffset: -20;\n	}\n}\n@keyframes knowledge-graph-pulse {\n	0%,\n	100% {\n		opacity: 0.12;\n	}\n	50% {\n		opacity: 0.28;\n	}\n}\n@keyframes knowledge-graph-fresh {\n	0%,\n	100% {\n		opacity: 0.35;\n	}\n	50% {\n		opacity: 0.95;\n	}\n}\n@keyframes knowledge-graph-selection {\n	0%,\n	100% {\n		stroke-opacity: 0.28;\n		transform: scale(1);\n	}\n	50% {\n		stroke-opacity: 0.7;\n		transform: scale(1.12);\n	}\n}\n@media (max-width: 760px) {\n	.knowledge-network-layout {\n		grid-template-columns: minmax(0, 1fr);\n	}\n	.knowledge-node-drawer {\n		top: auto;\n		bottom: 12px;\n		left: 12px;\n		width: calc(100% - 24px);\n		max-height: min(62%, 420px);\n		transform: translateY(calc(100% + 24px));\n	}\n	.knowledge-node-drawer.is-open {\n		transform: translateY(0);\n	}\n}\n@media (prefers-reduced-motion: reduce) {\n	.knowledge-graph-edge--active,\n	.knowledge-graph-edge--fresh,\n	.knowledge-graph-node-aura,\n	.knowledge-graph-node-aura--fresh,\n	.knowledge-graph-selection-halo {\n		animation: none;\n	}\n}\n.knowledge-graph-toolbar > button,\n.knowledge-graph-toolbar label,\n.knowledge-graph-toolbar span > button {\n	min-height: 32px;\n}\n.knowledge-graph-zoom-button,\n.knowledge-graph-fit-button {\n	display: inline-flex;\n	min-height: 32px;\n	align-items: center;\n	justify-content: center;\n	border-radius: var(--radius-sm);\n	color: #dce7ff;\n	font-size: 12px;\n	line-height: 1;\n	transition:\n		background-color 0.15s,\n		color 0.15s,\n		transform 0.15s;\n}\n.knowledge-graph-zoom-button {\n	width: 32px;\n	font-size: 18px;\n}\n.knowledge-graph-fit-button {\n	padding: 0 var(--space-3);\n	font-size: 11px;\n}\n.knowledge-graph-zoom-button:hover,\n.knowledge-graph-fit-button:hover {\n	background: rgba(124, 151, 216, 0.22);\n	color: #fff;\n}\n.knowledge-graph-zoom-button:active,\n.knowledge-graph-fit-button:active {\n	transform: scale(0.95);\n}\n.knowledge-graph-zoom-value {\n	min-width: 42px;\n	color: #aabde6;\n	font:\n		10px ui-monospace,\n		SFMono-Regular,\n		Menlo,\n		monospace;\n	text-align: center;\n}\n.knowledge-graph-scene {\n	transform-box: fill-box;\n	transform-origin: center;\n}\n.knowledge-graph-svg {\n	overscroll-behavior: contain;\n}\n.knowledge-graph-legend {\n	line-height: 1.2;\n}\n.knowledge-graph-category-filter {\n	display: inline-flex;\n	align-items: center;\n	gap: var(--space-1);\n	border: 1px solid transparent;\n	border-radius: 999px;\n	padding: 2px 7px;\n	color: #8494b3;\n	transition:\n		border-color 160ms ease,\n		background-color 160ms ease,\n		color 160ms ease;\n}\n.knowledge-graph-category-filter i {\n	display: inline-block;\n	height: 7px;\n	width: 7px;\n	border-radius: 999px;\n}\n.knowledge-graph-category-filter:hover,\n.knowledge-graph-category-filter.is-active {\n	border-color: #526a9f;\n	background: #192844;\n	color: #dce7ff;\n}\n.knowledge-graph-edge {\n	transition:\n		stroke-opacity 0.2s,\n		stroke-width 0.2s;\n}\n.knowledge-graph-edge--active {\n	stroke-dasharray: 3 7;\n	animation: knowledge-graph-flow 1.8s linear infinite;\n}\n.knowledge-graph-node-aura {\n	animation: knowledge-graph-pulse 3.2s ease-in-out infinite;\n}\n.knowledge-graph-selection-halo {\n	animation: knowledge-graph-selection 1.8s ease-in-out infinite;\n}\n.knowledge-node-drawer {\n	opacity: 0;\n	pointer-events: none;\n	transform: translateX(calc(100% + 24px));\n}\n.knowledge-node-drawer.is-open {\n	opacity: 1;\n	pointer-events: auto;\n	transform: translateX(0);\n}\n@keyframes knowledge-graph-flow {\n	to {\n		stroke-dashoffset: -20;\n	}\n}\n@keyframes knowledge-graph-pulse {\n	0%,\n	100% {\n		opacity: 0.12;\n	}\n	50% {\n		opacity: 0.28;\n	}\n}\n@keyframes knowledge-graph-selection {\n	0%,\n	100% {\n		stroke-opacity: 0.28;\n		transform: scale(1);\n	}\n	50% {\n		stroke-opacity: 0.7;\n		transform: scale(1.12);\n	}\n}\n@media (max-width: 760px) {\n	.knowledge-node-drawer {\n		top: auto;\n		bottom: 12px;\n		left: 12px;\n		width: calc(100% - 24px);\n		max-height: min(62%, 420px);\n		transform: translateY(calc(100% + 24px));\n	}\n	.knowledge-node-drawer.is-open {\n		transform: translateY(0);\n	}\n}\n@media (prefers-reduced-motion: reduce) {\n	.knowledge-graph-edge--active,\n	.knowledge-graph-node-aura,\n	.knowledge-graph-selection-halo {\n		animation: none;\n	}\n}\n.knowledge-state-card {\n	border-color: var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 92%, transparent);\n	box-shadow: var(--knowledge-shadow-soft);\n}\n.knowledge-state-card--error {\n	border-color: color-mix(in srgb, var(--color-err) 38%, var(--knowledge-border));\n	background: color-mix(in srgb, var(--color-err) 7%, var(--knowledge-surface));\n}\n.knowledge-graph-svg :where(g[role="button"]):focus-visible {\n	outline: 2px solid var(--knowledge-accent);\n	outline-offset: 4px;\n}\n.knowledge-graph-svg :where(g[role="button"]):focus-visible circle:last-of-type {\n	stroke: var(--knowledge-accent);\n	stroke-width: 3;\n}\n.knowledge-observatory-canvas .knowledge-graph-node-aura {\n	animation: none;\n}\n.knowledge-observatory-canvas .knowledge-graph-node-aura--fresh {\n	animation: knowledge-graph-fresh 0.7s ease-in-out 3;\n}\n.knowledge-graph-live-toggle {\n	border: 1px solid var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 92%, transparent);\n	color: var(--knowledge-ink);\n	pointer-events: auto;\n}\n.knowledge-graph-live-dot {\n	width: 7px;\n	height: 7px;\n	border-radius: 999px;\n	background: #059669;\n	animation: knowledge-graph-live-blink 2s ease-in-out infinite;\n}\n.knowledge-graph-live-dot--paused {\n	background: var(--knowledge-ink-muted);\n	animation: none;\n}\n@keyframes knowledge-graph-live-blink {\n	50% {\n		opacity: 0.35;\n	}\n}\n@media (prefers-reduced-motion: reduce) {\n	.knowledge-observatory-canvas .knowledge-graph-node-aura--fresh,\n	.knowledge-graph-selection-halo,\n	.knowledge-graph-live-dot {\n		animation: none;\n	}\n}\n[data-testid="knowledge-network"] {\n	container-type: inline-size;\n}\n@container (max-width: 1000px) {\n	.knowledge-network-layout {\n		grid-template-columns: minmax(0, 1fr);\n	}\n}\n.knowledge-view-head {\n	border-bottom-color: transparent;\n	background: transparent;\n	padding: var(--space-4) var(--space-6) var(--space-2);\n}\n.knowledge-view-body {\n	/* Same frame as PageShell (px-8 pt-8 pb-12) so first-level pages line up. */\n	padding: 2rem 2rem 3rem;\n	background: var(--knowledge-canvas);\n}\n.knowledge-home > section:first-child {\n	box-shadow: none;\n	border-color: var(--knowledge-border);\n	background: var(--knowledge-surface);\n}\n.knowledge-view {\n	--knowledge-shadow: 0 1px 2px rgba(35, 58, 78, 0.04);\n	--knowledge-shadow-soft: none;\n}\n.knowledge-home :is(section, article) :is(section, article, div).rounded-xl.border,\n.knowledge-home :is(section, article) :is(section, article, div).rounded-lg.border {\n	border-color: transparent;\n	background: var(--knowledge-surface-muted);\n	box-shadow: none;\n}\n.knowledge-network-header {\n	display: flex;\n	align-items: flex-end;\n	justify-content: space-between;\n	gap: var(--space-4);\n	padding: var(--space-1) var(--space-1) var(--space-2);\n}\n.knowledge-network-eyebrow {\n	margin: 0 0 3px;\n	font-size: 10px;\n	font-weight: 600;\n	letter-spacing: 0.14em;\n	text-transform: uppercase;\n	color: var(--knowledge-accent);\n}\n.knowledge-network-title {\n	margin: 0;\n	font-size: 16px;\n	font-weight: 600;\n	letter-spacing: -0.015em;\n	color: var(--knowledge-ink);\n}\n.knowledge-network-hint {\n	max-width: 620px;\n	margin: 4px 0 0;\n	font-size: 11px;\n	line-height: 1.55;\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-network-stats {\n	display: flex;\n	flex-wrap: wrap;\n	justify-content: flex-end;\n	gap: var(--space-2);\n	font-size: 11px;\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-network-header .knowledge-network-stats span {\n	border: 1px solid var(--knowledge-border);\n	border-radius: 999px;\n	background: var(--knowledge-surface-muted);\n	padding: 4px 9px;\n	white-space: nowrap;\n}\n.knowledge-network-stats strong {\n	font-variant-numeric: tabular-nums;\n	color: var(--knowledge-ink);\n}\n.knowledge-observatory-canvas {\n	background:\n		radial-gradient(\n			circle at 18% 16%,\n			color-mix(in srgb, var(--knowledge-accent) 7%, transparent),\n			transparent 32%\n		),\n		linear-gradient(180deg, var(--knowledge-surface), var(--knowledge-canvas));\n}\n.knowledge-graph-controls,\n.knowledge-graph-observatory-label,\n.knowledge-graph-legend {\n	background: color-mix(in srgb, var(--knowledge-surface) 96%, transparent);\n}\n.knowledge-graph-zoom-button,\n.knowledge-graph-fit-button {\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-graph-zoom-button:hover,\n.knowledge-graph-fit-button:hover {\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-accent);\n}\n.knowledge-graph-category-filter {\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-graph-category-filter:hover,\n.knowledge-graph-category-filter.is-active {\n	border-color: color-mix(in srgb, var(--knowledge-accent) 38%, var(--knowledge-border));\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-accent);\n}\n@media (max-width: 760px) {\n	.knowledge-network-header {\n		align-items: flex-start;\n		flex-direction: column;\n	}\n	.knowledge-network-stats {\n		justify-content: flex-start;\n	}\n}\n';

// ui/entry.tsx
import { Fragment as Fragment7, jsx as jsx25, jsxs as jsxs25 } from "react/jsx-runtime";
function Styles() {
  return /* @__PURE__ */ jsx25("style", { "data-drone-knowledge-styles": true, children: knowledgeStyles });
}
function KnowledgePage() {
  return /* @__PURE__ */ jsxs25("div", { className: "drone-knowledge-ui", style: { display: "flex", flex: 1, minWidth: 0, minHeight: 0 }, children: [
    /* @__PURE__ */ jsx25(Styles, {}),
    /* @__PURE__ */ jsx25(KnowledgeView, {})
  ] });
}
function KnowledgeOverlay() {
  return /* @__PURE__ */ jsxs25(Fragment7, { children: [
    /* @__PURE__ */ jsx25(Styles, {}),
    /* @__PURE__ */ jsx25(KnowledgeUiRoot, {})
  ] });
}
function KnowledgeSurface(props) {
  let surface;
  switch (props.kind) {
    case "settings":
      surface = /* @__PURE__ */ jsx25(KnowledgePanel, { ...props });
      break;
    case "note":
      surface = /* @__PURE__ */ jsx25(KnowledgeNoteViewer, { ...props });
      break;
    case "flow":
      surface = /* @__PURE__ */ jsx25(KnowledgeFlowCard, { ...props });
      break;
    case "zotero":
      surface = /* @__PURE__ */ jsx25(ZoteroPanel, {});
      break;
    case "institution":
      surface = /* @__PURE__ */ jsx25(InstitutionalAccessSection, {});
      break;
  }
  return /* @__PURE__ */ jsxs25("div", { className: "drone-knowledge-ui", children: [
    /* @__PURE__ */ jsx25(Styles, {}),
    surface
  ] });
}
export {
  KnowledgeOverlay,
  KnowledgePage,
  KnowledgeSurface
};
