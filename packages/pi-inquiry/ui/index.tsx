import type { PluginRuntimeRootDescription } from "@gyoungwe/plugin-api/runtime";
import type { DroneUiRuntime } from "@gyoungwe/plugin-api/ui";
import { memo, useEffect, useRef, useState } from "react";
import type {
	ArtifactRecord,
	AttemptRecord,
	DecisionRecord,
} from "../src/models.js";

import type { InquiryService } from "../src/service.js";

type Snapshot = Awaited<ReturnType<InquiryService["readOnlyState"]>> & {
	attempts: readonly AttemptRecord[];
};

const host = (window as unknown as { DroneUI: DroneUiRuntime }).DroneUI;
interface Status {
	state: "select-workspace" | "needs-binding" | "bound" | "needs-recovery";
	projectId?: string | null;
	roots: readonly PluginRuntimeRootDescription[];
	canRestoreOriginal?: boolean;
}
const copy = {
	en: {
		title: "Inquiry ledger",
		refresh: "Refresh",
		loading: "Loading original ledger…",
		select: "Select an actual workspace session.",
		grant:
			"Authorize the original ledger directory independently for JSON metadata and binary state when enabling this plugin.",
		binary: "Binary state directory",
		metadata: "JSON metadata directory",
		choose: "Choose an approved directory",
		ack: "I am binding existing data to its actual workspace.",
		bind: "Bind original directory",
		reconcile: "Reconcile pending write",
		restore: "Restore original backup",
		pending:
			"A prior write needs explicit SHA reconciliation. No automatic retry will run.",
		busy: "Waiting for approval or owned cleanup…",
		cancel: "Cancel current invocation",
		questionId: "Question ID",
		question: "Research question",
		save: "Save question",
		questions: "Questions",
		artifacts: "Artifacts",
		decisions: "Decisions",
		attempts: "Attempts",
		findings: "Findings",
		reruns: "Reruns",
		empty: "No records.",
		provenance: "Read provenance",
		reason: "Human decision review reason",
		revoke: "Revoke decision",
		confirm: "Confirm reviewed artifacts",
		asserted:
			"These records are plugin-asserted or imported data; they are not independent host provenance proofs.",
		unavailable:
			"Re-run execution and workspace promotion are not connected yet.",
		bound: "Original project",
		original:
			"Restore replaces the current SQLite file with the exact original backup. Each write still requires approval.",
	},
	zh: {
		title: "Inquiry 研究账本",
		refresh: "刷新",
		loading: "正在读取原始账本…",
		select: "请先选择真实工作区会话。",
		grant:
			"启用插件时，请分别为 JSON 元数据和二进制状态授权同一个原始账本目录。",
		binary: "二进制状态目录",
		metadata: "JSON 元数据目录",
		choose: "选择已授权目录",
		ack: "我确认把现有数据绑定到其实际所属工作区。",
		bind: "绑定原始目录",
		reconcile: "核对未完成的写入",
		restore: "恢复原始备份",
		pending: "此前写入需要显式核对 SHA，不会自动重试。",
		busy: "正在等待授权或本次清理完成…",
		cancel: "取消当前调用",
		questionId: "问题 ID",
		question: "研究问题",
		save: "保存问题",
		questions: "问题",
		artifacts: "产物",
		decisions: "决策",
		attempts: "尝试",
		findings: "发现",
		reruns: "重跑",
		empty: "暂无记录。",
		provenance: "读取溯源",
		reason: "人工复核理由",
		revoke: "撤销决策",
		confirm: "确认已复核产物",
		asserted: "这些记录属于插件声明或导入数据，不能作为独立宿主溯源证明。",
		unavailable: "重跑执行器和工作区晋升仍未接入。",
		bound: "原始项目",
		original:
			"恢复将用原始备份的精确字节替换当前 SQLite 文件，每次写入仍需授权。",
	},
};
function Workspace() {
	const runtime = host.hooks.usePluginRuntime(),
		language = host.hooks.useLanguage(),
		t = copy[language];
	const [status, setStatus] = useState<Status | null>(null),
		[snapshot, setSnapshot] = useState<Snapshot | null>(null),
		[error, setError] = useState<string | null>(null),
		[busy, setBusy] = useState(false),
		[root, setRoot] = useState(""),
		[metadataRoot, setMetadataRoot] = useState(""),
		[ack, setAck] = useState(false),
		[questionId, setQuestionId] = useState(""),
		[statement, setStatement] = useState(""),
		[reason, setReason] = useState(""),
		[provenance, setProvenance] = useState<unknown>(null);
	const live = useRef(true),
		active = useRef<AbortController | undefined>(undefined);
	const read = async (input: unknown) =>
		(await runtime.invoke("inquiry.read", input)) as { value: Snapshot };
	const refresh = async () => {
		const value = (await runtime.invoke("inquiry.read", {
			action: "status",
		})) as Status;
		const data =
			value.state === "bound"
				? (await read({ action: "snapshot" })).value
				: null;
		if (live.current) {
			setStatus(value);
			setSnapshot(data);
			setError(null);
		}
	};
	useEffect(() => {
		live.current = true;
		const load = () => {
			void refresh().catch((cause) => {
				if (live.current)
					setError(cause instanceof Error ? cause.message : String(cause));
			});
		};
		load();
		const stop = runtime.subscribe(load);
		return () => {
			live.current = false;
			active.current?.abort(new Error("Inquiry UI closed"));
			stop();
		};
	}, [runtime]);
	const act = async (input: unknown) => {
		const controller = new AbortController();
		active.current = controller;
		setBusy(true);
		setError(null);
		try {
			await runtime.invoke("inquiry.write", input, controller.signal);
			await refresh();
		} catch (cause) {
			if (live.current)
				setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			active.current = undefined;
			if (live.current) setBusy(false);
		}
	};
	const save = () => {
		if (!status?.projectId) throw new Error("Inquiry project is not bound");
		const now = new Date().toISOString();
		return act({
			action: "recordQuestion",
			record: {
				id: questionId,
				schemaVersion: 2,
				projectId: status.projectId,
				kind: "question",
				statement,
				competingExplanations: [],
				testsDone: [],
				testsPlanned: [],
				status: "open",
				proposer: "user",
				priority: 0.5,
				createdAt: now,
				updatedAt: now,
			},
		});
	};
	const inspect = async (record: ArtifactRecord) => {
		setError(null);
		try {
			const value = (await runtime.invoke("inquiry.read", {
				action: "artifactProvenance",
				id: record.id,
			})) as { value: unknown };
			if (live.current) setProvenance(value.value);
		} catch (cause) {
			if (live.current)
				setError(cause instanceof Error ? cause.message : String(cause));
		}
	};
	const decision = (
		record: DecisionRecord,
		action: "revokeDecision" | "confirmDecision",
	) => act({ action, id: record.id, reason });
	return (
		<section
			className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm"
			data-testid="inquiry-workspace"
		>
			<header className="flex items-center justify-between">
				<h2 className="font-semibold">{t.title}</h2>
				<button
					type="button"
					disabled={busy}
					onClick={() =>
						void refresh().catch((cause) =>
							setError(cause instanceof Error ? cause.message : String(cause)),
						)
					}
				>
					{t.refresh}
				</button>
			</header>
			{error && (
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}
			{!status ? (
				<p>{t.loading}</p>
			) : status.state === "select-workspace" ? (
				<p>{t.select}</p>
			) : (
				<>
					{status.state === "needs-binding" && (
						<fieldset disabled={busy} className="flex flex-col gap-2">
							<p>{t.grant}</p>
							<label>
								{t.binary}
								<select
									aria-label={t.binary}
									value={root}
									onChange={(event) => setRoot(event.target.value)}
								>
									<option value="">{t.choose}</option>
									{status.roots
										.filter((value) => value.kind === "binary-state")
										.map((value) => (
											<option key={value.handle} value={value.handle}>
												{value.path}
											</option>
										))}
								</select>
							</label>
							<label>
								{t.metadata}
								<select
									aria-label={t.metadata}
									value={metadataRoot}
									onChange={(event) => setMetadataRoot(event.target.value)}
								>
									<option value="">{t.choose}</option>
									{status.roots
										.filter((value) => value.kind === "state")
										.map((value) => (
											<option key={value.handle} value={value.handle}>
												{value.path}
											</option>
										))}
								</select>
							</label>
							<label>
								<input
									type="checkbox"
									checked={ack}
									onChange={(event) => setAck(event.target.checked)}
								/>
								{t.ack}
							</label>
							<button
								type="button"
								disabled={!root || !metadataRoot || !ack}
								onClick={() =>
									void act({
										action: "bind",
										root,
										metadataRoot,
										acknowledgeExistingData: ack,
									})
								}
							>
								{t.bind}
							</button>
						</fieldset>
					)}
					{status.state === "needs-recovery" && (
						<div>
							<p>{t.pending}</p>
							<button
								type="button"
								disabled={busy}
								onClick={() => void act({ action: "reconcile" })}
							>
								{t.reconcile}
							</button>
						</div>
					)}
					{status.state === "bound" && (
						<>
							<p className="break-all">
								{t.bound}: {status.projectId}
							</p>
							<fieldset disabled={busy} className="flex flex-col gap-2">
								<label>
									{t.questionId}
									<input
										aria-label={t.questionId}
										value={questionId}
										onChange={(event) => setQuestionId(event.target.value)}
									/>
								</label>
								<label>
									{t.question}
									<textarea
										aria-label={t.question}
										value={statement}
										onChange={(event) => setStatement(event.target.value)}
									/>
								</label>
								<button
									type="button"
									disabled={!questionId.trim() || !statement.trim()}
									onClick={() => void save()}
								>
									{t.save}
								</button>
							</fieldset>
							{snapshot && (
								<>
									<section>
										<h3>
											{t.questions} ({snapshot.questions.length})
										</h3>
										{snapshot.questions.length === 0 ? (
											<p>{t.empty}</p>
										) : (
											<ul>
												{snapshot.questions.map((record) => (
													<li
														key={record.id}
														className="rounded border border-border p-2"
													>
														<strong>{record.statement}</strong>
														<p>
															{record.id} · {record.status}
														</p>
													</li>
												))}
											</ul>
										)}
									</section>
									<section>
										<h3>
											{t.artifacts} ({snapshot.artifacts.length})
										</h3>
										{snapshot.artifacts.length === 0 ? (
											<p>{t.empty}</p>
										) : (
											<ul>
												{snapshot.artifacts.map((record) => (
													<li
														key={record.id}
														className="rounded border border-border p-2"
													>
														<p className="break-all">{record.path}</p>
														<p>
															{record.status} · {record.sha256}
														</p>
														<button
															type="button"
															disabled={busy}
															onClick={() => void inspect(record)}
														>
															{t.provenance}
														</button>
													</li>
												))}
											</ul>
										)}
										{provenance !== null && (
											<pre className="overflow-auto whitespace-pre-wrap break-all">
												{JSON.stringify(provenance, null, 2)}
											</pre>
										)}
									</section>
									<section>
										<h3>
											{t.decisions} ({snapshot.decisions.length})
										</h3>
										<label>
											{t.reason}
											<input
												aria-label={t.reason}
												value={reason}
												onChange={(event) => setReason(event.target.value)}
											/>
										</label>
										{snapshot.decisions.length === 0 ? (
											<p>{t.empty}</p>
										) : (
											<ul>
												{snapshot.decisions.map((record) => (
													<li
														key={record.id}
														className="rounded border border-border p-2"
													>
														<strong>{record.summary}</strong>
														<p>
															{record.id} · {record.status}
														</p>
														<button
															type="button"
															disabled={busy || !reason.trim()}
															onClick={() =>
																void decision(
																	record,
																	record.status === "revoked"
																		? "confirmDecision"
																		: "revokeDecision",
																)
															}
														>
															{record.status === "revoked"
																? t.confirm
																: t.revoke}
														</button>
													</li>
												))}
											</ul>
										)}
									</section>
									<p>
										{t.attempts}: {snapshot.attempts.length} · {t.findings}:{" "}
										{snapshot.findings.length} · {t.reruns}:{" "}
										{snapshot.reruns.length}
									</p>
								</>
							)}
							<div>
								<p>{t.original}</p>
								<button
									type="button"
									disabled={busy || !status.canRestoreOriginal}
									onClick={() => void act({ action: "restoreOriginal" })}
								>
									{t.restore}
								</button>
							</div>
						</>
					)}
				</>
			)}
			{busy && (
				<div role="status">
					<p>{t.busy}</p>
					<button
						type="button"
						onClick={() =>
							active.current?.abort(new Error("Inquiry invocation cancelled"))
						}
					>
						{t.cancel}
					</button>
				</div>
			)}
			<p className="text-xs text-muted">{t.asserted}</p>
			<p className="text-xs text-muted">{t.unavailable}</p>
		</section>
	);
}
export const InquiryPanel = memo(function InquiryPanel() {
	const sessionId = host.stores.useSessionsStore(
		(state) => state.activeSessionId,
	);
	return <Workspace key={sessionId} />;
});
