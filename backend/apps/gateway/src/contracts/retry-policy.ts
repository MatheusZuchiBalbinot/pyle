import type { AttemptOutcome } from './attempt-observer.js';

export type RetryDecisionInput = {
	readonly method: string;
	readonly hasRequestBody: boolean;
	readonly outcome: AttemptOutcome;
	// 1-based: the attempt that just ended.
	readonly attemptNumber: number;
	readonly maxAttempts: number;
	readonly remainingBudgetMs: number;
};

export interface RetryPolicy {
	shouldRetry(input: RetryDecisionInput): boolean;
}

export class NoRetryPolicy implements RetryPolicy {
	shouldRetry(): boolean {
		return false;
	}
}
