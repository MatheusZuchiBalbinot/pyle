import type { AdminNotificationCategory } from '@prisma/control-plane-client';
import { IsIn, IsOptional } from 'class-validator';

import { PageQueryDto } from '../../../common/dto/page-query.dto.js';
import type { NotificationReadFilter } from '../../infrastructure/admin-notification.repository.js';

const CATEGORIES: readonly AdminNotificationCategory[] = ['traffic', 'instance', 'system', 'ai'];
const READ_FILTERS: readonly NotificationReadFilter[] = ['unread', 'read', 'all'];

export class ListNotificationsQueryDto extends PageQueryDto {
	@IsOptional()
	@IsIn(CATEGORIES)
	category?: AdminNotificationCategory;

	@IsOptional()
	@IsIn(READ_FILTERS)
	read?: NotificationReadFilter;
}
