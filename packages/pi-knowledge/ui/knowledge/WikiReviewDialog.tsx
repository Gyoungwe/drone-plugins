import type { WikiReviewPreview } from "@gyoungwe/plugin-api/ui";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getKnowledgeApi } from "../api";
import { useKnowledgeStore } from "../api";
import { ActionSurface } from "../api";
import { Button } from "../api";
import { useKnowledgeText } from "./copy";
import { WikiReviewContent } from "./WikiReviewContent";
import { WikiModelReview } from "./WikiModelReview";

/** Focused Wiki apply/reject popup. Esc / 稍后 closes without rejecting. */
export function WikiReviewDialog({
	cwd,
	id,
	queued,
	onLater,
}: {
	cwd: string;
	id: string;
	queued: number;
	onLater: () => void;
}) {
	const t = useKnowledgeText();
	const box = useRef<HTMLDivElement>(null);
	const revision = useKnowledgeStore((s) => s.revision);
	const [preview, setPreview] = useState<WikiReviewPreview | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [tick, setTick] = useState(0);
	const [reviewing, setReviewing] = useState(false);
	const [verdict, setVerdict] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reload when the binding invalidates or the user retries
	useEffect(() => {
		let live = true;
		setPreview(null);
		setError(null);
		setReviewing(false);
		setVerdict(null);
		setPending(true);
		void getKnowledgeApi()
			.getKnowledgeOverview({ cwd })
			.then((overview) => {
				const binding = overview.binding?.revision;
				if (binding == null) throw new Error("not-bound");
				if (id) return getKnowledgeApi().previewKnowledgeReview({ cwd, id, revision: binding });
				return getKnowledgeApi()
					.getKnowledgeReviews({ cwd, revision: binding, offset: 0, limit: 1 })
					.then((page) => {
						const first = page.items[0];
						if (!first) throw new Error("empty");
						return getKnowledgeApi().previewKnowledgeReview({ cwd, id: first.id, revision: binding });
					});
			})
			.then(
				(value) => {
					if (live) setPreview(value);
				},
				(cause) => {
					if (!live) return;
					setError(cause instanceof Error ? cause.message : String(cause));
				},
			)
			.finally(() => {
				if (live) setPending(false);
			});
		return () => {
			live = false;
		};
	}, [cwd, id, revision, tick]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: refocus when preview or error content arrives
	useEffect(() => {
		const node = box.current?.querySelector<HTMLElement>("button:not([disabled])");
		node?.focus();
	}, [preview, error]);
	// Escape defers only when nothing is in flight: deferring mid-load or mid-decision raced the IPC result.
	async function decide(decision: "apply" | "reject") {
		if (!preview || pending) return;
		setPending(true);
		setError(null);
		try {
			const value = await getKnowledgeApi().decideKnowledgeReview({ cwd, token: preview.reviewToken, decision });
			const text =
				value.status === "rejected"
					? t("rejected")
					: value.indexed === false || value.reviewRecorded === false
						? `${t("savedPartial")} ${value.indexError || value.recordError || ""}`
						: t("applied");
			useKnowledgeStore.getState().invalidate();
			useKnowledgeStore.getState().apply({
				kind: "notice",
				id: String(Date.now()),
				sessionId: null,
				severity: value.indexed === false ? "warning" : "info",
				text,
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
		<div className="drone-knowledge-ui"><ActionSurface
			contentRef={box}
			ariaLabel={t("reviewTitle")}
			tone="warn"
			width="wide"
			testId="wiki-review-dialog"
			onEscape={pending ? undefined : onLater}
		>
			<div className="shrink-0 border-b border-border px-5 py-4">
				<p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">
					Obsidian · {t("reviews")}
				</p>
				<h3 className="mt-1 text-base font-semibold text-ink">{preview?.title || t("reviewTitle")}</h3>
				{preview && (
					<p className="mt-1 break-all font-mono text-[11px] text-ink-dim select-text">{preview.path}</p>
				)}
			</div>
			<div className="min-h-0 flex-1 space-y-3 scroll-fade overflow-y-auto px-5 py-4">
				{pending && !preview && <p className="text-xs text-ink-dim">{t("loading")}</p>}
				{errorText && (
					<div role="alert" className="rounded-lg border border-border p-3 text-xs text-err">
						<p>{errorText}</p>
						<Button size="sm" className="mt-2" disabled={pending} onClick={() => setTick((n) => n + 1)}>
							{t("retry")}
						</Button>
					</div>
				)}
				{preview && (
					<>
						<p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">
							{t("reason")}：{preview.rationale}
						</p>
						<p className="rounded-lg bg-hover px-3 py-2 text-xs leading-relaxed text-ink-dim">
							{t("preserve")}
						</p>
						<WikiReviewContent key={preview.reviewToken} preview={preview} />
						{(preview.expired || preview.targetChanged) && (
							<p role="alert" className="text-xs text-warn">
								{preview.targetChanged ? t("targetChanged") : t("expired")}{" "}
								<Button size="sm" disabled={pending} onClick={() => setTick((n) => n + 1)}>
									{t("refreshPreview")}
								</Button>
							</p>
						)}
						<WikiModelReview
							cwd={cwd}
							preview={preview}
							adviceOnly
							defaultExpanded
							disabled={pending || blocked || reviewing}
							onBusy={setReviewing}
							onFailure={() => {}}
							onComplete={async (value) => {
								setVerdict(
									value.applied
										? t("modelReviewApplied")
										: value.verdict === "approve"
											? t("modelReviewPass")
											: value.verdict === "reject"
												? t("modelReviewReject")
												: t("modelReviewHuman"),
								);
								if (value.applied) {
									useKnowledgeStore.getState().invalidate();
									useKnowledgeStore.getState().apply({
										kind: "notice",
										id: String(Date.now()),
										sessionId: null,
										severity: "info",
										text: t("modelReviewApplied"),
									});
									onLater();
								}
							}}
						/>
						<p className="text-xs text-ink-dim">{t("notScience")}</p>
					</>
				)}
			</div>
			<div className="shrink-0 border-t border-border px-5 py-3">
				<div className="flex items-center justify-between gap-3">
					<p className="min-w-0 truncate text-[11px] text-ink-faint">
						{verdict ||
							(queued > 0 ? t("reviewQueued").replace("{count}", String(queued)) : t("reviewLaterHint"))}
					</p>
					<div className="flex shrink-0 gap-2">
						<Button disabled={pending && !!preview} onClick={onLater}>
							{t("later")}
						</Button>
						<Button
							tone="danger"
							disabled={pending || reviewing || !preview}
							onClick={() => void decide("reject")}
						>
							{t("reject")}
						</Button>
						<Button
							variant="primary"
							disabled={pending || reviewing || !preview || blocked}
							onClick={() => void decide("apply")}
						>
							{pending && preview ? t("applying") : t("apply")}
						</Button>
					</div>
				</div>
			</div>
		</ActionSurface></div>,
		document.body,
	);
}
