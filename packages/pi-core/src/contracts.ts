import { contractContentHash } from "@gyoungwe/plugin-api/knowledge";

/** The small ask contract needed by pi-core; it must not pull in Drone shared. */
export type AskQuestionType = "single" | "multi" | "preview" | "text";
export type AskRequestKind = "clarification" | "authorization";
export type AskRecommendationConfidence = "high" | "medium" | "low";

export interface AskRecommendation {
	value: string;
	reason: string;
	confidence?: AskRecommendationConfidence;
	basedOn?: string[];
}

export interface AskOption {
	value: string;
	label: string;
	description?: string;
	preview?: string;
	recommended?: boolean;
}

export interface AskDecisionProposal {
	proposalHash: string;
	lineage?: unknown;
	contextHash?: string;
	capabilityHash?: string;
	workflowHash?: string;
	recommendation?: AskRecommendation;
	reason?: string;
	evidence?: string[];
	benefits?: string[];
	costs?: string[];
	risks?: string[];
	resources?: string[];
	authorizationActions?: Array<{
		id: string;
		label: string;
		description?: string;
		risk?: "low" | "high";
		independent?: boolean;
	}>;
	authorizationScopeHash?: string;
}

export interface AskQuestion {
	id: string;
	label: string;
	prompt: string;
	type: AskQuestionType;
	required: boolean;
	options: AskOption[];
	recommendation?: AskRecommendation;
	allowCustomText?: boolean;
}

export interface AskRequest {
	id: string;
	sessionId: string;
	toolCallId: string;
	title?: string;
	kind?: AskRequestKind;
	purpose?: AskRequestKind;
	questions: AskQuestion[];
	proposal?: AskDecisionProposal;
	decisionProposal?: AskDecisionProposal;
}

export interface AskAnswer {
	values?: string[];
	customText?: string;
	note?: string;
	optionNotes?: Record<string, string>;
	recommendation?: AskRecommendation;
}

export interface AskDecision {
	proposalHash: string;
	lineage?: unknown;
	choice?: string;
	choices?: string[];
	customText?: string;
	notes?: string;
	decisionHash: string;
	authorizationScopeHash?: string;
	authorizedActionIds?: string[];
}

export type AskResponse =
	| {
			kind: "answer";
			mode?: "submit" | "elaborate";
			answers: Record<string, AskAnswer>;
			decision?: AskDecision;
	  }
	| { kind: "cancel" };

/** Hash the submitted choice, excluding model recommendations. */
export function askDecisionHash(
	proposalHash: string,
	selection: Pick<AskDecision, "choice" | "choices" | "customText" | "notes">,
): string {
	return contractContentHash({ proposalHash, ...selection });
}

export type TodoStatus = "pending" | "in_progress" | "completed";
export interface TodoItem {
	content: string;
	status: TodoStatus;
}
export const TODO_TOOL_NAME = "todo";
export const MAX_DELIVERED_FILES = 12;

export function formatTodoList(todos: readonly TodoItem[]): string {
	return todos.map((todo, index) => `${index + 1}. [${todo.status}] ${todo.content}`).join("\n");
}
