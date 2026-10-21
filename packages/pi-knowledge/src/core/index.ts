export {
	type ClaimComparison,
	type ClaimSetComparison,
	compareClaimSets,
	compareClaims,
	type KnowledgeClaim,
} from "./claim-conflicts.js";
export { readCapabilitySources, type CapabilityKnowledgeSourcePort } from "./capability-discovery.js";
export {
	createKnowledgeConfigApi,
	createKnowledgeConfigState,
	type KnowledgeBinding,
	type KnowledgeBindingInput,
	type KnowledgeConfigApi,
	type KnowledgeConfigState,
	type KnowledgeDepositMode,
	type KnowledgeProfile,
	type KnowledgeSubagentPolicy,
	knowledgeDirectory,
	projectIdentity,
	readKnowledgeBinding,
	saveKnowledgeBinding,
	withKnowledgeBinding,
} from "./config.js";
export {
	continuationHint,
	continuesTopic,
	currentProject,
	explainerTopicId,
	type KnowledgeToolResult,
	result,
	type SessionIdentityContext,
	sessionIdentity,
	type TopicForContinuation,
} from "./extension-helpers.js";
export {
	allowedSegment,
	canRead,
	fileVersion,
	inspectNote,
	MAX_NOTE_BYTES,
	noteScope,
	readNoteFile,
	safeNotePath,
	snippet,
	validateNote,
} from "./files.js";
export {
	type CardFieldOptions,
	cardField,
	cardLink,
	type FlowCard,
	type FlowCardField,
	type FlowCardInput,
	type FlowCardLink,
	type FlowEvent,
	type FlowEventContent,
	type FlowTone,
	failureCard,
	flowCard,
	literatureCard,
	statusTone,
} from "./flow-cards.js";
export {
	containedVaultFile,
	createVaultFileOnly,
	initializeProjectContext,
	initializeSharedNavigation,
	replaceVaultFile,
	type KnowledgeLayoutDependencies,
	type NavigationUpdateResult,
	type ReplaceVaultFileOptions,
	VaultFileConflictError,
	updateVaultNavigation,
} from "./layout.js";
export {
	createSpecialistBudget,
	decideSpecialistRun,
	SPECIALIST_DECISIONS,
	type SpecialistBudget,
	type SpecialistBudgetOptions,
	type SpecialistBudgetSnapshot,
	type SpecialistDecision,
	type SpecialistRequestSignatureOptions,
	type SpecialistRunDecision,
	type SpecialistRunOptions,
	type SpecialistUsage,
	specialistRequestSignature,
} from "./orchestration-policy.js";
export {
	advisoryLine,
	advisoryNotice,
	knowledgeFailure,
	type PublicationFailure,
	type PublicationFailureCode,
	type PublicationVerification,
	publicationFallbackNotice,
	publicationNotice,
	publicationNotices,
} from "./publication-policy.js";
export {
	evaluateMetacognitivePublication,
	type MetacognitiveArtifact,
	type MetacognitiveArtifactNumber,
	type MetacognitiveDiagnostic,
	type MetacognitiveEvidenceFinding,
	type MetacognitiveExecutedWorkflow,
	type MetacognitiveFailure,
	type MetacognitiveFailureCode,
	type MetacognitiveFinding,
	type MetacognitiveFindingUse,
	type MetacognitiveLabel,
	type MetacognitiveMethodClaim,
	type MetacognitiveNumberClaim,
	type MetacognitiveSnapshot,
	type MetacognitiveUseRole,
} from "./metacognitive-policy.js";
export {
	BackgroundReviewer,
	type BackgroundReviewerBridge,
	reviewDeliverable,
	selectReviewerProvider,
	type BackgroundReviewRequest,
	type BackgroundReviewerOptions,
	type DeliverableReviewFinding,
	type DeliverableReviewLocation,
	type DeliverableReviewResult,
	type DeliverableReviewSnapshot,
	type ReviewAttemptRecord,
	type ReviewDeliverableRecord,
	type ReviewReadReceipt,
	type ReviewerModelProvider,
	type ReviewerProviderSelection,
	type ReviewerSeverity,
	type ReviewerTrigger,
} from "./deliverable-review.js";
export {
	advisoryCodes,
	type ReviewMode,
	readReviewMode,
	saveReviewMode,
} from "./review-policy.js";
export {
	buildKnowledgeSearchExpression,
	splitKnowledgeChunks,
	tokenizeKnowledgeText,
} from "./search-policy.js";
export { embedTexts, validateSemanticConfig as validateSemanticProviderConfig } from "./semantic-provider.js";
export {
	createSemanticSettingsApi,
	createSemanticSettingsState,
	readSemanticSettings,
	type SemanticConfig,
	type SemanticProvider,
	type SemanticSettings,
	type SemanticSettingsApi,
	type SemanticSettingsState,
	saveSemanticSettings,
	validateSemanticConfig,
} from "./semantic-settings.js";
export {
	normalizeSourceLinks,
	onlineSourceLink,
	type SourceLinkOptions,
	type SourceLinksResult,
} from "./source-links.js";
export {
	createTaskFeedback,
	guardResearchToolResult,
	type ResearchToolResultEvent,
	type TaskFeedback,
	type TaskFeedbackContent,
	type TaskFeedbackContext,
	type TaskFeedbackEvent,
	type TaskFeedbackFacts,
	type TaskFeedbackFailure,
	type TaskFeedbackFile,
} from "./task-feedback.js";
export {
	createToolBudget,
	type ToolBudget,
	type ToolBudgetFailure,
	type ToolBudgetOptions,
} from "./tool-budget.js";
export {
	autoTopicCandidate,
	type TopicCandidate,
	type TopicCandidateInput,
	type TopicCandidateResult,
} from "./topic-candidate.js";
export {
	immutableWikiProposalHash,
	MANAGED_END,
	MANAGED_START,
	type ManagedParts,
	managedParts,
	proposedWikiText,
	targetWikiPath,
	validateSpecialistHtml,
	validateWikiSourcePaths,
	type WikiProposalShape,
} from "./wiki-policy.js";

export {
	TOPIC_MEMORY_LIMITS,
	TOPIC_MEMORY_VERSION,
	archiveTopic,
	classifyTopic,
	createTopicMemory,
	listTopics,
	readTopic,
	topicRunHash,
	updateTopic,
} from "./topic-memory.js";
export { runNavigationMaintenance, updateNavigation } from "./maintenance.js";
export { looksLikeFileName, noteDisplayTitle } from "./note-title.js";
export { recentByCategory } from "./recent-by-category.js";
export * from "./daily-discovery.js";
export * from "./daily-discovery-prompt.js";
export * from "./memory-note.js";
export * from "./project-identity.js";
export * from "./related-notes.js";
export {
	configureKnowledgeWorker,
	configureKnowledgeEvidence,
	configureKnowledgeHost,
	configureKnowledgeSetup,
	createKnowledgeWorker,
	consumeKnowledgeReviewPreview,
	deliveryContract,
	emitKnowledgeWorkerLifecycle,
	knowledgeWorkerMetadata,
	KNOWLEDGE_WORKER_LIFECYCLE_EVENT,
	loadWorkspaceConfig,
	publishExplainer,
	LAYOUT,
	inspectObsidianSetup,
	inspectSetupDirectory,
	resolveSetupVault,
	researchSetupOptions,
} from "./runtime-host.js";
export type {
	KnowledgeWorkerLifecycleEvent,
	KnowledgeWorkerMetadata,
} from "./runtime-host.js";
export { configureKnowledgeRuntime } from "./runtime-host.js";
export {
	assignCommunities,
	classifyRelation,
	createSemanticModel,
	isInfrastructureNode,
	nodeType,
	type RelationType,
	type SemanticEdgeInput,
	type SemanticGraph,
	type SemanticNode,
	type SemanticNodeInput,
	type SemanticRelation,
	type SemanticView,
} from "./semantic-model.js";

export {
	beginKnowledgeFlow,
	clearKnowledgeFlow,
	emitKnowledgeUi,
	flowFor,
	invalidateKnowledgeUi,
	noteKnowledgeOperation,
	noteKnowledgeRead,
	noteKnowledgeSearch,
	noteKnowledgeSpecialist,
	notifyKnowledgeUi,
	publicationKnowledgeFlow,
	requestWikiReviewUi,
	subscribeKnowledgeUi,
	updateKnowledgeFlow,
} from "./ui-state.js";
export {
	projectKnowledgeEvent,
	projectKnowledgeSnapshot,
	registerAnswerPublication,
} from "./publication.js";

export { KnowledgeService, closeKnowledgeServices, getKnowledgeService, notifyKnowledgeChange } from "./service.js";

export {
	checkKnowledgeReceiptFreshness,
	checkKnowledgeSnapshotReuse,
	KnowledgeReuseIndex,
	ingestKnowledgeSnapshot,
	knowledgeEvidenceGradeRank,
	knowledgeReuseLevelRank,
	resolveKnowledgeContext,
	validateKnowledgeSourceReceipt,
	type KnowledgeContext,
	type KnowledgeContextInput,
	type KnowledgeFreshnessCheck,
	type KnowledgeFreshnessOptions,
	type KnowledgeFreshnessStatus,
	type KnowledgeReceiptInput,
	type KnowledgeReuseIndexEntry,
	type KnowledgeReuseIndexStore,
	type KnowledgeReuseRequest,
	type KnowledgeReuseDecision,
	type KnowledgeReuseStatus,
	type KnowledgeSnapshotInput,
	type KnowledgeSourceState,
} from "./reuse.js";

export {
	autoApplyWikiProposal,
	decideWikiProposal,
	listWikiProposals,
	mergeWikiProposal,
	previewWikiProposal,
	stageWikiProposal,
	undoWikiUpdate,
	wikiHistory,
	validateWikiSourcePaths as validateRuntimeWikiSourcePaths,
} from "./wiki-review.js";

export {
	SPECIALIST_LIMITS,
	contextSessionId,
	knowledgeSpecialistHost,
	registerKnowledgeSpecialistHost,	
	setSpecialistSettings,
	specialistQueueSnapshot,
	specialistSettings,	
	withSpecialistSlot,
} from "./specialist-host.js";

export { createKnowledgeSpecialists, knowledgeReadStart, shouldOrientKnowledge } from "./specialists.js";

export { saveSpecialistExplainer } from "./specialist-delivery.js";

export { lastWikiModelReview, reviewWikiWithModel } from "./wiki-model-review.js";

export * from "./ui-service.js";

export {
	EXPERIENCE_LIMITS,
	EXPERIENCE_VERSION,
	createExperienceStore,
	experienceInputFromTerminalJob,
	recordTerminalJobExperience,
	terminalJobExperienceInput,
	searchExperiences,
	type ExperienceArtifact,
	type ExperienceBinding,
	type ExperienceDocument,
	type ExperienceInput,
	type ExperienceObservation,
	type ExperienceOutcome,
	type ExperienceQcDistribution,
	type ExperienceQcMetric,
	type ExperienceProvenance,
	type ExperienceRecord,
	type ExperienceRepair,
	type ExperienceResourceUse,
	type ExperienceSearchHit,
	type ExperienceSearchResult,
	type ExperienceStorePort,
	type TerminalJobExperienceInput,
	type ExperienceStatus,
	type ExperienceStore,
	type ExperienceStoreOptions,
	type WorkflowSpecDiff,
	type WorkflowSpecDiffValue,
} from "./experience-store.js";
export { EvolutionIndex, type EvolutionIndexStore } from "./evolution.js";
