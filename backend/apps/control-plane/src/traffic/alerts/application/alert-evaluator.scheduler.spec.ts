import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AlertEvaluatorScheduler } from './alert-evaluator.scheduler.js';
import type { GatewayAlertService } from './gateway-alert.service.js';

describe('AlertEvaluatorScheduler', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		process.env.ALERT_EVALUATION_INTERVAL_MS = '1000';
	});

	afterEach(() => {
		vi.useRealTimers();
		delete process.env.ALERT_EVALUATION_INTERVAL_MS;
	});

	it('evaluates on every tick, skipping ticks while a pass is still running', async () => {
		let finish: () => void = () => undefined;
		const evaluate = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
		const scheduler = new AlertEvaluatorScheduler({ evaluate } as unknown as GatewayAlertService);

		scheduler.onModuleInit();

		await vi.advanceTimersByTimeAsync(3000);
		expect(evaluate).toHaveBeenCalledTimes(1);
		finish();
		await vi.advanceTimersByTimeAsync(1000);

		expect(evaluate).toHaveBeenCalledTimes(2);
		scheduler.onModuleDestroy();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('logs a failed pass and keeps going', async () => {
		const evaluate = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue({ openedCount: 0, resolvedCount: 0 });
		const scheduler = new AlertEvaluatorScheduler({ evaluate } as unknown as GatewayAlertService);

		await scheduler.tick();
		await scheduler.tick();

		expect(evaluate).toHaveBeenCalledTimes(2);
		scheduler.onModuleDestroy();
	});
});
