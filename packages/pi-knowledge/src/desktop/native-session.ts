import type { PluginNativeSession } from "@gyoungwe/plugin-api/native";
import type {
	PluginNativeSessionFacts,
	PluginRuntimeCapabilities,
	PluginRuntimeFactoryContext,
} from "@gyoungwe/plugin-api/runtime";
import type { KnowledgeBinding } from "../core/config.js";
import type { createKnowledgeSpecialistHost } from "../core/specialist-host.js";
import { createManagedNativeSession, type KnowledgeSessionOwner } from "../extension/knowledge-extension.js";
import { type createKnowledgeModelReviewModel, parseModelReviewCommandInput } from "./model-review.js";
import { registerDesktopKnowledgeNativeReadTools } from "./native.js";
import { createKnowledgeRecoveryMigration } from "./recovery-migration.js";
import { createManagedKnowledgeSessionPorts } from "./session-ports.js";
import { createBrokerKnowledgeSpecialist } from "./specialist-model.js";

interface KnowledgeNativeSessionOptions {
	context: PluginRuntimeFactoryContext;
	owner: KnowledgeSessionOwner;
	specialists: ReturnType<typeof createKnowledgeSpecialistHost>;
	modelReviews: ReturnType<typeof createKnowledgeModelReviewModel>;
	readKnowledgeBinding: () => Promise<KnowledgeBinding | null>;
	projectFor: (capabilities: PluginRuntimeCapabilities, workspace: string | null) => Promise<string | null>;
}

type ManagedSessionComposition = Parameters<typeof createManagedNativeSession>[1];

/** Every tool the read-only knowledge interface registers in a child session; none of them writes. */
const CHILD_READ_TOOLS = [
	"knowledge_status",
	"knowledge_search",
	"research_check_answer",
	"research_knowledge_status",
	"research_prepare_knowledge",
	"research_read_knowledge",
	"research_restore_evidence",
	"research_resume_topic",
	"research_search_explainers",
	"research_search_knowledge",
	"research_task_status",
	"research_topics",
] as const;

/** Every hook the read-only knowledge interface registers in a child session. */
const CHILD_SESSION_EVENTS = [
	"session_start",
	"session_tree",
	"before_agent_start",
	"context",
	"message_start",
	"tool_execution_start",
	"tool_execution_end",
	"tool_result",
] as const;

export function createKnowledgeNativeSessionFactory(options: KnowledgeNativeSessionOptions) {
	const { context, owner, projectFor } = options;
	return async (facts?: PluginNativeSessionFacts): Promise<PluginNativeSession> => {
		const sessionPorts = createManagedKnowledgeSessionPorts(context.capabilities);
		const composition: ManagedSessionComposition = {
			session: sessionPorts.ports,
			registerReadTools: (pi) =>
				registerDesktopKnowledgeNativeReadTools(pi, owner, (native: { cwd: string }) =>
					projectFor(context.capabilities, native.cwd),
				),
			project: async (cwd: string) => {
				const project = await projectFor(context.capabilities, cwd);
				if (project === null) throw new Error("Knowledge native session has no workspace project");
				return project;
			},
		};

		if (facts?.kind === "child") return createChildSession(options, composition, facts);
		return createPrimarySession(options, composition, sessionPorts);
	};
}

function createChildSession(
	{ owner, readKnowledgeBinding }: KnowledgeNativeSessionOptions,
	composition: ManagedSessionComposition,
	facts: Extract<PluginNativeSessionFacts, { kind: "child" }>,
): PluginNativeSession {
	// The host fact is not a grant. "none" never touches the Vault binding. "read" offers the
	// read-only interface, and every call re-reads this package's own subagent policy with the
	// live caller the host supplies at that moment (none exists while the session is created).
	const readable = facts.files === "read";
	const child = createManagedNativeSession(owner, {
		...composition,
		child: readable ? "read" : "evidence",
		childReadAllowed: async () => (await readKnowledgeBinding())?.subagentPolicy === "read-local",
	});
	if (!child.projection) throw new Error("Knowledge child session requires its publication projection");
	const session: PluginNativeSession = {
		...child,
		// A child's answers only take the evidence-only path (label, no task report), so its
		// finalizer runs with read capabilities; any write it attempted would fail at the broker.
		projection: { ...child.projection, finalizeEffect: "read" },
		toolEffects: readable ? Object.fromEntries(CHILD_READ_TOOLS.map((tool) => [tool, "read" as const])) : {},
		// A child is read-only: its hooks get read capabilities only, so any write attempt fails at the broker.
		eventEffects: Object.fromEntries(CHILD_SESSION_EVENTS.map((event) => [event, "read" as const])),
		commandEffects: {},
	};
	return session;
}

function createPrimarySession(
	options: KnowledgeNativeSessionOptions,
	composition: ManagedSessionComposition,
	sessionPorts: ReturnType<typeof createManagedKnowledgeSessionPorts>,
): PluginNativeSession {
	const { context, owner, specialists } = options;
	const { config } = owner;
	const migrateRecovery = createKnowledgeRecoveryMigration(context.capabilities, config);
	const native = createManagedNativeSession(owner, composition);
	let unregister: (() => void) | undefined;
	return {
		...native,
		toolEffects: { knowledge_status: "read", knowledge_search: "read" },
		eventEffects: {
			session_start: "read",
			session_tree: "read",
			tool_execution_start: "read",
			tool_result: "read",
		},
		commandEffects: {
			"knowledge-review-model": "write",
			"obsidian-review": "write",
			"knowledge-migrate-recovery": "write",
		},
		async extension(pi) {
			await native.extension(pi);
			pi.on("session_start", (_event, caller) => {
				unregister = specialists.registerKnowledgeSpecialistHost(
					caller.sessionManager.getSessionId(),
					createBrokerKnowledgeSpecialist(context.capabilities),
				);
			});

			registerNativeCommands(pi, options, native, migrateRecovery, sessionPorts);
		},
		async dispose() {
			unregister?.();
			await native.dispose();
		},
	};
}

function registerNativeCommands(
	pi: Parameters<PluginNativeSession["extension"]>[0],
	{ context, owner, modelReviews, projectFor }: KnowledgeNativeSessionOptions,
	native: ReturnType<typeof createManagedNativeSession>,
	migrateRecovery: ReturnType<typeof createKnowledgeRecoveryMigration>,
	sessionPorts: ReturnType<typeof createManagedKnowledgeSessionPorts>,
): void {
	pi.registerCommand("knowledge-migrate-recovery", {
		description:
			"Explicitly import an authorized 0.2.0/0.2.1 historical read-window checkpoint; no current proof is restored",
		async handler(args, caller) {
			if (args.trim()) throw new Error("Checkpoint migration accepts no scope or target arguments");
			const result = await migrateRecovery(caller);
			await sessionPorts.ports.notify(JSON.stringify(result), caller);
		},
	});
	pi.registerCommand("knowledge-review-model", {
		description:
			"Review one exact Wiki proposal with explicit JSON cost/data acknowledgement; read the audit in the knowledge review UI",
		async handler(args, caller) {
			const input = parseModelReviewCommandInput(args);
			const scope = (await context.capabilities.call(
				"caller.scope",
				null,
			)) as import("@gyoungwe/plugin-api/runtime").PluginRuntimeScope;
			if (scope.kind !== "session" || scope.sessionId !== caller.sessionManager.getSessionId())
				throw new Error("Model review command requires its originating live session");
			const binding = await owner.config.readKnowledgeBinding({ fresh: true });
			if (!binding) throw new Error("No application knowledge Vault is bound");
			const signal = caller.signal ? AbortSignal.any([native.signal, caller.signal]) : native.signal;
			await modelReviews.review(
				{ ...input, revision: binding.revision },
				() => projectFor(context.capabilities, scope.workspaceDirectory),
				{ scope, signal, capabilities: context.capabilities },
			);
			context.events.changed();
		},
	});
}
