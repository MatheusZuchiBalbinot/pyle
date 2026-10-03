import { describe, expect, it } from 'vitest';

import { isHealthyStep, kneeOf, parseK6Summary, renderReport, shouldStopTarget, type StepResult } from './bench-report.js';

function step(offeredRps: number, overrides: Partial<StepResult> = {}): StepResult {
	return { target: 'pyle-open', offeredRps, achievedRps: offeredRps, errorRate: 0, p50Ms: 1, p95Ms: 2, p99Ms: 4, droppedIterations: 0, ...overrides };
}

const K6_METRICS = {
	http_req_duration: { values: { med: 0.8, 'p(95)': 1.9, 'p(99)': 3.2, max: 40 } },
	http_reqs: { values: { count: 9990, rate: 999 } },
	http_req_failed: { values: { rate: 0.0005 } },
	dropped_iterations: { values: { count: 10 } },
};

describe('bench report', () => {
	it('reads a k6 summary into a step', () => {
		expect(parseK6Summary('direct', 1000, K6_METRICS)).toEqual({
			target: 'direct',
			offeredRps: 1000,
			achievedRps: 999,
			errorRate: 0.0005,
			p50Ms: 0.8,
			p95Ms: 1.9,
			p99Ms: 3.2,
			droppedIterations: 10,
		});
	});

	it('takes a summary without dropped iterations as none, and refuses one without durations', () => {
		const { dropped_iterations: _dropped, ...withoutDropped } = K6_METRICS;

		expect(parseK6Summary('direct', 1000, withoutDropped).droppedIterations).toBe(0);
		expect(() => parseK6Summary('direct', 1000, { http_reqs: K6_METRICS.http_reqs })).toThrow('http_req_duration');
		expect(() => parseK6Summary('direct', 1000, { ...K6_METRICS, http_reqs: { values: { rate: 'fast' } } })).toThrow('rate');
	});

	it('calls a step healthy only when it kept up, without errors and within the p99 budget', () => {
		expect(isHealthyStep(step(1000))).toBe(true);
		expect(isHealthyStep(step(1000, { achievedRps: 900 }))).toBe(false);
		expect(isHealthyStep(step(1000, { errorRate: 0.01 }))).toBe(false);
		expect(isHealthyStep(step(1000, { p99Ms: 120 }))).toBe(false);
	});

	it('puts the knee at the last healthy step before the first failure, ignoring a lucky one after it', () => {
		const steps = [step(1000), step(2000), step(4000, { p99Ms: 200 }), step(6000)];

		expect(kneeOf(steps)?.offeredRps).toBe(2000);
		expect(kneeOf([step(1000, { errorRate: 1 })])).toBeNull();
		expect(kneeOf([step(1000), step(2000)])?.offeredRps).toBe(2000);
	});

	it('stops a target after two failed steps in a row', () => {
		const failed = step(8000, { p99Ms: 500 });

		expect(shouldStopTarget([step(1000), failed])).toBe(false);
		expect(shouldStopTarget([failed])).toBe(false);
		expect(shouldStopTarget([step(1000), failed, failed])).toBe(true);
	});

	it('writes a summary per target and every step', () => {
		const steps = [step(1000), step(2000, { p99Ms: 90 }), step(1000, { target: 'direct', p50Ms: 0.25 })];
		const report = renderReport({
			title: 'Benchmark',
			environment: ['a machine'],
			targets: ['pyle-open', 'direct', 'nginx-1-worker'],
			steps,
			referenceRps: 1000,
		});

		expect(report).toContain('- a machine');
		expect(report).toContain('| pyle-open | 1,000 | 1.00 ms | 4.00 ms |');
		expect(report).toContain('| direct | 1,000 | 0.25 ms | 4.00 ms |');
		expect(report).toContain('| nginx-1-worker | below the first step | - | - |');
		expect(report).toContain('| pyle-open | 2,000 | 2,000 | 0.00% | 1.00 ms | 2.00 ms | 90.00 ms | 0 |');
	});
});
