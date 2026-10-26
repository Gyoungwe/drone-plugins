import type { PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import {
	type FormEvent,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { Button, usePluginRuntime, useSessionsStore } from "./runtime-api";
import { useNativeKnowledgeText } from "./native-copy";
import { createKnowledgeRuntimeStore } from "./runtime-store";

export function NativeKnowledgeUnavailable() {
	const t = useNativeKnowledgeText();
	return (
		<section
			className="rounded-xl border border-border bg-surface p-4"
			aria-label={t.unsupportedTitle}
		>
			<h2 className="text-sm font-medium text-ink">{t.unsupportedTitle}</h2>
			<p className="mt-2 text-xs leading-relaxed text-ink-dim">
				{t.unsupported}
			</p>
		</section>
	);
}

function CallerKnowledgePage({ client }: { client: PluginUiRuntimeClient }) {
	const t = useNativeKnowledgeText();
	const store = useMemo(() => createKnowledgeRuntimeStore(client), [client]);
	const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
	const [query, setQuery] = useState("");
	useEffect(() => store.connect(), [store]);
	const overview = state.overview;
	async function submit(event: FormEvent) {
		event.preventDefault();
		const value = query.trim();
		if (value) await store.search(value);
	}
	return (
		<section
			className="knowledge-view"
			aria-label={t.title}
			data-testid="native-knowledge-page"
		>
			<div className="knowledge-view-body">
				<div className="mx-auto w-full max-w-5xl space-y-6 p-5 text-ink">
					<header className="flex items-center justify-between gap-4">
						<div>
							<h1 className="text-lg font-semibold">{t.title}</h1>
							{overview?.binding && (
								<p className="mt-1 text-xs text-ink-dim">
									{overview.binding.label} ·{" "}
									{overview.project
										? `${t.project}: ${overview.project}`
										: t.application}
								</p>
							)}
						</div>
						<Button
							size="sm"
							disabled={state.overviewLoading}
							onClick={() => void store.refresh()}
						>
							{state.overviewLoading ? t.loading : t.refresh}
						</Button>
					</header>
					{state.overviewError && (
						<p
							role="alert"
							className="rounded-xl border border-border p-4 text-sm text-err"
						>
							{state.overviewError}
						</p>
					)}
					{state.overviewLoading && !overview && (
						<p role="status" className="text-sm text-ink-dim">
							{t.loading}
						</p>
					)}
					{overview?.state === "unconfigured" && (
						<div className="rounded-xl border border-dashed border-border p-5">
							<h2 className="font-medium">{t.unconfigured}</h2>
							<p className="mt-2 text-sm text-ink-dim">{t.unconfiguredHint}</p>
						</div>
					)}
					{overview?.state === "bound" && (
						<>
							<p className="text-sm text-ink-dim">
								{overview.index
									? `${overview.index.noteCount} ${t.notes} · ${t[overview.index.coverage]}`
									: t.indexMissing}
							</p>
							<form
								className="flex gap-2"
								onSubmit={(event) => void submit(event)}
							>
								<label className="sr-only" htmlFor="native-knowledge-query">
									{t.query}
								</label>
								<input
									id="native-knowledge-query"
									type="search"
									maxLength={2000}
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder={t.searchHint}
									className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-ink-faint"
								/>
								<Button
									type="submit"
									size="sm"
									disabled={state.searchLoading || !query.trim()}
								>
									{state.searchLoading ? t.loading : t.search}
								</Button>
							</form>
							{state.searchError && (
								<p role="alert" className="text-sm text-err">
									{state.searchError}
								</p>
							)}
							{state.searchResult && (
								<section aria-label={t.results}>
									<h2 className="text-sm font-medium">{t.results}</h2>
									{!state.searchResult.complete && (
										<p role="status" className="mt-2 text-xs text-ink-dim">
											{t.incomplete}
										</p>
									)}
									{state.searchResult.hits.length === 0 && (
										<p className="mt-2 text-sm text-ink-dim">{t.noResults}</p>
									)}
									<ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
										{state.searchResult.hits.map((hit) => (
											<li key={hit.path} className="p-4">
												<h3 className="text-sm font-medium">
													{hit.title || hit.path}
												</h3>
												<p className="mt-1 break-all font-mono text-xs text-ink-faint">
													{hit.path} · {t.lines} {hit.startLine}–{hit.endLine}
												</p>
												<p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-dim">
													{hit.text}
												</p>
											</li>
										))}
									</ul>
									<p className="mt-2 text-xs text-ink-faint">{t.readOnly}</p>
								</section>
							)}
							<section aria-label={t.recent}>
								<h2 className="text-sm font-medium">{t.recent}</h2>
								{overview.recentNotes.length === 0 ? (
									<p className="mt-2 text-sm text-ink-dim">{t.noRecent}</p>
								) : (
									<ul className="mt-2 divide-y divide-border">
										{overview.recentNotes.map((note) => (
											<li key={note.path} className="py-3">
												<p className="text-sm">{note.title || note.path}</p>
												<p className="mt-1 break-all font-mono text-xs text-ink-faint">
													{note.path}
												</p>
											</li>
										))}
									</ul>
								)}
							</section>
						</>
					)}
					<NativeKnowledgeUnavailable />
				</div>
			</div>
		</section>
	);
}

export function NativeKnowledgePage() {
	const client = usePluginRuntime();
	const session = useSessionsStore((state) => state.activeSessionId);
	return <CallerKnowledgePage key={session ?? "application"} client={client} />;
}
