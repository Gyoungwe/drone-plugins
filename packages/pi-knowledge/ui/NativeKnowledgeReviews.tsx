import { useCallback, useEffect, useRef, useState } from "react";
import type {
	KnowledgeReviewsResult,
	KnowledgePreviewReviewResult,
	KnowledgeApplyReviewResult,
} from "../src/desktop/contract.js";
import type { createKnowledgeRuntimeStore } from "./runtime-store";
import { Button } from "./runtime-api";
import { useNativeKnowledgeText } from "./native-copy";
import { NativeKnowledgeModelReview } from "./NativeKnowledgeModelReview";
import { WikiReviewContent } from "./knowledge/WikiReviewContent";

type Store = ReturnType<typeof createKnowledgeRuntimeStore>;
type Selection = { id: string; proposalHash: string };
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function ReviewPreview({
	store,
	selection,
	onClose,
	onDecision,
	onModelBusy,
}: {
	store: Store;
	selection: Selection;
	onClose: () => void;
	onDecision: (receipt?: KnowledgeApplyReviewResult) => void;
	onModelBusy: (busy: boolean) => void;
}) {
	const t = useNativeKnowledgeText();
	const handleModelBusy = useCallback(
		(busy: boolean) => {
			setAction(busy ? "model" : null);
			onModelBusy(busy);
		},
		[onModelBusy],
	);
	const [preview, setPreview] = useState<KnowledgePreviewReviewResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [action, setAction] = useState<"apply" | "reject" | "model" | null>(null);
	useEffect(() => {
		let live = true;
		setPreview(null);
		setError(null);
		setAction(null);
		void store
			.previewReview({
				id: selection.id,
				expectedProposalHash: selection.proposalHash,
			})
			.then(
				(value) => {
					if (live) setPreview(value);
				},
				(cause) => {
					if (live) setError(errorText(cause));
				},
			);
		return () => {
			live = false;
		};
	}, [store, selection]);
	const decide = async (kind: "apply" | "reject") => {
		if (!preview || action) return;
		setAction(kind);
		setError(null);
		try {
			if (kind === "apply") {
				const receipt = await store.applyReview({
					id: selection.id,
					expectedProposalHash: selection.proposalHash,
				});
				onDecision(receipt);
				return;
			} else {
				await store.rejectReview({
					id: selection.id,
					expectedProposalHash: selection.proposalHash,
				});
			}
			onDecision();
		} catch (cause) {
			setError(errorText(cause));
		} finally {
			setAction(null);
		}
	};
	return (
		<article
			className="space-y-4 rounded-xl border border-border bg-surface p-4"
			data-testid="native-review-preview"
		>
			<Button size="sm" onClick={onClose}>
				{t.reviewBack}
			</Button>
			{error && (
				<p role="alert" className="text-sm text-err">
					{error}
				</p>
			)}
			{!error && !preview && (
				<p role="status" className="text-sm text-ink-dim">
					{t.loading}
				</p>
			)}
			{preview && (
				<>
					<header>
						<h2 className="text-base font-medium">{preview.title}</h2>
						<p className="break-all text-xs text-ink-dim">{preview.path}</p>
					</header>
					<p className="whitespace-pre-wrap text-sm">{preview.rationale}</p>
					<p className="break-all font-mono text-xs text-ink-faint" title={preview.proposalHash}>
						{t.reviewVersion}: {preview.proposalHash.slice(0, 12)}
					</p>
					{preview.expired && (
						<p role="status" className="text-xs text-warn">
							{t.reviewExpired}
						</p>
					)}
					{preview.targetChanged && (
						<p role="status" className="text-xs text-warn">
							{t.reviewTargetChanged}
						</p>
					)}
					<WikiReviewContent
						preview={preview}
						onOpenSource={(source) =>
							store.openNote(source.path, {
								startLine: source.startLine,
								hash: source.hash ?? undefined,
							})
						}
					/>
					<p className="text-xs text-ink-dim">{t.reviewNotVerified}</p>
					<NativeKnowledgeModelReview
						store={store}
						preview={preview}
						disabled={(action !== null && action !== "model") || !preview.canApply}
						onBusy={handleModelBusy}
						onApplied={(result) => onDecision(result.writeResult)}
					/>
					<div className="flex gap-2">
						<Button
							size="sm"
							disabled={action !== null || !preview.canApply}
							onClick={() => void decide("apply")}
						>
							{action === "apply" ? t.applying : t.applyReview}
						</Button>
						<Button size="sm" disabled={action !== null} onClick={() => void decide("reject")}>
							{action === "reject" ? t.rejecting : t.rejectReview}
						</Button>
					</div>
				</>
			)}
		</article>
	);
}

export function NativeKnowledgeReviews({
	store,
	observationRevision,
}: {
	store: Store;
	observationRevision: number;
}) {
	const t = useNativeKnowledgeText();
	const modelBusy = useRef(false);
	const setModelBusy = useCallback((busy: boolean) => {
		modelBusy.current = busy;
	}, []);
	const reviewContext = useRef<{
		store: Store;
		vaultId: string | undefined;
		revision: number | undefined;
		project: string | null | undefined;
	} | null>(null);
	const [offset, setOffset] = useState(0);
	const [page, setPage] = useState<KnowledgeReviewsResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selection, setSelection] = useState<Selection | null>(null);
	const [decisionRevision, setDecisionRevision] = useState(0);
	const [receiptError, setReceiptError] = useState<string | null>(null);
	useEffect(() => {
		let live = true;
		setPage(null);
		setError(null);
		const overview = store.getSnapshot().overview;
		const previous = reviewContext.current;
		const sameContext =
			previous?.store === store &&
			previous.vaultId === overview?.binding?.vaultId &&
			previous.revision === overview?.binding?.revision &&
			previous.project === overview?.project;
		reviewContext.current = {
			store,
			vaultId: overview?.binding?.vaultId,
			revision: overview?.binding?.revision,
			project: overview?.project,
		};
		if (!sameContext || !modelBusy.current) setSelection(null);
		void store.reviews({ offset, limit: 12 }).then(
			(value) => {
				if (live) setPage(value);
			},
			(cause) => {
				if (live) setError(errorText(cause));
			},
		);
		return () => {
			live = false;
		};
	}, [store, offset, observationRevision, decisionRevision]);
	return (
		<section aria-label={t.reviews} className="space-y-4">
			<p className="text-xs text-ink-dim">{t.reviewReadOnly}</p>
			{receiptError && (
				<p role="alert" className="text-sm text-err">
					{receiptError}
				</p>
			)}
			{error && (
				<p role="alert" className="text-sm text-err">
					{error}
				</p>
			)}
			{!error && !page && (
				<p role="status" className="text-sm text-ink-dim">
					{t.loading}
				</p>
			)}
			{page && (
				<>
					<p className="text-xs text-ink-dim">
						{page.total} {t.reviewCount}
					</p>
					{page.problems.map((problem) => (
						<p key={problem.id} role="alert" className="break-words text-xs text-err">
							{problem.id}: {problem.error}
						</p>
					))}
					{page.items.length === 0 && (
						<p className="text-sm text-ink-dim">
							{page.project === null ? t.reviewProjectRequired : t.reviewEmpty}
						</p>
					)}
					<ul className="divide-y divide-border rounded-xl border border-border">
						{page.items.map((item) => (
							<li key={item.id} className="p-3">
								<Button
									size="sm"
									onClick={() =>
										setSelection({
											id: item.id,
											proposalHash: item.proposalHash,
										})
									}
								>
									{item.title}
								</Button>
								<p className="mt-1 break-all text-xs text-ink-dim">{item.path}</p>
								{item.expired && <p className="text-xs text-warn">{t.reviewExpired}</p>}
								{item.bindingChanged && (
									<p className="text-xs text-warn">{t.reviewBindingChanged}</p>
								)}
							</li>
						))}
					</ul>
					<div className="flex gap-2">
						<Button size="sm" disabled={offset === 0} onClick={() => setOffset(0)}>
							{t.firstPage}
						</Button>
						<Button
							size="sm"
							disabled={page.nextOffset === null}
							onClick={() => setOffset(page.nextOffset!)}
						>
							{t.nextPage}
						</Button>
					</div>
				</>
			)}
			{selection && (
				<ReviewPreview
					key={`${selection.id}:${selection.proposalHash}`}
					store={store}
					selection={selection}
					onClose={() => setSelection(null)}
					onModelBusy={setModelBusy}
					onDecision={(receipt) => {
						setReceiptError(
							receipt && (!receipt.reviewRecorded || !receipt.indexed)
								? `${t.reviewPartial} ${receipt.recordError ?? ""} ${receipt.indexError ?? ""}`
								: null,
						);
						setSelection(null);
						setDecisionRevision((value) => value + 1);
					}}
				/>
			)}
		</section>
	);
}
