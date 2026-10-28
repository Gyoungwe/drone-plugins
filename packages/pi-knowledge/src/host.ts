/** Stable host entry for the installable knowledge package. */
export * from "./core/index.js";
export * from "./core/host.js";
export * from "./maintenance/plan.js";
export * from "./maintenance/prompts.js";
export * from "./maintenance/run.js";
export { createKnowledgeInterface, configureKnowledgeExtensionHost, registerKnowledgeInterface, registerWikiReviewAcceptance } from "./extension/internal-knowledge-extension.js";

export { createNativeExtension, createNativeSession } from "./extension/knowledge-extension.js";

/** Temporary 0.3 pure adapter export for published 1.x callers; no host algorithm fallback. */
export { runKnowledgeSpecialist as runCanonicalKnowledgeSpecialist } from "./core/specialist-model-loop.js";
