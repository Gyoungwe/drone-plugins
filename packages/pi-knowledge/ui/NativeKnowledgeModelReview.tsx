import { useEffect, useRef, useState } from "react";
import type {
	KnowledgeModelReviewInfo,
	KnowledgeModelReviewResult,
	KnowledgePreviewReviewResult,
} from "../src/desktop/contract.js";
import type { createKnowledgeRuntimeStore } from "./runtime-store";
import { Button, useSettingsStore } from "./runtime-api";
import { useNativeKnowledgeText } from "./native-copy";

export function NativeKnowledgeModelReview({
	store,
	preview,
	disabled,
	onBusy,
	onApplied,
}: {
	store: ReturnType<typeof createKnowledgeRuntimeStore>;
	preview: KnowledgePreviewReviewResult;
	disabled: boolean;
	onBusy: (busy: boolean) => void;
	onApplied: (result: KnowledgeModelReviewResult) => void;
}) {
	const t = useNativeKnowledgeText();
	const pref = useSettingsStore((s) => s.modelPrefs?.subagentModels?.["knowledge-wiki-reviewer"]);
	const profile = pref ? ("knowledge-wiki-reviewer" as const) : undefined;
	const [info, setInfo] = useState<KnowledgeModelReviewInfo | null>(null),
		[report, setReport] = useState<KnowledgeModelReviewResult | null>(null),
		[ack, setAck] = useState(false),
		[autoApply, setAutoApply] = useState(false),
		[busy, setBusy] = useState(false),
		[error, setError] = useState<string | null>(null);
	const active = useRef<AbortController | null>(null),
		generation = useRef(0);
	useEffect(() => {
		const epoch = ++generation.current;
		setInfo(null);
		setReport(null);
		setAck(false);
		setAutoApply(false);
		setError(null);
		void store
			.modelReviewInfo({
				id: preview.id,
				expectedProposalHash: preview.proposalHash,
				...(profile ? { profile } : {}),
			})
			.then(
				(value) => {
					if (generation.current === epoch) {
						setInfo(value);
						setReport(value.lastReview);
					}
				},
				(cause) => {
					if (generation.current === epoch)
						setError(cause instanceof Error ? cause.message : String(cause));
				},
			);
		return () => {
			++generation.current;
			active.current?.abort();
			onBusy(false);
		};
	}, [store, preview.id, preview.proposalHash, profile, onBusy]);
	const run = async () => {
		if (!ack || !info || busy) return;
		const controller = new AbortController(),
			epoch = generation.current;
		active.current = controller;
		setBusy(true);
		onBusy(true);
		setError(null);
		try {
			const result = await store.modelReview(
				{
					id: preview.id,
					expectedProposalHash: preview.proposalHash,
					acknowledged: true,
					autoApply,
					...(profile ? { profile } : {}),
				},
				controller.signal,
			);
			if (epoch !== generation.current) return;
			setReport(result);
			setAck(false);
			if (result.applied) onApplied(result);
		} catch (cause) {
			if (epoch === generation.current)
				setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			if (epoch === generation.current) {
				active.current = null;
				setBusy(false);
				onBusy(false);
			}
		}
	};
	return (
		<section
			className="space-y-2 rounded-lg border border-border p-3"
			data-testid="native-model-review"
		>
			<h3 className="text-sm font-medium">{t.modelReview}</h3>
			{info && (
				<p className="text-xs text-ink-dim">
					{info.selection.provider}/{info.selection.model} · {info.selection.thinkingLevel}
				</p>
			)}
			{error && (
				<p role="alert" className="text-xs text-err">
					{error}
				</p>
			)}
			<label className="flex gap-2 text-xs">
				<input
					type="checkbox"
					checked={ack}
					disabled={busy || disabled || !info}
					onChange={(event) => setAck(event.target.checked)}
				/>
				{t.modelReviewConsent}
			</label>
			<label className="flex gap-2 text-xs">
				<input
					type="checkbox"
					checked={autoApply}
					disabled={busy || disabled || !info}
					onChange={(event) => setAutoApply(event.target.checked)}
				/>
				{t.modelReviewAutoApply}
			</label>
			<Button size="sm" disabled={!ack || !info || busy || disabled} onClick={() => void run()}>
				{busy ? t.modelReviewRunning : t.modelReviewRun}
			</Button>
			{busy && (
				<Button size="sm" onClick={() => active.current?.abort()}>
					{t.modelReviewCancel}
				</Button>
			)}
			{report && (
				<div className="space-y-1 text-xs" data-testid="native-model-review-result">
					<p>
						{report.verdict}: {report.summary}
					</p>
					<p>{t.modelReviewNotVerified}</p>
					<p>
						{t.modelReviewInput}:{" "}
						{report.usage.inputTokens === null ? t.modelReviewUnknown : report.usage.inputTokens} ·{" "}
						{t.modelReviewOutput}:{" "}
						{report.usage.outputTokens === null ? t.modelReviewUnknown : report.usage.outputTokens}{" "}
						· {t.modelReviewCost}:{" "}
						{report.usage.cost === null ? t.modelReviewUnknown : `$${report.usage.cost.toFixed(4)}`}
					</p>
					{(report.partial || report.applyError || report.auditSaveError) && (
						<p role="alert">{report.applyError || report.auditSaveError || t.reviewPartial}</p>
					)}
					<details>
						<summary>{report.auditId}</summary>
						<pre className="whitespace-pre-wrap break-all">{JSON.stringify(report, null, 2)}</pre>
					</details>
				</div>
			)}
		</section>
	);
}
