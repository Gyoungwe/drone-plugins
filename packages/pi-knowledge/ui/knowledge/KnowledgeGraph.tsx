import {
	COMPOSER_FOCUS_EVENT,
	getKnowledgeApi,
	useDraftStore,
	useKnowledgeStore,
	useSessionsStore,
	useUiStore,
} from "../api";
import { KnowledgeGraphView } from "./KnowledgeGraphView";
import { openKnowledgeNote } from "./KnowledgeLinks";

/** Published UI v1 adapter; remove when the remaining full UI consumers use runtime v2. */
export function KnowledgeGraph({
	cwd,
	revision,
	indexKey = "",
}: {
	cwd: string | null;
	revision: number;
	indexKey?: string;
}) {
	const nonce = useKnowledgeStore((s) => s.revision);
	return (
		<KnowledgeGraphView
			api={getKnowledgeApi()}
			nonce={nonce}
			revision={revision}
			indexKey={indexKey}
			onOpenNote={(path) => openKnowledgeNote(cwd, path, revision)}
			onHandoff={(_path, prompt) => {
				useSessionsStore.getState().createDraftSession(cwd ?? undefined);
				const id = useSessionsStore.getState().activeSessionId;
				if (!id) return;
				useDraftStore
					.getState()
					.updateDraft(id, (entry) => ({ ...entry, text: prompt }));
				useKnowledgeStore.getState().close();
				useUiStore.getState().setView("chat");
				window.dispatchEvent(new Event(COMPOSER_FOCUS_EVENT));
			}}
		/>
	);
}
