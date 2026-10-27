export function registerTaskRuntime(
	pi: unknown,
	options?: { readKnowledgeBinding?: () => Promise<{ vaultId: string; revision: number; vault?: string } | null> },
): unknown;
