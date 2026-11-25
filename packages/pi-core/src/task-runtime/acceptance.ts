import type { PluginRuntimeSchema } from "@gyoungwe/plugin-api/runtime";
import type { TaskAcceptanceDefinition, TaskAcceptanceVerifier } from "@gyoungwe/plugin-api/tasks";
import { currentRuntime, type RuntimeHost, runtimeSlot, withRuntime } from "./runtime-bridge.ts";

export type { TaskAcceptanceVerifier } from "@gyoungwe/plugin-api/tasks";

export type Acceptance = Readonly<Record<string, unknown>> & { readonly kind?: string };

export interface AcceptanceMilestone {
	acceptance?: Acceptance | null;
	bound?: { fields?: Readonly<Record<string, unknown>> | null } | null;
}

interface AcceptanceRegistration {
	version?: number;
	kind?: string;
	definition?: TaskAcceptanceDefinition;
}

type Verifiers = Map<string | undefined, TaskAcceptanceVerifier>;

interface AcceptanceRegistry {
	verifiers: Verifiers;
	kinds: string[];
	properties: Record<string, PluginRuntimeSchema>;
}

const CORE_ACCEPTANCE_KINDS = Object.freeze(["file", "human_review"]);
const CORE_FIELDS = Object.freeze(["kind", "path", "sha256", "rootKind"]);
const KIND = /^[a-z][a-z0-9_]{1,40}$/;
const FIELD = /^[a-zA-Z][a-zA-Z0-9]{0,40}$/;
const stringField = { type: "string", minLength: 1, maxLength: 512 };
const VERIFIER_HOOKS = ["label", "verify", "observe", "resolve", "identify", "consent", "pending"] as const;

const ACCEPTANCE_VERIFIER_EVENT = "drone:acceptance-verifier/v1";
const ACCEPTANCE_VERIFIER_REQUEST_EVENT = "drone:acceptance-verifier/request/v1";
const eventBridges = runtimeSlot(
	"tasks",
	"acceptanceEventBridges",
	() => /* @__PURE__ */ new WeakSet<RuntimeHost>(),
);
const createRegistry = (): AcceptanceRegistry => {
	const kinds = [...CORE_ACCEPTANCE_KINDS];
	return {
		verifiers: /* @__PURE__ */ new Map(),
		kinds,
		properties: {
			kind: { type: "string", enum: kinds },
			path: stringField,
			sha256: stringField,
			rootKind: { type: "string", enum: ["workspace", "vault", "research-run"], minLength: 1, maxLength: 32 },
		},
	};
};
const registry = runtimeSlot("tasks", "acceptance", createRegistry);
function ensureRegistryShape() {
	registry.verifiers ??= /* @__PURE__ */ new Map();
	registry.kinds ??= [...CORE_ACCEPTANCE_KINDS];
	registry.properties ??= {};
	registry.properties.kind ??= { type: "string", enum: registry.kinds };
	registry.properties.path ??= stringField;
	registry.properties.sha256 ??= stringField;
	registry.properties.rootKind ??= {
		type: "string",
		enum: ["workspace", "vault", "research-run"],
		minLength: 1,
		maxLength: 32,
	};
}
function bindAcceptanceVerifierEvents(pi: RuntimeHost) {
	if (eventBridges.has(pi)) return () => undefined;
	eventBridges.add(pi);
	const runtime = currentRuntime();
	const receive = (value: unknown) => {
		const payload = value as AcceptanceRegistration | null | undefined;
		if (
			payload?.version !== 1 ||
			typeof payload.kind !== "string" ||
			!payload.definition ||
			typeof payload.definition !== "object"
		)
			throw new Error("Invalid task acceptance registration event");
		const { kind, definition } = payload;
		withRuntime(runtime, () => registerAcceptanceVerifier(kind, definition));
	};
	const unsubscribe = pi.events.on(ACCEPTANCE_VERIFIER_EVENT, receive);
	pi.events.emit(ACCEPTANCE_VERIFIER_REQUEST_EVENT, { version: 1 });
	return unsubscribe;
}
function registerAcceptanceVerifier(kind: string, definition: TaskAcceptanceDefinition = {}) {
	ensureRegistryShape();
	if (!KIND.test(kind || "")) throw new Error(`Acceptance kind "${kind}" must match ${KIND}`);
	if (CORE_ACCEPTANCE_KINDS.includes(kind)) throw new Error(`Acceptance kind "${kind}" is owned by the host`);
	for (const fn of VERIFIER_HOOKS)
		if (definition[fn] !== void 0 && typeof definition[fn] !== "function")
			throw new Error(`Acceptance verifier ${kind}.${fn} must be a function`);
	const spec = definition as Partial<TaskAcceptanceVerifier>;
	const fields = [...new Set(spec.fields || [])];
	for (const field of fields)
		if (!FIELD.test(field) || CORE_FIELDS.includes(field))
			throw new Error(`Acceptance verifier ${kind}: invalid field "${field}"`);
	const verifier: TaskAcceptanceVerifier = Object.freeze({
		kind,
		fields: Object.freeze(fields),
		evidenceKind: spec.evidenceKind || `${kind}-verified`,
		operationVerifier: spec.operationVerifier || `${kind}-record-not-scientific-proof`,
		label: spec.label || (() => kind),
		verify: spec.verify || null,
		observe: spec.observe || null,
		resolve: spec.resolve || null,
		identify: spec.identify || null,
		consent: spec.consent || null,
		pending: spec.pending || null,
		acknowledgeError: spec.acknowledgeError || null,
	});
	registry.verifiers.set(kind, verifier);
	if (!registry.kinds.includes(kind)) registry.kinds.push(kind);
	for (const field of fields) registry.properties[field] ??= stringField;
	return verifier;
}
function resetAcceptanceVerifiers() {
	ensureRegistryShape();
	registry.verifiers.clear();
	registry.kinds.splice(0, registry.kinds.length, ...CORE_ACCEPTANCE_KINDS);
	for (const field of Object.keys(registry.properties))
		if (!CORE_FIELDS.includes(field)) delete registry.properties[field];
}
function acceptanceVerifier(kind: string | undefined) {
	ensureRegistryShape();
	return registry.verifiers.get(kind) || null;
}
function acceptanceVerifiers() {
	ensureRegistryShape();
	return [...registry.verifiers.values()];
}
function acceptanceKinds() {
	ensureRegistryShape();
	return [...registry.kinds];
}
function acceptanceSchema() {
	ensureRegistryShape();
	return {
		type: "object",
		properties: registry.properties,
		required: ["kind"],
		additionalProperties: false,
	};
}
/** Managed tool schemas are serialized when registered, before remote checkers load: any kind and extra
 * string fields pass here, and task_plan validates them against the checkers actually loaded. */
function openAcceptanceSchema() {
	return {
		type: "object",
		properties: {
			kind: { type: "string", minLength: 2, maxLength: 41 },
			path: stringField,
			sha256: stringField,
			rootKind: { type: "string", enum: ["workspace", "vault", "research-run"], minLength: 1, maxLength: 32 },
		},
		required: ["kind"],
		additionalProperties: stringField,
	};
}
function normalizeAcceptance(
	input: Acceptance,
	clean: (value: unknown, max?: number) => string,
	verifiers?: ReadonlyMap<string | undefined, TaskAcceptanceVerifier>,
) {
	ensureRegistryShape();
	const kind = input?.kind;
	const verifier = (verifiers || registry.verifiers).get(kind) || null;
	const acceptance: Record<string, unknown> & { kind?: string } = {
		kind,
		path: clean(input.path, 512),
		sha256: /^[a-f0-9]{64}$/.test((input.sha256 || "") as string) ? input.sha256 : null,
	};
	if (["workspace", "vault", "research-run"].includes(String(input.rootKind)))
		acceptance.rootKind = input.rootKind;
	for (const field of verifier?.fields || []) acceptance[field] = clean(input[field]);
	return acceptance;
}
function effectiveAcceptance(milestone: AcceptanceMilestone | null | undefined): Acceptance {
	const acceptance = milestone?.acceptance || {};
	const bound = milestone?.bound?.fields;
	return bound && typeof bound === "object" ? { ...acceptance, ...bound } : { ...acceptance };
}
function describeAcceptance(
	acceptance: Acceptance | null | undefined,
	verifier = acceptanceVerifier(acceptance?.kind),
) {
	if (acceptance?.kind === "file") return `\u751F\u6210\u6587\u4EF6 ${acceptance.path || ""}`.trim();
	if (acceptance?.kind === "human_review") return "\u7531\u4F60\u4EB2\u81EA\u786E\u8BA4\u5B8C\u6210";
	if (verifier) {
		try {
			return String(
				(verifier.label as NonNullable<TaskAcceptanceVerifier["label"]>)(acceptance as Acceptance) ||
					verifier.kind,
			);
		} catch {
			return verifier.kind;
		}
	}
	return `\u5B8C\u6210 ${acceptance?.kind || "\u672A\u77E5"} \u9A8C\u6536`;
}

export {
	ACCEPTANCE_VERIFIER_EVENT,
	ACCEPTANCE_VERIFIER_REQUEST_EVENT,
	acceptanceKinds,
	acceptanceSchema,
	acceptanceVerifier,
	acceptanceVerifiers,
	bindAcceptanceVerifierEvents,
	CORE_ACCEPTANCE_KINDS,
	describeAcceptance,
	effectiveAcceptance,
	normalizeAcceptance,
	openAcceptanceSchema,
	registerAcceptanceVerifier,
	resetAcceptanceVerifiers,
};
