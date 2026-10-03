// At most one write per key per interval: a write per request would put the database on the
// hot path.
export const KEY_USAGE_WRITE_INTERVAL_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;

export type KeyUsageWriter = (keyId: string, usedAt: Date) => Promise<void>;

export type KeyUsageTrackerOptions = {
	readonly write: KeyUsageWriter;
	readonly onError: (error: unknown) => void;
	readonly now?: () => number;
};

export class KeyUsageTracker {
	private readonly lastWrittenAt = new Map<string, number>();
	private readonly now: () => number;

	constructor(private readonly options: KeyUsageTrackerOptions) {
		this.now = options.now ?? Date.now;
	}

	// Never awaited by the request: the write runs beside the response.
	touch(keyId: string): void {
		const now = this.now();
		const last = this.lastWrittenAt.get(keyId);
		const isRecent = last !== undefined && now - last < KEY_USAGE_WRITE_INTERVAL_MS;

		if (isRecent) {
			return;
		}

		this.remember(keyId, now);
		this.options.write(keyId, new Date(now)).catch(this.options.onError);
	}

	private remember(keyId: string, now: number): void {
		this.lastWrittenAt.delete(keyId);
		this.lastWrittenAt.set(keyId, now);

		if (this.lastWrittenAt.size <= MAX_TRACKED_KEYS) {
			return;
		}

		const oldest = this.lastWrittenAt.keys().next().value;

		if (oldest !== undefined) {
			this.lastWrittenAt.delete(oldest);
		}
	}
}
