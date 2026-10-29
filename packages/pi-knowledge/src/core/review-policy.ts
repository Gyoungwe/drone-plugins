import * as compatibilityConfig from "./config.js";
import type { KnowledgeConfigApi } from "./config.js";
import { createLocalReviewPolicyStorage } from "./review-policy-storage.js";

export type ReviewMode = "automatic" | "strict";
export type ReviewPolicyDocument =
	| { kind: "missing"; version: null }
	| { kind: "value"; value: unknown; version: string }
	| { kind: "corrupt"; version: null };
export interface KnowledgeReviewPolicyStorage {
	read(): Promise<ReviewPolicyDocument>;
	write(
		value: { version: 1; mode: ReviewMode },
		expectedVersion: string | null,
	): Promise<ReviewPolicyDocument>;
}
export interface KnowledgeReviewPolicySnapshot {
	mode: ReviewMode;
	persistedMode: ReviewMode | null;
	version: string | null;
	override: "environment" | null;
	diagnostic: "invalid-json" | "invalid-policy" | null;
}

/** Policy decisions are shared; storage and deployment policy belong to the adapter. */
export function createStoredKnowledgeReviewPolicy(
	storage: KnowledgeReviewPolicyStorage,
	strictOverride: () => boolean,
) {
	async function readReviewPolicy(): Promise<KnowledgeReviewPolicySnapshot> {
		const document = await storage.read();
		const override = strictOverride() ? "environment" : null;
		if (document.kind === "missing")
			return {
				mode: override ? "strict" : "automatic",
				persistedMode: null,
				version: null,
				override,
				diagnostic: null,
			};
		if (document.kind === "corrupt")
			return {
				mode: "strict",
				persistedMode: null,
				version: null,
				override,
				diagnostic: "invalid-json",
			};
		const value = document.value;
		const mode =
			value && typeof value === "object" && "mode" in value
				? value.mode
				: undefined;
		if (mode !== "automatic" && mode !== "strict")
			return {
				mode: "strict",
				persistedMode: null,
				version: document.version,
				override,
				diagnostic: "invalid-policy",
			};
		return {
			mode: override ? "strict" : mode,
			persistedMode: mode,
			version: document.version,
			override,
			diagnostic: null,
		};
	}
	async function readReviewMode(): Promise<ReviewMode> {
		return (await readReviewPolicy()).mode;
	}
	async function saveReviewMode(
		mode: string,
		expectedVersion?: string | null,
	): Promise<{ mode: ReviewMode }> {
		if (mode !== "automatic" && mode !== "strict")
			throw new Error("Invalid review mode");
		const current = await readReviewPolicy();
		if (current.diagnostic)
			throw new Error(
				"Review policy is damaged; repair it before changing settings",
			);
		await storage.write(
			{ version: 1, mode },
			expectedVersion === undefined ? current.version : expectedVersion,
		);
		const saved = await readReviewPolicy();
		if (saved.diagnostic || saved.persistedMode !== mode)
			throw new Error("Review policy changed during write verification");
		return { mode: saved.mode };
	}
	return { readReviewMode, readReviewPolicy, saveReviewMode };
}

export function createKnowledgeReviewPolicy(
	config: Pick<KnowledgeConfigApi, "knowledgeDirectory">,
) {
	return createStoredKnowledgeReviewPolicy(
		createLocalReviewPolicyStorage(config),
		() => process.env.DRONE_REVIEW_MODE === "strict",
	);
}

// pi-knowledge 0.2 compatibility; remove when all native/Desktop consumers
// share the same explicit 0.3 owner and fixed configuration directory.
export const { readReviewMode, saveReviewMode } =
	createKnowledgeReviewPolicy(compatibilityConfig);

export const advisoryCodes = new Set([
	"paper-citation-required",
	"search-required",
	"coverage-incomplete",
	"wiki-changed",
	"citation-required",
	"source-unread",
	"source-changed",
	"delivery-changed",
	"search-stale",
	"check-timeout",
	"not-prepared",
	"citation-invalid",
	"citation-budget",
]);
