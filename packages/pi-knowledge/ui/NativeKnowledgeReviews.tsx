import { useEffect, useState } from "react";
import type {
	KnowledgeReviewsResult,
	KnowledgePreviewReviewResult,
} from "../src/desktop/contract.js";
import type { createKnowledgeRuntimeStore } from "./runtime-store";
import { Button } from "./runtime-api";
import { useNativeKnowledgeText } from "./native-copy";
import { WikiReviewContent } from "./knowledge/WikiReviewContent";

type Store = ReturnType<typeof createKnowledgeRuntimeStore>;
type Selection = { id: string; proposalHash: string };
const errorText = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

function ReviewPreview({
	store,
	selection,
	onClose,
}: {
	store: Store;
	selection: Selection;
	onClose: () => void;
}) {
	const t = useNativeKnowledgeText();
	const [preview, setPreview] = useState<KnowledgePreviewReviewResult | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let live = true;
		setPreview(null);
		setError(null);
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
					<p
						className="break-all font-mono text-xs text-ink-faint"
						title={preview.proposalHash}
					>
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
	const [offset, setOffset] = useState(0);
	const [page, setPage] = useState<KnowledgeReviewsResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selection, setSelection] = useState<Selection | null>(null);
	useEffect(() => {
		let live = true;
		setPage(null);
		setError(null);
		setSelection(null);
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
	}, [store, offset, observationRevision]);
	return (
		<section aria-label={t.reviews} className="space-y-4">
			<p className="text-xs text-ink-dim">{t.reviewReadOnly}</p>
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
						<p
							key={problem.id}
							role="alert"
							className="break-words text-xs text-err"
						>
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
								<p className="mt-1 break-all text-xs text-ink-dim">
									{item.path}
								</p>
								{item.expired && (
									<p className="text-xs text-warn">{t.reviewExpired}</p>
								)}
								{item.bindingChanged && (
									<p className="text-xs text-warn">{t.reviewBindingChanged}</p>
								)}
							</li>
						))}
					</ul>
					<div className="flex gap-2">
						<Button
							size="sm"
							disabled={offset === 0}
							onClick={() => setOffset(0)}
						>
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
				/>
			)}
		</section>
	);
}
