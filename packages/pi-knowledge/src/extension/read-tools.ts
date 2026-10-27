import type { KnowledgeBinding } from "../core/config.js";
import { result } from "../core/extension-helpers.js";
import type { KnowledgeService } from "../core/service.js";
import type { ToolBudget } from "../core/tool-budget.js";

export interface KnowledgeReadContext { cwd: string }
export interface KnowledgeReadTurn {
 service: Pick<KnowledgeService, "read" | "search" | "request">;
 ticket: Parameters<KnowledgeService["read"]>[0];
 binding: KnowledgeBinding;
 project: string | null;
}
export interface KnowledgeReadParameters { path: string; start_line?: number; max_chars?: number }
export interface KnowledgeSearchParameters { query: string; kind?: "knowledge" | "experiences"; workflow?: string; host_id?: string; wiki_only?: boolean; limit?: number }
export interface KnowledgeReadObserver<C extends KnowledgeReadContext, T extends KnowledgeReadTurn> {
 updateFlow?(ctx: C, update: {phase: string; error?: string | null}): void;
 noteRead?(ctx: C, page: Awaited<ReturnType<KnowledgeService["read"]>>): void;
 recordRead?(id: string, ctx: C, turn: T, page: Awaited<ReturnType<KnowledgeService["read"]>>, input: KnowledgeReadParameters): void;
 noteSearch?(ctx: C, found: Awaited<ReturnType<KnowledgeService["search"]>>, wikiOnly: boolean): void;
}
export interface KnowledgeReadDependencies<C extends KnowledgeReadContext, T extends KnowledgeReadTurn> {
 ensureTurn(ctx: C, query?: string): Promise<T>;
 toolBudget: Pick<ToolBudget, "consume">;
 observer?: KnowledgeReadObserver<C, T>;
}

/** Tool bodies are shared; adapters supply only their real session-owned services and observers. */
export function createKnowledgePrepareTool<C extends KnowledgeReadContext>({ prepare }: { prepare(ctx: C): Promise<unknown> }) {
	return {
			name: "research_prepare_knowledge",
			drone: {
				readOnly: true,
				recoverySafe: true,
				capabilities: ["research", "knowledge"],
				activity: { text: "正在读取知识库导航与项目背景…", phase: "knowledge-search" },
			},
			label: "Obsidian · 读取导航与项目背景",
			description:
				"Read the current application Vault navigation before search. Refresh after a Vault/navigation change. Does not rewrite notes.",
			parameters: { type: "object", properties: {} },
			execute: async (_id: string, _params: unknown, _signal: AbortSignal | undefined, _update: unknown, ctx: C) => result(await prepare(ctx)),
		};
}

export function createKnowledgeReadTool<C extends KnowledgeReadContext, T extends KnowledgeReadTurn>({ ensureTurn, toolBudget, observer }: KnowledgeReadDependencies<C, T>) {
	return {
			name: "research_read_knowledge",
			drone: {
				readOnly: true,
				recoverySafe: true,
				journal: true,
				capabilities: ["research", "knowledge"],
				activity: { text: "正在阅读 Wiki 与知识证据…", phase: "reading" },
			},
			label: "Obsidian · 阅读 Wiki / 证据片段",
			description:
				"Read a bounded Markdown range, version and human review from shared/current-project knowledge. The first chunk also returns outgoing links and backlinks (related notes) so you can navigate without extra searches. Does not follow symlinks.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string" },
					start_line: { type: "integer", minimum: 1 },
					max_chars: { type: "integer", minimum: 200, maximum: 8000 },
				},
				required: ["path"],
			},
			execute: async (_id: string, p: KnowledgeReadParameters, _s: AbortSignal | undefined, _u: unknown, ctx: C) => {
				const c = await ensureTurn(ctx);
				const blocked = toolBudget.consume(
					"read",
					JSON.stringify([p.path, p.start_line ?? 1, p.max_chars ?? 5000]),
				);
				if (blocked) return result(blocked);
				try {
					observer?.updateFlow?.(ctx, {
						phase: /(?:^|\/)Wiki\//.test(p.path) ? "reading-wiki" : "reading-evidence",
					});
					const page = await c.service.read(c.ticket, ctx.cwd, {
						path: p.path,
						startLine: p.start_line,
						maxChars: p.max_chars,
					});
					observer?.noteRead?.(ctx, page);
					observer?.recordRead?.(_id, ctx, c, page, p);
					// 双向链接：把出链/反链一并返回，省去 agent 再去搜索邻居笔记的往返
					let links;
					if (page.hash && !page.missing && (p.start_line ?? 1) === 1) {
						const nl = await c.service.request("noteLinks", {
							path: page.path || p.path,
							project: c.project,
						});
						const slim = (xs: any[]) =>
							(xs || [])
								.filter((x: any) => x.exists !== false)
								.slice(0, 12)
								.map((x: any) => ({ path: x.path, title: x.title }));
						links = { outgoing: slim(nl.outgoing), backlinks: slim(nl.incoming) };
					}
					return result({
						...page,
						...(links ? { links } : {}),
						...(page.hash && !page.missing
							? {
									citation: `[[${page.path || p.path}]]`,
									citationGuidance:
										"Use this exact citation only beside claims supported by the returned text. Reuse this receipt; do not reread via generic read.",
								}
							: {}),
					});
				} catch (error) {
					observer?.updateFlow?.(ctx, { phase: "blocked", error: String((error as Error).message).slice(0, 400) });
					throw error;
				}
			},
		};
}

export function createKnowledgeSearchTool<C extends KnowledgeReadContext, T extends KnowledgeReadTurn>({ ensureTurn, toolBudget, observer, searchContext, searchExperiences }: KnowledgeReadDependencies<C, T> & { searchContext?(ctx: C, turn: T): Promise<any>; searchExperiences(ctx: C, input: KnowledgeSearchParameters): Promise<unknown> }) {
	return {
			name: "research_search_knowledge",
			drone: {
				readOnly: true,
				recoverySafe: true,
				journal: true,
				capabilities: ["research", "knowledge"],
				activity: { text: "正在检索知识库索引…", phase: "knowledge-search" },
			},
			label: "Obsidian · 增量索引检索",
			description:
				"Search application-wide shared knowledge plus the current project. Requires current navigation; read linked Wiki before evidence search. Incomplete indexes never mean no knowledge. Explicit kind=experiences requires workflow and host_id; it searches only this Vault/project/host and returns navigation, never scientific evidence or execution instructions.",
			parameters: {
				type: "object",
				properties: {
					query: { type: "string" },
					kind: { type: "string", enum: ["knowledge", "experiences"] },
					workflow: { type: "string" },
					host_id: { type: "string" },
					wiki_only: { type: "boolean" },
					limit: { type: "integer", minimum: 1, maximum: 12 },
				},
				required: ["query"],
			},
			execute: async (_id: string, p: KnowledgeSearchParameters, _s: AbortSignal | undefined, _u: unknown, ctx: C) => {
				const c = await ensureTurn(ctx, p.query);
				const blocked = toolBudget.consume("search", p.kind === "experiences" ? JSON.stringify([p.kind, p.workflow, p.host_id, p.query]) : p.query);
				if (blocked) return result(blocked);
				if (p.kind === "experiences") {
					if (!p.workflow?.trim() || !p.host_id?.trim())
						throw new Error("Experience navigation requires explicit workflow and host_id");
					return result(await searchExperiences(ctx, p));
				}
				observer?.updateFlow?.(ctx, { phase: "searching", error: null });
				try {
					const found = await (c.service.search as any)(c.ticket, ctx.cwd, {
						query: p.query,
						wikiOnly: p.wiki_only,
						limit: p.limit,
						context: await searchContext?.(ctx, c),
					});
					observer?.noteSearch?.(ctx, found, !!p.wiki_only);
					// 只把定位所需的字段交给模型：片段 ≤700 字，去掉排序内部分数；全文用 research_read_knowledge 读
					const slimHits = Array.isArray(found?.hits)
						? found.hits.map(({ rank: _r, fusionScore: _f, ...hit }: any) =>
							typeof hit.text === "string" && hit.text.length > 700
								? { ...hit, text: hit.text.slice(0, 700), truncated: true }
								: hit,
						)
						: found?.hits;
					return result(slimHits ? { ...found, hits: slimHits } : found);
				} catch (error) {
					observer?.updateFlow?.(ctx, { phase: "blocked", error: String((error as Error).message).slice(0, 400) });
					throw error;
				}
			},
		};
}

export function createKnowledgeAnswerCheckTool<C extends KnowledgeReadContext>({ ensureTurn, preflight }: { ensureTurn(ctx: C): Promise<unknown>; preflight(ctx: C, draft: string): Promise<unknown> }) {
	return {
			name: "research_check_answer",
			drone: { readOnly: true, recoverySafe: true, capabilities: ["research", "knowledge"] },
			label: "Obsidian · 回答预检与具体原因",
			description:
				"Preflight the exact final draft using the same host checks as publication. Returns actual missing paths and observed task outcomes. Does not publish, create read receipts, call a model or bypass the final check.",
			parameters: {
				type: "object",
				properties: { draft: { type: "string", maxLength: 100000 } },
				required: ["draft"],
			},
			execute: async (_id: string, p: {draft: string}, _s: AbortSignal | undefined, _u: unknown, ctx: C) => {
				await ensureTurn(ctx);
				return result(await preflight(ctx, p.draft));
			},
		};
}
