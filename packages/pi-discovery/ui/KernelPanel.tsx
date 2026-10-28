import { useEffect, useRef, useState } from "react";
import type { DroneUiRuntime } from "@gyoungwe/plugin-api/ui";
import type { PluginExecutionDescription } from "@gyoungwe/plugin-api/runtime";
import type { KernelExecution } from "../src/domain/kernel.js";
import type { DiscoveryKernelSession } from "../src/projections.js";

const host = (window as unknown as { DroneUI: DroneUiRuntime }).DroneUI;
type Kernel = DiscoveryKernelSession & {
	ownership: "own" | "another-creator" | "historical";
	ownershipState: string;
	image: string | null;
};
interface Intent {
	requestId: string;
	sessionId: string;
	status: string;
	verification: "host-verified-this-activation" | "historical-unverified";
}
interface Snapshot {
	kernels: Kernel[];
	intents: Intent[];
}
const words = {
	en: {
		title: "Controlled code execution",
		logical:
			"Creating a logical kernel saves its creator and budget. It does not start a container.",
		budget:
			"Per kernel: 2 attempts; each code run up to 30 seconds and 64 KiB output. Network stays disabled; only its runs directory is writable.",
		engineMissing: "No reachable container engine. No code can run.",
		imageMissing:
			"The configured language image is not cached. No image is pulled and no code can run.",
		language: "Language",
		classification: "Data classification",
		image: "Configured cached image",
		create: "Create logical kernel",
		kernels: "Workspace logical kernels",
		none: "No logical kernels.",
		select: "Select your logical kernel",
		code: "Code (shown in the approval)",
		run: "Approve and run code",
		cancel: "Cancel active invocation",
		close: "Close my kernel",
		reconcile: "Reconcile my receipts and observed closures",
		cancelled:
			"Invocation cancelled. Reconcile to save the host's terminal receipt with a fresh authorized call.",
		own: "Current session",
		other: "Another session",
		historical: "Historical record; no live kernel",
		unverified: "Historical outcome; not verified by this application",
		verified: "Host outcome checked in this activation",
		receipts: "Execution intents and receipts",
		noReceipts: "No execution requests.",
		output: "Latest filtered execution result",
		busy: "Waiting for authorization or verified cleanup…",
		ready: "Logical kernel ready",
		running: "Executing",
		closed: "Closed",
		idle: "Idle timeout",
		needs: "Needs container",
		cleanup: "Cleanup unverified; recovery required",
		changed: "The configured image changed. Create a new logical kernel before execution.",
	},
	zh: {
		title: "受控代码执行",
		logical: "创建逻辑内核仅保存创建者与预算，不会启动容器。",
		budget:
			"每个内核最多 2 次尝试；每次代码执行最多 30 秒、64 KiB 输出。禁用网络，只可写本次 runs 目录。",
		engineMissing: "容器引擎不可用，不能运行代码。",
		imageMissing: "当前语言配置的镜像未缓存。不会拉取镜像，也不能运行代码。",
		language: "语言",
		classification: "数据分类",
		image: "配置对应的缓存镜像",
		create: "创建逻辑内核",
		kernels: "工作区逻辑内核",
		none: "暂无逻辑内核。",
		select: "选择本会话的逻辑内核",
		code: "代码（授权时会完整展示）",
		run: "批准并运行代码",
		cancel: "取消当前调用",
		close: "关闭本会话内核",
		reconcile: "核对本会话回执并保存已观察到的关闭状态",
		cancelled: "调用已取消。请用新的合法调用核对并保存宿主终态回执。",
		own: "当前会话",
		other: "其他会话",
		historical: "历史记录，没有活动内核",
		unverified: "历史结果，未经当前应用验证",
		verified: "本次启用已核对宿主结果",
		receipts: "执行请求与回执",
		noReceipts: "暂无执行请求。",
		output: "最近一次经过策略过滤的执行结果",
		busy: "等待授权或确认清理…",
		ready: "逻辑内核已就绪",
		running: "执行中",
		closed: "已关闭",
		idle: "空闲超时",
		needs: "需要容器",
		cleanup: "清理未验证，需要恢复",
		changed: "配置镜像已改变，请先创建新的逻辑内核。",
	},
};
export function KernelPanel() {
	const runtime = host.hooks.usePluginRuntime(),
		language = host.hooks.useLanguage(),
		t = words[language];
	const [environment, setEnvironment] = useState<PluginExecutionDescription | null>(null);
	const [snapshot, setSnapshot] = useState<Snapshot>({ kernels: [], intents: [] });
	const [kernelLanguage, setKernelLanguage] = useState<"python" | "r">("python");
	const [classification, setClassification] = useState("internal");
	const [selected, setSelected] = useState("");
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false),
		[running, setRunning] = useState(false);
	const [error, setError] = useState<string | null>(null),
		[latest, setLatest] = useState<KernelExecution | null>(null);
	const executing = useRef<AbortController | null>(null),
		live = useRef(true);
	const load = async () => {
		const nextEnvironment = (await runtime.invoke(
			"executionDescription",
			null,
		)) as PluginExecutionDescription;
		if (!live.current) return;
		const next = (await runtime.invoke("listKernelSessions", null)) as Snapshot;
		if (live.current) {
			setEnvironment(nextEnvironment);
			setSnapshot(next);
		}
	};
	useEffect(() => {
		live.current = true;
		const read = () => {
			void load().then(undefined, (cause) => {
				if (live.current) setError(cause instanceof Error ? cause.message : String(cause));
			});
		};
		read();
		const stop = runtime.subscribe(read);
		return () => {
			live.current = false;
			stop();
		};
	}, [runtime]);
	const act = async (operation: string, input: unknown) => {
		setBusy(true);
		setError(null);
		try {
			const result = await runtime.invoke(operation, input);
			if (live.current && operation === "createKernelSession")
				setSelected((result as { kernel: { sessionId: string } }).kernel.sessionId);
			await load();
		} catch (cause) {
			if (live.current) setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			if (live.current) setBusy(false);
		}
	};
	const execute = async () => {
		const controller = new AbortController();
		executing.current = controller;
		setRunning(true);
		setBusy(true);
		setError(null);
		try {
			const result = await runtime.invoke(
				"executeKernel",
				{ sessionId: selected, code },
				controller.signal,
			);
			if (live.current) setLatest((result as { execution: KernelExecution }).execution);
		} catch (cause) {
			if (live.current)
				setError(
					controller.signal.aborted
						? t.cancelled
						: cause instanceof Error
							? cause.message
							: String(cause),
				);
		} finally {
			executing.current = null;
			if (live.current) {
				setBusy(false);
				setRunning(false);
				await load();
			}
		}
	};
	const own = snapshot.kernels.filter(
		(kernel) => kernel.ownership === "own" && kernel.ownershipState === "active",
	);
	const current = own.find((kernel) => kernel.sessionId === selected);
	const configuredImage = environment?.images[kernelLanguage];
	const currentImage = current ? environment?.images[current.language] : undefined;
	const status = {
		ready: t.ready,
		running: t.running,
		closed: t.closed,
		"idle-timeout": t.idle,
		"needs-container": t.needs,
		"cleanup-failed": t.cleanup,
	};
	return (
		<section
			className="space-y-3 rounded-lg border border-border p-3"
			data-testid="discovery-kernels"
		>
			<h3 className="font-medium">{t.title}</h3>
			<p>{t.logical}</p>
			<p className="text-xs text-muted">{t.budget}</p>
			{error && (
				<p role="alert" className="text-red-600">
					{error}
				</p>
			)}
			{environment?.kind === "unavailable" && <p role="status">{t.engineMissing}</p>}
			{environment?.kind === "container" && !configuredImage && (
				<p role="status">{t.imageMissing}</p>
			)}
			<form
				className="space-y-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (!configuredImage) return;
					const sessionId = `kernel-${crypto.randomUUID()}`;
					void act("createKernelSession", {
						sessionId,
						runDirectory: `runs/${sessionId}`,
						language: kernelLanguage,
						image: configuredImage,
						dataClassification: classification,
						idleTimeoutMs: 120000,
						executionTimeoutMs: 30000,
						maxExecutions: 2,
						maxOutputBytes: 65536,
					});
				}}
			>
				<label className="block">
					{t.language}
					<select
						aria-label={t.language}
						value={kernelLanguage}
						onChange={(event) => setKernelLanguage(event.target.value as "python" | "r")}
					>
						<option value="python">Python</option>
						<option value="r">R</option>
					</select>
				</label>
				<label className="block">
					{t.classification}
					<select
						aria-label={t.classification}
						value={classification}
						onChange={(event) => setClassification(event.target.value)}
					>
						{["public", "internal", "controlled", "restricted"].map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
				</label>
				{configuredImage && (
					<p className="break-all text-xs">
						{t.image}: <code>{configuredImage}</code>
					</p>
				)}
				<button disabled={busy || !configuredImage}>{t.create}</button>
			</form>
			<h4>{t.kernels}</h4>
			{snapshot.kernels.length === 0 ? (
				<p>{t.none}</p>
			) : (
				<ul className="space-y-2">
					{snapshot.kernels.map((kernel) => (
						<li key={kernel.sessionId} className="rounded border border-border p-2">
							<code>{kernel.sessionId}</code>
							<p>
								{status[kernel.status]} ·{" "}
								{kernel.ownership === "own"
									? t.own
									: kernel.ownership === "historical"
										? t.historical
										: t.other}
							</p>
							<p>
								{kernel.runDirectory} · {kernel.remainingExecutions}
							</p>
						</li>
					))}
				</ul>
			)}
			<label className="block">
				{t.select}
				<select
					aria-label={t.select}
					value={selected}
					onChange={(event) => setSelected(event.target.value)}
				>
					<option value="">{t.select}</option>
					{own.map((kernel) => (
						<option key={kernel.sessionId} value={kernel.sessionId}>
							{kernel.sessionId}
						</option>
					))}
				</select>
			</label>
			{current && currentImage !== current.image && <p role="status">{t.changed}</p>}
			<label className="block">
				{t.code}
				<textarea
					aria-label={t.code}
					value={code}
					onChange={(event) => setCode(event.target.value)}
					className="block min-h-28 w-full rounded border border-border p-2 font-mono"
				/>
			</label>
			<div className="flex flex-wrap gap-3">
				<button
					disabled={
						busy ||
						!current ||
						current.status !== "ready" ||
						current.remainingExecutions < 1 ||
						currentImage !== current.image ||
						!currentImage ||
						!code.trim()
					}
					onClick={() => void execute()}
				>
					{t.run}
				</button>
				<button
					disabled={!running}
					onClick={() => executing.current?.abort(new Error("User cancelled execution"))}
				>
					{t.cancel}
				</button>
				<button
					disabled={busy || !current}
					onClick={() => void act("closeKernelSession", { sessionId: selected })}
				>
					{t.close}
				</button>
				<button disabled={busy} onClick={() => void act("reconcileExecutions", null)}>
					{t.reconcile}
				</button>
			</div>
			{busy && <p role="status">{t.busy}</p>}
			<h4>{t.receipts}</h4>
			{snapshot.intents.length === 0 ? (
				<p>{t.noReceipts}</p>
			) : (
				<ul className="space-y-1">
					{snapshot.intents.map((intent) => (
						<li key={intent.requestId}>
							<code>{intent.requestId}</code> · {intent.status}
							<p className="text-xs">
								{intent.verification === "host-verified-this-activation"
									? t.verified
									: t.unverified}
							</p>
						</li>
					))}
				</ul>
			)}
			{latest !== null && (
				<details>
					<summary>
						{t.output} · {latest.status}
					</summary>
					{latest.blockedReason && <p>{latest.blockedReason}</p>}
					<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all">
						{latest.output}
					</pre>
				</details>
			)}
		</section>
	);
}
