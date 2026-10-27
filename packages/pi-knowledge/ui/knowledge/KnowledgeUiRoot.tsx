import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useKnowledgeStore } from "../api";
import { Button } from "../api";
import { useKnowledgeText } from "./copy";
import { WikiReviewDialog } from "./WikiReviewDialog";
/**
 * 知识库 UI 根：事件桥（invalidate / open-review / flow）+ Wiki 审核弹窗 + 右下角通知。
 * 知识库主体不再是弹窗——见 KnowledgeView（App 主区全屏视图）。
 */
export function KnowledgeUiRoot() {
	const t = useKnowledgeText(),
		review = useKnowledgeStore((s) => s.review),
		reviewQueue = useKnowledgeStore((s) => s.reviewQueue),
		notice = useKnowledgeStore((s) => s.notice);
	const deferReview = useKnowledgeStore((s) => s.deferReview),
		dismiss = useKnowledgeStore((s) => s.dismiss);
	useEffect(() => {
		if (!notice || notice.severity === "error") return;
		const timer = setTimeout(dismiss, 6500);
		return () => clearTimeout(timer);
	}, [notice, dismiss]);
	return (
		<>
			{review && (
				<WikiReviewDialog cwd={review.cwd} id={review.id} queued={reviewQueue.length} onLater={deferReview} />
			)}
			{notice &&
				createPortal(
					<div className="drone-knowledge-ui"><div
						role={notice.severity === "error" ? "alert" : "status"}
						className="fixed bottom-5 right-4 z-(--z-toast) w-[min(420px,calc(100vw-32px))] rounded-xl border border-border bg-surface p-4 text-ink shadow-dialog"
						data-testid="knowledge-notice"
					>
						<div className="flex items-start justify-between gap-2">
							<p
								className={`text-xs font-semibold ${notice.severity === "error" ? "text-err" : notice.severity === "warning" ? "text-warn" : ""}`}
							>
								{t("notification")}
							</p>
							<Button size="sm" onClick={dismiss} aria-label={t("close")}>
								×
							</Button>
						</div>
						<p className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
							{notice.text}
						</p>
					</div></div>,
					document.body,
				)}
		</>
	);
}
