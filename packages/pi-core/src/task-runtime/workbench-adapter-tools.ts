import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { acceptanceSchema, openAcceptanceSchema } from "./acceptance.js";
import type { createTaskAuthorization } from "./ask-authorization.js";
import { taskProgressContext } from "./failure-feedback.js";
import type { PlanInput } from "./workbench.js";
import type { WorkbenchAdapter } from "./workbench-adapter.js";
import type { WaitInput } from "./workbench-command.js";

type Authorization = ReturnType<typeof createTaskAuthorization>;
type ToolPlan = PlanInput & { writeDirectories?: string[] };
const str = { type: "string", minLength: 1, maxLength: 512 };
const objectSchema = (properties: Record<string, object>, required: string[]) => ({
	type: "object",
	properties,
	required,
	additionalProperties: false,
});

function planProperties(remote: boolean) {
	return {
		goal: { ...str, maxLength: 180 },
		summary: { type: "string", minLength: 1, maxLength: 1200 },
		writeDirectories: { type: "array", maxItems: 8, items: str },
		compute: objectSchema(
			{
				hosts: {
					type: "array",
					minItems: 1,
					maxItems: 32,
					items: { ...str, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" },
				},
				remoteRead: { type: "array", maxItems: 64, items: { ...str, maxLength: 1024 } },
				remoteWrite: { type: "array", maxItems: 64, items: { ...str, maxLength: 1024 } },
				budget: objectSchema(
					{
						maxCoreHours: { type: "number", minimum: 0, maximum: 1e9 },
						maxWalltimeMinutes: { type: "integer", minimum: 1, maximum: 2e6 },
						maxConcurrentJobs: { type: "integer", minimum: 1, maximum: 1e4 },
						maxDiskGb: { type: "integer", minimum: 1, maximum: 1e6 },
					},
					["maxCoreHours", "maxWalltimeMinutes", "maxConcurrentJobs", "maxDiskGb"],
				),
				workflows: { type: "array", maxItems: 128, items: { ...str, maxLength: 256 } },
				agentCode: { type: "boolean" },
			},
			["hosts", "remoteRead", "remoteWrite", "budget", "workflows"],
		),
		milestones: {
			type: "array",
			minItems: 1,
			maxItems: 24,
			items: objectSchema(
				{
					id: str,
					title: str,
					dependsOn: { type: "array", maxItems: 24, items: str },
					// Native Pi reads the live registry when later-loaded verifiers add fields.
					acceptance: remote ? openAcceptanceSchema() : acceptanceSchema(),
				},
				["id", "title", "acceptance"],
			),
		},
	};
}

async function authorizePlan(
	{ journal, ports, status }: WorkbenchAdapter,
	ask: Authorization,
	input: ToolPlan,
	ctx: ExtensionContext,
	signal?: AbortSignal,
) {
	const writeRoots = await ports.writeRoots(ctx.cwd, input.writeDirectories || []);
	const milestones = await journal.plan({ ...input, writeRoots });
	await status.send("计划已经准备好，马上会弹出一个确认框，同意后开始执行。");
	const task = journal.snapshot();
	if (!task) throw new Error("Task plan is unavailable.");
	const authorized = await ask(
		{ taskId: task.id, revision: journal.view().revision, action: "authorize-task" },
		ctx,
		signal,
	);
	await status.send(
		authorized ? "你已确认，开始执行这个任务。" : "你没有确认，任务先停在原地，不会改动任何文件。",
	);
	return {
		milestones,
		authorized,
		next: authorized
			? "Continue within the approved scope."
			: "Stop and retain the checkpoint. Do not repeat the authorization question.",
	};
}

async function waitForUser(
	{ journal, status }: WorkbenchAdapter,
	ask: Authorization,
	input: WaitInput,
	ctx: ExtensionContext,
	signal?: AbortSignal,
) {
	const action = await journal.wait(input);
	if (!["authorization", "rebind"].includes(action.kind)) return action;
	const task = journal.snapshot();
	if (!task) throw new Error("Task action is unavailable.");
	const authorized = await ask(
		{ taskId: task.id, revision: journal.view().revision, action: "ask-authorization", actionId: action.id },
		ctx,
		signal,
	);
	await status.send(
		authorized
			? action.kind === "rebind"
				? "已按你的确认更换这一项对应的文献，接下来按新 DOI 核对。"
				: "好的，这项已经你确认，继续往下做。"
			: "你没有确认，这项先留着，不会替你做决定。",
	);
	return { ...action, state: authorized ? "acknowledged" : "pending", authorized };
}

function toolRegistrar({ pi, bind, attach }: WorkbenchAdapter) {
	return <Input>(
		name: string,
		description: string,
		properties: Record<string, object>,
		required: string[],
		execute: (input: Input, ctx: ExtensionContext, signal?: AbortSignal) => unknown,
	) => {
		const run: ToolDefinition["execute"] = async (_id, input, signal, _update, ctx) => {
			await attach(ctx);
			const result = await execute(input as Input, ctx, signal);
			return {
				content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }],
				details: { operational: true },
			};
		};
		pi.registerTool({
			name,
			label: name,
			description,
			parameters: objectSchema(properties, required),
			execute: bind(run, (_id, _input, _signal, _update, ctx) => ctx),
		});
	};
}

export function registerWorkbenchTools(adapter: WorkbenchAdapter, ask: Authorization) {
	const { journal, ports, evidence, bindingKey } = adapter;
	const tool = toolRegistrar(adapter);
	tool(
		"task_status",
		"Host task ledger for any scientific workflow. No model/evidence certification. Query before repeating uncertain effects.",
		{},
		[],
		() =>
			`${journal.render()}\n本次只返回已保存的观察；需要重新核对已有文件时请明确调用 task_reconcile。${taskProgressContext(journal.snapshot())}`,
	);
	tool<ToolPlan>(
		"task_plan",
		"Prepare one task authorization per contract after read-only discovery: original goal, understandable scope, existing write directories, and immutable deliverables. Bundle necessary choices here instead of asking about each step. Call task_plan again only for a separate goal; that opens a new task and preserves the previous checkpoint. The host opens ask_user automatically; only its explicit approval authorizes the shown task revision. The user authorizes once per task; normal stages and bounded recovery then proceed automatically. No authorization of new risks, arbitrary commands, credentials or scientific conclusions.",
		planProperties(!!ports.acceptance),
		["goal", "summary", "milestones"],
		(input, ctx, signal) => authorizePlan(adapter, ask, input, ctx, signal),
	);
	tool<WaitInput>(
		"task_wait",
		"Create a tracked human download/file, permission, review or rebind action. Supply the requested identity (title/DOI/hash), not generic download instructions. kind=rebind asks the user to replace the DOI an approved milestone is verified against (milestoneId + doi + reason) when the planned or previously bound DOI turned out to be the wrong paper; the host opens the confirmation card and only the user's choice applies it. Cancellation is not consent; Wiki approval uses its existing review UI.",
		{
			kind: { type: "string", enum: ["file", "download", "authorization", "review", "rebind"] },
			title: str,
			reason: str,
			url: str,
			doi: str,
			sha256: str,
			milestoneId: str,
		},
		["kind", "title", "reason"],
		(input, ctx, signal) => waitForUser(adapter, ask, input, ctx, signal),
	);
	tool(
		"task_reconcile",
		"Read-only revalidation of recorded workspace artifacts under CURRENT read permissions. Does not rerun commands, certify scientific conclusions or approve Wiki.",
		{},
		[],
		(_input, ctx) => journal.reconcile(ctx.cwd),
	);
	tool<Parameters<typeof evidence.restore>[0]>(
		"task_evidence_restore",
		"Recover a host-recorded, actually evicted file window only after current permission and version checks. At most two recoveries per task, bounded bytes. Does not mint scientific evidence receipts.",
		{ receiptId: str, path: str },
		["receiptId", "path"],
		(input, ctx) => evidence.restore(input, ctx.cwd, bindingKey),
	);
}
