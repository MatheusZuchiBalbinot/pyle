import { readPositiveIntEnv } from '@pyle/shared/config/env-parsing.js';

const DEFAULT_READ_NOTIFICATION_RETENTION_DAYS = 90;
const DEFAULT_SYSTEM_HEALTH_EVENT_RETENTION_DAYS = 180;

// Unread notifications are never purged.
export function getReadNotificationRetentionDays(): number {
	return readPositiveIntEnv('READ_NOTIFICATION_RETENTION_DAYS', DEFAULT_READ_NOTIFICATION_RETENTION_DAYS);
}

export function getSystemHealthEventRetentionDays(): number {
	return readPositiveIntEnv('SYSTEM_HEALTH_EVENT_RETENTION_DAYS', DEFAULT_SYSTEM_HEALTH_EVENT_RETENTION_DAYS);
}
