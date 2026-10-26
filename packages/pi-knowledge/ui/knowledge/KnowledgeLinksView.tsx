import type {
	KnowledgeLinkRef,
	KnowledgeNoteLinks,
} from "@gyoungwe/plugin-api/ui";
import { useEffect, useState } from "react";
import { useKnowledgeText } from "./copy";
/** 笔记的双向链接：反链（链接到本笔记的）与出链（本笔记链接到的），点击即打开 */
export function KnowledgeLinksView({
	load,
	nonce,
	onOpenNote,
	path,
	revision,
}: {
	load: (input: {
		path: string;
		revision: number;
	}) => Promise<KnowledgeNoteLinks>;
	nonce: number;
	onOpenNote: (path: string) => void;
	path: string;
	revision: number;
}) {
	const t = useKnowledgeText();
	const [error, setError] = useState<string | null>(null);
	const [links, setLinks] = useState<KnowledgeNoteLinks | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: nonce 是知识库变化后的刷新信号
	useEffect(() => {
		let live = true;
		setLinks(null);
		setError(null);
		void load({ path, revision }).then(
			(value) => {
				if (live) setLinks(value);
			},
			(cause) => {
				if (live)
					setError(String(cause instanceof Error ? cause.message : cause));
			},
		);
		return () => {
			live = false;
		};
	}, [load, path, revision, nonce]);
	if (error)
		return (
			<p role="alert" className="text-xs text-err">
				{error}
			</p>
		);
	if (!links) return null;
	const list = (items: KnowledgeLinkRef[], empty: string) =>
		items.length === 0 ? (
			<p className="text-[11px] text-ink-faint">{empty}</p>
		) : (
			<ul className="space-y-0.5">
				{items.map((item) => (
					<li key={item.path}>
						{item.exists ? (
							<button
								type="button"
								className="text-left text-xs text-link hover:underline"
								title={item.path}
								onClick={() => onOpenNote(item.path)}
							>
								{item.title}
							</button>
						) : (
							<span
								className="text-[11px] text-ink-faint"
								title={t("linkMissing")}
							>
								{item.title} · {t("linkMissing")}
							</span>
						)}
					</li>
				))}
			</ul>
		);
	return (
		<div
			className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-border p-3"
			data-testid="knowledge-links"
		>
			<div>
				<h5 className="mb-1 text-xs font-semibold">
					{t("linksIncoming")} · {links.incoming.length}
				</h5>
				{list(links.incoming, t("linksIncomingEmpty"))}
			</div>
			<div>
				<h5 className="mb-1 text-xs font-semibold">
					{t("linksOutgoing")} · {links.outgoing.length}
				</h5>
				{list(links.outgoing, t("linksOutgoingEmpty"))}
			</div>
		</div>
	);
}
