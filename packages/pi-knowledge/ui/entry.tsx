import type { KnowledgeSurfaceProps } from "@gyoungwe/plugin-api/ui";
import { NativeKnowledgePage, NativeKnowledgeUnavailable } from "./NativeKnowledgePage";
import { knowledgeStyles } from "./styles/generated";

function Styles() {
	return <style data-drone-knowledge-styles>{knowledgeStyles}</style>;
}

/** Candidate: all visible reads use the approved package runtime and its single domain owner. */
export function KnowledgePage() {
	return (
		<div className="drone-knowledge-ui" style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0 }}>
			<Styles />
			<NativeKnowledgePage />
		</div>
	);
}

/** Existing host surface slots stay explicit while their domain operations are migrated. */
export function KnowledgeSurface(props: KnowledgeSurfaceProps) {
	if (
		props.kind === "settings" &&
		[undefined, "reviews", "settings", "semantic"].includes(props.context?.tab)
	) {
		return (
			<div className="drone-knowledge-ui">
				<Styles />
				<NativeKnowledgePage initialView={props.context?.tab === "reviews" ? "reviews" : "settings"} />
			</div>
		);
	}
	return (
		<div className="drone-knowledge-ui">
			<Styles />
			<NativeKnowledgeUnavailable />
		</div>
	);
}
