import type { AttemptOutcome } from '../contracts/attempt-observer.js';
import type { RetryDecisionInput, RetryPolicy } from '../contracts/retry-policy.js';

const RETRYABLE_UPSTREAM_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

// Below this, another attempt could not finish anyway.
export const MIN_RETRY_BUDGET_MS = 50;

// Only requests safe to send twice, only for failures another instance could fix, only
// within the budget.
export class IdempotentRetryPolicy implements RetryPolicy {
	shouldRetry(input: RetryDecisionInput): boolean {
		const isSafeToRepeat = IDEMPOTENT_METHODS.has(input.method.toUpperCase()) && !input.hasRequestBody;
		const hasAttemptsLeft = input.attemptNumber < input.maxAttempts;
		const hasBudgetLeft = input.remainingBudgetMs >= MIN_RETRY_BUDGET_MS;

		return isSafeToRepeat && hasAttemptsLeft && hasBudgetLeft && isRetryableOutcome(input.outcome);
	}
}

function isRetryableOutcome(outcome: AttemptOutcome): boolean {
	if (outcome.kind === 'response') {
		return RETRYABLE_UPSTREAM_STATUSES.has(outcome.status);
	}

	return outcome.kind === 'connection_error' || outcome.kind === 'timeout';
}
