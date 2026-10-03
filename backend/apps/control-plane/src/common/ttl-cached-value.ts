type TtlCachedValueOptions<T> = {
	readonly ttlMs: number;
	readonly load: () => Promise<T>;
	// Called when a load rejects; the previous value (if any) stays cached.
	readonly onLoadError?: (error: unknown) => void;
};

type Entry<T> = { readonly value: T; readonly expiresAt: number };

// Concurrent callers share one load; a failed load keeps serving the last good value.
export class TtlCachedValue<T> {
	private entry: Entry<T> | null = null;
	private inFlight: Promise<T> | null = null;

	constructor(private readonly options: TtlCachedValueOptions<T>) {}

	get(): Promise<T> {
		const isFresh = this.entry !== null && this.entry.expiresAt > Date.now();

		if (isFresh) {
			return Promise.resolve(this.entry!.value);
		}

		return this.refresh();
	}

	refresh(): Promise<T> {
		if (this.inFlight) {
			return this.inFlight;
		}

		this.inFlight = this.options
			.load()
			.then((value) => {
				this.entry = { value, expiresAt: Date.now() + this.options.ttlMs };

				return value;
			})
			.catch((error: unknown) => {
				this.options.onLoadError?.(error);

				if (this.entry) {
					return this.entry.value;
				}

				throw error;
			})
			.finally(() => {
				this.inFlight = null;
			});

		return this.inFlight;
	}

	invalidate(): void {
		this.entry = null;
	}
}
