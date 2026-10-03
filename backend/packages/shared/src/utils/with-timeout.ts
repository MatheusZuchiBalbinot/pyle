export const TIMED_OUT: unique symbol = Symbol('timed out');

// The losing promise is not cancelled: use it where a late answer is harmless.
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof TIMED_OUT> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
		timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
	});

	try {
		return await Promise.race([promise, timeout]);
	} finally {
		clearTimeout(timer);
	}
}
