// ui/NativeKnowledgePage.tsx
import { useEffect as useEffect10, useMemo as useMemo5, useSyncExternalStore } from "react";

// ui/runtime-api.ts
var host = window.DroneUI;
var { Button, Markdown } = host.components;
var { useLanguage, usePluginRuntime } = host.hooks;
var { useSessionsStore } = host.stores;

// ui/native-copy.ts
var zh = {
  title: "\u77E5\u8BC6\u5E93",
  settings: "\u8BBE\u7F6E",
  reviews: "\u5F85\u5BA1\u5019\u9009",
  history: "\u5BA1\u6838\u5386\u53F2",
  historyEmpty: "\u5F53\u524D\u8BFE\u9898\u6682\u65E0\u53EF\u64A4\u9500\u7684\u66F4\u65B0\u3002",
  undoHint: "\u64A4\u9500\u4F1A\u6062\u590D\u4FDD\u5B58\u524D\u7684\u539F\u6587\uFF1B\u65B0\u5EFA\u9875\u9762\u4F1A\u88AB\u5220\u9664\u3002\u82E5\u4E4B\u540E\u6709\u4EBA\u7F16\u8F91\uFF0C\u64CD\u4F5C\u5C06\u62D2\u7EDD\u3002",
  undoReview: "\u64A4\u9500\u6B64\u66F4\u65B0",
  confirmUndo: "\u786E\u8BA4\u64A4\u9500",
  cancelUndo: "\u53D6\u6D88",
  undoing: "\u6B63\u5728\u64A4\u9500\u2026",
  reviewPartial: "\u7B14\u8BB0\u5DF2\u5199\u5165\uFF0C\u4F46\u5BA1\u6838\u8BB0\u5F55\u6216\u7D22\u5F15\u5C1A\u672A\u5B8C\u6210\uFF0C\u8BF7\u6838\u5BF9\u4EE5\u4E0B\u56DE\u6267\uFF1A",
  reviewReadOnly: "\u5019\u9009\u5199\u5165\u9700\u8981\u5BBF\u4E3B\u660E\u786E\u6388\u4E88\u72B6\u6001\u548C\u77E5\u8BC6\u5E93\u5199\u5165\u6743\u9650\uFF1B\u5E94\u7528\u524D\u8BF7\u6838\u5BF9\u5DEE\u5F02\u4E0E\u6765\u6E90\u3002",
  reviewBack: "\u5173\u95ED\u9884\u89C8",
  reviewCount: "\u6761\u5019\u9009",
  reviewEmpty: "\u5F53\u524D\u8BFE\u9898\u6682\u65E0\u5019\u9009\u3002",
  reviewProjectRequired: "\u9009\u62E9\u4E00\u4E2A\u771F\u5B9E\u9879\u76EE\u4F1A\u8BDD\uFF0C\u4EE5\u67E5\u770B\u8BE5\u8BFE\u9898\u7684\u5019\u9009\u3002",
  reviewExpired: "\u5019\u9009\u5DF2\u8FC7\u671F\uFF0C\u4EC5\u4F9B\u67E5\u770B\u3002",
  reviewBindingChanged: "\u77E5\u8BC6\u5E93\u7ED1\u5B9A\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u5019\u9009\u3002",
  reviewTargetChanged: "\u76EE\u6807\u7B14\u8BB0\u5DF2\u53D8\u5316\uFF1B\u6B64\u5904\u663E\u793A\u751F\u6210\u5019\u9009\u65F6\u7684\u539F\u6587\u4E0E\u5EFA\u8BAE\u5185\u5BB9\u3002",
  reviewVersion: "\u5019\u9009\u7248\u672C",
  reviewNotVerified: "\u5DEE\u5F02\u9884\u89C8\u4E0D\u4EE3\u8868\u79D1\u5B66\u6838\u9A8C\uFF0C\u4E5F\u4E0D\u4F1A\u786E\u8BA4\u6216\u5E94\u7528\u5019\u9009\u3002",
  applyReview: "\u5E94\u7528\u5019\u9009",
  rejectReview: "\u62D2\u7EDD\u5019\u9009",
  applying: "\u6B63\u5728\u5E94\u7528\u2026",
  rejecting: "\u6B63\u5728\u62D2\u7EDD\u2026",
  reviewApplied: "\u5019\u9009\u5DF2\u5E94\u7528\u5E76\u5B8C\u6210\u5199\u540E\u56DE\u8BFB\u3002",
  reviewRejected: "\u5019\u9009\u5DF2\u62D2\u7EDD\u5E76\u8BB0\u5F55\u5BA1\u6838\u7ED3\u679C\u3002",
  bindingDetails: "\u5F53\u524D\u77E5\u8BC6\u5E93\u7ED1\u5B9A",
  vaultPath: "\u76EE\u5F55",
  profile: "\u8D44\u6599\u7EC4\u7EC7",
  depositMode: "\u5199\u5165\u7B56\u7565",
  subagentPolicy: "\u4E13\u5458\u6743\u9650",
  bindingRevision: "\u7ED1\u5B9A\u7248\u672C",
  updatedAt: "\u66F4\u65B0\u65F6\u95F4",
  profile_project: "\u9879\u76EE\u8D44\u6599",
  profile_literature: "\u6587\u732E\u8D44\u6599",
  profile_hybrid: "\u6DF7\u5408\u8D44\u6599",
  "run-only": "\u4EC5\u8FD0\u884C\u8BB0\u5F55",
  verified: "\u5DF2\u6838\u5BF9\u5185\u5BB9",
  rich: "\u8BE6\u7EC6\u8BB0\u5F55",
  none: "\u4E0D\u542F\u7528",
  "read-local": "\u8BFB\u53D6\u672C\u5730\u8D44\u6599",
  bindingEditingUnavailable: "\u5207\u6362\u76EE\u5F55\u548C\u521D\u59CB\u5316\u5C1A\u5728\u8FC1\u79FB\uFF0C\u9700\u8981\u5355\u72EC\u9009\u62E9\u76EE\u5F55\u3001\u786E\u8BA4\u5199\u5165\u5E76\u7B49\u5F85\u5F53\u524D\u4EFB\u52A1\u5173\u95ED\u3002",
  reviewPolicy: "\u5BA1\u6838\u7B56\u7565",
  effectiveMode: "\u5F53\u524D\u751F\u6548",
  persistedMode: "\u5DF2\u4FDD\u5B58",
  notPersisted: "\u5C1A\u672A\u4FDD\u5B58\uFF0C\u6CBF\u7528\u9ED8\u8BA4\u7B56\u7565",
  automatic: "\u81EA\u52A8",
  strict: "\u4E25\u683C",
  reviewPolicyHint: "\u6B64\u8BBE\u7F6E\u63A7\u5236\u77E5\u8BC6\u53D1\u5E03\u68C0\u67E5\u3002\u81EA\u52A8\u6A21\u5F0F\u4ECD\u4FDD\u7559\u6388\u6743\u3001\u6765\u6E90\u548C\u5199\u5165\u68C0\u67E5\uFF1B\u4EBA\u5DE5 Wiki \u5185\u5BB9\u4E0D\u56E0\u6B64\u83B7\u5F97\u81EA\u52A8\u4FEE\u6539\u6743\u9650\u3002",
  policyOverride: "\u73AF\u5883\u7B56\u7565\u5F3A\u5236\u4E25\u683C\u5BA1\u6838\uFF1B\u6B64\u5904\u4E0D\u80FD\u8986\u76D6\u3002",
  "invalid-json": "\u5BA1\u6838\u7B56\u7565 JSON \u5DF2\u635F\u574F\uFF1B\u5F53\u524D\u6267\u884C\u4E25\u683C\u6A21\u5F0F\u3002\u8BF7\u4FEE\u590D\u6587\u4EF6\u540E\u5237\u65B0\uFF0C\u754C\u9762\u4E0D\u4F1A\u8986\u76D6\u635F\u574F\u6570\u636E\u3002",
  "invalid-policy": "\u5BA1\u6838\u7B56\u7565\u5185\u5BB9\u65E0\u6548\uFF1B\u5F53\u524D\u6267\u884C\u4E25\u683C\u6A21\u5F0F\u3002\u8BF7\u4FEE\u590D\u6587\u4EF6\u540E\u5237\u65B0\uFF0C\u754C\u9762\u4E0D\u4F1A\u8986\u76D6\u65E0\u6548\u6570\u636E\u3002",
  stateWriteRequired: "\u5F53\u524D\u4EC5\u6388\u6743\u8BFB\u53D6\u72B6\u6001\u3002\u82E5\u9700\u4FEE\u6539\uFF0C\u8BF7\u505C\u7528\u540E\u91CD\u65B0\u542F\u7528\u63D2\u4EF6\uFF0C\u5E76\u5728\u5BBF\u4E3B\u76EE\u5F55\u6388\u6743\u4E2D\u660E\u786E\u9009\u62E9\u5141\u8BB8\u72B6\u6001\u5199\u5165\u3002",
  savePolicy: "\u4FDD\u5B58\u5BA1\u6838\u7B56\u7565",
  saving: "\u6B63\u5728\u4FDD\u5B58\u2026",
  policySaved: "\u7B56\u7565\u5DF2\u4FDD\u5B58\u5E76\u56DE\u8BFB\u6838\u5BF9\u3002",
  semanticSettings: "\u76F8\u4F3C\u5185\u5BB9\u8BBE\u7F6E",
  semanticSettingsHint: "\u8BBE\u7F6E\u53EA\u4FDD\u5B58\u5230\u5BBF\u4E3B\u6388\u6743\u7684\u5E94\u7528\u72B6\u6001\uFF1B\u6A21\u578B\u8C03\u7528\u4ECD\u672A\u5728\u6B64\u9875\u9762\u542F\u7528\u3002",
  semanticEnabled: "\u542F\u7528\u76F8\u4F3C\u5185\u5BB9\u68C0\u7D22",
  semanticProvider: "\u6A21\u578B\u670D\u52A1",
  semanticProviderNone: "\u4E0D\u4F7F\u7528\u6A21\u578B",
  semanticBaseUrl: "\u670D\u52A1\u5730\u5740",
  semanticModel: "\u6A21\u578B\u540D\u79F0",
  saveSemantic: "\u4FDD\u5B58\u76F8\u4F3C\u5185\u5BB9\u8BBE\u7F6E",
  semanticSaved: "\u76F8\u4F3C\u5185\u5BB9\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u5E76\u56DE\u8BFB\u6838\u5BF9\u3002",
  inlineLinkUnavailable: "\u6B64\u94FE\u63A5\u6682\u4E0D\u80FD\u6253\u5F00\u3002\u5E93\u5185\u7B14\u8BB0\u8BF7\u4F7F\u7528\u4E0B\u65B9\u7684\u53CC\u5411\u94FE\u63A5\uFF1B\u5916\u90E8\u94FE\u63A5\u9700\u7B49\u5F85\u53D7\u63A7\u6253\u5F00\u80FD\u529B\u3002",
  readingNavigation: "\u77E5\u8BC6\u9605\u8BFB\u89C6\u56FE",
  reading: "\u9605\u8BFB",
  graph: "\u56FE\u8C31",
  jobs: "\u7D22\u5F15\u4EFB\u52A1",
  jobCount: "\u6761\u4EFB\u52A1",
  firstPage: "\u8FD4\u56DE\u9996\u9875",
  nextPage: "\u4E0B\u4E00\u9875",
  openUnavailable: "\u5728\u5916\u90E8\u5E94\u7528\u6253\u5F00\u6682\u4E0D\u53EF\u7528\uFF1A\u53D7\u63A7\u6587\u4EF6\u6253\u5F00\u80FD\u529B\u4ECD\u5728\u8FC1\u79FB\u3002",
  handoffUnavailable: "\u8F6C\u4EA4\u4F1A\u8BDD\u5904\u7406\u4ECD\u5728\u8FC1\u79FB\u4E2D\u3002",
  refresh: "\u5237\u65B0",
  loading: "\u6B63\u5728\u52A0\u8F7D\u2026",
  search: "\u641C\u7D22",
  query: "\u641C\u7D22\u77E5\u8BC6\u5E93",
  searchHint: "\u8F93\u5165\u5173\u952E\u8BCD\u67E5\u627E\u5F53\u524D\u77E5\u8BC6\u5E93\u4E2D\u7684\u8D44\u6599",
  unconfigured: "\u5C1A\u672A\u7ED1\u5B9A\u77E5\u8BC6\u5E93",
  unconfiguredHint: "\u5B8C\u6210\u77E5\u8BC6\u5E93\u7ED1\u5B9A\u540E\uFF0C\u8FD9\u91CC\u4F1A\u663E\u793A\u6982\u89C8\u5E76\u652F\u6301\u641C\u7D22\u3002",
  project: "\u5F53\u524D\u8BFE\u9898",
  application: "\u5171\u4EAB\u8D44\u6599",
  notes: "\u7BC7\u7B14\u8BB0\uFF08\u5168\u5E93\u7D22\u5F15\uFF09",
  recent: "\u6700\u8FD1\u66F4\u65B0",
  noRecent: "\u6682\u65E0\u7D22\u5F15\u8BB0\u5F55\u3002",
  indexMissing: "\u5C1A\u672A\u8BFB\u53D6\u7D22\u5F15\u72B6\u6001\u3002",
  uninitialized: "\u7D22\u5F15\u5C1A\u672A\u521D\u59CB\u5316",
  indexing: "\u6B63\u5728\u5EFA\u7ACB\u7D22\u5F15",
  partial: "\u7D22\u5F15\u5C1A\u672A\u5B8C\u6574",
  ready: "\u7D22\u5F15\u5DF2\u5C31\u7EEA",
  results: "\u641C\u7D22\u7ED3\u679C",
  noResults: "\u6CA1\u6709\u5339\u914D\u7ED3\u679C\u3002",
  incomplete: "\u7D22\u5F15\u5C1A\u672A\u5B8C\u6574\uFF0C\u5F53\u524D\u7ED3\u679C\u4E0D\u4EE3\u8868\u5168\u90E8\u8D44\u6599\u3002",
  lines: "\u884C",
  unsupportedTitle: "\u5176\u4ED6\u77E5\u8BC6\u529F\u80FD\u6682\u4E0D\u53EF\u7528",
  unsupported: "\u5F53\u524D\u652F\u6301\u603B\u89C8\u3001\u641C\u7D22\u3001\u7B14\u8BB0\u9605\u8BFB\u3001\u94FE\u63A5\u3001\u56FE\u8C31\u3001\u7D22\u5F15\u4EFB\u52A1\u67E5\u8BE2\u3001\u5019\u9009\u5BA1\u6838\u3001\u5386\u53F2\u4E0E\u64A4\u9500\uFF0C\u4EE5\u53CA\u5BA1\u6838\u7B56\u7565\u548C\u76F8\u4F3C\u5185\u5BB9\u8BBE\u7F6E\u3002\u7ED1\u5B9A\u7F16\u8F91\u3001\u81EA\u52A8\u53D1\u73B0\u3001\u4E91\u540C\u6B65\u53CA Zotero \u529F\u80FD\u4ECD\u5728\u8FC1\u79FB\u4E2D\u3002",
  readOnly: "\u641C\u7D22\u7247\u6BB5\u4EC5\u4F9B\u6D4F\u89C8\uFF0C\u4E0D\u4EE3\u8868\u5F53\u524D\u4F1A\u8BDD\u5DF2\u8BFB\u53D6\u539F\u6587\u6216\u5B8C\u6210\u8BC1\u636E\u6838\u9A8C\u3002"
};
var en = {
  title: "Knowledge",
  settings: "Settings",
  reviews: "Review candidates",
  history: "Review history",
  historyEmpty: "This project has no updates available to undo.",
  undoHint: "Undo restores the saved original; a newly created page is deleted. Later human edits cause the operation to refuse.",
  undoReview: "Undo this update",
  confirmUndo: "Confirm undo",
  cancelUndo: "Cancel",
  undoing: "Undoing\u2026",
  reviewPartial: "The note was written, but its review record or index is incomplete. Inspect the receipt:",
  reviewReadOnly: "Applying a candidate requires explicit host permission for state and Vault writes. Check the diff and sources before applying.",
  reviewBack: "Close preview",
  reviewCount: "candidates",
  reviewEmpty: "This project has no candidates.",
  reviewProjectRequired: "Select a real project session to view its candidates.",
  reviewExpired: "This candidate has expired and is available for reading only.",
  reviewBindingChanged: "The library binding changed. Refresh the candidate list.",
  reviewTargetChanged: "The target note changed. This view shows the original text and suggestion recorded in the candidate.",
  reviewVersion: "Candidate version",
  reviewNotVerified: "A diff is not scientific verification and does not approve or apply a candidate.",
  applyReview: "Apply candidate",
  rejectReview: "Reject candidate",
  applying: "Applying\u2026",
  rejecting: "Rejecting\u2026",
  reviewApplied: "Candidate applied and read back after the Vault write.",
  reviewRejected: "Candidate rejected and the review decision was recorded.",
  bindingDetails: "Current library binding",
  vaultPath: "Directory",
  profile: "Organization",
  depositMode: "Deposit policy",
  subagentPolicy: "Specialist access",
  bindingRevision: "Binding revision",
  updatedAt: "Updated",
  profile_project: "Project",
  profile_literature: "Literature",
  profile_hybrid: "Hybrid",
  "run-only": "Run records only",
  verified: "Verified material",
  rich: "Detailed records",
  none: "Disabled",
  "read-local": "Read local material",
  bindingEditingUnavailable: "Switching directories and initialization are still being migrated. They require a separate directory selection, write confirmation and draining current work.",
  reviewPolicy: "Review policy",
  effectiveMode: "Effective",
  persistedMode: "Saved",
  notPersisted: "Not saved; using the default policy",
  automatic: "Automatic",
  strict: "Strict",
  reviewPolicyHint: "This setting controls knowledge publication checks. Automatic mode retains permission, source and write checks; it does not authorize automatic changes to human-authored Wiki content.",
  policyOverride: "The environment enforces strict review and cannot be overridden here.",
  "invalid-json": "The review policy JSON is corrupt. Strict mode is active; repair the file and refresh. This page will not overwrite corrupt data.",
  "invalid-policy": "The review policy is invalid. Strict mode is active; repair the file and refresh. This page will not overwrite invalid data.",
  stateWriteRequired: "State access is read-only. To change settings, disable and re-enable the plugin and explicitly grant state writes in the host directory dialog.",
  savePolicy: "Save review policy",
  saving: "Saving\u2026",
  policySaved: "The policy was saved and read back successfully.",
  semanticSettings: "Similarity settings",
  semanticSettingsHint: "Settings are saved only through the host-authorized application state; model execution is not enabled on this page.",
  semanticEnabled: "Enable similarity search",
  semanticProvider: "Model service",
  semanticProviderNone: "No model",
  semanticBaseUrl: "Service URL",
  semanticModel: "Model name",
  saveSemantic: "Save similarity settings",
  semanticSaved: "Similarity settings were saved and read back successfully.",
  inlineLinkUnavailable: "This link cannot be opened yet. Use the note links below; external links need the controlled opening capability.",
  readingNavigation: "Knowledge reading views",
  reading: "Reading",
  graph: "Graph",
  jobs: "Index jobs",
  jobCount: "jobs",
  firstPage: "First page",
  nextPage: "Next page",
  openUnavailable: "Opening in an external app is unavailable until controlled file opening is migrated.",
  handoffUnavailable: "Session handoff is still being migrated.",
  refresh: "Refresh",
  loading: "Loading\u2026",
  search: "Search",
  query: "Search knowledge",
  searchHint: "Find material in the current knowledge library",
  unconfigured: "No knowledge library is bound",
  unconfiguredHint: "Bind a knowledge library to view its overview and search its contents.",
  project: "Current project",
  application: "Shared material",
  notes: "notes (whole-library index)",
  recent: "Recently updated",
  noRecent: "No indexed records yet.",
  indexMissing: "Index status has not been read yet.",
  uninitialized: "Index not initialized",
  indexing: "Indexing",
  partial: "Index incomplete",
  ready: "Index ready",
  results: "Search results",
  noResults: "No matching results.",
  incomplete: "The index is incomplete; these results do not represent all material.",
  lines: "Lines",
  unsupportedTitle: "Other knowledge features are temporarily unavailable",
  unsupported: "Overview, search, note reading, links, graphs, index jobs, candidate review decisions, history and undo are available, along with review policy and similarity settings. Binding changes, discovery, cloud sync and Zotero are still being migrated.",
  readOnly: "Search excerpts are for browsing. They do not establish that this session read the source or verified its evidence."
};
function useNativeKnowledgeText() {
  return useLanguage() === "zh" ? zh : en;
}

// ui/NativeKnowledgePreferences.tsx
import { useEffect as useEffect2, useRef as useRef2, useState as useState2 } from "react";

// ui/NativeKnowledgeSemanticSettings.tsx
import { useEffect, useRef, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
function errorText(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}
function NativeKnowledgeSemanticSettings({
  client,
  observationRevision,
  refreshing
}) {
  const t = useNativeKnowledgeText();
  const [value, setValue] = useState(null);
  const [provider, setProvider] = useState("none");
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const epoch = useRef(0);
  useEffect(() => {
    const request = ++epoch.current;
    setLoading(true);
    setSaving(false);
    setSaved(false);
    setError(null);
    setValue(null);
    void client.invoke("semanticSettings", null).then(
      (result) => {
        if (request !== epoch.current) return;
        const settings = result;
        setValue(settings);
        if (settings.settings) {
          setProvider(settings.settings.provider);
          setEnabled(settings.settings.enabled);
          setBaseUrl(settings.settings.baseUrl);
          setModel(settings.settings.model);
        }
      },
      (cause) => {
        if (request === epoch.current) setError(errorText(cause));
      }
    ).finally(() => {
      if (request === epoch.current) setLoading(false);
    });
    return () => {
      ++epoch.current;
    };
  }, [client, observationRevision]);
  async function save(snapshot, bindingRevision) {
    const request = ++epoch.current;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const result = await client.invoke("setSemanticSettings", {
        bindingRevision,
        expectedSettingsRevision: snapshot.revision,
        settings: {
          enabled,
          provider,
          baseUrl,
          model,
          credentialEnv: snapshot.credentialEnv,
          remoteConsent: snapshot.remoteConsent,
          timeoutMs: snapshot.timeoutMs,
          chunkChars: snapshot.chunkChars,
          minSimilarity: snapshot.minSimilarity
        }
      });
      if (request !== epoch.current) return;
      setValue(result);
      setProvider(result.settings?.provider ?? "none");
      setEnabled(result.settings?.enabled ?? false);
      setBaseUrl(result.settings?.baseUrl ?? "");
      setModel(result.settings?.model ?? "");
      setSaved(true);
    } catch (cause) {
      if (request === epoch.current) setError(errorText(cause));
    } finally {
      if (request === epoch.current) setSaving(false);
    }
  }
  return /* @__PURE__ */ jsxs(
    "section",
    {
      className: "rounded-xl border border-border bg-surface p-4",
      "aria-label": t.semanticSettings,
      "data-testid": "native-knowledge-semantic-settings",
      children: [
        /* @__PURE__ */ jsx("h3", { className: "text-sm font-medium", children: t.semanticSettings }),
        loading && /* @__PURE__ */ jsx("p", { role: "status", className: "mt-3 text-sm text-ink-dim", children: t.loading }),
        error && /* @__PURE__ */ jsx("p", { role: "alert", className: "mt-3 text-sm text-err", children: error }),
        value?.settings && /* @__PURE__ */ jsxs("div", { className: "mt-3 space-y-3 text-xs", children: [
          /* @__PURE__ */ jsx("p", { className: "text-ink-dim", children: t.semanticSettingsHint }),
          /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "checkbox",
                checked: enabled,
                onChange: (event) => {
                  setEnabled(event.target.checked);
                  setSaved(false);
                },
                disabled: !value.canWriteState || saving || refreshing
              }
            ),
            t.semanticEnabled
          ] }),
          /* @__PURE__ */ jsxs("label", { className: "block", children: [
            /* @__PURE__ */ jsx("span", { children: t.semanticProvider }),
            /* @__PURE__ */ jsxs(
              "select",
              {
                "aria-label": t.semanticProvider,
                value: provider,
                onChange: (event) => {
                  setProvider(event.target.value);
                  setSaved(false);
                },
                disabled: !value.canWriteState || saving || refreshing,
                className: "ml-2 rounded-lg border border-border bg-surface px-3 py-2",
                children: [
                  /* @__PURE__ */ jsx("option", { value: "none", children: t.semanticProviderNone }),
                  /* @__PURE__ */ jsx("option", { value: "ollama", children: "Ollama" }),
                  /* @__PURE__ */ jsx("option", { value: "openai-compatible", children: "OpenAI compatible" })
                ]
              }
            )
          ] }),
          provider !== "none" && /* @__PURE__ */ jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsxs("label", { className: "block", children: [
              /* @__PURE__ */ jsx("span", { children: t.semanticBaseUrl }),
              /* @__PURE__ */ jsx("input", { "aria-label": t.semanticBaseUrl, className: "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2", value: baseUrl, onChange: (event) => {
                setBaseUrl(event.target.value);
                setSaved(false);
              }, disabled: !value.canWriteState || saving || refreshing })
            ] }),
            /* @__PURE__ */ jsxs("label", { className: "block", children: [
              /* @__PURE__ */ jsx("span", { children: t.semanticModel }),
              /* @__PURE__ */ jsx("input", { "aria-label": t.semanticModel, className: "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2", value: model, onChange: (event) => {
                setModel(event.target.value);
                setSaved(false);
              }, disabled: !value.canWriteState || saving || refreshing })
            ] })
          ] }),
          !value.canWriteState && /* @__PURE__ */ jsx("p", { className: "text-ink-dim", children: t.stateWriteRequired }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsx(
              Button,
              {
                size: "sm",
                disabled: !value.canWriteState || !value.binding || saving || refreshing,
                onClick: () => {
                  if (value.binding && value.settings) void save(value.settings, value.binding.revision);
                },
                children: saving ? t.saving : t.saveSemantic
              }
            ),
            saved && /* @__PURE__ */ jsx("span", { role: "status", className: "text-ink-dim", children: t.semanticSaved })
          ] })
        ] })
      ]
    }
  );
}

// ui/NativeKnowledgePreferences.tsx
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function NativeKnowledgePreferences({
  client,
  observationRevision,
  refreshing
}) {
  const t = useNativeKnowledgeText();
  const [value, setValue] = useState2(null);
  const [mode, setMode] = useState2("strict");
  const [loading, setLoading] = useState2(false), [saving, setSaving] = useState2(false);
  const [error, setError] = useState2(null), [saved, setSaved] = useState2(false);
  const epoch = useRef2(0);
  useEffect2(() => {
    const request = ++epoch.current;
    setLoading(true);
    setSaving(false);
    setSaved(false);
    setError(null);
    setValue(null);
    void client.invoke("preferences", null).then(
      (result) => {
        if (request !== epoch.current) return;
        const preferences = result;
        setValue(preferences);
        setMode(
          preferences.reviewPolicy.persistedMode ?? preferences.reviewPolicy.mode
        );
      },
      (cause) => {
        if (request === epoch.current)
          setError(cause instanceof Error ? cause.message : String(cause));
      }
    ).finally(() => {
      if (request === epoch.current) setLoading(false);
    });
    return () => {
      ++epoch.current;
    };
  }, [client, observationRevision]);
  async function save(snapshot, bindingRevision) {
    const request = ++epoch.current;
    setSaving(true);
    setSaved(false);
    setError(null);
    const input = {
      bindingRevision,
      expectedVersion: snapshot.reviewPolicy.version,
      mode
    };
    try {
      const result = await client.invoke(
        "setReviewPolicy",
        input
      );
      if (request !== epoch.current) return;
      setValue(result);
      setMode(result.reviewPolicy.persistedMode ?? result.reviewPolicy.mode);
      setSaved(true);
    } catch (cause) {
      if (request === epoch.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === epoch.current) setSaving(false);
    }
  }
  return /* @__PURE__ */ jsxs2(
    "section",
    {
      className: "space-y-4",
      "aria-label": t.settings,
      "data-testid": "native-knowledge-preferences",
      children: [
        /* @__PURE__ */ jsx2("h2", { className: "text-sm font-semibold", children: t.settings }),
        loading && /* @__PURE__ */ jsx2("p", { role: "status", className: "text-sm text-ink-dim", children: t.loading }),
        error && /* @__PURE__ */ jsx2("p", { role: "alert", className: "text-sm text-err", children: error }),
        value && /* @__PURE__ */ jsxs2(Fragment, { children: [
          /* @__PURE__ */ jsxs2(
            "section",
            {
              className: "rounded-xl border border-border bg-surface p-4",
              "aria-label": t.bindingDetails,
              children: [
                /* @__PURE__ */ jsx2("h3", { className: "text-sm font-medium", children: t.bindingDetails }),
                value.binding ? /* @__PURE__ */ jsxs2("dl", { className: "mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs", children: [
                  /* @__PURE__ */ jsx2("dt", { children: t.vaultPath }),
                  /* @__PURE__ */ jsx2("dd", { className: "break-all font-mono", children: value.binding.vault }),
                  /* @__PURE__ */ jsx2("dt", { children: t.profile }),
                  /* @__PURE__ */ jsx2("dd", { children: t[`profile_${value.binding.profile}`] }),
                  /* @__PURE__ */ jsx2("dt", { children: t.depositMode }),
                  /* @__PURE__ */ jsx2("dd", { children: t[value.binding.depositMode] }),
                  /* @__PURE__ */ jsx2("dt", { children: t.subagentPolicy }),
                  /* @__PURE__ */ jsx2("dd", { children: t[value.binding.subagentPolicy] }),
                  /* @__PURE__ */ jsx2("dt", { children: t.bindingRevision }),
                  /* @__PURE__ */ jsx2("dd", { children: value.binding.revision }),
                  /* @__PURE__ */ jsx2("dt", { children: t.updatedAt }),
                  /* @__PURE__ */ jsx2("dd", { children: value.binding.updatedAt })
                ] }) : /* @__PURE__ */ jsx2("p", { className: "mt-3 text-sm text-ink-dim", children: t.unconfigured }),
                /* @__PURE__ */ jsx2("p", { className: "mt-3 text-xs text-ink-dim", children: t.bindingEditingUnavailable })
              ]
            }
          ),
          /* @__PURE__ */ jsxs2(
            "section",
            {
              className: "rounded-xl border border-border bg-surface p-4",
              "aria-label": t.reviewPolicy,
              children: [
                /* @__PURE__ */ jsx2("h3", { className: "text-sm font-medium", children: t.reviewPolicy }),
                /* @__PURE__ */ jsxs2("dl", { className: "mt-3 grid grid-cols-2 gap-2 text-xs", children: [
                  /* @__PURE__ */ jsx2("dt", { children: t.effectiveMode }),
                  /* @__PURE__ */ jsx2("dd", { children: t[value.reviewPolicy.mode] }),
                  /* @__PURE__ */ jsx2("dt", { children: t.persistedMode }),
                  /* @__PURE__ */ jsx2("dd", { children: value.reviewPolicy.persistedMode ? t[value.reviewPolicy.persistedMode] : t.notPersisted })
                ] }),
                /* @__PURE__ */ jsx2("p", { className: "mt-3 text-xs text-ink-dim", children: t.reviewPolicyHint }),
                value.reviewPolicy.override && /* @__PURE__ */ jsx2("p", { role: "status", className: "mt-3 text-xs text-warn", children: t.policyOverride }),
                value.reviewPolicy.diagnostic && /* @__PURE__ */ jsx2("p", { role: "alert", className: "mt-3 text-xs text-err", children: t[value.reviewPolicy.diagnostic] }),
                !value.canWriteState && /* @__PURE__ */ jsx2("p", { className: "mt-3 text-xs text-ink-dim", children: t.stateWriteRequired }),
                value.binding && /* @__PURE__ */ jsxs2("div", { className: "mt-3 flex flex-wrap items-center gap-3", children: [
                  /* @__PURE__ */ jsxs2("label", { className: "text-xs", children: [
                    t.reviewPolicy,
                    /* @__PURE__ */ jsxs2(
                      "select",
                      {
                        "aria-label": t.reviewPolicy,
                        value: mode,
                        onChange: (event) => {
                          setMode(event.target.value);
                          setSaved(false);
                        },
                        disabled: saving || loading || refreshing || !value.canWriteState || value.reviewPolicy.override !== null || value.reviewPolicy.diagnostic !== null,
                        className: "ml-2 rounded-lg border border-border bg-surface px-3 py-2",
                        children: [
                          /* @__PURE__ */ jsx2("option", { value: "automatic", children: t.automatic }),
                          /* @__PURE__ */ jsx2("option", { value: "strict", children: t.strict })
                        ]
                      }
                    )
                  ] }),
                  /* @__PURE__ */ jsx2(
                    Button,
                    {
                      size: "sm",
                      disabled: saving || loading || refreshing || !value.canWriteState || value.reviewPolicy.override !== null || value.reviewPolicy.diagnostic !== null || mode === (value.reviewPolicy.persistedMode ?? value.reviewPolicy.mode),
                      onClick: () => void save(value, value.binding.revision),
                      children: saving ? t.saving : t.savePolicy
                    }
                  )
                ] }),
                saved && /* @__PURE__ */ jsx2("p", { role: "status", className: "mt-3 text-xs text-ink-dim", children: t.policySaved })
              ]
            }
          ),
          /* @__PURE__ */ jsx2(
            NativeKnowledgeSemanticSettings,
            {
              client,
              observationRevision,
              refreshing
            }
          )
        ] })
      ]
    }
  );
}

// ui/NativeKnowledgeHistory.tsx
import { useEffect as useEffect3, useState as useState3 } from "react";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function NativeKnowledgeHistory({
  store,
  observationRevision
}) {
  const t = useNativeKnowledgeText();
  const [history, setHistory] = useState3(null);
  const [error, setError] = useState3(null);
  const [confirm, setConfirm] = useState3(null);
  const [busy, setBusy] = useState3(false);
  const [revision, setRevision] = useState3(0);
  useEffect3(() => {
    let live = true;
    setHistory(null);
    setError(null);
    setConfirm(null);
    void store.reviewHistory().then(
      (value) => {
        if (live) setHistory(value);
      },
      (cause) => {
        if (live) setError(cause instanceof Error ? cause.message : String(cause));
      }
    );
    return () => {
      live = false;
    };
  }, [store, observationRevision, revision]);
  async function undo(item) {
    setBusy(true);
    setError(null);
    try {
      await store.undoReview({ id: item.id, expectedHash: item.afterHash });
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }
  return /* @__PURE__ */ jsxs3("section", { "aria-label": t.history, className: "space-y-4", children: [
    /* @__PURE__ */ jsx3("p", { className: "text-xs text-ink-dim", children: t.undoHint }),
    error && /* @__PURE__ */ jsx3("p", { role: "alert", className: "text-sm text-err", children: error }),
    !history && !error && /* @__PURE__ */ jsx3("p", { role: "status", children: t.loading }),
    history && history.items.length === 0 && /* @__PURE__ */ jsx3("p", { children: t.historyEmpty }),
    /* @__PURE__ */ jsx3("ul", { className: "divide-y divide-border rounded-xl border border-border", children: history?.items.map((item) => /* @__PURE__ */ jsxs3("li", { className: "space-y-2 p-3", children: [
      /* @__PURE__ */ jsx3("p", { className: "break-all text-sm", children: item.path }),
      /* @__PURE__ */ jsx3("p", { className: "font-mono text-xs text-ink-dim", children: item.afterHash.slice(0, 12) }),
      confirm === item.id ? /* @__PURE__ */ jsxs3("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsx3(Button, { size: "sm", disabled: busy, onClick: () => void undo(item), children: busy ? t.undoing : t.confirmUndo }),
        /* @__PURE__ */ jsx3(Button, { size: "sm", disabled: busy, onClick: () => setConfirm(null), children: t.cancelUndo })
      ] }) : /* @__PURE__ */ jsx3(Button, { size: "sm", disabled: busy, onClick: () => setConfirm(item.id), children: t.undoReview })
    ] }, item.id)) })
  ] });
}

// ui/NativeKnowledgeReviews.tsx
import { useEffect as useEffect4, useState as useState5 } from "react";

// ui/knowledge/WikiReviewContent.tsx
import { useMemo, useState as useState4 } from "react";

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
  homeSearchPartial: "\u7D22\u5F15\u5C1A\u672A\u5B8C\u6574\uFF0C\u5F53\u524D\u7ED3\u679C\u4E0D\u4EE3\u8868\u5168\u90E8\u8D44\u6599\u3002",
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
  homeSearchPartial: "The index is incomplete; these results do not represent all material.",
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

// ui/knowledge/WikiReviewContent.tsx
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function WikiReviewContent({
  preview,
  onOpenSource
}) {
  const t = useKnowledgeText();
  const [view, setView] = useState4("diff");
  const lines = useMemo(
    () => knowledgeLineDiff(preview.before, preview.after),
    [preview]
  );
  const visible = lines.slice(0, 200);
  return /* @__PURE__ */ jsxs4(Fragment2, { children: [
    /* @__PURE__ */ jsx4(
      "div",
      {
        className: "flex flex-wrap gap-1",
        role: "tablist",
        "aria-label": t("reviewTitle"),
        children: ["diff", "both", "protected"].map((tab) => /* @__PURE__ */ jsx4(
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
        ))
      }
    ),
    view === "diff" && /* @__PURE__ */ jsxs4(
      "section",
      {
        className: "max-h-[32vh] overflow-auto rounded-lg border border-border font-mono text-[11px]",
        "aria-label": t("diff"),
        children: [
          visible.map((row) => /* @__PURE__ */ jsxs4(
            "div",
            {
              className: `flex gap-2 px-2 leading-6 ${row.kind === "add" ? "bg-ok/10" : row.kind === "remove" ? "bg-err/8" : "text-ink-dim"}`,
              children: [
                /* @__PURE__ */ jsxs4("span", { className: "w-12 shrink-0 select-none text-right text-ink-faint", children: [
                  row.oldLine || "",
                  " ",
                  row.newLine || ""
                ] }),
                /* @__PURE__ */ jsx4("span", { title: row.kind, className: "w-3 shrink-0", children: row.kind === "add" ? "+" : row.kind === "remove" ? "\u2212" : " " }),
                /* @__PURE__ */ jsx4("span", { className: "min-w-0 whitespace-pre-wrap break-words", children: row.text || " " })
              ]
            },
            `${row.kind}:${row.oldLine}:${row.newLine}:${row.text}`
          )),
          lines.length > 200 && /* @__PURE__ */ jsx4("p", { className: "px-2 py-2 text-[11px] text-ink-faint", children: t("truncated") })
        ]
      }
    ),
    view === "both" && /* @__PURE__ */ jsx4("div", { className: "grid gap-2", children: ["before", "after"].map((side) => /* @__PURE__ */ jsxs4("div", { className: "min-w-0", children: [
      /* @__PURE__ */ jsx4("p", { className: "mb-1 text-xs font-medium", children: t(side) }),
      /* @__PURE__ */ jsx4("pre", { className: "max-h-[22vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-3 text-xs leading-relaxed", children: preview[side] || "\u2014" })
    ] }, side)) }),
    view === "protected" && /* @__PURE__ */ jsx4("pre", { className: "max-h-[32vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-3 text-xs leading-relaxed", children: preview.protectedText || "\u2014" }),
    /* @__PURE__ */ jsxs4("div", { children: [
      /* @__PURE__ */ jsxs4("h4", { className: "mb-2 text-xs font-semibold", children: [
        t("sources"),
        " \xB7 ",
        preview.sources.length
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "max-h-28 space-y-1 overflow-auto", children: preview.sources.map((source) => /* @__PURE__ */ jsxs4(
        "div",
        {
          className: "rounded-lg border border-border px-2 py-2",
          children: [
            onOpenSource ? /* @__PURE__ */ jsx4(
              "button",
              {
                type: "button",
                className: "break-all text-left text-xs text-link hover:underline",
                onClick: () => onOpenSource(source),
                children: source.path
              }
            ) : /* @__PURE__ */ jsx4("p", { className: "break-all text-xs", children: source.path }),
            /* @__PURE__ */ jsxs4("p", { className: "font-mono text-[11px] text-ink-faint", children: [
              "L",
              source.startLine,
              "\u2013",
              source.endLine,
              source.hash ? ` \xB7 ${source.hash.slice(0, 12)}` : ""
            ] }),
            source.changed && /* @__PURE__ */ jsx4("p", { className: "text-xs text-warn", children: t("sourceChanged") }),
            source.error && /* @__PURE__ */ jsx4("p", { role: "alert", className: "text-xs text-err", children: source.error })
          ]
        },
        source.path
      )) })
    ] })
  ] });
}

// ui/NativeKnowledgeReviews.tsx
import { Fragment as Fragment3, jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var errorText2 = (error) => error instanceof Error ? error.message : String(error);
function ReviewPreview({
  store,
  selection,
  onClose,
  onDecision
}) {
  const t = useNativeKnowledgeText();
  const [preview, setPreview] = useState5(null);
  const [error, setError] = useState5(null);
  const [action, setAction] = useState5(null);
  useEffect4(() => {
    let live = true;
    setPreview(null);
    setError(null);
    setAction(null);
    void store.previewReview({
      id: selection.id,
      expectedProposalHash: selection.proposalHash
    }).then(
      (value) => {
        if (live) setPreview(value);
      },
      (cause) => {
        if (live) setError(errorText2(cause));
      }
    );
    return () => {
      live = false;
    };
  }, [store, selection]);
  const decide = async (kind) => {
    if (!preview || action) return;
    setAction(kind);
    setError(null);
    try {
      if (kind === "apply") {
        const receipt = await store.applyReview({
          id: selection.id,
          expectedProposalHash: selection.proposalHash
        });
        onDecision(receipt);
        return;
      } else {
        await store.rejectReview({
          id: selection.id,
          expectedProposalHash: selection.proposalHash
        });
      }
      onDecision();
    } catch (cause) {
      setError(errorText2(cause));
    } finally {
      setAction(null);
    }
  };
  return /* @__PURE__ */ jsxs5(
    "article",
    {
      className: "space-y-4 rounded-xl border border-border bg-surface p-4",
      "data-testid": "native-review-preview",
      children: [
        /* @__PURE__ */ jsx5(Button, { size: "sm", onClick: onClose, children: t.reviewBack }),
        error && /* @__PURE__ */ jsx5("p", { role: "alert", className: "text-sm text-err", children: error }),
        !error && !preview && /* @__PURE__ */ jsx5("p", { role: "status", className: "text-sm text-ink-dim", children: t.loading }),
        preview && /* @__PURE__ */ jsxs5(Fragment3, { children: [
          /* @__PURE__ */ jsxs5("header", { children: [
            /* @__PURE__ */ jsx5("h2", { className: "text-base font-medium", children: preview.title }),
            /* @__PURE__ */ jsx5("p", { className: "break-all text-xs text-ink-dim", children: preview.path })
          ] }),
          /* @__PURE__ */ jsx5("p", { className: "whitespace-pre-wrap text-sm", children: preview.rationale }),
          /* @__PURE__ */ jsxs5("p", { className: "break-all font-mono text-xs text-ink-faint", title: preview.proposalHash, children: [
            t.reviewVersion,
            ": ",
            preview.proposalHash.slice(0, 12)
          ] }),
          preview.expired && /* @__PURE__ */ jsx5("p", { role: "status", className: "text-xs text-warn", children: t.reviewExpired }),
          preview.targetChanged && /* @__PURE__ */ jsx5("p", { role: "status", className: "text-xs text-warn", children: t.reviewTargetChanged }),
          /* @__PURE__ */ jsx5(
            WikiReviewContent,
            {
              preview,
              onOpenSource: (source) => store.openNote(source.path, {
                startLine: source.startLine,
                hash: source.hash ?? void 0
              })
            }
          ),
          /* @__PURE__ */ jsx5("p", { className: "text-xs text-ink-dim", children: t.reviewNotVerified }),
          /* @__PURE__ */ jsxs5("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsx5(
              Button,
              {
                size: "sm",
                disabled: action !== null || !preview.canApply,
                onClick: () => void decide("apply"),
                children: action === "apply" ? t.applying : t.applyReview
              }
            ),
            /* @__PURE__ */ jsx5(Button, { size: "sm", disabled: action !== null, onClick: () => void decide("reject"), children: action === "reject" ? t.rejecting : t.rejectReview })
          ] })
        ] })
      ]
    }
  );
}
function NativeKnowledgeReviews({
  store,
  observationRevision
}) {
  const t = useNativeKnowledgeText();
  const [offset, setOffset] = useState5(0);
  const [page, setPage] = useState5(null);
  const [error, setError] = useState5(null);
  const [selection, setSelection] = useState5(null);
  const [decisionRevision, setDecisionRevision] = useState5(0);
  const [receiptError, setReceiptError] = useState5(null);
  useEffect4(() => {
    let live = true;
    setPage(null);
    setError(null);
    setSelection(null);
    void store.reviews({ offset, limit: 12 }).then(
      (value) => {
        if (live) setPage(value);
      },
      (cause) => {
        if (live) setError(errorText2(cause));
      }
    );
    return () => {
      live = false;
    };
  }, [store, offset, observationRevision, decisionRevision]);
  return /* @__PURE__ */ jsxs5("section", { "aria-label": t.reviews, className: "space-y-4", children: [
    /* @__PURE__ */ jsx5("p", { className: "text-xs text-ink-dim", children: t.reviewReadOnly }),
    receiptError && /* @__PURE__ */ jsx5("p", { role: "alert", className: "text-sm text-err", children: receiptError }),
    error && /* @__PURE__ */ jsx5("p", { role: "alert", className: "text-sm text-err", children: error }),
    !error && !page && /* @__PURE__ */ jsx5("p", { role: "status", className: "text-sm text-ink-dim", children: t.loading }),
    page && /* @__PURE__ */ jsxs5(Fragment3, { children: [
      /* @__PURE__ */ jsxs5("p", { className: "text-xs text-ink-dim", children: [
        page.total,
        " ",
        t.reviewCount
      ] }),
      page.problems.map((problem) => /* @__PURE__ */ jsxs5("p", { role: "alert", className: "break-words text-xs text-err", children: [
        problem.id,
        ": ",
        problem.error
      ] }, problem.id)),
      page.items.length === 0 && /* @__PURE__ */ jsx5("p", { className: "text-sm text-ink-dim", children: page.project === null ? t.reviewProjectRequired : t.reviewEmpty }),
      /* @__PURE__ */ jsx5("ul", { className: "divide-y divide-border rounded-xl border border-border", children: page.items.map((item) => /* @__PURE__ */ jsxs5("li", { className: "p-3", children: [
        /* @__PURE__ */ jsx5(
          Button,
          {
            size: "sm",
            onClick: () => setSelection({
              id: item.id,
              proposalHash: item.proposalHash
            }),
            children: item.title
          }
        ),
        /* @__PURE__ */ jsx5("p", { className: "mt-1 break-all text-xs text-ink-dim", children: item.path }),
        item.expired && /* @__PURE__ */ jsx5("p", { className: "text-xs text-warn", children: t.reviewExpired }),
        item.bindingChanged && /* @__PURE__ */ jsx5("p", { className: "text-xs text-warn", children: t.reviewBindingChanged })
      ] }, item.id)) }),
      /* @__PURE__ */ jsxs5("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsx5(Button, { size: "sm", disabled: offset === 0, onClick: () => setOffset(0), children: t.firstPage }),
        /* @__PURE__ */ jsx5(Button, { size: "sm", disabled: page.nextOffset === null, onClick: () => setOffset(page.nextOffset), children: t.nextPage })
      ] })
    ] }),
    selection && /* @__PURE__ */ jsx5(
      ReviewPreview,
      {
        store,
        selection,
        onClose: () => setSelection(null),
        onDecision: (receipt) => {
          setReceiptError(
            receipt && (!receipt.reviewRecorded || !receipt.indexed) ? `${t.reviewPartial} ${receipt.recordError ?? ""} ${receipt.indexError ?? ""}` : null
          );
          setSelection(null);
          setDecisionRevision((value) => value + 1);
        }
      },
      `${selection.id}:${selection.proposalHash}`
    )
  ] });
}

// ui/NativeKnowledgeReading.tsx
import { useEffect as useEffect9, useMemo as useMemo4, useState as useState9 } from "react";

// ui/knowledge/KnowledgeNoteView.tsx
import { useEffect as useEffect6, useState as useState7 } from "react";

// ui/knowledge/KnowledgeLinksView.tsx
import { useEffect as useEffect5, useState as useState6 } from "react";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function KnowledgeLinksView({
  load,
  nonce,
  onOpenNote,
  path,
  revision
}) {
  const t = useKnowledgeText();
  const [error, setError] = useState6(null);
  const [links, setLinks] = useState6(null);
  useEffect5(() => {
    let live = true;
    setLinks(null);
    setError(null);
    void load({ path, revision }).then(
      (value) => {
        if (live) setLinks(value);
      },
      (cause) => {
        if (live)
          setError(String(cause instanceof Error ? cause.message : cause));
      }
    );
    return () => {
      live = false;
    };
  }, [load, path, revision, nonce]);
  if (error)
    return /* @__PURE__ */ jsx6("p", { role: "alert", className: "text-xs text-err", children: error });
  if (!links) return null;
  const list = (items, empty) => items.length === 0 ? /* @__PURE__ */ jsx6("p", { className: "text-[11px] text-ink-faint", children: empty }) : /* @__PURE__ */ jsx6("ul", { className: "space-y-0.5", children: items.map((item) => /* @__PURE__ */ jsx6("li", { children: item.exists ? /* @__PURE__ */ jsx6(
    "button",
    {
      type: "button",
      className: "text-left text-xs text-link hover:underline",
      title: item.path,
      onClick: () => onOpenNote(item.path),
      children: item.title
    }
  ) : /* @__PURE__ */ jsxs6(
    "span",
    {
      className: "text-[11px] text-ink-faint",
      title: t("linkMissing"),
      children: [
        item.title,
        " \xB7 ",
        t("linkMissing")
      ]
    }
  ) }, item.path)) });
  return /* @__PURE__ */ jsxs6(
    "div",
    {
      className: "mt-3 grid grid-cols-2 gap-3 rounded-lg border border-border p-3",
      "data-testid": "knowledge-links",
      children: [
        /* @__PURE__ */ jsxs6("div", { children: [
          /* @__PURE__ */ jsxs6("h5", { className: "mb-1 text-xs font-semibold", children: [
            t("linksIncoming"),
            " \xB7 ",
            links.incoming.length
          ] }),
          list(links.incoming, t("linksIncomingEmpty"))
        ] }),
        /* @__PURE__ */ jsxs6("div", { children: [
          /* @__PURE__ */ jsxs6("h5", { className: "mb-1 text-xs font-semibold", children: [
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

// ui/knowledge/KnowledgeNoteView.tsx
import { Fragment as Fragment4, jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function KnowledgeNoteView({
  api,
  nonce,
  onOpenNote,
  onOpenExternal,
  unavailableReason,
  evidenceNotice,
  renderText,
  initialPage,
  revision,
  path,
  onClose
}) {
  const t = useKnowledgeText();
  const [cursor, setCursor] = useState7(
    {
      line: initialPage?.startLine ?? 1,
      expectedHash: initialPage?.expectedHash
    }
  ), [note, setNote] = useState7(null), [error, setError] = useState7(null), [loading, setLoading] = useState7(false);
  const line = cursor.line;
  useEffect6(() => {
    let live = true;
    setLoading(true);
    setNote(null);
    setError(null);
    void api.readNote({
      path,
      startLine: line,
      revision,
      ...cursor.expectedHash ? { expectedHash: cursor.expectedHash } : {}
    }).then(
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
  }, [api, path, cursor, revision, nonce]);
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
        error && /* @__PURE__ */ jsx7(
          "p",
          {
            role: "alert",
            className: "whitespace-pre-wrap break-words text-xs text-err",
            children: error
          }
        ),
        note?.missing && /* @__PURE__ */ jsx7("p", { className: "text-xs text-warn", children: t("missing") }),
        note?.text && /* @__PURE__ */ jsxs7(Fragment4, { children: [
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
            evidenceNotice?.(note.text) && /* @__PURE__ */ jsx7(
              "p",
              {
                "data-testid": "legacy-evidence-status",
                className: "mb-2 rounded border border-border p-2 text-xs text-warn",
                children: evidenceNotice?.(note.text)
              }
            ),
            renderText(noteDisplayText(note.displayText || note.text))
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
        note && !note.missing && /* @__PURE__ */ jsx7(
          KnowledgeLinksView,
          {
            load: api.links,
            nonce,
            path,
            revision,
            onOpenNote
          }
        ),
        unavailableReason && /* @__PURE__ */ jsx7("p", { className: "mt-2 text-xs text-ink-faint", children: unavailableReason }),
        /* @__PURE__ */ jsxs7("div", { className: "mt-2 flex flex-wrap gap-1", children: [
          line > 1 && /* @__PURE__ */ jsx7(Button, { size: "sm", onClick: () => setCursor({ line: 1 }), children: t("readBack") }),
          note?.truncated && note.endLine !== void 0 && note.endLine < (note.totalLines || 0) && note.endLine >= line && /* @__PURE__ */ jsx7(
            Button,
            {
              size: "sm",
              onClick: () => setCursor({
                line: note.endLine + 1,
                expectedHash: note.hash ?? void 0
              }),
              children: t("readMore")
            }
          ),
          /* @__PURE__ */ jsx7(
            Button,
            {
              size: "sm",
              disabled: !onOpenExternal || loading || note?.missing,
              title: unavailableReason,
              onClick: () => void onOpenExternal().catch(
                (e) => setError(String(e.message || e))
              ),
              children: t("openObsidian")
            }
          )
        ] })
      ]
    }
  );
}

// ui/knowledge/KnowledgeGraphView.tsx
import { useEffect as useEffect7, useMemo as useMemo2, useRef as useRef3, useState as useState8 } from "react";

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

// ui/knowledge/KnowledgeGraphView.tsx
import { Fragment as Fragment5, jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
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
    return graph.relations.filter((edge) => edge.type !== "duplicate").map((edge) => ({
      source: edge.source,
      target: edge.target,
      type: edge.type
    }));
  return graph.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    type: edge.directory ? "directory" : "link"
  }));
}
function nodeColor(node) {
  if (node.isInfrastructure || node.nodeType === "infrastructure")
    return "#9aa4b8";
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
  orphan: {
    label: "graphHealthOrphan",
    hint: "graphHealthOrphanHint",
    prompt: "graphHealthOrphanPrompt"
  },
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
  warning: {
    label: "graphHealthWarning",
    hint: "graphHealthWarningHint",
    prompt: "handOffPrompt"
  }
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
    return /* @__PURE__ */ jsx8(
      "rect",
      {
        x: x - side / 2,
        y: y - side / 2,
        width: side,
        height: side,
        rx: r * 0.35,
        ...common
      }
    );
  }
  if (shape === "diamond") {
    const d = r * 1.3;
    return /* @__PURE__ */ jsx8(
      "polygon",
      {
        points: `${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}`,
        ...common
      }
    );
  }
  return /* @__PURE__ */ jsx8("circle", { cx: x, cy: y, r, ...common });
}
function KnowledgeGraphView({
  api,
  nonce,
  onOpenNote,
  onHandoff,
  unavailableReason,
  revision,
  indexKey = ""
}) {
  const t = useKnowledgeText();
  const language = useLanguage();
  const categoryLabels = language === "zh" ? CATEGORY_LABELS_ZH : CATEGORY_LABELS_EN;
  const [data, setData] = useState8(null);
  const [error, setError] = useState8(null);
  const [selected, setSelected] = useState8(null);
  const [view, setView] = useState8("semantic");
  const [mergeMirrors, setMergeMirrors] = useState8(true);
  const [relationFilter, setRelationFilter] = useState8("all");
  const [categoryFilter, setCategoryFilter] = useState8(
    null
  );
  const [links, setLinks] = useState8(null);
  const [hovered, setHovered] = useState8(null);
  const [camera, setCamera] = useState8({ x: 0, y: 0, scale: 1 });
  const [freshPaths, setFreshPaths] = useState8(() => /* @__PURE__ */ new Set());
  const [colorMode, setColorMode] = useState8("cluster");
  const [scope, setScope] = useState8("global");
  const [hops, setHops] = useState8(1);
  const [healthOn, setHealthOn] = useState8(false);
  const rootRef = useRef3(null);
  const dragRef = useRef3(null);
  const dragFrameRef = useRef3(null);
  const pendingCameraRef = useRef3(null);
  const previousGraphRef = useRef3(null);
  const graphSignatureRef = useRef3(null);
  useEffect7(
    () => () => {
      if (dragFrameRef.current !== null)
        cancelAnimationFrame(dragFrameRef.current);
    },
    []
  );
  const liveKey = `${revision}:${nonce}:${indexKey}`;
  const [appliedKey, setAppliedKey] = useState8(liveKey);
  const [paused, setPaused] = useState8(false);
  const [pendingEvents, setPendingEvents] = useState8(0);
  const lastKeyRef = useRef3(liveKey);
  useEffect7(() => {
    if (lastKeyRef.current === liveKey) return;
    lastKeyRef.current = liveKey;
    if (paused) {
      setPendingEvents((count) => count + 1);
      return;
    }
    const timer = window.setTimeout(
      () => setAppliedKey(liveKey),
      LIVE_BATCH_MS
    );
    return () => window.clearTimeout(timer);
  }, [liveKey, paused]);
  const togglePaused = () => {
    if (paused) {
      setPendingEvents(0);
      setAppliedKey(lastKeyRef.current);
    }
    setPaused(!paused);
  };
  useEffect7(() => {
    let live = true;
    setError(null);
    void api.getKnowledgeGraph({ revision, limit: GRAPH_LIMIT, view, mergeMirrors }).then(
      (value) => live && setData(value),
      (e) => live && setError(String(e.message || e))
    );
    return () => {
      live = false;
    };
  }, [api, appliedKey, view, mergeMirrors]);
  const nodes = useMemo2(() => data ? graphNodes(data) : [], [data]);
  const edges = useMemo2(() => data ? graphEdges(data) : [], [data]);
  const incoming = useMemo2(() => inDegrees(nodes, edges), [nodes, edges]);
  const clusters = useMemo2(() => graphClusters(nodes, edges), [nodes, edges]);
  const clusterSizes = useMemo2(() => {
    const sizes = /* @__PURE__ */ new Map();
    for (const value of clusters.values())
      sizes.set(value, (sizes.get(value) ?? 0) + 1);
    return sizes;
  }, [clusters]);
  const findings = useMemo2(
    () => graphHealth(nodes, edges, incoming),
    [nodes, edges, incoming]
  );
  const findingsByPath = useMemo2(() => {
    const map = /* @__PURE__ */ new Map();
    for (const finding of findings)
      map.set(finding.path, [...map.get(finding.path) ?? [], finding.kind]);
    return map;
  }, [findings]);
  const radiusOf = (node) => hubRadius(incoming.get(node.path) ?? 0, node.degree) + (node.isMain ? 3 : 0);
  useEffect7(() => {
    if (!selected || !nodes.some((node) => node.path === selected))
      setSelected(null);
  }, [nodes, selected]);
  useEffect7(() => {
    if (!selected) {
      setLinks(null);
      return;
    }
    let live = true;
    void api.getKnowledgeNoteLinks({ path: selected, revision }).then(
      (value) => live && setLinks(value),
      (cause) => {
        if (live) {
          setLinks(null);
          setError(String(cause instanceof Error ? cause.message : cause));
        }
      }
    );
    return () => {
      live = false;
    };
  }, [api, selected, revision, nonce]);
  const layoutRef = useRef3(
    null
  );
  const points = useMemo2(() => {
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
        new Map(
          graphNodeList.map((node) => [
            node.path,
            graphNodeRadius(sizes.get(node.path) ?? 0)
          ])
        )
      );
    else if (graph2.layout)
      base = new Map(
        Object.entries(graph2.layout).map(([path, point]) => [
          path,
          { ...point, vx: 0, vy: 0 }
        ])
      );
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
  const localSet = useMemo2(
    () => scope === "local" && selected ? localNeighbourhood(selected, nodes, edges, hops) : null,
    [scope, selected, nodes, edges, hops]
  );
  const viewNodes = useMemo2(
    () => localSet ? nodes.filter((node) => localSet.has(node.path)) : nodes,
    [localSet, nodes]
  );
  const localPoints = useMemo2(() => {
    if (!localSet || !selected) return null;
    const subEdges = edges.filter(
      (edge) => localSet.has(edge.source) && localSet.has(edge.target)
    );
    const sub = nodes.filter((node) => localSet.has(node.path));
    const placed = clusterLayout(
      sub,
      subEdges,
      new Map(sub.map((node) => [node.path, 0])),
      new Map(
        sub.map((node) => [
          node.path,
          hubRadius(incoming.get(node.path) ?? 0, node.degree) + 4
        ])
      ),
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
  const clusterHeads = useMemo2(() => {
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
  const labelled = useMemo2(
    () => new Set(
      localSet ? [...viewNodes].sort(
        (a, b) => (incoming.get(b.path) ?? 0) - (incoming.get(a.path) ?? 0) || b.degree - a.degree || a.path.localeCompare(b.path)
      ).slice(0, LOCAL_LABEL_LIMIT).map((node) => node.path).concat(selected ? [selected] : []) : (
        // Most-cited notes plus one head per topic cluster get a permanent label; the rest on hover.
        [...nodes].filter((node) => node.degree >= 2).sort(
          (a, b) => (incoming.get(b.path) ?? 0) - (incoming.get(a.path) ?? 0) || b.degree - a.degree || a.path.localeCompare(b.path)
        ).slice(0, LABEL_LIMIT).concat([...clusterHeads.values()]).concat(nodes.filter((node) => node.isMain)).concat(
          nodes.filter(
            (node) => node.path === selected || node.path === hovered
          )
        ).map((node) => node.path)
      )
    ),
    [nodes, viewNodes, localSet, selected, hovered, incoming, clusterHeads]
  );
  const labels = useMemo2(
    () => data ? placeGraphLabels(
      { nodes: viewNodes },
      viewPoints,
      labelled,
      selected,
      {
        avoidZones: [
          // The controls are absolutely positioned over the SVG's bottom-right corner.
          { x: GRAPH_WIDTH - 224, y: GRAPH_HEIGHT - 72, width: 224, height: 72 },
          // The legend occupies the lower-left corner of the canvas.
          { x: 0, y: GRAPH_HEIGHT - 82, width: 270, height: 82 }
        ]
      }
    ) : /* @__PURE__ */ new Map(),
    [data, viewNodes, viewPoints, labelled, selected]
  );
  useEffect7(() => {
    setCamera({ x: 0, y: 0, scale: 1 });
  }, [scope, hops, scope === "local" ? selected : null]);
  const fillOf = (node) => {
    if (freshPaths.has(node.path)) return LIVE_COLOR;
    if (colorMode === "type" || node.isInfrastructure || node.nodeType === "infrastructure")
      return nodeColor(node);
    const cluster = clusters.get(node.path) ?? 0;
    return clusterColor(cluster, clusterSizes.get(cluster) ?? 0);
  };
  const handOff = (path, kind) => onHandoff?.(path, t(HEALTH_COPY[kind].prompt).replace("{path}", path));
  useEffect7(() => {
    if (!data) return;
    const current = new Map(
      nodes.map((node) => [
        node.path,
        { title: node.title, degree: node.degree }
      ])
    );
    const graphSignature = `${view}:${mergeMirrors}:${[...current].map(([path, value]) => `${path}:${value.title}:${value.degree}`).join("|")}`;
    const previous = previousGraphRef.current;
    const previousSignature = graphSignatureRef.current;
    previousGraphRef.current = current;
    graphSignatureRef.current = graphSignature;
    if (previous && previousSignature !== graphSignature) {
      const changed = /* @__PURE__ */ new Set();
      for (const [path, value] of current) {
        const old = previous.get(path);
        if (!old || old.title !== value.title || old.degree !== value.degree)
          changed.add(path);
      }
      if (changed.size > 0) {
        setFreshPaths(changed);
        const timer = window.setTimeout(() => setFreshPaths(/* @__PURE__ */ new Set()), 3200);
        return () => window.clearTimeout(timer);
      }
    }
  }, [data, mergeMirrors, nodes, view]);
  const neighbours = useMemo2(() => {
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
  const zoomBy = (factor) => setCamera(
    (current) => clampCamera({ ...current, scale: current.scale * factor })
  );
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
    setCamera({
      x: GRAPH_WIDTH / 2 - point.x * scale,
      y: GRAPH_HEIGHT / 2 - point.y * scale,
      scale
    });
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
      return {
        x: anchor.x - worldX * scale,
        y: anchor.y - worldY * scale,
        scale
      };
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
    pendingCameraRef.current = {
      ...drag.camera,
      x: drag.camera.x + dx,
      y: drag.camera.y + dy
    };
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
  useEffect7(() => {
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
    return /* @__PURE__ */ jsx8("p", { className: "knowledge-state-card knowledge-state-card--error rounded-lg border p-3 text-xs text-err", children: error });
  if (!data || !graph)
    return /* @__PURE__ */ jsx8("p", { className: "knowledge-state-card rounded-lg border p-3 text-[11px] text-ink-faint", children: t("loading") });
  if (nodes.length === 0)
    return /* @__PURE__ */ jsx8("p", { className: "knowledge-state-card rounded-lg border p-4 text-[11px] text-ink-faint", children: t("graphEmpty") });
  return /* @__PURE__ */ jsxs8(
    "div",
    {
      ref: rootRef,
      "data-testid": "knowledge-graph",
      className: "knowledge-observatory space-y-3",
      "aria-describedby": "knowledge-graph-summary knowledge-graph-keyboard-help",
      children: [
        /* @__PURE__ */ jsxs8(
          "header",
          {
            className: "knowledge-network-header",
            "data-testid": "knowledge-network-header",
            children: [
              /* @__PURE__ */ jsx8("h3", { className: "sr-only", children: t("graphTitle") }),
              /* @__PURE__ */ jsxs8("div", { className: "knowledge-network-stats", children: [
                /* @__PURE__ */ jsxs8("span", { children: [
                  /* @__PURE__ */ jsx8("strong", { children: nodes.length }),
                  " ",
                  t("graphLegendNote")
                ] }),
                /* @__PURE__ */ jsxs8("span", { children: [
                  /* @__PURE__ */ jsx8("strong", { children: edges.length }),
                  " ",
                  t("graphLinks").replace("{count}", "")
                ] }),
                /* @__PURE__ */ jsxs8("span", { children: [
                  /* @__PURE__ */ jsx8("strong", { children: isolated }),
                  " ",
                  t("graphHealthIsolated").replace("{count}", "")
                ] })
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxs8("div", { className: "knowledge-graph-toolbar flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsx8(
            Button,
            {
              size: "sm",
              "aria-pressed": view === "semantic",
              onClick: () => setView("semantic"),
              children: t("graphSemantic")
            }
          ),
          /* @__PURE__ */ jsx8(
            Button,
            {
              size: "sm",
              "aria-pressed": view === "all",
              onClick: () => setView("all"),
              children: t("graphAllFiles")
            }
          ),
          /* @__PURE__ */ jsxs8("label", { className: "ml-1 flex items-center gap-1 text-xs text-ink-dim", children: [
            /* @__PURE__ */ jsx8(
              "input",
              {
                type: "checkbox",
                checked: mergeMirrors,
                onChange: (event) => setMergeMirrors(event.target.checked)
              }
            ),
            t("graphMergeMirrors")
          ] }),
          /* @__PURE__ */ jsx8("span", { className: "ml-auto flex gap-1", children: ["all", "link", "directory"].map((filter) => /* @__PURE__ */ jsx8(
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
        /* @__PURE__ */ jsxs8(
          "div",
          {
            className: "knowledge-graph-toolbar flex flex-wrap items-center gap-2",
            "data-testid": "knowledge-graph-modes",
            children: [
              /* @__PURE__ */ jsxs8("span", { className: "flex gap-1", children: [
                /* @__PURE__ */ jsx8(
                  Button,
                  {
                    size: "sm",
                    "aria-pressed": colorMode === "cluster",
                    onClick: () => setColorMode("cluster"),
                    children: t("graphColorCluster")
                  }
                ),
                /* @__PURE__ */ jsx8(
                  Button,
                  {
                    size: "sm",
                    "aria-pressed": colorMode === "type",
                    onClick: () => setColorMode("type"),
                    children: t("graphColorType")
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs8("span", { className: "flex gap-1", children: [
                /* @__PURE__ */ jsx8(
                  Button,
                  {
                    size: "sm",
                    "aria-pressed": scope === "global",
                    onClick: () => setScope("global"),
                    children: t("graphScopeGlobal")
                  }
                ),
                /* @__PURE__ */ jsx8(
                  Button,
                  {
                    size: "sm",
                    "aria-pressed": scope === "local",
                    onClick: () => setScope("local"),
                    children: t("graphScopeLocal")
                  }
                ),
                scope === "local" && [1, 2].map((count) => /* @__PURE__ */ jsx8(
                  Button,
                  {
                    size: "sm",
                    "aria-pressed": hops === count,
                    onClick: () => setHops(count),
                    children: t("graphHopCount").replace("{count}", String(count))
                  },
                  count
                ))
              ] }),
              /* @__PURE__ */ jsxs8(
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
              scope === "local" && !selected && /* @__PURE__ */ jsx8("span", { className: "text-[11px] text-ink-faint", children: t("graphLocalHint") })
            ]
          }
        ),
        /* @__PURE__ */ jsxs8("div", { className: "flex flex-wrap items-center gap-1 text-[11px] text-ink-faint", children: [
          /* @__PURE__ */ jsx8("span", { className: "mr-1 uppercase tracking-[0.12em]", children: t("graphCategory") }),
          [...new Set(nodes.map(categoryOf))].map(
            (category) => /* @__PURE__ */ jsxs8(
              "button",
              {
                type: "button",
                className: `knowledge-graph-category-filter ${categoryFilter === category ? "is-active" : ""}`,
                "aria-pressed": categoryFilter === category,
                onClick: () => setCategoryFilter(
                  (current) => current === category ? null : category
                ),
                children: [
                  /* @__PURE__ */ jsx8("i", { style: { backgroundColor: CATEGORY_COLORS[category] } }),
                  categoryLabels[category]
                ]
              },
              category
            )
          )
        ] }),
        /* @__PURE__ */ jsxs8("div", { className: "flex flex-wrap gap-1 text-[11px] text-ink-faint", children: [
          /* @__PURE__ */ jsx8(
            "span",
            {
              id: "knowledge-graph-summary",
              className: "rounded-full border border-border px-2 py-0.5",
              children: t("graphSummary").replace("{nodes}", String(nodes.length)).replace("{edges}", String(edges.length)).replace("{total}", String(graph.totalNotes)).replace("{limit}", String(GRAPH_LIMIT))
            }
          ),
          /* @__PURE__ */ jsx8("span", { className: "rounded-full border border-border px-2 py-0.5", children: t("graphHealthIsolated").replace("{count}", String(isolated)) }),
          /* @__PURE__ */ jsx8("span", { className: "rounded-full border border-border px-2 py-0.5", children: t("graphHealthDuplicates").replace("{count}", String(duplicates)) })
        ] }),
        /* @__PURE__ */ jsx8("p", { id: "knowledge-graph-keyboard-help", className: "sr-only", children: t("graphKeyboardHelp") }),
        /* @__PURE__ */ jsxs8("div", { className: "relative", children: [
          /* @__PURE__ */ jsxs8("div", { className: "knowledge-observatory-canvas relative overflow-hidden rounded-xl", children: [
            /* @__PURE__ */ jsxs8("div", { className: "knowledge-graph-canvas-tools absolute inset-3 z-10", children: [
              /* @__PURE__ */ jsxs8(
                "button",
                {
                  type: "button",
                  className: "knowledge-graph-live-toggle absolute right-0 top-0 flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
                  "aria-pressed": paused,
                  title: t("graphLiveToggle"),
                  "data-testid": "knowledge-graph-live-toggle",
                  onClick: togglePaused,
                  children: [
                    /* @__PURE__ */ jsx8(
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
              /* @__PURE__ */ jsxs8("div", { className: "knowledge-graph-controls absolute bottom-0 right-0 flex items-center gap-1 rounded-lg p-1", children: [
                /* @__PURE__ */ jsxs8(
                  "button",
                  {
                    type: "button",
                    className: "knowledge-graph-zoom-button",
                    onClick: () => zoomBy(1.14),
                    title: `${t("graphZoomIn")} (+)`,
                    children: [
                      /* @__PURE__ */ jsx8("span", { "aria-hidden": "true", children: "\uFF0B" }),
                      /* @__PURE__ */ jsx8("span", { className: "sr-only", children: t("graphZoomIn") })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs8("span", { className: "knowledge-graph-zoom-value", "aria-live": "polite", children: [
                  Math.round(camera.scale * 100),
                  "%"
                ] }),
                /* @__PURE__ */ jsxs8(
                  "button",
                  {
                    type: "button",
                    className: "knowledge-graph-zoom-button",
                    onClick: () => zoomBy(0.88),
                    title: `${t("graphZoomOut")} (-)`,
                    children: [
                      /* @__PURE__ */ jsx8("span", { "aria-hidden": "true", children: "\uFF0D" }),
                      /* @__PURE__ */ jsx8("span", { className: "sr-only", children: t("graphZoomOut") })
                    ]
                  }
                ),
                /* @__PURE__ */ jsxs8(
                  "button",
                  {
                    type: "button",
                    className: "knowledge-graph-zoom-button px-2",
                    onClick: resetCamera,
                    title: t("graphResetView"),
                    children: [
                      /* @__PURE__ */ jsx8("span", { "aria-hidden": "true", children: "\u2302" }),
                      /* @__PURE__ */ jsx8("span", { className: "sr-only", children: t("graphResetView") })
                    ]
                  }
                ),
                /* @__PURE__ */ jsx8(
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
            /* @__PURE__ */ jsxs8(
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
                  /* @__PURE__ */ jsx8("title", { id: "knowledge-graph-title", children: t("graphTitle") }),
                  /* @__PURE__ */ jsxs8("defs", { children: [
                    /* @__PURE__ */ jsx8(
                      "pattern",
                      {
                        id: "knowledge-grid",
                        width: "32",
                        height: "32",
                        patternUnits: "userSpaceOnUse",
                        children: /* @__PURE__ */ jsx8(
                          "path",
                          {
                            d: "M 32 0 L 0 0 0 32",
                            fill: "none",
                            stroke: "var(--knowledge-grid)",
                            strokeOpacity: ".8",
                            strokeWidth: "1"
                          }
                        )
                      }
                    ),
                    /* @__PURE__ */ jsxs8("radialGradient", { id: "knowledge-glow", children: [
                      /* @__PURE__ */ jsx8(
                        "stop",
                        {
                          offset: "0",
                          stopColor: "var(--knowledge-accent)",
                          stopOpacity: ".2"
                        }
                      ),
                      /* @__PURE__ */ jsx8(
                        "stop",
                        {
                          offset: "1",
                          stopColor: "var(--knowledge-canvas)",
                          stopOpacity: "0"
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ jsx8("rect", { width: GRAPH_WIDTH, height: GRAPH_HEIGHT, fill: "url(#knowledge-grid)" }),
                  /* @__PURE__ */ jsx8(
                    "ellipse",
                    {
                      cx: GRAPH_WIDTH / 2,
                      cy: GRAPH_HEIGHT / 2,
                      rx: "300",
                      ry: "210",
                      fill: "url(#knowledge-glow)"
                    }
                  ),
                  /* @__PURE__ */ jsxs8(
                    "g",
                    {
                      className: "knowledge-graph-scene",
                      transform: `translate(${camera.x} ${camera.y}) scale(${camera.scale})`,
                      children: [
                        viewNodes.filter((node) => node.isMain).map((node) => {
                          const point = viewPoints.get(node.path);
                          if (!point) return null;
                          return /* @__PURE__ */ jsx8(
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
                        /* @__PURE__ */ jsx8("g", { children: visibleEdges.map((edge) => {
                          const a = viewPoints.get(edge.source), b = viewPoints.get(edge.target);
                          if (!a || !b) return null;
                          const categoryOn = !categoryFilter || categoryOf(
                            nodeByPath.get(edge.source) ?? { kind: "note" }
                          ) === categoryFilter || categoryOf(
                            nodeByPath.get(edge.target) ?? { kind: "note" }
                          ) === categoryFilter;
                          const on = categoryOn && (!active || active.has(edge.source) && active.has(edge.target));
                          const fresh = freshPaths.has(edge.source) || freshPaths.has(edge.target);
                          return /* @__PURE__ */ jsx8(
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
                            /* @__PURE__ */ jsxs8(
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
                                  /* @__PURE__ */ jsx8("title", { children: `${node.title}
${node.path}` }),
                                  selected === node.path && /* @__PURE__ */ jsx8(
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
                                  /* @__PURE__ */ jsx8(
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
                                  nodeFindings?.map((kind, index) => /* @__PURE__ */ jsx8(
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
                                  node.isMain && /* @__PURE__ */ jsx8(
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
                                  (node.sharedWith?.length ?? 0) > 1 && /* @__PURE__ */ jsx8(
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
                                  /* @__PURE__ */ jsx8(
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
                                  showLabel && placement && /* @__PURE__ */ jsxs8(Fragment5, { children: [
                                    /* @__PURE__ */ jsx8(
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
                                    /* @__PURE__ */ jsxs8(
                                      "text",
                                      {
                                        x: placement.x,
                                        y: placement.y,
                                        textAnchor: placement.anchor,
                                        fontSize: "10",
                                        fill: "var(--knowledge-ink)",
                                        children: [
                                          /* @__PURE__ */ jsx8("tspan", { children: labelText(node) }),
                                          showMetadata && /* @__PURE__ */ jsxs8(
                                            "tspan",
                                            {
                                              x: placement.x,
                                              dy: "12",
                                              fontSize: "8",
                                              fill: "var(--knowledge-ink-muted)",
                                              children: [
                                                t("graphInDegree").replace(
                                                  "{count}",
                                                  String(incoming.get(node.path) ?? 0)
                                                ),
                                                " ",
                                                "\xB7 ",
                                                categoryLabels[categoryOf(node)]
                                              ]
                                            }
                                          )
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
            /* @__PURE__ */ jsx8("div", { className: "sr-only", "aria-live": "polite", "aria-atomic": "true", children: selectedNode ? `${selectedNode.title} \xB7 ${selectedNode.path}` : "" }),
            /* @__PURE__ */ jsxs8("div", { className: "knowledge-graph-legend absolute bottom-2 left-3 flex max-w-[calc(100%-24px)] flex-wrap gap-x-3 gap-y-1 rounded-md px-2 py-2 text-xs", children: [
              colorMode === "cluster" && /* @__PURE__ */ jsxs8(Fragment5, { children: [
                [...clusterHeads.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6).map(([cluster, head]) => /* @__PURE__ */ jsxs8("span", { title: head.title, children: [
                  /* @__PURE__ */ jsx8(
                    "i",
                    {
                      className: "mr-1 inline-block h-2 w-2 rounded-full",
                      style: {
                        backgroundColor: clusterColor(
                          cluster,
                          clusterSizes.get(cluster) ?? 0
                        )
                      }
                    }
                  ),
                  labelText(head)
                ] }, `legend-cluster-${cluster}`)),
                /* @__PURE__ */ jsx8("span", { children: t("graphLegendShapes") })
              ] }),
              colorMode === "type" && [...new Set(nodes.map(categoryOf))].map(
                (category) => /* @__PURE__ */ jsxs8("span", { children: [
                  /* @__PURE__ */ jsx8(
                    "i",
                    {
                      className: "mr-1 inline-block h-2 w-2 rounded-full",
                      style: { backgroundColor: CATEGORY_COLORS[category] }
                    }
                  ),
                  categoryLabels[category]
                ] }, `legend-${category}`)
              ),
              /* @__PURE__ */ jsxs8("span", { children: [
                /* @__PURE__ */ jsx8("i", { className: "knowledge-graph-legend-main mr-1 inline-block h-2 w-2 rounded-full border" }),
                t("graphLegendMain")
              ] }),
              /* @__PURE__ */ jsxs8("span", { children: [
                /* @__PURE__ */ jsx8("i", { className: "mr-1 inline-block h-2 w-2 rounded-full border border-[var(--knowledge-edge)] border-dashed" }),
                t("graphLegendShared")
              ] }),
              /* @__PURE__ */ jsxs8("span", { children: [
                /* @__PURE__ */ jsx8("i", { className: "mr-1 inline-block h-[1px] w-3 align-middle bg-[var(--knowledge-edge)]" }),
                t("graphLegendDirect")
              ] }),
              /* @__PURE__ */ jsxs8("span", { children: [
                /* @__PURE__ */ jsx8("i", { className: "knowledge-graph-legend-directory mr-1 inline-block w-3 border-t border-dashed align-middle" }),
                t("graphLegendDirectory")
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx8(
            "aside",
            {
              className: `knowledge-node-drawer absolute right-3 top-16 bottom-12 z-20 w-[min(360px,calc(100%-24px))] overflow-y-auto rounded-xl p-4 transition duration-200 ${selectedNode || healthOn ? "is-open" : ""}`,
              "aria-label": selectedNode || !healthOn ? t("graphNodeCard") : t("graphHealth"),
              "aria-hidden": !selectedNode && !healthOn,
              children: selectedNode ? /* @__PURE__ */ jsxs8(Fragment5, { children: [
                /* @__PURE__ */ jsx8(
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
                /* @__PURE__ */ jsx8("p", { className: "text-[11px] uppercase tracking-[0.12em] text-ink-faint", children: t("graphSelectedNode") }),
                /* @__PURE__ */ jsx8("h4", { className: "mt-1 truncate text-xs font-semibold", children: selectedNode.title }),
                /* @__PURE__ */ jsx8("p", { className: "mt-1 break-all font-mono text-[11px] text-ink-faint", children: selectedNode.path }),
                /* @__PURE__ */ jsxs8("div", { className: "mt-2 flex flex-wrap gap-1", children: [
                  /* @__PURE__ */ jsx8("span", { className: "rounded border border-border px-2 py-0.5 text-xs text-ink-dim", children: categoryLabels[categoryOf(selectedNode)] }),
                  /* @__PURE__ */ jsx8("span", { className: "rounded border border-border px-2 py-0.5 text-xs text-ink-dim", children: t("graphLinks").replace(
                    "{count}",
                    String(selectedNode.degree)
                  ) }),
                  /* @__PURE__ */ jsx8("span", { className: "rounded border border-border px-2 py-0.5 text-xs text-ink-dim", children: t("graphInDegree").replace(
                    "{count}",
                    String(incoming.get(selectedNode.path) ?? 0)
                  ) }),
                  (clusterSizes.get(clusters.get(selectedNode.path) ?? 0) ?? 0) > 1 && /* @__PURE__ */ jsxs8("span", { className: "flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-ink-dim", children: [
                    /* @__PURE__ */ jsx8(
                      "i",
                      {
                        className: "inline-block h-2 w-2 rounded-full",
                        style: {
                          backgroundColor: clusterColor(
                            clusters.get(selectedNode.path) ?? 0,
                            clusterSizes.get(
                              clusters.get(selectedNode.path) ?? 0
                            ) ?? 0
                          )
                        }
                      }
                    ),
                    t("graphCluster").replace(
                      "{count}",
                      String((clusters.get(selectedNode.path) ?? 0) + 1)
                    )
                  ] })
                ] }),
                (findingsByPath.get(selectedNode.path) ?? []).map((kind) => /* @__PURE__ */ jsxs8(
                  "div",
                  {
                    className: "mt-3 rounded border border-border px-2 py-2 text-xs",
                    style: { borderColor: HEALTH_COLORS[kind] },
                    children: [
                      /* @__PURE__ */ jsx8(
                        "p",
                        {
                          className: "font-semibold",
                          style: { color: HEALTH_COLORS[kind] },
                          children: t(HEALTH_COPY[kind].label)
                        }
                      ),
                      /* @__PURE__ */ jsx8("p", { className: "mt-1 text-ink-dim", children: t(HEALTH_COPY[kind].hint) }),
                      /* @__PURE__ */ jsx8(
                        Button,
                        {
                          className: "mt-2",
                          size: "sm",
                          variant: "primary",
                          disabled: !onHandoff,
                          title: unavailableReason,
                          onClick: () => handOff(selectedNode.path, kind),
                          children: t("handOff")
                        }
                      )
                    ]
                  },
                  `finding-${kind}`
                )),
                /* @__PURE__ */ jsxs8("dl", { className: "mt-3 space-y-2 text-xs text-ink-dim", children: [
                  /* @__PURE__ */ jsxs8("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx8("dt", { children: t("graphOutgoing") }),
                    /* @__PURE__ */ jsx8("dd", { children: links?.outgoing.length ?? 0 })
                  ] }),
                  /* @__PURE__ */ jsxs8("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx8("dt", { children: t("graphIncoming") }),
                    /* @__PURE__ */ jsx8("dd", { children: links?.incoming.length ?? 0 })
                  ] }),
                  /* @__PURE__ */ jsxs8("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx8("dt", { children: t("graphHops") }),
                    /* @__PURE__ */ jsx8("dd", { children: neighbours.get(selected ?? "")?.size ? 1 : 0 })
                  ] })
                ] }),
                selectedNode.warnings?.length || selectedNode.mirrors?.length ? /* @__PURE__ */ jsx8("p", { className: "mt-3 rounded bg-hover px-2 py-2 text-xs text-warn", children: t("graphMirrorWarning").replace(
                  "{count}",
                  String(selectedNode.mirrors?.length ?? 0)
                ) }) : null,
                links && /* @__PURE__ */ jsxs8("div", { className: "mt-3 border-t border-border pt-2", children: [
                  /* @__PURE__ */ jsx8("p", { className: "text-xs font-semibold text-ink-dim", children: t("graphRelatedNotes") }),
                  [...links.outgoing, ...links.incoming].slice(0, 4).map((link) => /* @__PURE__ */ jsxs8(
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
                /* @__PURE__ */ jsx8(
                  Button,
                  {
                    className: "mt-3 w-full",
                    size: "sm",
                    onClick: () => onOpenNote(selectedNode.path),
                    children: t("graphOpenNote")
                  }
                )
              ] }) : healthOn ? /* @__PURE__ */ jsxs8("div", { "data-testid": "knowledge-graph-health-list", children: [
                /* @__PURE__ */ jsx8(
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
                /* @__PURE__ */ jsx8("p", { className: "text-[11px] uppercase tracking-[0.12em] text-ink-faint", children: t("graphHealth") }),
                /* @__PURE__ */ jsx8("p", { className: "mt-1 text-[11px] leading-relaxed text-ink-faint", children: t("graphHealthIntro") }),
                findings.length === 0 && /* @__PURE__ */ jsx8("p", { className: "mt-3 text-xs text-ink-dim", children: t("graphHealthEmpty") }),
                HEALTH_ORDER.map((kind) => {
                  const rows = findings.filter(
                    (finding) => finding.kind === kind
                  );
                  if (rows.length === 0) return null;
                  return /* @__PURE__ */ jsxs8(
                    "section",
                    {
                      className: "mt-3 border-t border-border pt-2",
                      children: [
                        /* @__PURE__ */ jsxs8("p", { className: "flex items-center gap-2 text-xs font-semibold text-ink-dim", children: [
                          /* @__PURE__ */ jsx8(
                            "i",
                            {
                              className: "inline-block h-2 w-2 rounded-full",
                              style: { backgroundColor: HEALTH_COLORS[kind] }
                            }
                          ),
                          t(HEALTH_COPY[kind].label),
                          /* @__PURE__ */ jsx8("span", { className: "font-normal text-ink-faint", children: rows.length })
                        ] }),
                        rows.slice(0, 12).map((finding) => /* @__PURE__ */ jsx8(
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
                        rows.length > 12 && /* @__PURE__ */ jsx8("p", { className: "mt-1 text-[11px] text-ink-faint", children: t("graphMore").replace(
                          "{count}",
                          String(rows.length - 12)
                        ) })
                      ]
                    },
                    `health-${kind}`
                  );
                })
              ] }) : /* @__PURE__ */ jsxs8("div", { className: "flex h-full min-h-[220px] flex-col justify-between", children: [
                /* @__PURE__ */ jsx8("p", { className: "text-[11px] uppercase tracking-[0.12em] text-ink-faint", children: t("graphSelectedNode") }),
                /* @__PURE__ */ jsx8("p", { className: "mt-3 text-[11px] leading-relaxed text-ink-faint", children: t("graphSelectHint") }),
                /* @__PURE__ */ jsx8("p", { className: "text-[11px] leading-relaxed text-ink-faint", children: t("graphCollisionHint") })
              ] })
            }
          )
        ] }),
        /* @__PURE__ */ jsxs8("p", { className: "text-[11px] text-ink-faint", children: [
          t("graphHint"),
          " \xB7 ",
          t("graphShortcuts")
        ] })
      ]
    }
  );
}

// ui/knowledge/KnowledgeSearchView.tsx
import { useEffect as useEffect8, useMemo as useMemo3, useRef as useRef4 } from "react";

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

// ui/knowledge/KnowledgeSearchView.tsx
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
var CATEGORY_KEYS = {
  all: "homeCategoryAll",
  paper: "homeCategoryPaper",
  software: "homeCategorySoftware",
  method: "homeCategoryMethod",
  idea: "homeCategoryIdea"
};
function KnowledgeSearchView({
  bindingRevision,
  activeCategory,
  onCategoryChange,
  categoryCounts,
  result,
  busy,
  error,
  onSearch,
  onOpenNote,
  query,
  onQueryChange
}) {
  const t = useKnowledgeText();
  const inputRef = useRef4(null);
  useEffect8(() => {
    const handle = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);
  async function submit(event) {
    event?.preventDefault();
    const text = query.trim();
    if (text && bindingRevision) await onSearch(text);
  }
  const hits = useMemo3(
    () => result?.hits.filter(
      (hit) => activeCategory === "all" || classifyKnowledgeHit(hit.kind, hit.path) === activeCategory
    ) ?? [],
    [result, activeCategory]
  );
  const openHit = onOpenNote;
  return /* @__PURE__ */ jsxs9("div", { "data-testid": "knowledge-search", children: [
    /* @__PURE__ */ jsxs9(
      "form",
      {
        className: "flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-ink-faint",
        onSubmit: (event) => void submit(event),
        children: [
          /* @__PURE__ */ jsx9("span", { "aria-hidden": "true", className: "text-sm text-ink-dim", children: "\u2315" }),
          /* @__PURE__ */ jsx9("label", { htmlFor: "knowledge-search-input", className: "sr-only", children: t("homeSearch") }),
          /* @__PURE__ */ jsx9(
            "input",
            {
              ref: inputRef,
              id: "knowledge-search-input",
              type: "search",
              maxLength: 2e3,
              value: query,
              onChange: (event) => onQueryChange(event.target.value),
              placeholder: t("homeSearchPlaceholder"),
              className: "min-w-0 flex-1 bg-transparent text-sm text-ink outline-none",
              disabled: !bindingRevision
            }
          ),
          /* @__PURE__ */ jsx9("kbd", { className: "rounded-md bg-hover px-2 py-0.5 text-[11px] text-ink-dim", children: t("homeSearchShortcut") }),
          /* @__PURE__ */ jsx9(
            Button,
            {
              size: "sm",
              type: "submit",
              disabled: busy || !query.trim() || !bindingRevision,
              children: busy ? t("loading") : t("homeSearch")
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsx9(
      "div",
      {
        className: "mt-3 flex flex-wrap items-center gap-1",
        role: "tablist",
        "aria-label": t("homeCategories"),
        children: Object.keys(CATEGORY_KEYS).map((category) => {
          const count = categoryCounts[category];
          return /* @__PURE__ */ jsxs9(
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
        })
      }
    ),
    !bindingRevision && /* @__PURE__ */ jsx9("p", { className: "mt-3 text-xs text-ink-faint", children: t("homeSearchUnavailable") }),
    error && /* @__PURE__ */ jsx9("p", { role: "alert", className: "mt-3 break-words text-xs text-err", children: error }),
    result && !result.complete && /* @__PURE__ */ jsx9("p", { role: "status", className: "mt-2 text-xs text-ink-dim", children: t("homeSearchPartial") }),
    result && /* @__PURE__ */ jsx9("div", { className: "mt-3", children: hits.length === 0 ? /* @__PURE__ */ jsx9("p", { className: "text-xs text-ink-faint", children: result.complete ? t("homeSearchEmpty") : t("homeSearchIncomplete") }) : /* @__PURE__ */ jsx9("ul", { className: "divide-y divide-border rounded-xl border border-border bg-surface", children: hits.map((hit) => /* @__PURE__ */ jsx9("li", { children: /* @__PURE__ */ jsxs9(
      "button",
      {
        type: "button",
        className: "w-full px-3 py-3 text-left hover:bg-hover",
        onClick: () => openHit(hit.path, hit),
        children: [
          /* @__PURE__ */ jsx9(
            "span",
            {
              className: "block truncate text-xs font-medium",
              title: hit.title,
              children: hit.title || hit.path
            }
          ),
          /* @__PURE__ */ jsx9("span", { className: "mt-1 block truncate font-mono text-[11px] text-ink-faint", children: hit.path }),
          hit.hash && /* @__PURE__ */ jsxs9("span", { className: "block font-mono text-[11px] text-ink-faint", children: [
            "L",
            hit.startLine,
            "\u2013",
            hit.endLine,
            " \xB7 ",
            hit.hash.slice(0, 12)
          ] }),
          hit.text && /* @__PURE__ */ jsx9("span", { className: "mt-1 line-clamp-2 block whitespace-pre-wrap text-xs text-ink-dim", children: hit.text })
        ]
      }
    ) }, hit.path)) }) })
  ] });
}

// ui/NativeKnowledgeReading.tsx
import { Fragment as Fragment6, jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
function NativeKnowledgeReading({
  store,
  state
}) {
  const t = useNativeKnowledgeText();
  const [category, setCategory] = useState9("all");
  const [recent, setRecent] = useState9(
    null
  );
  const [linkNotice, setLinkNotice] = useState9(null);
  const [error, setError] = useState9(null);
  const [jobs, setJobs] = useState9(null);
  const [offset, setOffset] = useState9(0);
  const binding = state.overview.binding;
  useEffect9(() => setLinkNotice(null), [state.selectedNote]);
  const noteApi = useMemo4(
    () => ({ readNote: store.readNote, links: store.links }),
    [store]
  );
  const graphApi = useMemo4(
    () => ({
      getKnowledgeGraph: store.graph,
      getKnowledgeNoteLinks: store.links
    }),
    [store]
  );
  useEffect9(() => {
    let live = true;
    setError(null);
    setRecent(null);
    if (state.view !== "reading" || state.selectedNote) return;
    void store.recentByCategory().then(
      (value) => {
        if (live) setRecent(value);
      },
      (cause) => {
        if (live)
          setError(String(cause instanceof Error ? cause.message : cause));
      }
    );
    return () => {
      live = false;
    };
  }, [store, state.view, state.selectedNote, state.observationRevision]);
  useEffect9(() => {
    let live = true;
    setError(null);
    setJobs(null);
    if (state.view !== "jobs") return;
    void store.jobs({ offset, limit: 20 }).then(
      (value) => {
        if (live) setJobs(value);
      },
      (cause) => {
        if (live)
          setError(String(cause instanceof Error ? cause.message : cause));
      }
    );
    return () => {
      live = false;
    };
  }, [store, state.view, state.observationRevision, offset]);
  const counts = recent ? {
    all: Object.values(recent.counts).reduce((a, b) => a + b, 0),
    ...recent.counts
  } : { all: null, paper: null, software: null, method: null, idea: null };
  const notes = category === "all" ? state.overview.recentNotes : recent?.groups[category] ?? [];
  return /* @__PURE__ */ jsxs10(Fragment6, { children: [
    error && /* @__PURE__ */ jsx10("p", { role: "alert", className: "text-sm text-err", children: error }),
    state.view === "graph" && /* @__PURE__ */ jsx10(
      KnowledgeGraphView,
      {
        api: graphApi,
        nonce: state.observationRevision,
        revision: binding.revision,
        onOpenNote: store.openNote,
        unavailableReason: t.handoffUnavailable
      }
    ),
    state.view === "jobs" && /* @__PURE__ */ jsx10("section", { "aria-label": t.jobs, children: jobs ? /* @__PURE__ */ jsxs10(Fragment6, { children: [
      /* @__PURE__ */ jsxs10("p", { className: "text-xs text-ink-dim", children: [
        jobs.total,
        " ",
        t.jobCount
      ] }),
      /* @__PURE__ */ jsx10("ul", { className: "divide-y divide-border", children: jobs.items.map((job) => /* @__PURE__ */ jsxs10("li", { className: "py-3 text-sm", children: [
        /* @__PURE__ */ jsxs10("p", { children: [
          job.kind,
          " \xB7 ",
          job.path
        ] }),
        /* @__PURE__ */ jsxs10("p", { className: "text-xs text-ink-faint", children: [
          job.scope,
          " \xB7 ",
          job.updated
        ] })
      ] }, job.key)) }),
      /* @__PURE__ */ jsxs10("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsx10(
          Button,
          {
            size: "sm",
            disabled: offset === 0,
            onClick: () => setOffset(0),
            children: t.firstPage
          }
        ),
        /* @__PURE__ */ jsx10(
          Button,
          {
            size: "sm",
            disabled: jobs.nextOffset === null,
            onClick: () => setOffset(jobs.nextOffset),
            children: t.nextPage
          }
        )
      ] })
    ] }) : !error && /* @__PURE__ */ jsx10("p", { role: "status", children: t.loading }) }),
    state.view === "reading" && (state.selectedNote ? /* @__PURE__ */ jsx10(
      KnowledgeNoteView,
      {
        api: noteApi,
        nonce: state.observationRevision,
        path: state.selectedNote.path,
        initialPage: state.selectedNote,
        revision: binding.revision,
        onOpenNote: store.openNote,
        onClose: store.closeNote,
        unavailableReason: t.openUnavailable,
        renderText: (text) => /* @__PURE__ */ jsxs10(Fragment6, { children: [
          /* @__PURE__ */ jsx10(
            Markdown,
            {
              text,
              onLink: (href) => {
                const path = href.startsWith("#") ? new URLSearchParams(href.slice(1)).get("drone-note") : null;
                if (path) store.openNote(path);
                else setLinkNotice(t.inlineLinkUnavailable);
              }
            }
          ),
          linkNotice && /* @__PURE__ */ jsx10("p", { role: "status", className: "mt-2 text-xs text-ink-dim", children: linkNotice })
        ] })
      },
      state.selectedNote.path
    ) : /* @__PURE__ */ jsxs10(Fragment6, { children: [
      /* @__PURE__ */ jsx10(
        KnowledgeSearchView,
        {
          query: state.query,
          onQueryChange: store.setQuery,
          bindingRevision: binding.revision,
          activeCategory: category,
          onCategoryChange: setCategory,
          categoryCounts: counts,
          result: state.searchResult,
          busy: state.searchLoading,
          error: state.searchError,
          onSearch: store.search,
          onOpenNote: store.openNote
        }
      ),
      /* @__PURE__ */ jsx10("p", { className: "text-xs text-ink-dim", children: t.readOnly }),
      /* @__PURE__ */ jsxs10("section", { "aria-label": t.recent, children: [
        /* @__PURE__ */ jsx10("h2", { className: "text-sm font-medium", children: t.recent }),
        notes.length === 0 ? !error && /* @__PURE__ */ jsx10("p", { className: "mt-2 text-sm text-ink-dim", children: category !== "all" && !recent ? t.loading : t.noRecent }) : /* @__PURE__ */ jsx10("ul", { className: "mt-2 divide-y divide-border", children: notes.map((note) => /* @__PURE__ */ jsx10("li", { children: /* @__PURE__ */ jsxs10(
          "button",
          {
            type: "button",
            className: "w-full py-3 text-left hover:bg-hover",
            onClick: () => store.openNote(note.path),
            children: [
              /* @__PURE__ */ jsx10("p", { className: "text-sm", children: note.title || note.path }),
              /* @__PURE__ */ jsx10("p", { className: "mt-1 break-all font-mono text-xs text-ink-faint", children: note.path })
            ]
          }
        ) }, note.path)) })
      ] })
    ] }))
  ] });
}

// ui/runtime-store.ts
var initialState = () => ({
  query: "",
  selectedNote: null,
  view: "reading",
  observationRevision: 0,
  overview: null,
  overviewLoading: false,
  overviewError: null,
  searchResult: null,
  searchLoading: false,
  searchError: null
});
var errorText3 = (error) => error instanceof Error ? error.message : String(error);
function createKnowledgeRuntimeStore(client) {
  let state = initialState();
  const listeners = /* @__PURE__ */ new Set();
  let connected = false;
  let generation = 0;
  let overviewRequest = 0;
  let searchRequest = 0;
  let eventRevision = 0;
  let currentQuery = null;
  let readEpoch = 0;
  const update = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  async function refresh() {
    if (!connected) return false;
    const owner = generation;
    const request = ++overviewRequest;
    ++readEpoch;
    update({ overviewLoading: true, overviewError: null });
    try {
      const overview = await client.invoke("overview", null);
      if (!connected || generation !== owner || request !== overviewRequest) return false;
      if (state.overview && (state.overview.binding?.vaultId !== overview.binding?.vaultId || state.overview.binding?.revision !== overview.binding?.revision)) {
        currentQuery = null;
        ++searchRequest;
        update({
          searchResult: null,
          searchError: null,
          searchLoading: false,
          selectedNote: null,
          view: state.view === "settings" ? "settings" : "reading",
          query: ""
        });
      }
      update({
        overview,
        overviewLoading: false,
        observationRevision: state.observationRevision + 1,
        selectedNote: state.selectedNote ? { path: state.selectedNote.path, startLine: 1 } : null
      });
      return true;
    } catch (error) {
      if (connected && generation === owner && request === overviewRequest)
        update({ overviewLoading: false, overviewError: errorText3(error) });
      return false;
    }
  }
  async function search(query) {
    if (!connected) return;
    currentQuery = query;
    const owner = generation;
    const request = ++searchRequest;
    update({
      query,
      searchLoading: true,
      searchError: null,
      searchResult: null
    });
    try {
      const binding = state.overview?.binding;
      if (!binding) throw new Error("Knowledge search requires a bound Vault");
      const searchResult = await client.invoke("search", {
        query,
        revision: binding.revision,
        limit: 12
      });
      if (connected && generation === owner && request === searchRequest)
        update({ searchResult, searchLoading: false });
    } catch (error) {
      if (connected && generation === owner && request === searchRequest)
        update({ searchLoading: false, searchError: errorText3(error) });
    }
  }
  async function read(operation, input) {
    if (!connected) throw new Error("Knowledge caller is disconnected");
    const binding = state.overview?.binding;
    if (!binding) throw new Error("Knowledge reading requires a bound Vault");
    const owner = generation, epoch = readEpoch;
    const result = await client.invoke(operation, {
      ...input,
      revision: binding.revision
    });
    if (!connected || owner !== generation || epoch !== readEpoch)
      throw new Error("Knowledge observation was superseded");
    return result;
  }
  async function mutate(operation, input) {
    if (!connected) throw new Error("Knowledge caller is disconnected");
    const binding = state.overview?.binding;
    if (!binding) throw new Error("Knowledge writing requires a bound Vault");
    const owner = generation;
    const result = await client.invoke(operation, { ...input, revision: binding.revision });
    if (!connected || owner !== generation || state.overview?.binding?.vaultId !== binding.vaultId || state.overview.binding.revision !== binding.revision)
      throw new Error("Knowledge caller or binding changed during writing");
    return result;
  }
  function connect() {
    connected = true;
    const owner = ++generation;
    eventRevision = 0;
    currentQuery = null;
    state = initialState();
    const unsubscribe = client.subscribe((event) => {
      if (!connected || generation !== owner || event.revision <= eventRevision) return;
      eventRevision = event.revision;
      const query = currentQuery;
      const request = ++searchRequest;
      update({ searchResult: null, searchLoading: false, searchError: null });
      void refresh().then((refreshed) => {
        if (refreshed && connected && generation === owner && request === searchRequest && query !== null && query === currentQuery)
          void search(query);
      });
    });
    void refresh();
    return () => {
      unsubscribe();
      if (generation === owner) {
        connected = false;
        ++generation;
      }
    };
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connect,
    refresh,
    search,
    setQuery: (query) => {
      currentQuery = null;
      ++searchRequest;
      update({
        query,
        searchResult: null,
        searchLoading: false,
        searchError: null
      });
    },
    openNote: (path, hit) => update({
      selectedNote: {
        path,
        startLine: hit?.startLine ?? 1,
        expectedHash: hit?.hash
      },
      view: "reading"
    }),
    closeNote: () => update({ selectedNote: null }),
    setView: (view) => update({ view, selectedNote: null }),
    readNote: (input) => read("readNote", input),
    links: (input) => read("links", input),
    graph: (input) => read("graph", input),
    jobs: (input) => read("jobs", input),
    reviews: (input) => read("reviews", input),
    previewReview: (input) => read("previewReview", input),
    rejectReview: (input) => mutate("rejectReview", input),
    applyReview: (input) => mutate("applyReview", input),
    reviewHistory: () => read("reviewHistory", {}),
    undoReview: (input) => mutate("undoReview", input),
    recentByCategory: () => read("recentByCategory", { limit: 8 })
  };
}

// ui/NativeKnowledgePage.tsx
import { Fragment as Fragment7, jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
function NativeKnowledgeUnavailable() {
  const t = useNativeKnowledgeText();
  return /* @__PURE__ */ jsxs11("section", { className: "rounded-xl border border-border bg-surface p-4", "aria-label": t.unsupportedTitle, children: [
    /* @__PURE__ */ jsx11("h2", { className: "text-sm font-medium text-ink", children: t.unsupportedTitle }),
    /* @__PURE__ */ jsx11("p", { className: "mt-2 text-xs leading-relaxed text-ink-dim", children: t.unsupported })
  ] });
}
function CallerKnowledgePage({
  client,
  initialView
}) {
  const t = useNativeKnowledgeText();
  const store = useMemo5(() => createKnowledgeRuntimeStore(client), [client]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect10(() => {
    const disconnect = store.connect();
    store.setView(initialView);
    return disconnect;
  }, [store, initialView]);
  const overview = state.overview;
  return /* @__PURE__ */ jsx11("section", { className: "knowledge-view", "aria-label": t.title, "data-testid": "native-knowledge-page", children: /* @__PURE__ */ jsx11("div", { className: "knowledge-view-body", children: /* @__PURE__ */ jsxs11("div", { className: "mx-auto w-full max-w-5xl space-y-6 p-5 text-ink", children: [
    /* @__PURE__ */ jsxs11("header", { className: "flex items-center justify-between gap-4", children: [
      /* @__PURE__ */ jsxs11("div", { children: [
        /* @__PURE__ */ jsx11("h1", { className: "text-lg font-semibold", children: t.title }),
        overview?.binding && /* @__PURE__ */ jsxs11("p", { className: "mt-1 text-xs text-ink-dim", children: [
          overview.binding.label,
          " \xB7",
          " ",
          overview.project ? `${t.project}: ${overview.project}` : t.application
        ] })
      ] }),
      /* @__PURE__ */ jsx11(Button, { size: "sm", disabled: state.overviewLoading, onClick: () => void store.refresh(), children: state.overviewLoading ? t.loading : t.refresh })
    ] }),
    /* @__PURE__ */ jsx11("nav", { className: "flex gap-2", "aria-label": t.readingNavigation, children: ["reading", "graph", "jobs", "reviews", "history", "settings"].map((view) => /* @__PURE__ */ jsx11(
      Button,
      {
        size: "sm",
        "aria-pressed": state.view === view,
        disabled: view !== "settings" && !overview?.binding,
        onClick: () => store.setView(view),
        children: t[view]
      },
      view
    )) }),
    state.view === "settings" && /* @__PURE__ */ jsx11(
      NativeKnowledgePreferences,
      {
        client,
        observationRevision: state.observationRevision,
        refreshing: state.overviewLoading
      }
    ),
    state.overviewError && /* @__PURE__ */ jsx11("p", { role: "alert", className: "rounded-xl border border-border p-4 text-sm text-err", children: state.overviewError }),
    state.overviewLoading && !overview && /* @__PURE__ */ jsx11("p", { role: "status", className: "text-sm text-ink-dim", children: t.loading }),
    state.view !== "settings" && overview?.state === "unconfigured" && /* @__PURE__ */ jsxs11("div", { className: "rounded-xl border border-dashed border-border p-5", children: [
      /* @__PURE__ */ jsx11("h2", { className: "font-medium", children: t.unconfigured }),
      /* @__PURE__ */ jsx11("p", { className: "mt-2 text-sm text-ink-dim", children: t.unconfiguredHint })
    ] }),
    state.view !== "settings" && overview?.state === "bound" && /* @__PURE__ */ jsxs11(Fragment7, { children: [
      /* @__PURE__ */ jsx11("p", { className: "text-sm text-ink-dim", children: overview.index ? `${overview.index.noteCount} ${t.notes} \xB7 ${t[overview.index.coverage]}` : t.indexMissing }),
      !state.overviewLoading && (state.view === "history" ? /* @__PURE__ */ jsx11(NativeKnowledgeHistory, { store, observationRevision: state.observationRevision }) : state.view === "reviews" ? /* @__PURE__ */ jsx11(NativeKnowledgeReviews, { store, observationRevision: state.observationRevision }) : /* @__PURE__ */ jsx11(NativeKnowledgeReading, { store, state }, state.view))
    ] }),
    /* @__PURE__ */ jsx11(NativeKnowledgeUnavailable, {})
  ] }) }) });
}
function NativeKnowledgePage({
  initialView = "reading"
}) {
  const client = usePluginRuntime();
  const session = useSessionsStore((state) => state.activeSessionId);
  return /* @__PURE__ */ jsx11(CallerKnowledgePage, { client, initialView }, session ?? "application");
}

// generated-style:./styles/generated
var knowledgeStyles = '/*! tailwindcss v4.3.3 | MIT License | https://tailwindcss.com */\n@layer drone-knowledge-properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){:where(.drone-knowledge-ui) *,:where(.drone-knowledge-ui) :before,:where(.drone-knowledge-ui) :after,:where(.drone-knowledge-ui) ::backdrop{--drone-knowledge-tw-rotate-x:initial;--drone-knowledge-tw-rotate-y:initial;--drone-knowledge-tw-rotate-z:initial;--drone-knowledge-tw-skew-x:initial;--drone-knowledge-tw-skew-y:initial;--drone-knowledge-tw-space-y-reverse:0;--drone-knowledge-tw-divide-y-reverse:0;--drone-knowledge-tw-border-style:solid;--drone-knowledge-tw-leading:initial;--drone-knowledge-tw-font-weight:initial;--drone-knowledge-tw-tracking:initial;--drone-knowledge-tw-ordinal:initial;--drone-knowledge-tw-slashed-zero:initial;--drone-knowledge-tw-numeric-figure:initial;--drone-knowledge-tw-numeric-spacing:initial;--drone-knowledge-tw-numeric-fraction:initial;--drone-knowledge-tw-shadow:0 0 #0000;--drone-knowledge-tw-shadow-color:initial;--drone-knowledge-tw-shadow-alpha:100%;--drone-knowledge-tw-inset-shadow:0 0 #0000;--drone-knowledge-tw-inset-shadow-color:initial;--drone-knowledge-tw-inset-shadow-alpha:100%;--drone-knowledge-tw-ring-color:initial;--drone-knowledge-tw-ring-shadow:0 0 #0000;--drone-knowledge-tw-inset-ring-color:initial;--drone-knowledge-tw-inset-ring-shadow:0 0 #0000;--drone-knowledge-tw-ring-inset:initial;--drone-knowledge-tw-ring-offset-width:0px;--drone-knowledge-tw-ring-offset-color:#fff;--drone-knowledge-tw-ring-offset-shadow:0 0 #0000;--drone-knowledge-tw-blur:initial;--drone-knowledge-tw-brightness:initial;--drone-knowledge-tw-contrast:initial;--drone-knowledge-tw-grayscale:initial;--drone-knowledge-tw-hue-rotate:initial;--drone-knowledge-tw-invert:initial;--drone-knowledge-tw-opacity:initial;--drone-knowledge-tw-saturate:initial;--drone-knowledge-tw-sepia:initial;--drone-knowledge-tw-drop-shadow:initial;--drone-knowledge-tw-drop-shadow-color:initial;--drone-knowledge-tw-drop-shadow-alpha:100%;--drone-knowledge-tw-drop-shadow-size:initial;--drone-knowledge-tw-duration:initial}}}@layer drone-knowledge-theme{:where(.drone-knowledge-ui),:where(.drone-knowledge-ui){--color-white:#fff;--spacing:.25rem;--container-2xl:42rem;--container-5xl:64rem;--text-xs:.75rem;--text-xs--line-height:calc(1 / .75);--text-sm:.875rem;--text-sm--line-height:calc(1.25 / .875);--text-base:1rem;--text-base--line-height:calc(1.5 / 1);--text-lg:1.125rem;--text-lg--line-height:calc(1.75 / 1.125);--font-weight-normal:400;--font-weight-medium:500;--font-weight-semibold:600;--tracking-wide:.025em;--leading-relaxed:1.625;--radius-2xl:1rem;--default-transition-duration:.15s;--default-transition-timing-function:cubic-bezier(.4, 0, .2, 1)}}@layer drone-knowledge-utilities{:where(.drone-knowledge-ui) .pointer-events-none{pointer-events:none}:where(.drone-knowledge-ui) .visible{visibility:visible}:where(.drone-knowledge-ui) .sr-only{clip-path:inset(50%);white-space:nowrap;border-width:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}:where(.drone-knowledge-ui) .absolute{position:absolute}:where(.drone-knowledge-ui) .fixed{position:fixed}:where(.drone-knowledge-ui) .relative{position:relative}:where(.drone-knowledge-ui) .sticky{position:sticky}:where(.drone-knowledge-ui) .inset-3{inset:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .top-0{top:0}:where(.drone-knowledge-ui) .top-2{top:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .top-3{top:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .top-16{top:calc(var(--spacing) * 16)}:where(.drone-knowledge-ui) .right-0{right:0}:where(.drone-knowledge-ui) .right-2{right:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .right-3{right:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .right-4{right:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .bottom-0{bottom:0}:where(.drone-knowledge-ui) .bottom-2{bottom:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .bottom-5{bottom:calc(var(--spacing) * 5)}:where(.drone-knowledge-ui) .bottom-12{bottom:calc(var(--spacing) * 12)}:where(.drone-knowledge-ui) .left-2{left:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .left-3{left:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .z-\\(--z-toast\\){z-index:var(--z-toast)}:where(.drone-knowledge-ui) .z-10{z-index:10}:where(.drone-knowledge-ui) .z-20{z-index:20}:where(.drone-knowledge-ui) .z-60{z-index:60}:where(.drone-knowledge-ui) .container{width:100%}@media (min-width:40rem){:where(.drone-knowledge-ui) .container{max-width:40rem}}@media (min-width:48rem){:where(.drone-knowledge-ui) .container{max-width:48rem}}@media (min-width:64rem){:where(.drone-knowledge-ui) .container{max-width:64rem}}@media (min-width:80rem){:where(.drone-knowledge-ui) .container{max-width:80rem}}@media (min-width:96rem){:where(.drone-knowledge-ui) .container{max-width:96rem}}:where(.drone-knowledge-ui) .mx-3{margin-inline:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .mx-auto{margin-inline:auto}:where(.drone-knowledge-ui) .my-1{margin-block:var(--spacing)}:where(.drone-knowledge-ui) .my-2{margin-block:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .my-3{margin-block:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .my-4{margin-block:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .mt-0\\.5{margin-top:calc(var(--spacing) * .5)}:where(.drone-knowledge-ui) .mt-1{margin-top:var(--spacing)}:where(.drone-knowledge-ui) .mt-2{margin-top:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .mt-3{margin-top:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .mt-4{margin-top:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .mt-5{margin-top:calc(var(--spacing) * 5)}:where(.drone-knowledge-ui) .mr-1{margin-right:var(--spacing)}:where(.drone-knowledge-ui) .-mb-px{margin-bottom:-1px}:where(.drone-knowledge-ui) .mb-1{margin-bottom:var(--spacing)}:where(.drone-knowledge-ui) .mb-2{margin-bottom:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .mb-3{margin-bottom:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .ml-1{margin-left:var(--spacing)}:where(.drone-knowledge-ui) .ml-2{margin-left:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .ml-auto{margin-left:auto}:where(.drone-knowledge-ui) .line-clamp-2{-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}:where(.drone-knowledge-ui) .block{display:block}:where(.drone-knowledge-ui) .contents{display:contents}:where(.drone-knowledge-ui) .flex{display:flex}:where(.drone-knowledge-ui) .grid{display:grid}:where(.drone-knowledge-ui) .hidden{display:none}:where(.drone-knowledge-ui) .inline{display:inline}:where(.drone-knowledge-ui) .inline-block{display:inline-block}:where(.drone-knowledge-ui) .h-1\\.5{height:calc(var(--spacing) * 1.5)}:where(.drone-knowledge-ui) .h-2{height:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .h-11{height:calc(var(--spacing) * 11)}:where(.drone-knowledge-ui) .h-\\[1px\\]{height:1px}:where(.drone-knowledge-ui) .h-\\[clamp\\(520px\\,68vh\\,760px\\)\\]{height:clamp(520px,68vh,760px)}:where(.drone-knowledge-ui) .h-full{height:100%}:where(.drone-knowledge-ui) .max-h-28{max-height:calc(var(--spacing) * 28)}:where(.drone-knowledge-ui) .max-h-36{max-height:calc(var(--spacing) * 36)}:where(.drone-knowledge-ui) .max-h-40{max-height:calc(var(--spacing) * 40)}:where(.drone-knowledge-ui) .max-h-44{max-height:calc(var(--spacing) * 44)}:where(.drone-knowledge-ui) .max-h-48{max-height:calc(var(--spacing) * 48)}:where(.drone-knowledge-ui) .max-h-52{max-height:calc(var(--spacing) * 52)}:where(.drone-knowledge-ui) .max-h-60{max-height:calc(var(--spacing) * 60)}:where(.drone-knowledge-ui) .max-h-64{max-height:calc(var(--spacing) * 64)}:where(.drone-knowledge-ui) .max-h-72{max-height:calc(var(--spacing) * 72)}:where(.drone-knowledge-ui) .max-h-80{max-height:calc(var(--spacing) * 80)}:where(.drone-knowledge-ui) .max-h-\\[22vh\\]{max-height:22vh}:where(.drone-knowledge-ui) .max-h-\\[28vh\\]{max-height:28vh}:where(.drone-knowledge-ui) .max-h-\\[32vh\\]{max-height:32vh}:where(.drone-knowledge-ui) .max-h-\\[38vh\\]{max-height:38vh}:where(.drone-knowledge-ui) .min-h-0{min-height:0}:where(.drone-knowledge-ui) .min-h-\\[220px\\]{min-height:220px}:where(.drone-knowledge-ui) .w-1\\.5{width:calc(var(--spacing) * 1.5)}:where(.drone-knowledge-ui) .w-2{width:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .w-3{width:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .w-12{width:calc(var(--spacing) * 12)}:where(.drone-knowledge-ui) .w-16{width:calc(var(--spacing) * 16)}:where(.drone-knowledge-ui) .w-\\[min\\(360px\\,calc\\(100\\%-24px\\)\\)\\]{width:min(360px,100% - 24px)}:where(.drone-knowledge-ui) .w-\\[min\\(420px\\,calc\\(100vw-32px\\)\\)\\]{width:min(420px,100vw - 32px)}:where(.drone-knowledge-ui) .w-full{width:100%}:where(.drone-knowledge-ui) .max-w-2xl{max-width:var(--container-2xl)}:where(.drone-knowledge-ui) .max-w-5xl{max-width:var(--container-5xl)}:where(.drone-knowledge-ui) .max-w-\\[1440px\\]{max-width:1440px}:where(.drone-knowledge-ui) .max-w-\\[calc\\(100\\%-24px\\)\\]{max-width:calc(100% - 24px)}:where(.drone-knowledge-ui) .max-w-full{max-width:100%}:where(.drone-knowledge-ui) .min-w-0{min-width:0}:where(.drone-knowledge-ui) .flex-1{flex:1}:where(.drone-knowledge-ui) .shrink-0{flex-shrink:0}:where(.drone-knowledge-ui) .transform{transform:var(--drone-knowledge-tw-rotate-x,) var(--drone-knowledge-tw-rotate-y,) var(--drone-knowledge-tw-rotate-z,) var(--drone-knowledge-tw-skew-x,) var(--drone-knowledge-tw-skew-y,)}:where(.drone-knowledge-ui) .cursor-pointer{cursor:pointer}:where(.drone-knowledge-ui) .touch-none{touch-action:none}:where(.drone-knowledge-ui) .list-none{list-style-type:none}:where(.drone-knowledge-ui) .grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}:where(.drone-knowledge-ui) .grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}:where(.drone-knowledge-ui) .grid-cols-\\[auto_1fr\\]{grid-template-columns:auto 1fr}:where(.drone-knowledge-ui) .grid-cols-\\[minmax\\(0\\,1fr\\)_auto\\]{grid-template-columns:minmax(0,1fr) auto}:where(.drone-knowledge-ui) .flex-col{flex-direction:column}:where(.drone-knowledge-ui) .flex-wrap{flex-wrap:wrap}:where(.drone-knowledge-ui) .items-center{align-items:center}:where(.drone-knowledge-ui) .items-start{align-items:flex-start}:where(.drone-knowledge-ui) .justify-between{justify-content:space-between}:where(.drone-knowledge-ui) .justify-end{justify-content:flex-end}:where(.drone-knowledge-ui) .gap-1{gap:var(--spacing)}:where(.drone-knowledge-ui) .gap-2{gap:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .gap-3{gap:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .gap-4{gap:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .gap-8{gap:calc(var(--spacing) * 8)}:where(.drone-knowledge-ui) :where(.space-y-0\\.5>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * .5) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * .5) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) :where(.space-y-1>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(var(--spacing) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(var(--spacing) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) :where(.space-y-2>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 2) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 2) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) :where(.space-y-3>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 3) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 3) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) :where(.space-y-4>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 4) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 4) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) :where(.space-y-6>:not(:last-child)){--drone-knowledge-tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 6) * var(--drone-knowledge-tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 6) * calc(1 - var(--drone-knowledge-tw-space-y-reverse)))}:where(.drone-knowledge-ui) .gap-x-3{column-gap:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .gap-y-1{row-gap:var(--spacing)}:where(.drone-knowledge-ui) .gap-y-2{row-gap:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) :where(.divide-y>:not(:last-child)){--drone-knowledge-tw-divide-y-reverse:0;border-bottom-style:var(--drone-knowledge-tw-border-style);border-top-style:var(--drone-knowledge-tw-border-style);border-top-width:calc(1px * var(--drone-knowledge-tw-divide-y-reverse));border-bottom-width:calc(1px * calc(1 - var(--drone-knowledge-tw-divide-y-reverse)))}:where(.drone-knowledge-ui) :where(.divide-border>:not(:last-child)){border-color:var(--color-border)}:where(.drone-knowledge-ui) .truncate{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}:where(.drone-knowledge-ui) .overflow-auto{overflow:auto}:where(.drone-knowledge-ui) .overflow-hidden{overflow:hidden}:where(.drone-knowledge-ui) .overflow-y-auto{overflow-y:auto}:where(.drone-knowledge-ui) .rounded{border-radius:.25rem}:where(.drone-knowledge-ui) .rounded-2xl{border-radius:var(--radius-2xl)}:where(.drone-knowledge-ui) .rounded-full{border-radius:3.40282e38px}:where(.drone-knowledge-ui) .rounded-lg{border-radius:10px}:where(.drone-knowledge-ui) .rounded-md{border-radius:8px}:where(.drone-knowledge-ui) .rounded-xl{border-radius:14px}:where(.drone-knowledge-ui) .border{border-style:var(--drone-knowledge-tw-border-style);border-width:1px}:where(.drone-knowledge-ui) .border-0{border-style:var(--drone-knowledge-tw-border-style);border-width:0}:where(.drone-knowledge-ui) .border-t{border-top-style:var(--drone-knowledge-tw-border-style);border-top-width:1px}:where(.drone-knowledge-ui) .border-b{border-bottom-style:var(--drone-knowledge-tw-border-style);border-bottom-width:1px}:where(.drone-knowledge-ui) .border-b-2{border-bottom-style:var(--drone-knowledge-tw-border-style);border-bottom-width:2px}:where(.drone-knowledge-ui) .border-l{border-left-style:var(--drone-knowledge-tw-border-style);border-left-width:1px}:where(.drone-knowledge-ui) .border-dashed{--drone-knowledge-tw-border-style:dashed;border-style:dashed}:where(.drone-knowledge-ui) .border-\\[var\\(--knowledge-edge\\)\\]{border-color:var(--knowledge-edge)}:where(.drone-knowledge-ui) .border-border{border-color:var(--color-border)}:where(.drone-knowledge-ui) .border-border-strong{border-color:var(--color-border-strong)}:where(.drone-knowledge-ui) .border-ink{border-color:var(--color-ink)}:where(.drone-knowledge-ui) .border-ink-faint{border-color:var(--color-ink-faint)}:where(.drone-knowledge-ui) .border-transparent{border-color:#0000}:where(.drone-knowledge-ui) .border-warn\\/30{border-color:var(--color-warn)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .border-warn\\/30{border-color:color-mix(in oklab, var(--color-warn) 30%, transparent)}}:where(.drone-knowledge-ui) .bg-\\[var\\(--highlight\\)\\]{background-color:var(--highlight)}:where(.drone-knowledge-ui) .bg-\\[var\\(--knowledge-edge\\)\\]{background-color:var(--knowledge-edge)}:where(.drone-knowledge-ui) .bg-err\\/8{background-color:var(--color-err)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-err\\/8{background-color:color-mix(in oklab, var(--color-err) 8%, transparent)}}:where(.drone-knowledge-ui) .bg-err\\/10{background-color:var(--color-err)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-err\\/10{background-color:color-mix(in oklab, var(--color-err) 10%, transparent)}}:where(.drone-knowledge-ui) .bg-hover,:where(.drone-knowledge-ui) .bg-hover\\/30{background-color:var(--color-hover)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-hover\\/30{background-color:color-mix(in oklab, var(--color-hover) 30%, transparent)}}:where(.drone-knowledge-ui) .bg-ink{background-color:var(--color-ink)}:where(.drone-knowledge-ui) .bg-ok,:where(.drone-knowledge-ui) .bg-ok\\/10{background-color:var(--color-ok)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-ok\\/10{background-color:color-mix(in oklab, var(--color-ok) 10%, transparent)}}:where(.drone-knowledge-ui) .bg-surface,:where(.drone-knowledge-ui) .bg-surface\\/40{background-color:var(--color-surface)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-surface\\/40{background-color:color-mix(in oklab, var(--color-surface) 40%, transparent)}}:where(.drone-knowledge-ui) .bg-surface\\/70{background-color:var(--color-surface)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-surface\\/70{background-color:color-mix(in oklab, var(--color-surface) 70%, transparent)}}:where(.drone-knowledge-ui) .bg-transparent{background-color:#0000}:where(.drone-knowledge-ui) .bg-warn,:where(.drone-knowledge-ui) .bg-warn\\/5{background-color:var(--color-warn)}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-warn\\/5{background-color:color-mix(in oklab, var(--color-warn) 5%, transparent)}}:where(.drone-knowledge-ui) .bg-white\\/10{background-color:#ffffff1a}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .bg-white\\/10{background-color:color-mix(in oklab, var(--color-white) 10%, transparent)}}:where(.drone-knowledge-ui) .p-1{padding:var(--spacing)}:where(.drone-knowledge-ui) .p-2{padding:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .p-3{padding:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .p-4{padding:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .p-5{padding:calc(var(--spacing) * 5)}:where(.drone-knowledge-ui) .p-6{padding:calc(var(--spacing) * 6)}:where(.drone-knowledge-ui) .px-1{padding-inline:var(--spacing)}:where(.drone-knowledge-ui) .px-2{padding-inline:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .px-3{padding-inline:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .px-4{padding-inline:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .px-5{padding-inline:calc(var(--spacing) * 5)}:where(.drone-knowledge-ui) .py-0\\.5{padding-block:calc(var(--spacing) * .5)}:where(.drone-knowledge-ui) .py-1{padding-block:var(--spacing)}:where(.drone-knowledge-ui) .py-2{padding-block:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .py-3{padding-block:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .py-4{padding-block:calc(var(--spacing) * 4)}:where(.drone-knowledge-ui) .pt-1{padding-top:var(--spacing)}:where(.drone-knowledge-ui) .pt-2{padding-top:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .pt-3{padding-top:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .pt-5{padding-top:calc(var(--spacing) * 5)}:where(.drone-knowledge-ui) .pb-2{padding-bottom:calc(var(--spacing) * 2)}:where(.drone-knowledge-ui) .pl-3{padding-left:calc(var(--spacing) * 3)}:where(.drone-knowledge-ui) .text-center{text-align:center}:where(.drone-knowledge-ui) .text-left{text-align:left}:where(.drone-knowledge-ui) .text-right{text-align:right}:where(.drone-knowledge-ui) .align-middle{vertical-align:middle}:where(.drone-knowledge-ui) .font-mono{font-family:ui-monospace,SF Mono,SFMono-Regular,JetBrains Mono,Menlo,Consolas,Liberation Mono,Noto Sans Mono CJK SC,monospace}:where(.drone-knowledge-ui) .text-base{font-size:var(--text-base);line-height:var(--drone-knowledge-tw-leading,var(--text-base--line-height))}:where(.drone-knowledge-ui) .text-lg{font-size:var(--text-lg);line-height:var(--drone-knowledge-tw-leading,var(--text-lg--line-height))}:where(.drone-knowledge-ui) .text-sm{font-size:var(--text-sm);line-height:var(--drone-knowledge-tw-leading,var(--text-sm--line-height))}:where(.drone-knowledge-ui) .text-xs{font-size:var(--text-xs);line-height:var(--drone-knowledge-tw-leading,var(--text-xs--line-height))}:where(.drone-knowledge-ui) .text-\\[11px\\]{font-size:11px}:where(.drone-knowledge-ui) .text-\\[12px\\]{font-size:12px}:where(.drone-knowledge-ui) .text-\\[13px\\]{font-size:13px}:where(.drone-knowledge-ui) .leading-6{--drone-knowledge-tw-leading:calc(var(--spacing) * 6);line-height:calc(var(--spacing) * 6)}:where(.drone-knowledge-ui) .leading-relaxed{--drone-knowledge-tw-leading:var(--leading-relaxed);line-height:var(--leading-relaxed)}:where(.drone-knowledge-ui) .font-medium{--drone-knowledge-tw-font-weight:var(--font-weight-medium);font-weight:var(--font-weight-medium)}:where(.drone-knowledge-ui) .font-normal{--drone-knowledge-tw-font-weight:var(--font-weight-normal);font-weight:var(--font-weight-normal)}:where(.drone-knowledge-ui) .font-semibold{--drone-knowledge-tw-font-weight:var(--font-weight-semibold);font-weight:var(--font-weight-semibold)}:where(.drone-knowledge-ui) .tracking-\\[0\\.08em\\]{--drone-knowledge-tw-tracking:.08em;letter-spacing:.08em}:where(.drone-knowledge-ui) .tracking-\\[0\\.12em\\]{--drone-knowledge-tw-tracking:.12em;letter-spacing:.12em}:where(.drone-knowledge-ui) .tracking-\\[0\\.16em\\]{--drone-knowledge-tw-tracking:.16em;letter-spacing:.16em}:where(.drone-knowledge-ui) .tracking-wide{--drone-knowledge-tw-tracking:var(--tracking-wide);letter-spacing:var(--tracking-wide)}:where(.drone-knowledge-ui) .break-words{overflow-wrap:break-word}:where(.drone-knowledge-ui) .break-all{word-break:break-all}:where(.drone-knowledge-ui) .whitespace-nowrap{white-space:nowrap}:where(.drone-knowledge-ui) .whitespace-pre-wrap{white-space:pre-wrap}:where(.drone-knowledge-ui) .text-err{color:var(--color-err)}:where(.drone-knowledge-ui) .text-ink{color:var(--color-ink)}:where(.drone-knowledge-ui) .text-ink-2{color:var(--color-ink-2)}:where(.drone-knowledge-ui) .text-ink-dim{color:var(--color-ink-dim)}:where(.drone-knowledge-ui) .text-ink-faint{color:var(--color-ink-faint)}:where(.drone-knowledge-ui) .text-link{color:var(--link)}:where(.drone-knowledge-ui) .text-ok{color:var(--color-ok)}:where(.drone-knowledge-ui) .text-on-ink{color:var(--color-on-ink)}:where(.drone-knowledge-ui) .text-warn{color:var(--color-warn)}:where(.drone-knowledge-ui) .text-white\\/80{color:#fffc}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .text-white\\/80{color:color-mix(in oklab, var(--color-white) 80%, transparent)}}:where(.drone-knowledge-ui) .text-white\\/90{color:#ffffffe6}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .text-white\\/90{color:color-mix(in oklab, var(--color-white) 90%, transparent)}}:where(.drone-knowledge-ui) .uppercase{text-transform:uppercase}:where(.drone-knowledge-ui) .tabular-nums{--drone-knowledge-tw-numeric-spacing:tabular-nums;font-variant-numeric:var(--drone-knowledge-tw-ordinal,) var(--drone-knowledge-tw-slashed-zero,) var(--drone-knowledge-tw-numeric-figure,) var(--drone-knowledge-tw-numeric-spacing,) var(--drone-knowledge-tw-numeric-fraction,)}:where(.drone-knowledge-ui) .underline{text-decoration-line:underline}:where(.drone-knowledge-ui) .opacity-60{opacity:.6}:where(.drone-knowledge-ui) .shadow-dialog{--drone-knowledge-tw-shadow:var(--shadow-dialog);box-shadow:var(--drone-knowledge-tw-inset-shadow), var(--drone-knowledge-tw-inset-ring-shadow), var(--drone-knowledge-tw-ring-offset-shadow), var(--drone-knowledge-tw-ring-shadow), var(--drone-knowledge-tw-shadow)}:where(.drone-knowledge-ui) .shadow-none{--drone-knowledge-tw-shadow:0 0 #0000;box-shadow:var(--drone-knowledge-tw-inset-shadow), var(--drone-knowledge-tw-inset-ring-shadow), var(--drone-knowledge-tw-ring-offset-shadow), var(--drone-knowledge-tw-ring-shadow), var(--drone-knowledge-tw-shadow)}:where(.drone-knowledge-ui) .ring{--drone-knowledge-tw-ring-shadow:var(--drone-knowledge-tw-ring-inset,) 0 0 0 calc(1px + var(--drone-knowledge-tw-ring-offset-width)) var(--drone-knowledge-tw-ring-color,currentcolor);box-shadow:var(--drone-knowledge-tw-inset-shadow), var(--drone-knowledge-tw-inset-ring-shadow), var(--drone-knowledge-tw-ring-offset-shadow), var(--drone-knowledge-tw-ring-shadow), var(--drone-knowledge-tw-shadow)}:where(.drone-knowledge-ui) .filter{filter:var(--drone-knowledge-tw-blur,) var(--drone-knowledge-tw-brightness,) var(--drone-knowledge-tw-contrast,) var(--drone-knowledge-tw-grayscale,) var(--drone-knowledge-tw-hue-rotate,) var(--drone-knowledge-tw-invert,) var(--drone-knowledge-tw-saturate,) var(--drone-knowledge-tw-sepia,) var(--drone-knowledge-tw-drop-shadow,)}:where(.drone-knowledge-ui) .transition{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--drone-knowledge-tw-gradient-from,--drone-knowledge-tw-gradient-via,--drone-knowledge-tw-gradient-to,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;transition-timing-function:var(--drone-knowledge-tw-ease,var(--default-transition-timing-function));transition-duration:var(--drone-knowledge-tw-duration,var(--default-transition-duration))}:where(.drone-knowledge-ui) .transition-colors{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--drone-knowledge-tw-gradient-from,--drone-knowledge-tw-gradient-via,--drone-knowledge-tw-gradient-to;transition-timing-function:var(--drone-knowledge-tw-ease,var(--default-transition-timing-function));transition-duration:var(--drone-knowledge-tw-duration,var(--default-transition-duration))}:where(.drone-knowledge-ui) .duration-200{--drone-knowledge-tw-duration:.2s;transition-duration:.2s}:where(.drone-knowledge-ui) .outline-none{--drone-knowledge-tw-outline-style:none;outline-style:none}:where(.drone-knowledge-ui) .select-none{-webkit-user-select:none;user-select:none}:where(.drone-knowledge-ui) .select-text{-webkit-user-select:text;user-select:text}:where(.drone-knowledge-ui) .focus-within\\:border-ink-faint:focus-within{border-color:var(--color-ink-faint)}@media (hover:hover){:where(.drone-knowledge-ui) .hover\\:bg-hover:hover{background-color:var(--color-hover)}:where(.drone-knowledge-ui) .hover\\:bg-white\\/20:hover{background-color:#fff3}@supports (color:color-mix(in lab, red, red)){:where(.drone-knowledge-ui) .hover\\:bg-white\\/20:hover{background-color:color-mix(in oklab, var(--color-white) 20%, transparent)}}:where(.drone-knowledge-ui) .hover\\:text-ink:hover{color:var(--color-ink)}:where(.drone-knowledge-ui) .hover\\:underline:hover{text-decoration-line:underline}}:where(.drone-knowledge-ui) .focus\\:border-accent:focus{border-color:var(--color-accent)}:where(.drone-knowledge-ui) .disabled\\:opacity-40:disabled{opacity:.4}@media (min-width:950px){:where(.drone-knowledge-ui) .min-\\[950px\\]\\:max-h-\\[52vh\\]{max-height:52vh}:where(.drone-knowledge-ui) .min-\\[950px\\]\\:grid-cols-\\[240px_minmax\\(0\\,1fr\\)\\]{grid-template-columns:240px minmax(0,1fr)}}@media (min-width:1100px){:where(.drone-knowledge-ui) .min-\\[1100px\\]\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:40rem){:where(.drone-knowledge-ui) .sm\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}:where(.drone-knowledge-ui) .sm\\:grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (min-width:48rem){:where(.drone-knowledge-ui) .md\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (min-width:64rem){:where(.drone-knowledge-ui) .lg\\:grid-cols-\\[minmax\\(0\\,1fr\\)_360px\\]{grid-template-columns:minmax(0,1fr) 360px}:where(.drone-knowledge-ui) .lg\\:grid-cols-\\[minmax\\(180px\\,0\\.35fr\\)_minmax\\(0\\,1fr\\)\\]{grid-template-columns:minmax(180px,.35fr) minmax(0,1fr)}}}@property --drone-knowledge-tw-rotate-x{syntax:"*";inherits:false}@property --drone-knowledge-tw-rotate-y{syntax:"*";inherits:false}@property --drone-knowledge-tw-rotate-z{syntax:"*";inherits:false}@property --drone-knowledge-tw-skew-x{syntax:"*";inherits:false}@property --drone-knowledge-tw-skew-y{syntax:"*";inherits:false}@property --drone-knowledge-tw-space-y-reverse{syntax:"*";inherits:false;initial-value:0}@property --drone-knowledge-tw-divide-y-reverse{syntax:"*";inherits:false;initial-value:0}@property --drone-knowledge-tw-border-style{syntax:"*";inherits:false;initial-value:solid}@property --drone-knowledge-tw-leading{syntax:"*";inherits:false}@property --drone-knowledge-tw-font-weight{syntax:"*";inherits:false}@property --drone-knowledge-tw-tracking{syntax:"*";inherits:false}@property --drone-knowledge-tw-ordinal{syntax:"*";inherits:false}@property --drone-knowledge-tw-slashed-zero{syntax:"*";inherits:false}@property --drone-knowledge-tw-numeric-figure{syntax:"*";inherits:false}@property --drone-knowledge-tw-numeric-spacing{syntax:"*";inherits:false}@property --drone-knowledge-tw-numeric-fraction{syntax:"*";inherits:false}@property --drone-knowledge-tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --drone-knowledge-tw-shadow-color{syntax:"*";inherits:false}@property --drone-knowledge-tw-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --drone-knowledge-tw-inset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --drone-knowledge-tw-inset-shadow-color{syntax:"*";inherits:false}@property --drone-knowledge-tw-inset-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --drone-knowledge-tw-ring-color{syntax:"*";inherits:false}@property --drone-knowledge-tw-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --drone-knowledge-tw-inset-ring-color{syntax:"*";inherits:false}@property --drone-knowledge-tw-inset-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --drone-knowledge-tw-ring-inset{syntax:"*";inherits:false}@property --drone-knowledge-tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0}@property --drone-knowledge-tw-ring-offset-color{syntax:"*";inherits:false;initial-value:#fff}@property --drone-knowledge-tw-ring-offset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --drone-knowledge-tw-blur{syntax:"*";inherits:false}@property --drone-knowledge-tw-brightness{syntax:"*";inherits:false}@property --drone-knowledge-tw-contrast{syntax:"*";inherits:false}@property --drone-knowledge-tw-grayscale{syntax:"*";inherits:false}@property --drone-knowledge-tw-hue-rotate{syntax:"*";inherits:false}@property --drone-knowledge-tw-invert{syntax:"*";inherits:false}@property --drone-knowledge-tw-opacity{syntax:"*";inherits:false}@property --drone-knowledge-tw-saturate{syntax:"*";inherits:false}@property --drone-knowledge-tw-sepia{syntax:"*";inherits:false}@property --drone-knowledge-tw-drop-shadow{syntax:"*";inherits:false}@property --drone-knowledge-tw-drop-shadow-color{syntax:"*";inherits:false}@property --drone-knowledge-tw-drop-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --drone-knowledge-tw-drop-shadow-size{syntax:"*";inherits:false}@property --drone-knowledge-tw-duration{syntax:"*";inherits:false}\n\n.drone-knowledge-ui {\n--knowledge-canvas: var(--color-canvas);\n--knowledge-surface: var(--color-surface);\n--knowledge-surface-muted: var(--color-hover);\n--knowledge-border: var(--color-border);\n--knowledge-border-strong: var(--color-border-strong);\n--knowledge-ink: var(--color-ink);\n--knowledge-ink-muted: var(--color-ink-dim);\n--knowledge-ink-faint: var(--color-ink-faint);\n--knowledge-accent: #2e6f8e;\n--knowledge-accent-soft: #e8f2f5;\n--knowledge-grid: #e6edf3;\n--knowledge-edge: #9bafbe;\n--knowledge-main: #b88a3a;\n--knowledge-directory: #9b7ac6;\n--knowledge-shadow: 0 10px 28px rgba(35, 58, 78, 0.08);\n--knowledge-shadow-soft: 0 3px 12px rgba(35, 58, 78, 0.07);\n}\n[data-theme="dark"] .drone-knowledge-ui {\n--knowledge-canvas: var(--color-canvas);\n--knowledge-surface: var(--color-surface);\n--knowledge-surface-muted: var(--color-hover);\n--knowledge-border: var(--color-border);\n--knowledge-border-strong: var(--color-border-strong);\n--knowledge-ink: var(--color-ink);\n--knowledge-ink-muted: var(--color-ink-dim);\n--knowledge-ink-faint: var(--color-ink-faint);\n--knowledge-accent: #7eb5c8;\n--knowledge-accent-soft: #263940;\n--knowledge-grid: #39434d;\n--knowledge-edge: #6f8190;\n--knowledge-main: #d4ad68;\n--knowledge-directory: #b899de;\n--knowledge-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);\n--knowledge-shadow-soft: 0 3px 12px rgba(0, 0, 0, 0.22);\n}\n.knowledge-view {\n--knowledge-shadow: 0 1px 2px rgba(35, 58, 78, 0.04);\n--knowledge-shadow-soft: none;\n}\n/* Migrated from Drone renderer styles at e5ec4f01. Domain selectors are owned by this package. */\n.panel-flow > .drone-knowledge-ui > [data-testid="knowledge-flow-card"] {\n	margin: 0 0 var(--space-3);\n	border-radius: var(--radius-lg);\n	box-shadow: var(--shadow-soft);\n}\n.panel-flow > .drone-knowledge-ui > [data-testid="knowledge-flow-card"]:not(.sunburst-flow-card) {\n	padding: var(--space-3) var(--space-3);\n}\n.knowledge-view {\n	display: flex;\n	min-height: 0;\n	min-width: 0;\n	flex: 1;\n	flex-direction: column;\n	background: var(--knowledge-canvas);\n	color: var(--knowledge-ink);\n}\n.knowledge-view-head {\n	flex: none;\n	display: flex;\n	align-items: center;\n	justify-content: space-between;\n	gap: var(--space-3);\n	padding: var(--space-3) var(--space-5);\n	border-bottom: 1px solid var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 94%, transparent);\n}\n.knowledge-view-close {\n	display: inline-flex;\n	align-items: center;\n	gap: var(--space-2);\n	border-radius: var(--radius-md);\n	padding: 5px 9px;\n	font-size: 12px;\n	color: var(--knowledge-ink-muted);\n	transition:\n		background-color 0.15s,\n		color 0.15s;\n}\n.knowledge-view-close:hover {\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-ink);\n}\n.knowledge-view-body {\n	min-height: 0;\n	flex: 1;\n	overflow-y: auto;\n	padding: var(--space-4) var(--space-5) var(--space-10);\n	background:\n		linear-gradient(180deg, color-mix(in srgb, var(--knowledge-surface) 76%, transparent), transparent 190px),\n		var(--knowledge-canvas);\n}\n.knowledge-view-body > div {\n	/* Same content width as PageShell (max-w-5xl). */\n	max-width: 64rem;\n}\n.knowledge-home,\n.knowledge-panel {\n	color: var(--knowledge-ink);\n}\n.knowledge-home > section,\n.knowledge-panel > section,\n.knowledge-panel .knowledge-card {\n	border-color: var(--knowledge-border);\n	background: var(--knowledge-surface);\n	box-shadow: var(--knowledge-shadow);\n}\n.knowledge-home > section,\n.knowledge-panel > section {\n	border-radius: var(--radius-xl);\n}\n.knowledge-home [data-testid="knowledge-graph"] {\n	min-width: 0;\n}\n.knowledge-panel > header {\n	padding: 2px 2px var(--space-2);\n}\n.knowledge-panel [role="tablist"] {\n	border-color: var(--knowledge-border);\n	gap: 3px;\n}\n.knowledge-panel [role="tab"] {\n	border-radius: var(--radius-md);\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-panel [role="tab"][aria-selected="true"] {\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-accent);\n}\n.knowledge-panel [role="tab"]:focus-visible,\n.knowledge-home button:focus-visible,\n.knowledge-panel button:focus-visible,\n.knowledge-cloud-section input:focus-visible,\n.knowledge-cloud-section button:focus-visible {\n	outline: 2px solid color-mix(in srgb, var(--knowledge-accent) 72%, white);\n	outline-offset: 2px;\n}\n.knowledge-cloud-section {\n	border: 1px solid var(--knowledge-border);\n	border-radius: var(--radius-xl);\n	background: var(--knowledge-surface);\n	box-shadow: var(--knowledge-shadow);\n	padding: var(--space-4);\n}\n.knowledge-cloud-section input,\n.knowledge-cloud-section select {\n	border-color: var(--knowledge-border);\n	background: var(--knowledge-surface-muted);\n	color: var(--knowledge-ink);\n}\n.knowledge-cloud-section input::placeholder {\n	color: var(--knowledge-ink-faint);\n}\n.knowledge-cloud-section ul,\n.knowledge-cloud-section [class*="rounded-md border"] {\n	border-color: var(--knowledge-border);\n}\n.knowledge-cloud-section pre {\n	border: 1px solid var(--knowledge-border);\n	background: var(--knowledge-surface-muted);\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-cloud-section [role="status"] {\n	font-weight: 600;\n}\n.knowledge-nebula canvas.sigma-nodes {\n	filter: drop-shadow(0 0 3px color-mix(in srgb, var(--knowledge-accent) 55%, transparent))\n		drop-shadow(0 0 8px color-mix(in srgb, var(--knowledge-accent) 25%, transparent));\n}\n.knowledge-observatory {\n	--knowledge-chart-ink: var(--knowledge-ink);\n	--knowledge-chart-muted: var(--knowledge-ink-muted);\n	min-width: 0;\n}\n.knowledge-network-layout {\n	display: grid;\n	grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);\n	gap: var(--space-4);\n	align-items: start;\n}\n.knowledge-network-changes {\n	min-width: 0;\n	border: 1px solid var(--knowledge-border);\n	border-radius: var(--radius-lg);\n	background: var(--knowledge-surface);\n	box-shadow: var(--knowledge-shadow-soft);\n	color: var(--knowledge-ink);\n}\n.knowledge-network-changes-head {\n	display: flex;\n	align-items: center;\n	justify-content: space-between;\n	gap: var(--space-2);\n	border-bottom: 1px solid var(--knowledge-border);\n	padding: var(--space-3) var(--space-4);\n}\n.knowledge-network-changes-head h2 {\n	margin: 0;\n	font-size: 13px;\n	font-weight: 650;\n}\n.knowledge-live-indicator {\n	display: inline-flex;\n	align-items: center;\n	gap: 5px;\n	color: var(--knowledge-ink-muted);\n	font-size: 10px;\n	white-space: nowrap;\n}\n.knowledge-live-indicator i {\n	display: inline-block;\n	width: 7px;\n	height: 7px;\n	border-radius: 999px;\n	background: var(--color-ok);\n}\n.knowledge-network-changes-list {\n	margin: 0;\n	padding: 0 var(--space-4);\n	list-style: none;\n}\n.knowledge-network-change {\n	min-width: 0;\n	padding: var(--space-3) 0;\n	border-bottom: 1px solid var(--knowledge-border);\n}\n.knowledge-network-change:last-child {\n	border-bottom: 0;\n}\n.knowledge-network-change-title,\n.knowledge-network-change-source {\n	display: block;\n	min-width: 0;\n	overflow: hidden;\n	text-overflow: ellipsis;\n	white-space: nowrap;\n}\n.knowledge-network-change-title {\n	font-size: 12px;\n	font-weight: 600;\n}\n.knowledge-network-change-source {\n	margin-top: 4px;\n	color: var(--knowledge-ink-muted);\n	font-size: 10px;\n	line-height: 1.3;\n}\n.knowledge-network-changes-empty {\n	margin: 0;\n	padding: var(--space-4);\n	color: var(--knowledge-ink-muted);\n	font-size: 11px;\n}\n.knowledge-observatory-canvas {\n	min-height: clamp(520px, 68vh, 760px);\n	border: 1px solid var(--knowledge-border);\n	background:\n		linear-gradient(180deg, color-mix(in srgb, var(--knowledge-surface) 85%, transparent), transparent 180px),\n		var(--knowledge-surface);\n	box-shadow: var(--knowledge-shadow);\n}\n.knowledge-graph-canvas-tools {\n	pointer-events: none;\n}\n.knowledge-graph-canvas-tools > * {\n	pointer-events: auto;\n}\n.knowledge-graph-observatory-label,\n.knowledge-graph-controls {\n	border: 1px solid var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 94%, transparent);\n	box-shadow: var(--knowledge-shadow-soft);\n	backdrop-filter: blur(8px);\n}\n.knowledge-graph-observatory-label {\n	color: var(--knowledge-ink-muted);\n	font-weight: 600;\n	letter-spacing: 0.01em;\n}\n.knowledge-graph-toolbar > button,\n.knowledge-graph-toolbar label,\n.knowledge-graph-toolbar span > button {\n	min-height: 32px;\n}\n.knowledge-graph-zoom-button,\n.knowledge-graph-fit-button {\n	display: inline-flex;\n	min-height: 32px;\n	align-items: center;\n	justify-content: center;\n	border-radius: var(--radius-sm);\n	color: var(--knowledge-ink-muted);\n	font-size: 12px;\n	line-height: 1;\n	transition:\n		background-color 0.15s,\n		color 0.15s,\n		transform 0.15s;\n}\n.knowledge-graph-zoom-button {\n	width: 32px;\n	font-size: 18px;\n}\n.knowledge-graph-fit-button {\n	padding: 0 var(--space-3);\n	font-size: 11px;\n}\n.knowledge-graph-zoom-button:hover,\n.knowledge-graph-fit-button:hover {\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-accent);\n}\n.knowledge-graph-zoom-button:active,\n.knowledge-graph-fit-button:active {\n	transform: scale(0.95);\n}\n.knowledge-graph-zoom-value {\n	min-width: 42px;\n	color: var(--knowledge-ink-muted);\n	font:\n		10px ui-monospace,\n		SFMono-Regular,\n		Menlo,\n		monospace;\n	text-align: center;\n}\n.knowledge-graph-scene {\n	transform-box: fill-box;\n	transform-origin: center;\n}\n.knowledge-graph-svg {\n	overscroll-behavior: contain;\n	background: transparent;\n}\n.knowledge-graph-axis-labels {\n	fill: var(--knowledge-ink-faint);\n	font-size: 11px;\n	opacity: 0.85;\n}\n.knowledge-graph-legend {\n	border: 1px solid var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 94%, transparent);\n	box-shadow: var(--knowledge-shadow-soft);\n	color: var(--knowledge-ink-muted);\n	line-height: 1.2;\n	backdrop-filter: blur(8px);\n}\n.knowledge-graph-legend-main {\n	border-color: var(--knowledge-main);\n}\n.knowledge-graph-legend-directory {\n	border-color: var(--knowledge-directory);\n}\n.knowledge-graph-category-filter {\n	display: inline-flex;\n	align-items: center;\n	gap: var(--space-1);\n	border: 1px solid transparent;\n	border-radius: 999px;\n	padding: 2px 7px;\n	color: var(--knowledge-ink-muted);\n	transition:\n		border-color 160ms ease,\n		background-color 160ms ease,\n		color 160ms ease;\n}\n.knowledge-graph-category-filter i {\n	display: inline-block;\n	height: 7px;\n	width: 7px;\n	border-radius: 999px;\n}\n.knowledge-graph-category-filter:hover,\n.knowledge-graph-category-filter.is-active {\n	border-color: color-mix(in srgb, var(--knowledge-accent) 38%, var(--knowledge-border));\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-accent);\n}\n.knowledge-graph-edge {\n	transition:\n		stroke-opacity 0.2s,\n		stroke-width 0.2s;\n}\n.knowledge-graph-edge--active {\n	stroke-dasharray: 3 7;\n	animation: knowledge-graph-flow 1.8s linear infinite;\n}\n.knowledge-graph-edge--fresh {\n	animation: knowledge-graph-fresh 0.7s ease-in-out 3;\n}\n.knowledge-graph-node-aura {\n	animation: knowledge-graph-pulse 3.2s ease-in-out infinite;\n}\n.knowledge-graph-node-aura--fresh {\n	animation: knowledge-graph-fresh 0.7s ease-in-out 3;\n}\n.knowledge-graph-selection-halo {\n	animation: knowledge-graph-selection 1.8s ease-in-out infinite;\n}\n.knowledge-node-drawer {\n	border: 1px solid var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 96%, transparent);\n	box-shadow: var(--knowledge-shadow);\n	color: var(--knowledge-ink);\n	backdrop-filter: blur(12px);\n	opacity: 0;\n	pointer-events: none;\n	transform: translateX(calc(100% + 24px));\n}\n.knowledge-node-drawer.is-open {\n	opacity: 1;\n	pointer-events: auto;\n	transform: translateX(0);\n}\n@keyframes knowledge-graph-flow {\n	to {\n		stroke-dashoffset: -20;\n	}\n}\n@keyframes knowledge-graph-pulse {\n	0%,\n	100% {\n		opacity: 0.12;\n	}\n	50% {\n		opacity: 0.28;\n	}\n}\n@keyframes knowledge-graph-fresh {\n	0%,\n	100% {\n		opacity: 0.35;\n	}\n	50% {\n		opacity: 0.95;\n	}\n}\n@keyframes knowledge-graph-selection {\n	0%,\n	100% {\n		stroke-opacity: 0.28;\n		transform: scale(1);\n	}\n	50% {\n		stroke-opacity: 0.7;\n		transform: scale(1.12);\n	}\n}\n@media (max-width: 760px) {\n	.knowledge-network-layout {\n		grid-template-columns: minmax(0, 1fr);\n	}\n	.knowledge-node-drawer {\n		top: auto;\n		bottom: 12px;\n		left: 12px;\n		width: calc(100% - 24px);\n		max-height: min(62%, 420px);\n		transform: translateY(calc(100% + 24px));\n	}\n	.knowledge-node-drawer.is-open {\n		transform: translateY(0);\n	}\n}\n@media (prefers-reduced-motion: reduce) {\n	.knowledge-graph-edge--active,\n	.knowledge-graph-edge--fresh,\n	.knowledge-graph-node-aura,\n	.knowledge-graph-node-aura--fresh,\n	.knowledge-graph-selection-halo {\n		animation: none;\n	}\n}\n.knowledge-graph-toolbar > button,\n.knowledge-graph-toolbar label,\n.knowledge-graph-toolbar span > button {\n	min-height: 32px;\n}\n.knowledge-graph-zoom-button,\n.knowledge-graph-fit-button {\n	display: inline-flex;\n	min-height: 32px;\n	align-items: center;\n	justify-content: center;\n	border-radius: var(--radius-sm);\n	color: #dce7ff;\n	font-size: 12px;\n	line-height: 1;\n	transition:\n		background-color 0.15s,\n		color 0.15s,\n		transform 0.15s;\n}\n.knowledge-graph-zoom-button {\n	width: 32px;\n	font-size: 18px;\n}\n.knowledge-graph-fit-button {\n	padding: 0 var(--space-3);\n	font-size: 11px;\n}\n.knowledge-graph-zoom-button:hover,\n.knowledge-graph-fit-button:hover {\n	background: rgba(124, 151, 216, 0.22);\n	color: #fff;\n}\n.knowledge-graph-zoom-button:active,\n.knowledge-graph-fit-button:active {\n	transform: scale(0.95);\n}\n.knowledge-graph-zoom-value {\n	min-width: 42px;\n	color: #aabde6;\n	font:\n		10px ui-monospace,\n		SFMono-Regular,\n		Menlo,\n		monospace;\n	text-align: center;\n}\n.knowledge-graph-scene {\n	transform-box: fill-box;\n	transform-origin: center;\n}\n.knowledge-graph-svg {\n	overscroll-behavior: contain;\n}\n.knowledge-graph-legend {\n	line-height: 1.2;\n}\n.knowledge-graph-category-filter {\n	display: inline-flex;\n	align-items: center;\n	gap: var(--space-1);\n	border: 1px solid transparent;\n	border-radius: 999px;\n	padding: 2px 7px;\n	color: #8494b3;\n	transition:\n		border-color 160ms ease,\n		background-color 160ms ease,\n		color 160ms ease;\n}\n.knowledge-graph-category-filter i {\n	display: inline-block;\n	height: 7px;\n	width: 7px;\n	border-radius: 999px;\n}\n.knowledge-graph-category-filter:hover,\n.knowledge-graph-category-filter.is-active {\n	border-color: #526a9f;\n	background: #192844;\n	color: #dce7ff;\n}\n.knowledge-graph-edge {\n	transition:\n		stroke-opacity 0.2s,\n		stroke-width 0.2s;\n}\n.knowledge-graph-edge--active {\n	stroke-dasharray: 3 7;\n	animation: knowledge-graph-flow 1.8s linear infinite;\n}\n.knowledge-graph-node-aura {\n	animation: knowledge-graph-pulse 3.2s ease-in-out infinite;\n}\n.knowledge-graph-selection-halo {\n	animation: knowledge-graph-selection 1.8s ease-in-out infinite;\n}\n.knowledge-node-drawer {\n	opacity: 0;\n	pointer-events: none;\n	transform: translateX(calc(100% + 24px));\n}\n.knowledge-node-drawer.is-open {\n	opacity: 1;\n	pointer-events: auto;\n	transform: translateX(0);\n}\n@keyframes knowledge-graph-flow {\n	to {\n		stroke-dashoffset: -20;\n	}\n}\n@keyframes knowledge-graph-pulse {\n	0%,\n	100% {\n		opacity: 0.12;\n	}\n	50% {\n		opacity: 0.28;\n	}\n}\n@keyframes knowledge-graph-selection {\n	0%,\n	100% {\n		stroke-opacity: 0.28;\n		transform: scale(1);\n	}\n	50% {\n		stroke-opacity: 0.7;\n		transform: scale(1.12);\n	}\n}\n@media (max-width: 760px) {\n	.knowledge-node-drawer {\n		top: auto;\n		bottom: 12px;\n		left: 12px;\n		width: calc(100% - 24px);\n		max-height: min(62%, 420px);\n		transform: translateY(calc(100% + 24px));\n	}\n	.knowledge-node-drawer.is-open {\n		transform: translateY(0);\n	}\n}\n@media (prefers-reduced-motion: reduce) {\n	.knowledge-graph-edge--active,\n	.knowledge-graph-node-aura,\n	.knowledge-graph-selection-halo {\n		animation: none;\n	}\n}\n.knowledge-state-card {\n	border-color: var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 92%, transparent);\n	box-shadow: var(--knowledge-shadow-soft);\n}\n.knowledge-state-card--error {\n	border-color: color-mix(in srgb, var(--color-err) 38%, var(--knowledge-border));\n	background: color-mix(in srgb, var(--color-err) 7%, var(--knowledge-surface));\n}\n.knowledge-graph-svg :where(g[role="button"]):focus-visible {\n	outline: 2px solid var(--knowledge-accent);\n	outline-offset: 4px;\n}\n.knowledge-graph-svg :where(g[role="button"]):focus-visible circle:last-of-type {\n	stroke: var(--knowledge-accent);\n	stroke-width: 3;\n}\n.knowledge-observatory-canvas .knowledge-graph-node-aura {\n	animation: none;\n}\n.knowledge-observatory-canvas .knowledge-graph-node-aura--fresh {\n	animation: knowledge-graph-fresh 0.7s ease-in-out 3;\n}\n.knowledge-graph-live-toggle {\n	border: 1px solid var(--knowledge-border);\n	background: color-mix(in srgb, var(--knowledge-surface) 92%, transparent);\n	color: var(--knowledge-ink);\n	pointer-events: auto;\n}\n.knowledge-graph-live-dot {\n	width: 7px;\n	height: 7px;\n	border-radius: 999px;\n	background: #059669;\n	animation: knowledge-graph-live-blink 2s ease-in-out infinite;\n}\n.knowledge-graph-live-dot--paused {\n	background: var(--knowledge-ink-muted);\n	animation: none;\n}\n@keyframes knowledge-graph-live-blink {\n	50% {\n		opacity: 0.35;\n	}\n}\n@media (prefers-reduced-motion: reduce) {\n	.knowledge-observatory-canvas .knowledge-graph-node-aura--fresh,\n	.knowledge-graph-selection-halo,\n	.knowledge-graph-live-dot {\n		animation: none;\n	}\n}\n[data-testid="knowledge-network"] {\n	container-type: inline-size;\n}\n@container (max-width: 1000px) {\n	.knowledge-network-layout {\n		grid-template-columns: minmax(0, 1fr);\n	}\n}\n.knowledge-view-head {\n	border-bottom-color: transparent;\n	background: transparent;\n	padding: var(--space-4) var(--space-6) var(--space-2);\n}\n.knowledge-view-body {\n	/* Same frame as PageShell (px-8 pt-8 pb-12) so first-level pages line up. */\n	padding: 2rem 2rem 3rem;\n	background: var(--knowledge-canvas);\n}\n.knowledge-home > section:first-child {\n	box-shadow: none;\n	border-color: var(--knowledge-border);\n	background: var(--knowledge-surface);\n}\n.knowledge-view {\n	--knowledge-shadow: 0 1px 2px rgba(35, 58, 78, 0.04);\n	--knowledge-shadow-soft: none;\n}\n.knowledge-home :is(section, article) :is(section, article, div).rounded-xl.border,\n.knowledge-home :is(section, article) :is(section, article, div).rounded-lg.border {\n	border-color: transparent;\n	background: var(--knowledge-surface-muted);\n	box-shadow: none;\n}\n.knowledge-network-header {\n	display: flex;\n	align-items: flex-end;\n	justify-content: space-between;\n	gap: var(--space-4);\n	padding: var(--space-1) var(--space-1) var(--space-2);\n}\n.knowledge-network-eyebrow {\n	margin: 0 0 3px;\n	font-size: 10px;\n	font-weight: 600;\n	letter-spacing: 0.14em;\n	text-transform: uppercase;\n	color: var(--knowledge-accent);\n}\n.knowledge-network-title {\n	margin: 0;\n	font-size: 16px;\n	font-weight: 600;\n	letter-spacing: -0.015em;\n	color: var(--knowledge-ink);\n}\n.knowledge-network-hint {\n	max-width: 620px;\n	margin: 4px 0 0;\n	font-size: 11px;\n	line-height: 1.55;\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-network-stats {\n	display: flex;\n	flex-wrap: wrap;\n	justify-content: flex-end;\n	gap: var(--space-2);\n	font-size: 11px;\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-network-header .knowledge-network-stats span {\n	border: 1px solid var(--knowledge-border);\n	border-radius: 999px;\n	background: var(--knowledge-surface-muted);\n	padding: 4px 9px;\n	white-space: nowrap;\n}\n.knowledge-network-stats strong {\n	font-variant-numeric: tabular-nums;\n	color: var(--knowledge-ink);\n}\n.knowledge-observatory-canvas {\n	background:\n		radial-gradient(\n			circle at 18% 16%,\n			color-mix(in srgb, var(--knowledge-accent) 7%, transparent),\n			transparent 32%\n		),\n		linear-gradient(180deg, var(--knowledge-surface), var(--knowledge-canvas));\n}\n.knowledge-graph-controls,\n.knowledge-graph-observatory-label,\n.knowledge-graph-legend {\n	background: color-mix(in srgb, var(--knowledge-surface) 96%, transparent);\n}\n.knowledge-graph-zoom-button,\n.knowledge-graph-fit-button {\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-graph-zoom-button:hover,\n.knowledge-graph-fit-button:hover {\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-accent);\n}\n.knowledge-graph-category-filter {\n	color: var(--knowledge-ink-muted);\n}\n.knowledge-graph-category-filter:hover,\n.knowledge-graph-category-filter.is-active {\n	border-color: color-mix(in srgb, var(--knowledge-accent) 38%, var(--knowledge-border));\n	background: var(--knowledge-accent-soft);\n	color: var(--knowledge-accent);\n}\n@media (max-width: 760px) {\n	.knowledge-network-header {\n		align-items: flex-start;\n		flex-direction: column;\n	}\n	.knowledge-network-stats {\n		justify-content: flex-start;\n	}\n}\n';

// ui/entry.tsx
import { jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
function Styles() {
  return /* @__PURE__ */ jsx12("style", { "data-drone-knowledge-styles": true, children: knowledgeStyles });
}
function KnowledgePage() {
  return /* @__PURE__ */ jsxs12("div", { className: "drone-knowledge-ui", style: { display: "flex", flex: 1, minWidth: 0, minHeight: 0 }, children: [
    /* @__PURE__ */ jsx12(Styles, {}),
    /* @__PURE__ */ jsx12(NativeKnowledgePage, {})
  ] });
}
function KnowledgeSurface(props) {
  if (props.kind === "settings" && [void 0, "reviews", "settings", "semantic"].includes(props.context?.tab)) {
    return /* @__PURE__ */ jsxs12("div", { className: "drone-knowledge-ui", children: [
      /* @__PURE__ */ jsx12(Styles, {}),
      /* @__PURE__ */ jsx12(NativeKnowledgePage, { initialView: props.context?.tab === "reviews" ? "reviews" : "settings" })
    ] });
  }
  return /* @__PURE__ */ jsxs12("div", { className: "drone-knowledge-ui", children: [
    /* @__PURE__ */ jsx12(Styles, {}),
    /* @__PURE__ */ jsx12(NativeKnowledgeUnavailable, {})
  ] });
}
export {
  KnowledgePage,
  KnowledgeSurface
};
