import { useEffect, useState } from "react";
import type { KnowledgeReviewHistoryResult } from "../src/desktop/contract.js";
import type { createKnowledgeRuntimeStore } from "./runtime-store";
import { Button } from "./runtime-api";
import { useNativeKnowledgeText } from "./native-copy";

export function NativeKnowledgeHistory({
	store,
	observationRevision,
}: {
	store: ReturnType<typeof createKnowledgeRuntimeStore>;
	observationRevision: number;
}) {
	const t = useNativeKnowledgeText();
	const [history, setHistory] = useState<KnowledgeReviewHistoryResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirm, setConfirm] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [revision, setRevision] = useState(0);
	useEffect(() => {
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
			},
		);
		return () => {
			live = false;
		};
	}, [store, observationRevision, revision]);
	async function undo(item: KnowledgeReviewHistoryResult["items"][number]) {
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
	return (
		<section aria-label={t.history} className="space-y-4">
			<p className="text-xs text-ink-dim">{t.undoHint}</p>
			{error && (
				<p role="alert" className="text-sm text-err">
					{error}
				</p>
			)}
			{!history && !error && <p role="status">{t.loading}</p>}
			{history && history.items.length === 0 && <p>{t.historyEmpty}</p>}
			<ul className="divide-y divide-border rounded-xl border border-border">
				{history?.items.map((item) => (
					<li key={item.id} className="space-y-2 p-3">
						<p className="break-all text-sm">{item.path}</p>
						<p className="font-mono text-xs text-ink-dim">{item.afterHash.slice(0, 12)}</p>
						{confirm === item.id ? (
							<div className="flex gap-2">
								<Button size="sm" disabled={busy} onClick={() => void undo(item)}>
									{busy ? t.undoing : t.confirmUndo}
								</Button>
								<Button size="sm" disabled={busy} onClick={() => setConfirm(null)}>
									{t.cancelUndo}
								</Button>
							</div>
						) : (
							<Button size="sm" disabled={busy} onClick={() => setConfirm(item.id)}>
								{t.undoReview}
							</Button>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
