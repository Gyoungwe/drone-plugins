export interface TaskAcceptanceVerifier {
	readonly kind: string;
	readonly fields: readonly string[];
	readonly evidenceKind: string;
	readonly operationVerifier: string;
	readonly label: ((acceptance: Record<string, unknown>) => unknown) | null;
	readonly verify:
		| ((acceptance: Record<string, unknown>, context: unknown) => unknown)
		| null;
	readonly observe: ((event: unknown, details: unknown) => unknown) | null;
	readonly resolve: ((review: unknown, context: unknown) => unknown) | null;
	readonly identify: ((event: unknown, details: unknown) => unknown) | null;
	readonly consent: ((acceptance: Record<string, unknown>) => unknown) | null;
	readonly pending: ((milestone: unknown) => unknown) | null;
	readonly acknowledgeError: unknown;
}

export function registerAcceptanceVerifier(
	kind: string,
	definition: Readonly<Record<string, unknown>>,
): TaskAcceptanceVerifier;
export function acceptanceVerifier(kind: string): TaskAcceptanceVerifier | null;
