export { type CapabilityKnowledgeSourcePort, readCapabilitySources } from "./capability-discovery.js";
export {
	type ClaimComparison,
	type ClaimSetComparison,
	compareClaimSets,
	compareClaims,
	type KnowledgeClaim,
} from "./claim-conflicts.js";
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
export * from "./daily-discovery.js";
export * from "./daily-discovery-prompt.js";
export {
	BackgroundReviewer,
	type BackgroundReviewerBridge,
	type BackgroundReviewerOptions,
	type BackgroundReviewRequest,
	type DeliverableReviewFinding,
	type DeliverableReviewLocation,
	type DeliverableReviewResult,
	type DeliverableReviewSnapshot,
	type ReviewAttemptRecord,
	type ReviewDeliverableRecord,
	type ReviewerModelProvider,
	type ReviewerProviderSelection,
	type ReviewerSeverity,
	type ReviewerTrigger,
	type ReviewReadReceipt,
	reviewDeliverable,
	selectReviewerProvider,
} from "./deliverable-review.js";
export { summaryDeliveryClaims } from "./delivery-claims.js";
export { EvolutionIndex, type EvolutionIndexStore } from "./evolution.js";
export {
	createExperienceStore,
	EXPERIENCE_LIMITS,
	EXPERIENCE_VERSION,
	type ExperienceArtifact,
	type ExperienceBinding,
	type ExperienceDocument,
	type ExperienceInput,
	type ExperienceObservation,
	type ExperienceOutcome,
	type ExperienceProvenance,
	type ExperienceQcDistribution,
	type ExperienceQcMetric,
	type ExperienceRecord,
	type ExperienceRepair,
	type ExperienceResourceUse,
	type ExperienceSearchHit,
	type ExperienceSearchResult,
	type ExperienceStatus,
	type ExperienceStore,
	type ExperienceStoreOptions,
	type ExperienceStorePort,
	experienceInputFromTerminalJob,
	recordTerminalJobExperience,
	searchExperiences,
	type TerminalJobExperienceInput,
	terminalJobExperienceInput,
	type WorkflowSpecDiff,
	type WorkflowSpecDiffValue,
} from "./experience-store.js";
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
export { createKnowledgeRuntime, type KnowledgeRuntime } from "./knowledge-runtime.js";
export {
	containedVaultFile,
	createVaultFileOnly,
	initializeProjectContext,
	initializeSharedNavigation,
	type KnowledgeLayoutDependencies,
	type NavigationUpdateResult,
	type ReplaceVaultFileOptions,
	replaceVaultFile,
	updateVaultNavigation,
	VaultFileConflictError,
} from "./layout.js";
export { runNavigationMaintenance, updateNavigation } from "./maintenance.js";
export * from "./memory-note.js";
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
export { looksLikeFileName, noteDisplayTitle } from "./note-title.js";
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
export * from "./project-identity.js";
export {
	createKnowledgePublication,
	projectKnowledgeEvent,
	projectKnowledgeSnapshot,
	registerAnswerPublication,
} from "./publication.js";
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
export { recentByCategory } from "./recent-by-category.js";
export * from "./related-notes.js";
export {
	checkKnowledgeReceiptFreshness,
	checkKnowledgeSnapshotReuse,
	ingestKnowledgeSnapshot,
	type KnowledgeContext,
	type KnowledgeContextInput,
	type KnowledgeFreshnessCheck,
	type KnowledgeFreshnessOptions,
	type KnowledgeFreshnessStatus,
	type KnowledgeReceiptInput,
	type KnowledgeReuseDecision,
	KnowledgeReuseIndex,
	type KnowledgeReuseIndexEntry,
	type KnowledgeReuseIndexStore,
	type KnowledgeReuseRequest,
	type KnowledgeReuseStatus,
	type KnowledgeSnapshotInput,
	type KnowledgeSourceState,
	knowledgeEvidenceGradeRank,
	knowledgeReuseLevelRank,
	resolveKnowledgeContext,
	validateKnowledgeSourceReceipt,
} from "./reuse.js";
export {
	advisoryCodes,
	createKnowledgeReviewPolicy,
	type ReviewMode,
	readReviewMode,
	saveReviewMode,
} from "./review-policy.js";
export type {
	KnowledgeWorkerLifecycleEvent,
	KnowledgeWorkerMetadata,
} from "./runtime-host.js";
export {
	configureKnowledgeEvidence,
	configureKnowledgeHost,
	configureKnowledgeRuntime,
	configureKnowledgeSetup,
	configureKnowledgeWorker,
	consumeKnowledgeReviewPreview,
	createKnowledgeRuntimeHost,
	createKnowledgeWorker,
	deliveryContract,
	emitKnowledgeWorkerLifecycle,
	inspectObsidianSetup,
	inspectSetupDirectory,
	KNOWLEDGE_WORKER_LIFECYCLE_EVENT,
	type KnowledgeRuntimeHost,
	knowledgeWorkerMetadata,
	LAYOUT,
	loadWorkspaceConfig,
	publishExplainer,
	researchSetupOptions,
	resolveSetupVault,
} from "./runtime-host.js";
export {
	buildKnowledgeSearchExpression,
	splitKnowledgeChunks,
	tokenizeKnowledgeText,
} from "./search-policy.js";
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
	closeKnowledgeServices,
	createKnowledgeServicePool,
	getKnowledgeService,
	KnowledgeService,
	notifyKnowledgeChange,
} from "./service.js";
export {
	normalizeSourceLinks,
	onlineSourceLink,
	type SourceLinkOptions,
	type SourceLinksResult,
} from "./source-links.js";
export { createSpecialistDelivery, saveSpecialistExplainer } from "./specialist-delivery.js";
export {
	contextSessionId,
	createKnowledgeSpecialistHost,
	knowledgeSpecialistHost,
	registerKnowledgeSpecialistHost,
	SPECIALIST_LIMITS,
	setSpecialistSettings,
	specialistQueueSnapshot,
	specialistSettings,
	withSpecialistSlot,
} from "./specialist-host.js";
export {
	createKnowledgeSpecialists,
	createKnowledgeSpecialistTools,
	knowledgeReadStart,
	shouldOrientKnowledge,
} from "./specialists.js";
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
	archiveTopic,
	classifyTopic,
	createTopicMemory,
	createTopicMemoryApi,
	listTopics,
	readTopic,
	TOPIC_MEMORY_LIMITS,
	TOPIC_MEMORY_VERSION,
	topicRunHash,
	updateTopic,
} from "./topic-memory.js";

export * from "./ui-service.js";
export {
	beginKnowledgeFlow,
	clearKnowledgeFlow,
	createKnowledgeUi,
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
export { lastWikiModelReview, reviewWikiWithModel } from "./wiki-model-review.js";
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
	autoApplyWikiProposal,
	createKnowledgeWikiReview,
	decideWikiProposal,
	listWikiProposals,
	mergeWikiProposal,
	previewWikiProposal,
	stageWikiProposal,
	undoWikiUpdate,
	validateWikiSourcePaths as validateRuntimeWikiSourcePaths,
	wikiHistory,
} from "./wiki-review.js";
