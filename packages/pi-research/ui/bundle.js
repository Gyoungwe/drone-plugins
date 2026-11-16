// ui/src/index.tsx
import { memo } from "react";

// ui/src/ResearchRunsCard.tsx
import { useEffect, useState } from "react";

// ui/src/research-runs-copy.ts
var researchRunsCopy = {
  en: {
    title: "Research runs and route",
    hint: "See preparation, current route, sources and claims in this panel.",
    loading: "Loading research runs\u2026",
    empty: "No research runs are available for this project yet.",
    answerable: "Ready to answer",
    inProgress: "In progress",
    archive: "Archived / reused",
    sources: "Sources",
    claims: "Claims",
    coverage: "Coverage",
    recorded: "Recorded",
    unknown: "Pending",
    integrity: "Integrity",
    routeHint: "Only observed nodes are complete; unused branches stay pending. Click a source to preview it.",
    unverified: "Research records do not verify scientific conclusions.",
    provenance: "Sources & reproducibility",
    gaps: "Evidence gaps",
    timeline: "Observed events",
    governance: "Governance alerts",
    duplicates: "duplicates",
    stale: "stale/retracted",
    unavailable: "unavailable"
  },
  zh: {
    title: "\u7814\u7A76\u8FD0\u884C\u4E0E\u8DEF\u7EBF",
    hint: "\u5728\u540C\u4E00\u4E2A\u9762\u677F\u91CC\u67E5\u770B\u51C6\u5907\u3001\u5F53\u524D\u8DEF\u7531\u3001\u6765\u6E90\u548C\u4E3B\u5F20\u8986\u76D6\u3002",
    loading: "\u6B63\u5728\u8BFB\u53D6\u7814\u7A76\u8FD0\u884C\u2026",
    empty: "\u5F53\u524D\u9879\u76EE\u8FD8\u6CA1\u6709\u53EF\u5C55\u793A\u7684\u7814\u7A76\u8FD0\u884C\u3002",
    answerable: "\u5DF2\u6EE1\u8DB3\u56DE\u7B54\u6761\u4EF6",
    inProgress: "\u4ECD\u5728\u8FDB\u884C",
    archive: "\u5DF2\u5F52\u6863 / \u5DF2\u590D\u7528",
    sources: "\u6765\u6E90\u6570",
    claims: "\u4E3B\u5F20\u6570",
    coverage: "\u8986\u76D6\u7387",
    recorded: "\u5DF2\u8BB0\u5F55",
    unknown: "\u5F85\u8BB0\u5F55",
    integrity: "\u5B8C\u6574\u6027",
    routeHint: "\u8DEF\u7EBF\u53EA\u6807\u8BB0\u5B9E\u9645\u53D1\u751F\u8FC7\u7684\u8282\u70B9\uFF1B\u5206\u652F\u6CA1\u6709\u53D1\u751F\u65F6\u4FDD\u6301\u5F85\u5904\u7406\u3002\u70B9\u51FB\u6765\u6E90\u53EF\u9884\u89C8\u3002",
    unverified: "\u7814\u7A76\u8BB0\u5F55\u4E0D\u4EE3\u8868\u79D1\u5B66\u7ED3\u8BBA\u5DF2\u9A8C\u8BC1\u3002",
    provenance: "\u6765\u6E90\u4E0E\u590D\u73B0",
    gaps: "\u8BC1\u636E\u7F3A\u53E3",
    timeline: "\u5B9E\u9645\u4E8B\u4EF6",
    governance: "\u7814\u7A76\u8BB0\u5F55\u63D0\u9192",
    duplicates: "\u91CD\u590D",
    stale: "\u8FC7\u671F\u6216\u5DF2\u64A4\u7A3F",
    unavailable: "\u4E0D\u53EF\u7528"
  }
};

// ui/src/ResearchRunsCard.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function host() {
  return window.DroneUI;
}
function useRuns(runtime2, project) {
  const [runs, setRuns] = useState([]);
  const [runId, select] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    void runtime2.invoke("listRuns", { project, limit: 8 }).then(
      (result) => {
        if (!live) return;
        const { items } = result;
        setRuns(items);
        select(items.length ? items[0].runId : null);
        setLoading(false);
      },
      (cause) => {
        if (!live) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      }
    );
    return () => {
      live = false;
    };
  }, [runtime2, project]);
  return { runs, runId, select, loading, error };
}
function useRunDetail(runtime2, runId) {
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!runId) return;
    let live = true;
    setSelected(null);
    setLoading(true);
    setError(null);
    void runtime2.invoke("detail", { runId }).then(
      (result) => {
        if (!live) return;
        setSelected(result);
        setLoading(false);
      },
      (cause) => {
        if (!live) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      }
    );
    return () => {
      live = false;
    };
  }, [runtime2, runId]);
  return { selected, loading, error };
}
function RunList({
  runs,
  runId,
  select
}) {
  return /* @__PURE__ */ jsx("div", { className: "space-y-1", children: runs.map((run) => /* @__PURE__ */ jsxs(
    "button",
    {
      type: "button",
      "aria-pressed": runId === run.runId,
      onClick: () => select(run.runId),
      className: `w-full rounded-lg border px-3 py-2 text-left text-xs ${runId === run.runId ? "border-ink-faint bg-[var(--highlight)]" : "border-border hover:bg-hover"}`,
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsx("span", { className: "truncate font-medium", children: run.resultSlug }),
          /* @__PURE__ */ jsx("span", { className: "text-[11px] text-ink-faint", children: run.stage })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 line-clamp-2 text-xs text-ink-dim", children: run.query || run.runId })
      ]
    },
    run.runId
  )) });
}
function RunSummary({ run, t }) {
  const { RoadmapLane } = host().components;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "rounded-lg bg-hover px-3 py-2 text-xs", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-x-3 gap-y-1", children: [
        /* @__PURE__ */ jsx("strong", { children: run.runId }),
        /* @__PURE__ */ jsx("span", { children: run.status }),
        /* @__PURE__ */ jsxs("span", { children: [
          t.archive,
          ": ",
          run.archive.count + run.archive.reused
        ] }),
        /* @__PURE__ */ jsxs("span", { children: [
          t.integrity,
          ": ",
          run.integrity ? `${run.integrity.verified}/${run.integrity.checked}` : t.unknown
        ] })
      ] }),
      /* @__PURE__ */ jsx("p", { className: "mt-1 text-ink-dim", children: run.query })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "mt-3", children: /* @__PURE__ */ jsx(
      RoadmapLane,
      {
        testId: "research-route",
        nodes: run.route.map((node) => ({
          key: node.key,
          label: node.key,
          status: host().helpers.roadmapStatus(node.state),
          detail: node.state
        }))
      }
    ) }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-ink-dim", children: t.routeHint }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-ink-dim", children: t.unverified })
  ] });
}
function RunHistory({ run, t }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    run.gaps && run.gaps.length > 0 && /* @__PURE__ */ jsxs("p", { className: "mt-2 text-xs text-warn", children: [
      t.gaps,
      ": ",
      run.gaps.join(" \xB7 ")
    ] }),
    run.governance && run.governance.duplicateSources.length + run.governance.staleSources.length + run.governance.unavailableSources.length > 0 && /* @__PURE__ */ jsxs("p", { className: "mt-2 text-xs text-warn", children: [
      t.governance,
      ": ",
      run.governance.duplicateSources.length,
      " ",
      t.duplicates,
      ",",
      " ",
      run.governance.staleSources.length,
      " ",
      t.stale,
      ", ",
      run.governance.unavailableSources.length,
      " ",
      t.unavailable
    ] }),
    run.timeline && run.timeline.length > 0 && /* @__PURE__ */ jsxs("details", { className: "mt-2 text-xs", children: [
      /* @__PURE__ */ jsxs("summary", { className: "cursor-pointer font-medium", children: [
        t.timeline,
        " (",
        run.timeline.length,
        ")"
      ] }),
      /* @__PURE__ */ jsx("ol", { className: "mt-2 space-y-1 border-l border-border pl-3", children: run.timeline.slice(-12).map((event) => /* @__PURE__ */ jsxs(
        "li",
        {
          className: event.status === "failed" ? "text-err" : "text-ink-dim",
          children: [
            /* @__PURE__ */ jsx("span", { className: "font-medium", children: event.type }),
            event.detail ? ` \xB7 ${event.detail}` : ""
          ]
        },
        `${event.at}-${event.type}`
      )) })
    ] })
  ] });
}
function RunEvidence({ run, t }) {
  const openResourcePreview = host().stores.useUiStore((state) => state.openResourcePreview);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: "mt-3 grid gap-2 sm:grid-cols-3", children: [
      [t.sources, run.sources.length],
      [t.claims, run.claims.length],
      [t.coverage, run.coverage ? t.recorded : t.unknown]
    ].map(([label, value]) => /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-border px-3 py-2 text-xs", children: [
      /* @__PURE__ */ jsx("span", { className: "text-ink-dim", children: label }),
      /* @__PURE__ */ jsx("strong", { className: "ml-2", children: value })
    ] }, label)) }),
    run.warnings.length > 0 && /* @__PURE__ */ jsx("p", { className: "mt-2 text-xs text-warn", children: run.warnings.join(" \xB7 ") }),
    run.sources.length > 0 && /* @__PURE__ */ jsxs("div", { className: "mt-2 space-y-1 text-xs", children: [
      /* @__PURE__ */ jsx("p", { className: "text-ink-dim", children: t.sources }),
      run.sources.slice(0, 8).map((source) => /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => openResourcePreview({ href: source.path, label: source.path }),
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
    run.claims.length > 0 && /* @__PURE__ */ jsx("ul", { className: "mt-2 space-y-1 text-xs text-ink-dim", children: run.claims.slice(0, 6).map((claim) => /* @__PURE__ */ jsxs("li", { children: [
      /* @__PURE__ */ jsxs("span", { className: "font-medium", children: [
        "[",
        claim.relationship || claim.status,
        "]"
      ] }),
      " ",
      claim.claim,
      claim.limitations && /* @__PURE__ */ jsxs("span", { className: "text-ink-faint", children: [
        " \xB7 ",
        claim.limitations
      ] })
    ] }, claim.id || claim.claim)) }),
    run.provenance && /* @__PURE__ */ jsxs("div", { className: "mt-3 rounded-lg border border-border px-3 py-2 text-xs", children: [
      /* @__PURE__ */ jsxs("span", { className: "text-ink-dim", children: [
        t.provenance,
        ": "
      ] }),
      /* @__PURE__ */ jsx("span", { children: run.provenance.status }),
      run.provenance.limitations.length > 0 && /* @__PURE__ */ jsx("span", { className: "ml-2 text-ink-faint", children: run.provenance.limitations.join(" \xB7 ") })
    ] })
  ] });
}
function WorkspaceRunsCard({ project }) {
  const runtime2 = host().hooks.usePluginRuntime();
  const t = researchRunsCopy[host().hooks.useLanguage()];
  const list = useRuns(runtime2, project);
  const detail = useRunDetail(runtime2, list.runId);
  const loading = list.loading || detail.loading;
  const error = list.error || detail.error;
  return /* @__PURE__ */ jsxs("section", { className: "rounded-xl border border-border p-4", "data-testid": "research-runs-card", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("h3", { className: "text-xs font-semibold", children: t.title }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-ink-dim", children: t.hint })
      ] }),
      detail.selected && /* @__PURE__ */ jsx("span", { className: "rounded-full bg-hover px-2 py-0.5 text-xs text-ink-dim", children: detail.selected.answerable ? t.answerable : t.inProgress })
    ] }),
    loading && /* @__PURE__ */ jsx("p", { role: "status", className: "mt-3 text-xs text-ink-dim", children: t.loading }),
    error && /* @__PURE__ */ jsx("p", { role: "alert", className: "mt-3 break-words text-xs text-err", children: error }),
    !loading && !error && !list.runs.length && /* @__PURE__ */ jsx("p", { className: "mt-3 text-xs text-ink-dim", children: t.empty }),
    list.runs.length > 0 && /* @__PURE__ */ jsxs("div", { className: "mt-3 grid gap-3 lg:grid-cols-[minmax(180px,0.35fr)_minmax(0,1fr)]", children: [
      /* @__PURE__ */ jsx(RunList, { runs: list.runs, runId: list.runId, select: list.select }),
      detail.selected && /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx(RunSummary, { run: detail.selected, t }),
        /* @__PURE__ */ jsx(RunHistory, { run: detail.selected, t }),
        /* @__PURE__ */ jsx(RunEvidence, { run: detail.selected, t })
      ] })
    ] })
  ] });
}
function ResearchRunsCard({ project = null }) {
  const sessionId = host().stores.useSessionsStore((state) => state.activeSessionId);
  return /* @__PURE__ */ jsx(WorkspaceRunsCard, { project }, `${sessionId}:${project}`);
}

// ui/src/index.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function runtime() {
  return globalThis.window?.DroneUI;
}
function useLanguage() {
  const drone = runtime();
  return drone ? drone.hooks.useLanguage() : "en";
}
function ResearchCard({
  title,
  description,
  children
}) {
  return /* @__PURE__ */ jsxs2("section", { className: "rounded-lg border border-border bg-surface p-3 text-ink shadow-soft", children: [
    /* @__PURE__ */ jsx2("h2", { className: "text-[13px] font-medium", children: title }),
    /* @__PURE__ */ jsx2("p", { className: "mt-1 text-[12px] text-ink-2", children: description }),
    /* @__PURE__ */ jsx2("div", { className: "mt-3 flex flex-wrap gap-2", children })
  ] });
}
function Badge({ children }) {
  return /* @__PURE__ */ jsx2("span", { className: "rounded-md border border-border bg-canvas px-2 py-1 text-[11px] text-ink-2", children });
}
var ResearchHome = memo(function ResearchHome2() {
  const language = useLanguage();
  return /* @__PURE__ */ jsxs2(
    ResearchCard,
    {
      title: language === "zh" ? "\u7814\u7A76\u5DE5\u4F5C\u53F0" : "Research workbench",
      description: language === "zh" ? "\u4ECE\u65B0\u4EFB\u52A1\u5F00\u59CB\u4E00\u6761\u6709\u8BC1\u636E\u56DE\u6267\u7684\u7814\u7A76\u6D41\u7A0B\u3002" : "Start an evidence-gated research flow from a new task.",
      children: [
        /* @__PURE__ */ jsx2(Badge, { children: language === "zh" ? "\u6765\u6E90\u68C0\u7D22" : "Source search" }),
        /* @__PURE__ */ jsx2(Badge, { children: language === "zh" ? "\u5F15\u7528\u56DE\u6267" : "Citation receipts" }),
        /* @__PURE__ */ jsx2(Badge, { children: language === "zh" ? "\u8FDE\u63A5\u5668\u6388\u6743" : "Connector authorization" })
      ]
    }
  );
});
var ResearchCitations = memo(function ResearchCitations2() {
  const language = useLanguage();
  return /* @__PURE__ */ jsxs2(
    ResearchCard,
    {
      title: language === "zh" ? "\u5F15\u7528" : "Citations",
      description: language === "zh" ? "\u7814\u7A76\u56DE\u7B54\u53EA\u4F7F\u7528\u672C\u8F6E\u5DF2\u8BFB\u53D6\u5E76\u5E26\u54C8\u5E0C\u56DE\u6267\u7684\u6765\u6E90\u3002" : "Research answers use sources read in this run with hash receipts.",
      children: [
        /* @__PURE__ */ jsx2(Badge, { children: language === "zh" ? "\u8BFB\u53D6\u540E\u624D\u80FD\u5F15\u7528" : "Read before citing" }),
        /* @__PURE__ */ jsx2(Badge, { children: language === "zh" ? "\u9875\u7801\u53EF\u8FFD\u6EAF" : "Page traceable" })
      ]
    }
  );
});
var ResearchConnectors = memo(function ResearchConnectors2() {
  const language = useLanguage();
  return /* @__PURE__ */ jsxs2(
    ResearchCard,
    {
      title: language === "zh" ? "\u7814\u7A76\u8FDE\u63A5\u5668" : "Research connectors",
      description: language === "zh" ? "\u8FDE\u63A5\u5668\u7531\u5BBF\u4E3B\u6388\u6743\uFF1B\u4E0D\u53EF\u7528\u65F6\u7814\u7A76\u6D41\u7A0B\u4FDD\u7559\u672C\u5730\u6765\u6E90\u964D\u7EA7\u8DEF\u5F84\u3002" : "Connectors are authorized by the host; local sources remain available when one is unavailable.",
      children: [
        /* @__PURE__ */ jsx2(Badge, { children: language === "zh" ? "\u5F00\u653E\u6765\u6E90" : "Open sources" }),
        /* @__PURE__ */ jsx2(Badge, { children: "Zotero" }),
        /* @__PURE__ */ jsx2(Badge, { children: language === "zh" ? "\u673A\u6784\u8BBF\u95EE" : "Institutional access" })
      ]
    }
  );
});
export {
  ResearchCitations,
  ResearchConnectors,
  ResearchHome,
  ResearchRunsCard
};
