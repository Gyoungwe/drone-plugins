import type {
	KnowledgeNote,
	KnowledgeNoteLinks,
} from "@gyoungwe/plugin-api/ui";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../runtime-api";
import { useKnowledgeText } from "./copy";
import { KnowledgeLinksView } from "./KnowledgeLinksView";
import { noteDisplayText } from "./note-display";
export type ReadableNote = Pick<KnowledgeNote, "path"> &
	Partial<Omit<KnowledgeNote, "path">>;
export interface NoteReadingApi {
	readNote: (input: {
		path: string;
		revision: number;
		startLine: number;
		expectedHash?: string;
	}) => Promise<ReadableNote>;
	links: (input: {
		path: string;
		revision: number;
	}) => Promise<KnowledgeNoteLinks>;
}
export function KnowledgeNoteView({
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
	onClose,
}: {
	api: NoteReadingApi;
	renderText: (text: string) => ReactNode;
	initialPage?: { startLine: number; expectedHash?: string };
	nonce: number;
	onOpenNote: (path: string) => void;
	onOpenExternal?: () => Promise<void>;
	unavailableReason?: string;
	evidenceNotice?: (text: string) => string | null;
	revision: number;
	path: string;
	onClose: () => void;
}) {
	const t = useKnowledgeText();
	const [cursor, setCursor] = useState<{ line: number; expectedHash?: string }>(
			{
				line: initialPage?.startLine ?? 1,
				expectedHash: initialPage?.expectedHash,
			},
		),
		[note, setNote] = useState<ReadableNote | null>(null),
		[error, setError] = useState<string | null>(null),
		[loading, setLoading] = useState(false);
	const line = cursor.line;
	useEffect(() => {
		let live = true;
		setLoading(true);
		setNote(null);
		setError(null);
		void api
			.readNote({
				path,
				startLine: line,
				revision,
				...(cursor.expectedHash ? { expectedHash: cursor.expectedHash } : {}),
			})
			.then(
				(value) => {
					if (live) setNote(value);
				},
				(e) => {
					if (live) setError(String(e.message || e));
				},
			)
			.finally(() => {
				if (live) setLoading(false);
			});
		return () => {
			live = false;
		};
	}, [api, path, cursor, revision, nonce]);
	return (
		<section
			className="rounded-xl border border-border bg-surface p-3"
			aria-label={t("viewNote")}
			data-testid="knowledge-note"
		>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<h4 className="text-xs font-semibold">{t("viewNote")}</h4>
					<p className="mt-1 break-all font-mono text-[11px] text-ink-dim">
						{path}
					</p>
				</div>
				<Button size="sm" onClick={onClose} aria-label={t("close")}>
					×
				</Button>
			</div>
			<p className="my-2 text-xs text-ink-dim">{t("uiRead")}</p>
			{loading && (
				<p role="status" className="text-xs">
					{t("loading")}
				</p>
			)}
			{error && (
				<p
					role="alert"
					className="whitespace-pre-wrap break-words text-xs text-err"
				>
					{error}
				</p>
			)}
			{note?.missing && <p className="text-xs text-warn">{t("missing")}</p>}
			{note?.text && (
				<>
					<p className="mb-1 font-mono text-[11px] text-ink-faint">
						L{note.startLine}–{note.endLine} · {note.hash?.slice(0, 12)}{" "}
						{note.truncated ? ` · ${t("truncated")}` : ""}
					</p>
					<div className="max-h-80 overflow-auto rounded-lg bg-hover p-3">
						{evidenceNotice?.(note.text) && (
							<p
								data-testid="legacy-evidence-status"
								className="mb-2 rounded border border-border p-2 text-xs text-warn"
							>
								{evidenceNotice?.(note.text)}
							</p>
						)}
						{renderText(noteDisplayText(note.displayText || note.text))}
					</div>
				</>
			)}
			{note?.displayLinkBase && (
				<p className="my-2 break-words text-[11px] text-ink-faint">
					{t("linkPreviewOnly")} {note.displayLinkBase}
				</p>
			)}
			{note?.humanReview?.text && (
				<details className="mt-2 text-xs">
					<summary className="cursor-pointer font-medium">
						{t("humanReview")}
					</summary>
					<pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-ink-2">
						{note.humanReview.text}
					</pre>
				</details>
			)}
			{note && !note.missing && (
				<KnowledgeLinksView
					load={api.links}
					nonce={nonce}
					path={path}
					revision={revision}
					onOpenNote={onOpenNote}
				/>
			)}
			{unavailableReason && (
				<p className="mt-2 text-xs text-ink-faint">{unavailableReason}</p>
			)}
			<div className="mt-2 flex flex-wrap gap-1">
				{line > 1 && (
					<Button size="sm" onClick={() => setCursor({ line: 1 })}>
						{t("readBack")}
					</Button>
				)}
				{note?.truncated &&
					note.endLine !== undefined &&
					note.endLine < (note.totalLines || 0) &&
					note.endLine >= line && (
						<Button
							size="sm"
							onClick={() =>
								setCursor({
									line: note.endLine! + 1,
									expectedHash: note.hash ?? undefined,
								})
							}
						>
							{t("readMore")}
						</Button>
					)}
				<Button
					size="sm"
					disabled={!onOpenExternal || loading || note?.missing}
					title={unavailableReason}
					onClick={() =>
						void onOpenExternal!().catch((e) =>
							setError(String(e.message || e)),
						)
					}
				>
					{t("openObsidian")}
				</Button>
			</div>
		</section>
	);
}
