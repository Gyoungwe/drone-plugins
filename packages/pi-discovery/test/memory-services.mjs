export function memoryServices(initial = {}) {
	const journals = new Map(Object.entries(initial));
	const services = {
		journal: (name) => ({
			read: async () => structuredClone(journals.get(name) ?? []),
			write: async (records) => {
				journals.set(name, structuredClone(records));
			},
		}),
		authorize: async () => {
			throw new Error("authorization denied");
		},
		runner: async () => {
			throw new Error("runner should not be called");
		},
		files: {
			prepareDirectory: async () => {
				throw new Error("unexpected directory");
			},
			write: async () => {
				throw new Error("unexpected export");
			},
		},
		onExecution() {},
		legacyJournal: async () => undefined,
	};
	return { services, journals };
}
