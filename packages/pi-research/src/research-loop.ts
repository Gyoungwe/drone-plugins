import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { verifyLiteratureReceipt } from "./core/literature-receipt.js";
import { sourceStatus } from "./core/source-archive.js";
import { registerResearchExtension, type ResearchExtensionPorts } from "./extension.js";

/** Native Pi owns project-local configuration; Desktop injects binding-aware ports. */
async function workspace(cwd: string) {
 let config: { resultsRoot?: string; obsidianVault?: string | null; knowledgeBindingRevision?: number } = {};
 try {
  config = JSON.parse(await readFile(join(cwd, ".pi/research-workspace.json"), "utf8"));
 } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
 }
 if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Invalid research workspace configuration");
 if (config.resultsRoot !== undefined && typeof config.resultsRoot !== "string") throw new Error("resultsRoot must be a path");
 if (config.obsidianVault != null && typeof config.obsidianVault !== "string") throw new Error("obsidianVault must be a path");
 if (config.knowledgeBindingRevision !== undefined && !Number.isInteger(config.knowledgeBindingRevision)) throw new Error("knowledgeBindingRevision must be an integer");
 return {
  resultsRoot: resolve(cwd, config.resultsRoot ?? "results"),
  obsidianVault: config.obsidianVault ? resolve(cwd, config.obsidianVault) : null,
  knowledgeBindingRevision: config.knowledgeBindingRevision ?? 0,
 };
}

export function registerResearchLoop(pi: any): void {
 let tail: Promise<void> = Promise.resolve();
 const run = async <T>(operation: () => T | Promise<T>): Promise<T> => {
  const previous = tail;
  let unlock!: () => void;
  tail = new Promise<void>((resolve) => { unlock = resolve; });
  await previous;
  try { return await operation(); } finally { unlock(); }
 };
 const resolveProject = async (cwd: string) => basename(resolve(cwd)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "research-project";
 const ports: ResearchExtensionPorts = {
  workspace,
  resolveProject,
  resolveSessionProject: async (ctx) => ({ project: await resolveProject(ctx.cwd) }),
  describeProject: (resolution) => resolution,
  registerTool: (host, tool) => host.registerTool(tool),
  run,
  verifyLiteratureReceipt: (input) => verifyLiteratureReceipt(input as any),
  sourceStatus: (input) => sourceStatus(input, {
   workspace,
   exclusive: (_key, work) => work(), // Tool execution is already serialized by run.
   publishSourceNote: async () => { throw new Error("Native research status cannot publish a source note"); },
  }),
 };
 registerResearchExtension(pi, ports);
}
