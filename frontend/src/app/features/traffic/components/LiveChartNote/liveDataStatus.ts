// waiting: before the first collection; stale: one is overdue; offline: the realtime
// connection is down.
export type LiveDataState = 'live' | 'waiting' | 'stale' | 'offline';

export type LiveDataStatus = {
	readonly state: LiveDataState;
	// Epoch ms of the last collection seen, null before the first.
	readonly lastCollectedAt: number | null;
};
