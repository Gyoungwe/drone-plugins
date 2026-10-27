/** Always release operation deadlines after success or failure. */
export async function withDeadline<T>(
	operation: Promise<T>,
	timeoutMs: number,
	reason: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(reason)), timeoutMs);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}
