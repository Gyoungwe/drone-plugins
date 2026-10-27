import type { PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Button, usePluginRuntime, useSessionsStore } from "./runtime-api";
import { useNativeKnowledgeText } from "./native-copy";
import { NativeKnowledgePreferences } from "./NativeKnowledgePreferences";
import { NativeKnowledgeHistory } from "./NativeKnowledgeHistory";
import type { KnowledgeRuntimeState } from "./runtime-store";
import { NativeKnowledgeReviews } from "./NativeKnowledgeReviews";
import { NativeKnowledgeReading } from "./NativeKnowledgeReading";
import { createKnowledgeRuntimeStore } from "./runtime-store";

export function NativeKnowledgeUnavailable() {
	const t = useNativeKnowledgeText();
	return (
		<section className="rounded-xl border border-border bg-surface p-4" aria-label={t.unsupportedTitle}>
			<h2 className="text-sm font-medium text-ink">{t.unsupportedTitle}</h2>
			<p className="mt-2 text-xs leading-relaxed text-ink-dim">{t.unsupported}</p>
		</section>
	);
}

function CallerKnowledgePage({
	client,
	initialView,
}: {
	client: PluginUiRuntimeClient;
	initialView: KnowledgeRuntimeState["view"];
}) {
	const t = useNativeKnowledgeText();
	const store = useMemo(() => createKnowledgeRuntimeStore(client), [client]);
	const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
	useEffect(() => {
		const disconnect = store.connect();
		store.setView(initialView);
		return disconnect;
	}, [store, initialView]);
	const overview = state.overview;
	return (
		<section className="knowledge-view" aria-label={t.title} data-testid="native-knowledge-page">
			<div className="knowledge-view-body">
				<div className="mx-auto w-full max-w-5xl space-y-6 p-5 text-ink">
					<header className="flex items-center justify-between gap-4">
						<div>
							<h1 className="text-lg font-semibold">{t.title}</h1>
							{overview?.binding && (
								<p className="mt-1 text-xs text-ink-dim">
									{overview.binding.label} ·{" "}
									{overview.project ? `${t.project}: ${overview.project}` : t.application}
								</p>
							)}
						</div>
						<Button size="sm" disabled={state.overviewLoading} onClick={() => void store.refresh()}>
							{state.overviewLoading ? t.loading : t.refresh}
						</Button>
					</header>
					<nav className="flex gap-2" aria-label={t.readingNavigation}>
						{(["reading", "graph", "jobs", "reviews", "history", "settings"] as const).map((view) => (
							<Button
								key={view}
								size="sm"
								aria-pressed={state.view === view}
								disabled={view !== "settings" && !overview?.binding}
								onClick={() => store.setView(view)}
							>
								{t[view]}
							</Button>
						))}
					</nav>
					{state.view === "settings" && (
						<NativeKnowledgePreferences
							client={client}
							observationRevision={state.observationRevision}
							refreshing={state.overviewLoading}
						/>
					)}
					{state.overviewError && (
						<p role="alert" className="rounded-xl border border-border p-4 text-sm text-err">
							{state.overviewError}
						</p>
					)}
					{state.overviewLoading && !overview && (
						<p role="status" className="text-sm text-ink-dim">
							{t.loading}
						</p>
					)}
					{state.view !== "settings" && overview?.state === "unconfigured" && (
						<div className="rounded-xl border border-dashed border-border p-5">
							<h2 className="font-medium">{t.unconfigured}</h2>
							<p className="mt-2 text-sm text-ink-dim">{t.unconfiguredHint}</p>
						</div>
					)}
					{state.view !== "settings" && overview?.state === "bound" && (
						<>
							<p className="text-sm text-ink-dim">
								{overview.index
									? `${overview.index.noteCount} ${t.notes} · ${t[overview.index.coverage]}`
									: t.indexMissing}
							</p>
							{!state.overviewLoading &&
								(state.view === "history" ? (
									<NativeKnowledgeHistory store={store} observationRevision={state.observationRevision} />
								) : state.view === "reviews" ? (
									<NativeKnowledgeReviews store={store} observationRevision={state.observationRevision} />
								) : (
									<NativeKnowledgeReading key={state.view} store={store} state={state} />
								))}
						</>
					)}
					<NativeKnowledgeUnavailable />
				</div>
			</div>
		</section>
	);
}

export function NativeKnowledgePage({
	initialView = "reading",
}: {
	initialView?: KnowledgeRuntimeState["view"];
}) {
	const client = usePluginRuntime();
	const session = useSessionsStore((state) => state.activeSessionId);
	return <CallerKnowledgePage key={session ?? "application"} client={client} initialView={initialView} />;
}
