import { type PiToolRegistrar, registerPiConnectors } from "./connectors/tools.js";
import { registerEvidenceLoop } from "./evidence-loop.js";
import { registerResearchLoop } from "./research-loop.js";

export * from "./connectors/tools.js";

export default function piResearch(pi: unknown): void {
	registerEvidenceLoop(pi);
	registerResearchLoop(pi);
	registerPiConnectors(pi as PiToolRegistrar);
}
