import { registerEvidenceLoop } from "./evidence-loop.js";
import { registerResearchLoop } from "./research-loop.js";

export default function piResearch(pi: unknown): void {
	registerEvidenceLoop(pi);
	registerResearchLoop(pi);
}
