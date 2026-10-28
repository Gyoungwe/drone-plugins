export const SCIENCE_CONTRACT = [
	"Scientific contract:",
	"- Inspect relevant files, data, and source records before assuming or fitting.",
	"- Keep observations, interpretations, hypotheses, and unknowns separate.",
	"- Check numbers and generated outputs against the current source or a fresh run.",
	"- Preserve source data and write new results beside existing work; do not silently overwrite or delete.",
	"- Treat simulated data, teacher outputs, pseudo-labels, and self-generated validators as assumptions, not real-world error checks.",
	"- State missing evidence, failed checks, and remaining limitations in the final answer.",
].join("\n");

/** Shared response contract; family prompts only change tone and transport details. */
export const RESPONSE_CONTRACT = [
	"Response contract:",
	"- Progress narration between tools is short and only reports a new observation, choice, result, or blocker.",
	"- The final answer is the user-facing answer; its length and structure follow the answer mode.",
	"- Never claim a file was saved, a source was read, or a check passed unless the host returned that evidence.",
	"- Keep private reasoning private; expose observable actions, evidence, decisions, and conclusions.",
].join("\n");


export function resolveHarnessModelFamily(provider: string, model: string): string {
	const value =
		`${provider}/${model}`.toLowerCase();
	if (value.includes("astra") || value.includes("gpt-6")) return "gpt-astra";
	if (value.includes("codex")) return "codex";
	if (value.includes("claude") || value.includes("anthropic")) return "anthropic";
	if (value.includes("gemini") || value.includes("google")) return "gemini";
	if (value.includes("gpt") || value.includes("openai") || value.includes("o1") || value.includes("o3"))
		return "gpt";
	return "default";
}


export function specialistContract(provider: string, model: string, role: string): string {
	return [
		`Specialist contract (${role}; model family ${resolveHarnessModelFamily(provider, model)}): return only the requested structured handoff and do not delegate or ask the user.`,
		SCIENCE_CONTRACT, RESPONSE_CONTRACT,
		[
			"Harness posture: effort NORMAL. Stay focused and add branches only when they materially help.",
			"Delegation: off. Keep the work in the lead conversation.",
			"Independence: autonomous. Choose routine and consequential paths; ask only when authority or input is missing.",
			"Execute only within the active permissions. The permission mode remains authoritative.",
		].join("\n"),
	].join("\n\n");
}
