/** @jsxRuntime automatic */
import type {
	DroneUiRuntime,
	PluginUiRuntimeClient,
	ResearchRunDetail,
	ResearchRunListItem,
} from "@gyoungwe/plugin-api/ui";
import { useEffect, useState } from "react";
import { type ResearchRunsText, researchRunsCopy } from "./research-runs-copy.js";

declare global {
	interface Window {
		DroneUI: DroneUiRuntime;
	}
}

function host(): DroneUiRuntime {
	return window.DroneUI;
}

function useRuns(runtime: PluginUiRuntimeClient, project: string | null) {
	const [runs, setRuns] = useState<ResearchRunListItem[]>([]);
	const [runId, select] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let live = true;
		void runtime.invoke("listRuns", { project, limit: 8 }).then(
			(result) => {
				if (!live) return;
				const { items } = result as { items: ResearchRunListItem[]; total: number };
				setRuns(items);
				select(items.length ? items[0].runId : null);
				setLoading(false);
			},
			(cause) => {
				if (!live) return;
				setError(cause instanceof Error ? cause.message : String(cause));
				setLoading(false);
			},
		);
		return () => {
			live = false;
		};
	}, [runtime, project]);
	return { runs, runId, select, loading, error };
}

function useRunDetail(runtime: PluginUiRuntimeClient, runId: string | null) {
	const [selected, setSelected] = useState<ResearchRunDetail | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		if (!runId) return;
		let live = true;
		setSelected(null);
		setLoading(true);
		setError(null);
		void runtime.invoke("detail", { runId }).then(
			(result) => {
				if (!live) return;
				setSelected(result as ResearchRunDetail);
				setLoading(false);
			},
			(cause) => {
				if (!live) return;
				setError(cause instanceof Error ? cause.message : String(cause));
				setLoading(false);
			},
		);
		return () => {
			live = false;
		};
	}, [runtime, runId]);
	return { selected, loading, error };
}

function RunList({
	runs,
	runId,
	select,
}: {
	runs: ResearchRunListItem[];
	runId: string | null;
	select: (runId: string) => void;
}) {
	return (
		<div className="space-y-1">
			{runs.map((run) => (
				<button
					key={run.runId}
					type="button"
					aria-pressed={runId === run.runId}
					onClick={() => select(run.runId)}
					className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${runId === run.runId ? "border-ink-faint bg-[var(--highlight)]" : "border-border hover:bg-hover"}`}
				>
					<div className="flex items-center justify-between gap-2">
						<span className="truncate font-medium">{run.resultSlug}</span>
						<span className="text-[11px] text-ink-faint">{run.stage}</span>
					</div>
					<p className="mt-1 line-clamp-2 text-xs text-ink-dim">{run.query || run.runId}</p>
				</button>
			))}
		</div>
	);
}

type DetailProps = { run: ResearchRunDetail; t: ResearchRunsText };

function RunSummary({ run, t }: DetailProps) {
	const { RoadmapLane } = host().components;
	return (
		<>
			<div className="rounded-lg bg-hover px-3 py-2 text-xs">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<strong>{run.runId}</strong>
					<span>{run.status}</span>
					<span>
						{t.archive}: {run.archive.count + run.archive.reused}
					</span>
					<span>
						{t.integrity}: {run.integrity ? `${run.integrity.verified}/${run.integrity.checked}` : t.unknown}
					</span>
				</div>
				<p className="mt-1 text-ink-dim">{run.query}</p>
			</div>
			<div className="mt-3">
				<RoadmapLane
					testId="research-route"
					nodes={run.route.map((node) => ({
						key: node.key,
						label: node.key,
						status: host().helpers.roadmapStatus(node.state),
						detail: node.state,
					}))}
				/>
			</div>
			<p className="mt-2 text-xs text-ink-dim">{t.routeHint}</p>
			<p className="mt-2 text-xs text-ink-dim">{t.unverified}</p>
		</>
	);
}

function RunHistory({ run, t }: DetailProps) {
	return (
		<>
			{run.gaps && run.gaps.length > 0 && (
				<p className="mt-2 text-xs text-warn">
					{t.gaps}: {run.gaps.join(" · ")}
				</p>
			)}
			{run.governance &&
				run.governance.duplicateSources.length +
					run.governance.staleSources.length +
					run.governance.unavailableSources.length >
					0 && (
					<p className="mt-2 text-xs text-warn">
						{t.governance}: {run.governance.duplicateSources.length} {t.duplicates},{" "}
						{run.governance.staleSources.length} {t.stale}, {run.governance.unavailableSources.length}{" "}
						{t.unavailable}
					</p>
				)}
			{run.timeline && run.timeline.length > 0 && (
				<details className="mt-2 text-xs">
					<summary className="cursor-pointer font-medium">
						{t.timeline} ({run.timeline.length})
					</summary>
					<ol className="mt-2 space-y-1 border-l border-border pl-3">
						{run.timeline.slice(-12).map((event) => (
							<li
								key={`${event.at}-${event.type}`}
								className={event.status === "failed" ? "text-err" : "text-ink-dim"}
							>
								<span className="font-medium">{event.type}</span>
								{event.detail ? ` · ${event.detail}` : ""}
							</li>
						))}
					</ol>
				</details>
			)}
		</>
	);
}

function RunEvidence({ run, t }: DetailProps) {
	const openResourcePreview = host().stores.useUiStore((state) => state.openResourcePreview);
	return (
		<>
			<div className="mt-3 grid gap-2 sm:grid-cols-3">
				{[
					[t.sources, run.sources.length],
					[t.claims, run.claims.length],
					[t.coverage, run.coverage ? t.recorded : t.unknown],
				].map(([label, value]) => (
					<div key={label} className="rounded-lg border border-border px-3 py-2 text-xs">
						<span className="text-ink-dim">{label}</span>
						<strong className="ml-2">{value}</strong>
					</div>
				))}
			</div>
			{run.warnings.length > 0 && <p className="mt-2 text-xs text-warn">{run.warnings.join(" · ")}</p>}
			{run.sources.length > 0 && (
				<div className="mt-2 space-y-1 text-xs">
					<p className="text-ink-dim">{t.sources}</p>
					{run.sources.slice(0, 8).map((source) => (
						<button
							key={source.path}
							type="button"
							onClick={() => openResourcePreview({ href: source.path, label: source.path })}
							className="block max-w-full truncate text-left text-link hover:underline"
						>
							{source.verified ? "✓" : "!"} {source.path}
						</button>
					))}
				</div>
			)}
			{run.claims.length > 0 && (
				<ul className="mt-2 space-y-1 text-xs text-ink-dim">
					{run.claims.slice(0, 6).map((claim) => (
						<li key={claim.id || claim.claim}>
							<span className="font-medium">[{claim.relationship || claim.status}]</span> {claim.claim}
							{claim.limitations && <span className="text-ink-faint"> · {claim.limitations}</span>}
						</li>
					))}
				</ul>
			)}
			{run.provenance && (
				<div className="mt-3 rounded-lg border border-border px-3 py-2 text-xs">
					<span className="text-ink-dim">{t.provenance}: </span>
					<span>{run.provenance.status}</span>
					{run.provenance.limitations.length > 0 && (
						<span className="ml-2 text-ink-faint">{run.provenance.limitations.join(" · ")}</span>
					)}
				</div>
			)}
		</>
	);
}

function WorkspaceRunsCard({ project }: { project: string | null }) {
	const runtime = host().hooks.usePluginRuntime();
	const t = researchRunsCopy[host().hooks.useLanguage()];
	const list = useRuns(runtime, project);
	const detail = useRunDetail(runtime, list.runId);
	const loading = list.loading || detail.loading;
	const error = list.error || detail.error;
	return (
		<section className="rounded-xl border border-border p-4" data-testid="research-runs-card">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h3 className="text-xs font-semibold">{t.title}</h3>
					<p className="mt-1 text-xs text-ink-dim">{t.hint}</p>
				</div>
				{detail.selected && (
					<span className="rounded-full bg-hover px-2 py-0.5 text-xs text-ink-dim">
						{detail.selected.answerable ? t.answerable : t.inProgress}
					</span>
				)}
			</div>
			{loading && (
				<p role="status" className="mt-3 text-xs text-ink-dim">
					{t.loading}
				</p>
			)}
			{error && (
				<p role="alert" className="mt-3 break-words text-xs text-err">
					{error}
				</p>
			)}
			{!loading && !error && !list.runs.length && <p className="mt-3 text-xs text-ink-dim">{t.empty}</p>}
			{list.runs.length > 0 && (
				<div className="mt-3 grid gap-3 lg:grid-cols-[minmax(180px,0.35fr)_minmax(0,1fr)]">
					<RunList runs={list.runs} runId={list.runId} select={list.select} />
					{detail.selected && (
						<div className="min-w-0">
							<RunSummary run={detail.selected} t={t} />
							<RunHistory run={detail.selected} t={t} />
							<RunEvidence run={detail.selected} t={t} />
						</div>
					)}
				</div>
			)}
		</section>
	);
}

export function ResearchRunsCard({ project = null }: { project?: string | null }) {
	const sessionId = host().stores.useSessionsStore((state) => state.activeSessionId);
	return <WorkspaceRunsCard key={`${sessionId}:${project}`} project={project} />;
}
