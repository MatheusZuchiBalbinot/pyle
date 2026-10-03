import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildInstance, buildTestSnapshot } from '../testing/build-test-snapshot.js';
import { HealthChecker } from './health-checker.js';
import type { ProbeInstance } from './probe-instance.js';
import type { ProbeResult } from './probe-result.js';

const INTERVAL_MS = 1000;
const HEALTH = { path: '/health', intervalMs: INTERVAL_MS, timeoutMs: 500, healthyThreshold: 2, unhealthyThreshold: 3 };
const A = buildInstance('a');
const B = buildInstance('b', { isEnabled: false });
const OK: ProbeResult = { isSuccess: true, latencyMs: 1, detail: 'HTTP 200' };

function snapshotWith(...instances: ReturnType<typeof buildInstance>[]) {
	return buildTestSnapshot({ instances, service: { healthCheck: HEALTH } });
}

function build(probe: ProbeInstance = vi.fn().mockResolvedValue(OK), random = () => 0.5) {
	const onResult = vi.fn();
	const checker = new HealthChecker({ probe, onResult, random });

	return { checker, probe: vi.mocked(probe), onResult };
}

describe('HealthChecker', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('spreads the first checks, then checks every interval, drained instances included', async () => {
		const { checker, probe, onResult } = build();

		checker.start(snapshotWith(A, B));

		await vi.advanceTimersByTimeAsync(INTERVAL_MS / 2 - 1);
		expect(probe).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(probe).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);

		expect(onResult.mock.calls.map(([instanceId]) => instanceId)).toEqual([A.id, B.id, A.id, B.id]);
		checker.stop();
	});

	it('schedules instances that were synced before the start', async () => {
		const { checker, probe } = build();

		checker.syncInstances(snapshotWith(A));
		await vi.advanceTimersByTimeAsync(INTERVAL_MS * 2);
		expect(probe).not.toHaveBeenCalled();

		checker.start(snapshotWith(A));
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);

		expect(probe).toHaveBeenCalledTimes(1);
		checker.stop();
	});

	it('never piles checks up behind a slow one', async () => {
		let release: (result: ProbeResult) => void = () => undefined;
		const probe = vi.fn<ProbeInstance>(() => new Promise((resolve) => (release = resolve)));
		const { checker } = build(probe, () => 0);

		checker.start(snapshotWith(A));

		await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5);
		expect(probe).toHaveBeenCalledTimes(1);
		release(OK);
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);

		expect(probe).toHaveBeenCalledTimes(2);
		checker.stop();
	});

	it('stops checking removed instances, even one whose check was out', async () => {
		let release: (result: ProbeResult) => void = () => undefined;
		const probe = vi.fn<ProbeInstance>(() => new Promise((resolve) => (release = resolve)));
		const { checker, onResult } = build(probe, () => 0);

		checker.start(snapshotWith(A, B));
		await vi.advanceTimersByTimeAsync(0);

		checker.syncInstances(snapshotWith(B));
		release(OK);
		await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

		expect(checker.size).toBe(1);
		expect(onResult.mock.calls.every(([instanceId]) => instanceId !== A.id)).toBe(true);
		checker.stop();
	});

	it('picks up new instances and changed intervals on a reload', async () => {
		const { checker, probe } = build(undefined, () => 0);

		checker.start(snapshotWith(A));
		await vi.advanceTimersByTimeAsync(0);
		const slower = buildTestSnapshot({ instances: [A, B], service: { healthCheck: { ...HEALTH, intervalMs: INTERVAL_MS * 3 } } });

		checker.syncInstances(slower);
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);
		const afterOneInterval = probe.mock.calls.map(([target]) => target.instance.name);

		await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

		expect(afterOneInterval).toEqual(['a', 'b', 'a']);
		expect(probe.mock.calls.at(-1)?.[0].healthCheck.intervalMs).toBe(INTERVAL_MS * 3);
		checker.stop();
	});

	it('leaves nothing behind on stop, including a check that was out', async () => {
		let release: (result: ProbeResult) => void = () => undefined;
		const probe = vi.fn<ProbeInstance>(() => new Promise((resolve) => (release = resolve)));
		const { checker, onResult } = build(probe, () => 0);

		checker.start(snapshotWith(A, B));
		await vi.advanceTimersByTimeAsync(0);

		checker.stop();
		release(OK);
		await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

		expect(vi.getTimerCount()).toBe(0);
		expect(onResult).not.toHaveBeenCalled();
		expect(checker.size).toBe(0);
	});
});
