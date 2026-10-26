import type { WikiReviewPreview } from "@gyoungwe/plugin-api/ui";
import { useMemo, useState } from "react";
import { useKnowledgeText } from "./copy";
import { knowledgeLineDiff } from "./line-diff";

type ReviewContent = Pick<
	WikiReviewPreview,
	"before" | "after" | "protectedText" | "sources"
>;
export function WikiReviewContent({
	preview,
	onOpenSource,
}: {
	preview: ReviewContent;
	onOpenSource?: (source: ReviewContent["sources"][number]) => void;
}) {
	const t = useKnowledgeText();
	const [view, setView] = useState<"diff" | "both" | "protected">("diff");
	const lines = useMemo(
		() => knowledgeLineDiff(preview.before, preview.after),
		[preview],
	);
	const visible = lines.slice(0, 200);
	return (
		<>
			<div
				className="flex flex-wrap gap-1"
				role="tablist"
				aria-label={t("reviewTitle")}
			>
				{(["diff", "both", "protected"] as const).map((tab) => (
					<button
						key={tab}
						type="button"
						role="tab"
						aria-selected={view === tab}
						onClick={() => setView(tab)}
						className={`rounded-lg px-3 py-2 text-xs ${view === tab ? "bg-ink text-on-ink" : "text-ink-dim hover:bg-hover"}`}
					>
						{t(tab)}
					</button>
				))}
			</div>
			{view === "diff" && (
				<section
					className="max-h-[32vh] overflow-auto rounded-lg border border-border font-mono text-[11px]"
					aria-label={t("diff")}
				>
					{visible.map((row) => (
						<div
							key={`${row.kind}:${row.oldLine}:${row.newLine}:${row.text}`}
							className={`flex gap-2 px-2 leading-6 ${row.kind === "add" ? "bg-ok/10" : row.kind === "remove" ? "bg-err/8" : "text-ink-dim"}`}
						>
							<span className="w-12 shrink-0 select-none text-right text-ink-faint">
								{row.oldLine || ""} {row.newLine || ""}
							</span>
							<span title={row.kind} className="w-3 shrink-0">
								{row.kind === "add" ? "+" : row.kind === "remove" ? "−" : " "}
							</span>
							<span className="min-w-0 whitespace-pre-wrap break-words">
								{row.text || " "}
							</span>
						</div>
					))}
					{lines.length > 200 && (
						<p className="px-2 py-2 text-[11px] text-ink-faint">
							{t("truncated")}
						</p>
					)}
				</section>
			)}
			{view === "both" && (
				<div className="grid gap-2">
					{(["before", "after"] as const).map((side) => (
						<div key={side} className="min-w-0">
							<p className="mb-1 text-xs font-medium">{t(side)}</p>
							<pre className="max-h-[22vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-3 text-xs leading-relaxed">
								{preview[side] || "—"}
							</pre>
						</div>
					))}
				</div>
			)}
			{view === "protected" && (
				<pre className="max-h-[32vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-hover p-3 text-xs leading-relaxed">
					{preview.protectedText || "—"}
				</pre>
			)}
			<div>
				<h4 className="mb-2 text-xs font-semibold">
					{t("sources")} · {preview.sources.length}
				</h4>
				<div className="max-h-28 space-y-1 overflow-auto">
					{preview.sources.map((source) => (
						<div
							key={source.path}
							className="rounded-lg border border-border px-2 py-2"
						>
							{onOpenSource ? (
								<button
									type="button"
									className="break-all text-left text-xs text-link hover:underline"
									onClick={() => onOpenSource(source)}
								>
									{source.path}
								</button>
							) : (
								<p className="break-all text-xs">{source.path}</p>
							)}
							<p className="font-mono text-[11px] text-ink-faint">
								L{source.startLine}–{source.endLine}
								{source.hash ? ` · ${source.hash.slice(0, 12)}` : ""}
							</p>
							{source.changed && (
								<p className="text-xs text-warn">{t("sourceChanged")}</p>
							)}
							{source.error && (
								<p role="alert" className="text-xs text-err">
									{source.error}
								</p>
							)}
						</div>
					))}
				</div>
			</div>
		</>
	);
}
