import { describe, expect, it } from 'vitest';

import { budgetViolations } from './budget.js';

const NO_BUDGET = { maxP95Ms: null, maxServerErrorRate: null };

describe('budgetViolations', () => {
	it('passes a run within its limits, and checks nothing without limits', () => {
		const totals = { requests: 1000, p95Ms: 40, serverErrorRate: 0.001 };

		expect(budgetViolations(totals, { maxP95Ms: 250, maxServerErrorRate: 0.01 })).toEqual([]);
		expect(budgetViolations({ ...totals, p95Ms: 9000, serverErrorRate: 1 }, NO_BUDGET)).toEqual([]);
	});

	it('names each limit the run went over', () => {
		const totals = { requests: 1000, p95Ms: 300, serverErrorRate: 0.05 };

		expect(budgetViolations(totals, { maxP95Ms: 250, maxServerErrorRate: 0.01 })).toEqual([
			'p95 300 ms is over the 250 ms budget',
			'server errors 5.00% are over the 1.00% budget',
		]);
	});

	it('fails a run where nothing completed, whatever the limits', () => {
		expect(budgetViolations({ requests: 0, p95Ms: null, serverErrorRate: 0 }, NO_BUDGET)).toEqual(['no request completed']);
	});
});
