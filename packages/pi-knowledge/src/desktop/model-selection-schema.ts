export const modelSelectionSchema = {
	type: "object",
	properties: {
		provider: { type: "string" },
		model: { type: "string" },
		thinkingLevel: { type: "string" },
		profile: { type: "string" },
		optionalProfile: { type: "string" },
		inheritedThinking: { const: "nearest-supported" },
	},
	required: ["provider", "model", "thinkingLevel"],
	additionalProperties: false,
};
