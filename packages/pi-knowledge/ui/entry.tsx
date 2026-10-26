import type { KnowledgeSurfaceProps } from "@gyoungwe/plugin-api/ui";
import { KnowledgeView } from "./knowledge/KnowledgeView";
import { KnowledgeUiRoot } from "./knowledge/KnowledgeUiRoot";
import { KnowledgePanel } from "./knowledge/KnowledgePanel";
import { KnowledgeNoteViewer } from "./knowledge/KnowledgeNoteViewer";
import { KnowledgeFlowCard } from "./knowledge/KnowledgeFlowCard";
import { ZoteroPanel } from "./knowledge/ZoteroPanel";
import { InstitutionalAccessSection } from "./knowledge/InstitutionalAccessSection";
import { knowledgeStyles } from "./styles/generated";

function Styles() {
	return <style data-drone-knowledge-styles>{knowledgeStyles}</style>;
}

export function KnowledgePage() {
	return <div className="drone-knowledge-ui" style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0 }}><Styles /><KnowledgeView /></div>;
}

export function KnowledgeOverlay() {
	return <><Styles /><KnowledgeUiRoot /></>;
}

export function KnowledgeSurface(props: KnowledgeSurfaceProps) {
	let surface;
	switch (props.kind) {
		case "settings": surface = <KnowledgePanel {...props} />; break;
		case "note": surface = <KnowledgeNoteViewer {...props} />; break;
		case "flow": surface = <KnowledgeFlowCard {...props} />; break;
		case "zotero": surface = <ZoteroPanel />; break;
		case "institution": surface = <InstitutionalAccessSection />; break;
	}
	return <div className="drone-knowledge-ui"><Styles />{surface}</div>;
}
