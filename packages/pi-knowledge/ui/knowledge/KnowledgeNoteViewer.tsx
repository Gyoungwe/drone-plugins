import { useMemo } from "react";
import {
	Markdown,
	getKnowledgeApi,
	legacyEvidenceNotice,
	useKnowledgeStore,
} from "../api";
import { KnowledgeNoteView } from "./KnowledgeNoteView";
import { openKnowledgeNote } from "./KnowledgeLinks";
/** Published UI v1 adapter; remove with the last legacy full-page consumer. */
export function KnowledgeNoteViewer({
	cwd,
	path,
	revision,
	onClose,
}: {
	cwd: string | null;
	path: string;
	revision: number;
	onClose: () => void;
}) {
	const nonce = useKnowledgeStore((s) => s.revision);
	const api = useMemo(
		() => ({
			readNote: (input: {
				path: string;
				revision: number;
				startLine: number;
			}) => getKnowledgeApi().readKnowledgeNote({ ...input, cwd }),
			links: getKnowledgeApi().getKnowledgeNoteLinks,
		}),
		[cwd],
	);
	return (
		<KnowledgeNoteView
			key={path}
			api={api}
			nonce={nonce}
			path={path}
			revision={revision}
			onClose={onClose}
			onOpenNote={(path) => openKnowledgeNote(cwd, path, revision)}
			onOpenExternal={() =>
				getKnowledgeApi().openKnowledgeTarget({ cwd, path, revision })
			}
			evidenceNotice={legacyEvidenceNotice}
			renderText={(text) => <Markdown text={text} />}
		/>
	);
}
