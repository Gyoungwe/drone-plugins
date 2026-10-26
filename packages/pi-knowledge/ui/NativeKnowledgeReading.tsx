import { useEffect, useMemo, useState } from "react";
import type {
	KnowledgeJobsResult,
	KnowledgeRecentByCategoryResult,
} from "../src/desktop/contract";
import type {
	createKnowledgeRuntimeStore,
	KnowledgeRuntimeState,
} from "./runtime-store";
import { Button, Markdown } from "./runtime-api";
import { useNativeKnowledgeText } from "./native-copy";
import { KnowledgeNoteView } from "./knowledge/KnowledgeNoteView";
import { KnowledgeGraphView } from "./knowledge/KnowledgeGraphView";
import { KnowledgeSearchView } from "./knowledge/KnowledgeSearchView";
import type { KnowledgeCategory } from "./knowledge/knowledge-home-model";

type Store = ReturnType<typeof createKnowledgeRuntimeStore>;
export function NativeKnowledgeReading({
	store,
	state,
}: {
	store: Store;
	state: KnowledgeRuntimeState;
}) {
	const t = useNativeKnowledgeText();
	const [category, setCategory] = useState<KnowledgeCategory>("all");
	const [recent, setRecent] = useState<KnowledgeRecentByCategoryResult | null>(
		null,
	);
	const [linkNotice, setLinkNotice] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [jobs, setJobs] = useState<KnowledgeJobsResult | null>(null);
	const [offset, setOffset] = useState(0);
	const binding = state.overview!.binding!;
	useEffect(() => setLinkNotice(null), [state.selectedNote]);
	const noteApi = useMemo(
		() => ({ readNote: store.readNote, links: store.links }),
		[store],
	);
	const graphApi = useMemo(
		() => ({
			getKnowledgeGraph: store.graph,
			getKnowledgeNoteLinks: store.links,
		}),
		[store],
	);
	useEffect(() => {
		let live = true;
		setError(null);
		setRecent(null);
		if (state.view !== "reading" || state.selectedNote) return;
		void store.recentByCategory().then(
			(value) => {
				if (live) setRecent(value);
			},
			(cause) => {
				if (live)
					setError(String(cause instanceof Error ? cause.message : cause));
			},
		);
		return () => {
			live = false;
		};
	}, [store, state.view, state.selectedNote, state.observationRevision]);
	useEffect(() => {
		let live = true;
		setError(null);
		setJobs(null);
		if (state.view !== "jobs") return;
		void store.jobs({ offset, limit: 20 }).then(
			(value) => {
				if (live) setJobs(value);
			},
			(cause) => {
				if (live)
					setError(String(cause instanceof Error ? cause.message : cause));
			},
		);
		return () => {
			live = false;
		};
	}, [store, state.view, state.observationRevision, offset]);
	const counts = recent
		? {
				all: Object.values(recent.counts).reduce((a, b) => a + b, 0),
				...recent.counts,
			}
		: { all: null, paper: null, software: null, method: null, idea: null };
	const notes =
		category === "all"
			? state.overview!.recentNotes
			: (recent?.groups[category] ?? []);
	return (
		<>
			{error && (
				<p role="alert" className="text-sm text-err">
					{error}
				</p>
			)}
			{state.view === "graph" && (
				<KnowledgeGraphView
					api={graphApi}
					nonce={state.observationRevision}
					revision={binding.revision}
					onOpenNote={store.openNote}
					unavailableReason={t.handoffUnavailable}
				/>
			)}
			{state.view === "jobs" && (
				<section aria-label={t.jobs}>
					{jobs ? (
						<>
							<p className="text-xs text-ink-dim">
								{jobs.total} {t.jobCount}
							</p>
							<ul className="divide-y divide-border">
								{jobs.items.map((job) => (
									<li key={job.key} className="py-3 text-sm">
										<p>
											{job.kind} · {job.path}
										</p>
										<p className="text-xs text-ink-faint">
											{job.scope} · {job.updated}
										</p>
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
									disabled={jobs.nextOffset === null}
									onClick={() => setOffset(jobs.nextOffset!)}
								>
									{t.nextPage}
								</Button>
							</div>
						</>
					) : (
						!error && <p role="status">{t.loading}</p>
					)}
				</section>
			)}
			{state.view === "reading" &&
				(state.selectedNote ? (
					<KnowledgeNoteView
						key={state.selectedNote.path}
						api={noteApi}
						nonce={state.observationRevision}
						path={state.selectedNote.path}
						initialPage={state.selectedNote}
						revision={binding.revision}
						onOpenNote={store.openNote}
						onClose={store.closeNote}
						unavailableReason={t.openUnavailable}
						renderText={(text) => (
							<>
								<Markdown
									text={text}
									onLink={(href) => {
										const path = href.startsWith("#")
											? new URLSearchParams(href.slice(1)).get("drone-note")
											: null;
										if (path) store.openNote(path);
										else setLinkNotice(t.inlineLinkUnavailable);
									}}
								/>
								{linkNotice && (
									<p role="status" className="mt-2 text-xs text-ink-dim">
										{linkNotice}
									</p>
								)}
							</>
						)}
					/>
				) : (
					<>
						<KnowledgeSearchView
							query={state.query}
							onQueryChange={store.setQuery}
							bindingRevision={binding.revision}
							activeCategory={category}
							onCategoryChange={setCategory}
							categoryCounts={counts}
							result={state.searchResult}
							busy={state.searchLoading}
							error={state.searchError}
							onSearch={store.search}
							onOpenNote={store.openNote}
						/>
						<p className="text-xs text-ink-dim">{t.readOnly}</p>
						<section aria-label={t.recent}>
							<h2 className="text-sm font-medium">{t.recent}</h2>
							{notes.length === 0 ? (
								!error && (
									<p className="mt-2 text-sm text-ink-dim">
										{category !== "all" && !recent ? t.loading : t.noRecent}
									</p>
								)
							) : (
								<ul className="mt-2 divide-y divide-border">
									{notes.map((note) => (
										<li key={note.path}>
											<button
												type="button"
												className="w-full py-3 text-left hover:bg-hover"
												onClick={() => store.openNote(note.path)}
											>
												<p className="text-sm">{note.title || note.path}</p>
												<p className="mt-1 break-all font-mono text-xs text-ink-faint">
													{note.path}
												</p>
											</button>
										</li>
									))}
								</ul>
							)}
						</section>
					</>
				))}
		</>
	);
}
