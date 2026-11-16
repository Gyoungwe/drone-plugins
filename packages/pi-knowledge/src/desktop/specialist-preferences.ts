import type { createKnowledgeSpecialistHost } from "../core/specialist-host.js";
import type { KnowledgeReadOwner } from "./read-model.js";
import type {
	KnowledgeSetSpecialistSettingsInput,
	KnowledgeSpecialistPreferences,
} from "./specialist-preferences-contract.js";

/** Desktop authority wraps the existing owner; its queue and binding fence remain authoritative. */
export function createKnowledgeSpecialistPreferences(
	owner: KnowledgeReadOwner,
	specialists: Pick<
		ReturnType<typeof createKnowledgeSpecialistHost>,
		"specialistSettings" | "setSpecialistSettings"
	>,
	canWriteState: boolean,
) {
	async function snapshot(): Promise<KnowledgeSpecialistPreferences> {
		const binding = await owner.config.readKnowledgeBinding({ fresh: true });
		const settings = await specialists.specialistSettings();
		return {
			...settings,
			// The owner validates this enum, but its unchecked module infers string.
			mode: settings.mode as KnowledgeSpecialistPreferences["mode"],
			bindingRevision: binding?.revision ?? null,
			canWriteState,
		};
	}
	return {
		read: () => owner.run(snapshot),
		write: (input: KnowledgeSetSpecialistSettingsInput) =>
			owner.run(async () => {
				if (!canWriteState) throw new Error("Application-state write permission is required");
				await specialists.setSpecialistSettings(input);
				return snapshot();
			}),
	};
}
