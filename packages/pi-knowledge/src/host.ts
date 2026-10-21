/** Stable host entry for the installable knowledge package. */
export * from "./core/index.js";
export * from "./maintenance/plan.js";
export * from "./maintenance/prompts.js";
export * from "./maintenance/run.js";
export { configureKnowledgeExtensionHost, registerKnowledgeInterface, registerWikiReviewAcceptance } from "./extension/internal-knowledge-extension.js";
