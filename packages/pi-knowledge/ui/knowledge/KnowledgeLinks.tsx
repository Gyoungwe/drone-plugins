import { getKnowledgeApi, useKnowledgeStore } from "../api";
import { KnowledgeLinksView } from "./KnowledgeLinksView";
/** UI v1 navigation adapter; remove after all full-page consumers move to runtime v2. */
export function openKnowledgeNote(
	cwd: string | null,
	path: string,
	revision: number,
) {
	const store = useKnowledgeStore.getState();
	store.open({
		cwd,
		sessionId: store.dialog?.sessionId ?? null,
		tab: "reviews",
		note: path,
		noteRevision: revision,
	});
}
export function KnowledgeLinks({
	cwd,
	path,
	revision,
}: {
	cwd: string | null;
	path: string;
	revision: number;
}) {
	const nonce = useKnowledgeStore((s) => s.revision);
	return (
		<KnowledgeLinksView
			load={getKnowledgeApi().getKnowledgeNoteLinks}
			nonce={nonce}
			path={path}
			revision={revision}
			onOpenNote={(path) => openKnowledgeNote(cwd, path, revision)}
		/>
	);
}
