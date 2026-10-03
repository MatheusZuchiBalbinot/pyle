import { describe, expect, it, vi } from 'vitest';

import { KEY_USAGE_WRITE_INTERVAL_MS, KeyUsageTracker } from './key-usage-tracker.js';

function build() {
	let now = 0;
	const write = vi.fn().mockResolvedValue(undefined);
	const onError = vi.fn();
	const tracker = new KeyUsageTracker({ write, onError, now: () => now });

	return { tracker, write, onError, advance: (ms: number) => (now += ms) };
}

describe('KeyUsageTracker', () => {
	it('writes at most once per interval per key', () => {
		const { tracker, write, advance } = build();

		tracker.touch('k1');
		tracker.touch('k1');
		tracker.touch('k2');
		advance(KEY_USAGE_WRITE_INTERVAL_MS);
		tracker.touch('k1');

		expect(write.mock.calls.map(([keyId]) => keyId)).toEqual(['k1', 'k2', 'k1']);
	});

	it('reports a failed write without throwing into the request', async () => {
		const { tracker, write, onError } = build();

		write.mockRejectedValue(new Error('db down'));

		tracker.touch('k1');
		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('db down')));
	});

	it('stays bounded however many keys it has seen', () => {
		const write = vi.fn().mockResolvedValue(undefined);
		const tracker = new KeyUsageTracker({ write, onError: vi.fn() });

		for (let index = 0; index < 10_005; index++) {
			tracker.touch(`k${index}`);
		}

		tracker.touch('k0');

		expect(write).toHaveBeenCalledTimes(10_006);
	});
});
