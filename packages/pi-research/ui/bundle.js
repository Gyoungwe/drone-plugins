// ui/src/index.tsx
import { memo } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
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
  return /* @__PURE__ */ jsxs("section", { className: "rounded-lg border border-border bg-surface p-3 text-ink shadow-soft", children: [
    /* @__PURE__ */ jsx("h2", { className: "text-[13px] font-medium", children: title }),
    /* @__PURE__ */ jsx("p", { className: "mt-1 text-[12px] text-ink-2", children: description }),
    /* @__PURE__ */ jsx("div", { className: "mt-3 flex flex-wrap gap-2", children })
  ] });
}
function Badge({ children }) {
  return /* @__PURE__ */ jsx("span", { className: "rounded-md border border-border bg-canvas px-2 py-1 text-[11px] text-ink-2", children });
}
var ResearchHome = memo(function ResearchHome2() {
  const language = useLanguage();
  return /* @__PURE__ */ jsxs(
    ResearchCard,
    {
      title: language === "zh" ? "\u7814\u7A76\u5DE5\u4F5C\u53F0" : "Research workbench",
      description: language === "zh" ? "\u4ECE\u65B0\u4EFB\u52A1\u5F00\u59CB\u4E00\u6761\u6709\u8BC1\u636E\u56DE\u6267\u7684\u7814\u7A76\u6D41\u7A0B\u3002" : "Start an evidence-gated research flow from a new task.",
      children: [
        /* @__PURE__ */ jsx(Badge, { children: language === "zh" ? "\u6765\u6E90\u68C0\u7D22" : "Source search" }),
        /* @__PURE__ */ jsx(Badge, { children: language === "zh" ? "\u5F15\u7528\u56DE\u6267" : "Citation receipts" }),
        /* @__PURE__ */ jsx(Badge, { children: language === "zh" ? "\u8FDE\u63A5\u5668\u6388\u6743" : "Connector authorization" })
      ]
    }
  );
});
var ResearchCitations = memo(function ResearchCitations2() {
  const language = useLanguage();
  return /* @__PURE__ */ jsxs(
    ResearchCard,
    {
      title: language === "zh" ? "\u5F15\u7528" : "Citations",
      description: language === "zh" ? "\u7814\u7A76\u56DE\u7B54\u53EA\u4F7F\u7528\u672C\u8F6E\u5DF2\u8BFB\u53D6\u5E76\u5E26\u54C8\u5E0C\u56DE\u6267\u7684\u6765\u6E90\u3002" : "Research answers use sources read in this run with hash receipts.",
      children: [
        /* @__PURE__ */ jsx(Badge, { children: language === "zh" ? "\u8BFB\u53D6\u540E\u624D\u80FD\u5F15\u7528" : "Read before citing" }),
        /* @__PURE__ */ jsx(Badge, { children: language === "zh" ? "\u9875\u7801\u53EF\u8FFD\u6EAF" : "Page traceable" })
      ]
    }
  );
});
var ResearchConnectors = memo(function ResearchConnectors2() {
  const language = useLanguage();
  return /* @__PURE__ */ jsxs(
    ResearchCard,
    {
      title: language === "zh" ? "\u7814\u7A76\u8FDE\u63A5\u5668" : "Research connectors",
      description: language === "zh" ? "\u8FDE\u63A5\u5668\u7531\u5BBF\u4E3B\u6388\u6743\uFF1B\u4E0D\u53EF\u7528\u65F6\u7814\u7A76\u6D41\u7A0B\u4FDD\u7559\u672C\u5730\u6765\u6E90\u964D\u7EA7\u8DEF\u5F84\u3002" : "Connectors are authorized by the host; local sources remain available when one is unavailable.",
      children: [
        /* @__PURE__ */ jsx(Badge, { children: language === "zh" ? "\u5F00\u653E\u6765\u6E90" : "Open sources" }),
        /* @__PURE__ */ jsx(Badge, { children: "Zotero" }),
        /* @__PURE__ */ jsx(Badge, { children: language === "zh" ? "\u673A\u6784\u8BBF\u95EE" : "Institutional access" })
      ]
    }
  );
});
export {
  ResearchCitations,
  ResearchConnectors,
  ResearchHome
};
