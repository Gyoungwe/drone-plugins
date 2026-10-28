import { memo, useEffect, useState } from "react";
import type { DroneUiRuntime } from "@gyoungwe/plugin-api/ui";
import type {
	PluginRuntimeScope,
	PluginRuntimeRootDescription,
} from "@gyoungwe/plugin-api/runtime";
import type { DiscoveryWorkspaceBinding } from "../src/runtime.js";
import type { DiscoveryExplorationPlan } from "../src/projections.js";

const host = (window as unknown as { DroneUI: DroneUiRuntime }).DroneUI;
interface Overview {
	readonly scope: PluginRuntimeScope;
	readonly readiness: string;
	readonly roots: readonly {
		root: PluginRuntimeRootDescription;
		binding: DiscoveryWorkspaceBinding | null;
		hasExistingData: boolean;
	}[];
	readonly journals: readonly { journal: string; count: number }[];
}
const copy = {
	en: {
		title: "Discovery",
		select: "Select a real workspace session.",
		empty:
			"Authorize a discovery state directory when enabling this plugin. To keep Desktop records, select the existing hashed discovery directory itself.",
		existing:
			"Existing journals will be preserved. Bind them only to their actual workspace.",
		bind: "Bind this directory",
		take: "Take ownership and preserve records",
		bound: "Workspace journals",
		plan: "Create an exploration plan",
		budget:
			"Budget: at most 2 executions, 30 seconds, 64 KiB output and 2 cost units. Saving does not run code.",
		hypothesis: "Hypothesis ID",
		candidate: "Candidate test",
		create: "Save plan",
		loading: "Loading…",
		busy: "Waiting for authorization…",
		refresh: "Refresh",
		unavailable:
			"Kernel execution, critic, multipath and evaluation are awaiting their controlled host ports. This view does not execute code.",
		plans: "Plans",
		noPlans: "No plans yet.",
	},
	zh: {
		title: "探索",
		select: "请先选择一个真实工作区会话。",
		empty:
			"启用插件时请授权探索状态目录。若要接续桌面记录，请选择已有的 discovery 哈希目录本身。",
		existing: "已有日志将原样保留。请只绑定到它们实际所属的工作区。",
		bind: "绑定此目录",
		take: "接管写者并保留已有记录",
		bound: "工作区日志",
		plan: "创建探索计划",
		budget:
			"预算：最多 2 次执行、30 秒、64 KiB 输出及 2 个成本单位。保存不会执行代码。",
		hypothesis: "假设 ID",
		candidate: "候选检验",
		create: "保存计划",
		loading: "正在读取…",
		busy: "等待授权…",
		refresh: "刷新",
		unavailable:
			"内核执行、批评者、多路径和评估仍等待受控宿主端口接入。此页面不会执行代码。",
		plans: "计划",
		noPlans: "暂无计划。",
	},
};
function WorkspacePanel() {
	const runtime = host.hooks.usePluginRuntime();
	const language = host.hooks.useLanguage();
	const t = copy[language];
	const [overview, setOverview] = useState<Overview | null>(null);
	const [plans, setPlans] = useState<readonly DiscoveryExplorationPlan[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [hypothesis, setHypothesis] = useState("");
	const [candidate, setCandidate] = useState("");
	const refresh = async () => {
		const current = (await runtime.invoke("overview", null)) as Overview;
		setOverview(current);
		if (current.scope.kind !== "application" && current.readiness === "ready") {
			const result = (await runtime.invoke("listRecords", {
				journal: "plans",
			})) as { records: DiscoveryExplorationPlan[] };
			setPlans(result.records);
		} else setPlans([]);
	};
	useEffect(() => {
		let live = true;
		const read = async () => {
			const current = (await runtime.invoke("overview", null)) as Overview;
			if (!live) return;
			const rows =
				current.scope.kind !== "application" && current.readiness === "ready"
					? (
							(await runtime.invoke("listRecords", { journal: "plans" })) as {
								records: DiscoveryExplorationPlan[];
							}
						).records
					: [];
			if (live) {
				setOverview(current);
				setPlans(rows);
				setError(null);
			}
		};
		const load = () => {
			void read().then(undefined, (cause) => {
				if (live)
					setError(cause instanceof Error ? cause.message : String(cause));
			});
		};
		load();
		const unsubscribe = runtime.subscribe(load);
		return () => {
			live = false;
			unsubscribe();
		};
	}, [runtime]);
	const act = async (operation: string, input: unknown) => {
		setBusy(true);
		setError(null);
		try {
			await runtime.invoke(operation, input);
			await refresh();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setBusy(false);
		}
	};
	return (
		<section
			className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm"
			data-testid="discovery-workspace"
		>
			<header className="flex items-center justify-between">
				<h2 className="font-semibold">{t.title}</h2>
				<button disabled={busy} onClick={() => void act("overview", null)}>
					{t.refresh}
				</button>
			</header>
			{error && (
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}
			{!overview ? (
				<p>{t.loading}</p>
			) : overview.scope.kind === "application" ? (
				<p>{t.select}</p>
			) : (
				<>
					<p className="break-all text-xs text-muted">
						{overview.scope.workspaceDirectory}
					</p>
					{overview.roots.length === 0 && <p>{t.empty}</p>}
					{overview.roots.map(({ root, binding, hasExistingData }) => (
						<article
							key={root.handle}
							className="rounded-lg border border-border p-3"
						>
							<p className="break-all">{root.path}</p>
							{hasExistingData && !binding && <p>{t.existing}</p>}
							{root.access === "read-write" &&
								(!binding ||
									binding.workspaceId ===
										(overview.scope.kind === "application"
											? null
											: overview.scope.workspaceId)) && (
									<button
										disabled={busy}
										onClick={() =>
											void act("bindCurrentWorkspace", {
												root: root.handle,
												acknowledgeExistingData: hasExistingData,
											})
										}
									>
										{hasExistingData || binding ? t.take : t.bind}
									</button>
								)}
						</article>
					))}
					<h3 className="font-medium">{t.bound}</h3>
					<dl className="grid grid-cols-2 gap-2">
						{overview.journals.map((item) => (
							<div key={item.journal}>
								<dt>{item.journal}</dt>
								<dd>{item.count}</dd>
							</div>
						))}
					</dl>
					{overview.readiness === "ready" && (
						<form
							onSubmit={(event) => {
								event.preventDefault();
								void act("createExplorationPlan", {
									id: `plan-${Date.now()}`,
									hypothesisId: hypothesis,
									prior: {
										direction: "unknown",
										recordedAt: new Date().toISOString(),
									},
									budget: {
										maxExecutions: 2,
										maxWallTimeMs: 30000,
										maxOutputBytes: 65536,
										maxCostUnits: 2,
									},
									candidates: [
										{
											id: "candidate-1",
											statement: candidate,
											surprise: 0.5,
											estimatedCost: 1,
											expectedExplanationsExcluded: 1,
											credibility: 0.5,
										},
									],
								});
							}}
							className="space-y-2"
						>
							<h3 className="font-medium">{t.plan}</h3>
							<p className="text-xs text-muted">{t.budget}</p>
							<label className="block">
								{t.hypothesis}
								<input
									aria-label={t.hypothesis}
									required
									value={hypothesis}
									onChange={(event) => setHypothesis(event.target.value)}
									className="block w-full rounded border border-border p-2"
								/>
							</label>
							<label className="block">
								{t.candidate}
								<textarea
									aria-label={t.candidate}
									required
									value={candidate}
									onChange={(event) => setCandidate(event.target.value)}
									className="block w-full rounded border border-border p-2"
								/>
							</label>
							<button disabled={busy}>{t.create}</button>
						</form>
					)}
					<h3 className="font-medium">{t.plans}</h3>
					{plans.length === 0 ? (
						<p>{t.noPlans}</p>
					) : (
						<ul>
							{plans.map((plan) => (
								<li key={plan.id} className="rounded border border-border p-2">
									<strong>{plan.hypothesisId}</strong>
									<p>{plan.id}</p>
									<p>{plan.rankedCandidateIds.join(", ")}</p>
								</li>
							))}
						</ul>
					)}
				</>
			)}
			{busy && <p role="status">{t.busy}</p>}
			<p className="text-xs text-muted">{t.unavailable}</p>
		</section>
	);
}
export const DiscoveryPanel = memo(function DiscoveryPanel() {
	const sessionId = host.stores.useSessionsStore(
		(state) => state.activeSessionId,
	);
	return <WorkspacePanel key={sessionId} />;
});
