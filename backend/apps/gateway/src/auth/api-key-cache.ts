export type ResolvedKey = { readonly keyId: string; readonly consumerId: string };

type KeyLookup = (keyHash: string) => Promise<ResolvedKey | null>;

type ApiKeyCacheOptions = {
	readonly lookup: KeyLookup;
	readonly now?: () => number;
	readonly positiveTtlMs?: number;
	readonly negativeTtlMs?: number;
	readonly maxEntries?: number;
};

// A revoked key keeps working for at most this long on a gateway that
// missed the change message (the message itself clears the cache at once).
const DEFAULT_POSITIVE_TTL_MS = 60_000;
// Short, so a key issued right after a failed attempt works almost at once,
// yet long enough that a client hammering with a bad key costs no queries.
const DEFAULT_NEGATIVE_TTL_MS = 5000;
const API_KEY_CACHE_MAX_ENTRIES = 10_000;

type CacheEntry = { readonly value: ResolvedKey | null; readonly expiresAt: number };

// Bounded (LRU) and short-lived; concurrent lookups of the same unknown key share one
// query.
export class ApiKeyCache {
	private readonly entries = new Map<string, CacheEntry>();
	private readonly pending = new Map<string, Promise<ResolvedKey | null>>();
	private readonly now: () => number;
	private readonly positiveTtlMs: number;
	private readonly negativeTtlMs: number;
	private readonly maxEntries: number;

	constructor(private readonly options: ApiKeyCacheOptions) {
		this.now = options.now ?? Date.now;
		this.positiveTtlMs = options.positiveTtlMs ?? DEFAULT_POSITIVE_TTL_MS;
		this.negativeTtlMs = options.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS;
		this.maxEntries = options.maxEntries ?? API_KEY_CACHE_MAX_ENTRIES;
	}

	async resolve(keyHash: string): Promise<ResolvedKey | null> {
		const cached = this.readFresh(keyHash);

		if (cached !== undefined) {
			return cached;
		}

		const inFlight = this.pending.get(keyHash);

		if (inFlight) {
			return inFlight;
		}

		const lookup = this.lookupAndStore(keyHash).finally(() => this.pending.delete(keyHash));

		this.pending.set(keyHash, lookup);

		return lookup;
	}

	// Changes are rare; a refill costs one query per active key.
	clear(): void {
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}

	private readFresh(keyHash: string): ResolvedKey | null | undefined {
		const entry = this.entries.get(keyHash);

		if (!entry) {
			return undefined;
		}

		this.entries.delete(keyHash);

		if (entry.expiresAt <= this.now()) {
			return undefined;
		}

		this.entries.set(keyHash, entry);

		return entry.value;
	}

	private async lookupAndStore(keyHash: string): Promise<ResolvedKey | null> {
		const value = await this.options.lookup(keyHash);
		const ttl = value === null ? this.negativeTtlMs : this.positiveTtlMs;

		this.entries.set(keyHash, { value, expiresAt: this.now() + ttl });
		this.evictOverflow();

		return value;
	}

	private evictOverflow(): void {
		while (this.entries.size > this.maxEntries) {
			const oldest = this.entries.keys().next().value;

			if (oldest === undefined) {
				return;
			}

			this.entries.delete(oldest);
		}
	}
}
