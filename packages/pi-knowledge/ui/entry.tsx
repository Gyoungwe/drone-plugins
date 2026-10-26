import {
	NativeKnowledgePage,
	NativeKnowledgeUnavailable,
} from "./NativeKnowledgePage";
import { knowledgeStyles } from "./styles/generated";

function Styles() {
	return <style data-drone-knowledge-styles>{knowledgeStyles}</style>;
}

/** Candidate: all visible reads use the approved package runtime and its single domain owner. */
export function KnowledgePage() {
	return (
		<div
			className="drone-knowledge-ui"
			style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0 }}
		>
			<Styles />
			<NativeKnowledgePage />
		</div>
	);
}

/** Existing host surface slots stay explicit while their domain operations are migrated. */
export function KnowledgeSurface() {
	return (
		<div className="drone-knowledge-ui">
			<Styles />
			<NativeKnowledgeUnavailable />
		</div>
	);
}
