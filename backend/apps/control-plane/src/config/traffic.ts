import { readPositiveIntEnv } from '@pyle/shared/config/env-parsing.js';

const DEFAULT_TRAFFIC_RETENTION_HOURS = 24;
const DEFAULT_CONSUMER_PURGE_AFTER_DAYS = 30;
const DEFAULT_ALERT_EVALUATION_INTERVAL_MS = 10_000;

// Every read window, the AI tools included, is capped by this.
export function getTrafficRetentionHours(): number {
	return readPositiveIntEnv('TRAFFIC_RETENTION_HOURS', DEFAULT_TRAFFIC_RETENTION_HOURS);
}

// Long enough to undo a mistaken deletion.
export function getConsumerPurgeAfterDays(): number {
	return readPositiveIntEnv('CONSUMER_PURGE_AFTER_DAYS', DEFAULT_CONSUMER_PURGE_AFTER_DAYS);
}

// Matches the 10 s traffic bucket: evaluating faster sees no new data.
export function getAlertEvaluationIntervalMs(): number {
	return readPositiveIntEnv('ALERT_EVALUATION_INTERVAL_MS', DEFAULT_ALERT_EVALUATION_INTERVAL_MS);
}
