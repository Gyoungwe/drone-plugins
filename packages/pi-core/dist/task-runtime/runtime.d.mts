export interface TaskJournal {
	scope(): string;
	snapshot(): { id: string } | null;
	readRoots(): string[];
}

export function registerTaskRuntime(
	pi: unknown,
	options?: { readKnowledgeBinding?: () => Promise<{ vaultId: string; revision: number; vault?: string } | null> },
): TaskJournal;
