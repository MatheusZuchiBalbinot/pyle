import type { RunTotals } from './bot-summary.js';

// What a run must stay within to pass (--max-p95-ms, --max-error-rate); null: not checked.
export type RunBudget = { readonly maxP95Ms: number | null; readonly maxServerErrorRate: number | null };

const PERCENT_FACTOR = 100;

export function formatPercent(rate: number): string {
	return `${(rate * PERCENT_FACTOR).toFixed(2)}%`;
}

// One line per limit the run went over; empty when it passed.
export function budgetViolations(totals: RunTotals, budget: RunBudget): readonly string[] {
	if (totals.requests === 0) {
		return ['no request completed'];
	}

	const violations: string[] = [];
	const isSlow = budget.maxP95Ms !== null && totals.p95Ms !== null && totals.p95Ms > budget.maxP95Ms;

	if (isSlow) {
		violations.push(`p95 ${totals.p95Ms} ms is over the ${budget.maxP95Ms} ms budget`);
	}

	const isFailing = budget.maxServerErrorRate !== null && totals.serverErrorRate > budget.maxServerErrorRate;

	if (isFailing) {
		violations.push(`server errors ${formatPercent(totals.serverErrorRate)} are over the ${formatPercent(budget.maxServerErrorRate ?? 0)} budget`);
	}

	return violations;
}
