import type { SpecialistSettingsStorage } from "../core/specialist-host.js";
import type { WikiReviewPorts } from "../core/wiki-review-ports.js";

export function createBrokerSpecialistSettingsStorage(state: WikiReviewPorts["state"]): SpecialistSettingsStorage {
	return {
		async read() { return (await state.read("specialists.json"))?.value ?? null; },
		async write(value, expectedRevision) {
			const current = await state.read("specialists.json");
			if (current !== null && (current.value as { revision: number }).revision !== expectedRevision)
				throw new Error("Specialist settings changed; refresh first");
			if (current === null && expectedRevision !== 0) throw new Error("Specialist settings were removed");
			await state.write("specialists.json", value, current?.version ?? null);
		},
	};
}
