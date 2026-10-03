import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataRetentionScheduler } from './data-retention.scheduler.js';
import type { DataRetentionService } from './data-retention.service.js';

const FIRST_PASS_DELAY_MS = 5 * 60 * 1000;
const RETENTION_PASS_INTERVAL_MS = 24 * 60 * 60 * 1000;

type Fakes = {
	readonly retentionService: DataRetentionService;
};

function buildFakes(): Fakes {
	return {
		retentionService: { runPass: vi.fn().mockResolvedValue(undefined) } as unknown as DataRetentionService,
	};
}

function buildStartedScheduler(fakes: Fakes): DataRetentionScheduler {
	const scheduler = new DataRetentionScheduler(fakes.retentionService);

	scheduler.onModuleInit();

	return scheduler;
}

describe('DataRetentionScheduler', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('waits before its first pass instead of purging at boot', async () => {
		const fakes = buildFakes();

		buildStartedScheduler(fakes);

		await vi.advanceTimersByTimeAsync(FIRST_PASS_DELAY_MS - 1);

		expect(fakes.retentionService.runPass).not.toHaveBeenCalled();
	});

	it('runs the first pass once the delay elapsed', async () => {
		const fakes = buildFakes();

		buildStartedScheduler(fakes);

		await vi.advanceTimersByTimeAsync(FIRST_PASS_DELAY_MS);

		expect(fakes.retentionService.runPass).toHaveBeenCalledOnce();
	});

	it('keeps running once a day after that', async () => {
		const fakes = buildFakes();

		buildStartedScheduler(fakes);

		await vi.advanceTimersByTimeAsync(RETENTION_PASS_INTERVAL_MS * 2);

		expect(vi.mocked(fakes.retentionService.runPass).mock.calls.length).toBeGreaterThanOrEqual(3);
	});

	it('keeps the schedule alive after a failed pass', async () => {
		const fakes = buildFakes();

		fakes.retentionService.runPass = vi.fn().mockRejectedValue(new Error('purge failed'));
		buildStartedScheduler(fakes);

		await vi.advanceTimersByTimeAsync(FIRST_PASS_DELAY_MS);
		await vi.advanceTimersByTimeAsync(RETENTION_PASS_INTERVAL_MS);

		expect(vi.mocked(fakes.retentionService.runPass).mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it('cancels both timers on shutdown', () => {
		const fakes = buildFakes();
		const scheduler = buildStartedScheduler(fakes);

		expect(vi.getTimerCount()).toBe(2);

		scheduler.onModuleDestroy();

		expect(vi.getTimerCount()).toBe(0);
	});

	it('tolerates a shutdown that never started', () => {
		const fakes = buildFakes();
		const scheduler = new DataRetentionScheduler(fakes.retentionService);

		expect(() => scheduler.onModuleDestroy()).not.toThrow();
	});
});
