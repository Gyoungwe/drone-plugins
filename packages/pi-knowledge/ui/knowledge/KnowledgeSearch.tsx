import type { KnowledgeSearchResult } from "@gyoungwe/plugin-api/ui";
import { useState } from "react";
import { KnowledgeSearchView } from "./KnowledgeSearchView";
import { getKnowledgeApi } from "../api";
import { useKnowledgeStore } from "../api";
import type { KnowledgeCategory } from "./knowledge-home-model";

export type { KnowledgeCategory } from "./knowledge-home-model";

type Counts = Record<KnowledgeCategory, number | null>;

export function KnowledgeSearch({
	cwd,
	sessionId,
	bindingRevision,
	activeCategory,
	onCategoryChange,
	categoryCounts,
}: {
	cwd: string | null;
	sessionId: string | null;
	bindingRevision: number;
	activeCategory: KnowledgeCategory;
	onCategoryChange: (category: KnowledgeCategory) => void;
	categoryCounts: Counts;
}) {
	const [query, setQuery] = useState("");
	const [result, setResult] = useState<KnowledgeSearchResult | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const openHit = (path: string) =>
		useKnowledgeStore
			.getState()
			.open({
				cwd,
				sessionId,
				tab: "reviews",
				note: path,
				noteRevision: bindingRevision,
			});

	return (
		<KnowledgeSearchView
			query={query}
			onQueryChange={setQuery}
			bindingRevision={bindingRevision}
			activeCategory={activeCategory}
			onCategoryChange={onCategoryChange}
			categoryCounts={categoryCounts}
			result={result}
			busy={busy}
			error={error}
			onSearch={async (text) => {
				setBusy(true);
				setError(null);
				try {
					setResult(
						await getKnowledgeApi().searchKnowledge({
							cwd,
							bindingRevision,
							query: text,
						}),
					);
				} catch (cause) {
					setError(String(cause instanceof Error ? cause.message : cause));
				} finally {
					setBusy(false);
				}
			}}
			onOpenNote={openHit}
		/>
	);
}
