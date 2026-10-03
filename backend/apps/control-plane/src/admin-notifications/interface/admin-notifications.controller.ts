import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { UuidParamDto } from '../../common/dto/path-params.dto.js';
import { toPageRequest } from '../../common/pagination.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { AdminNotificationsService } from '../application/admin-notifications.service.js';
import { AdminNotificationsPageDto } from './dto/admin-notification.dto.js';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto.js';

@ApiTags('notifications')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@Controller('admin/notifications')
export class AdminNotificationsController {
	constructor(private readonly notifications: AdminNotificationsService) {}

	@ApiOperation({ summary: 'A page of the console inbox: persisted admin events, newest first, plus the whole inbox’s unread count' })
	@ApiOkResponse({ type: AdminNotificationsPageDto })
	@Get()
	list(@Query() query: ListNotificationsQueryDto): Promise<AdminNotificationsPageDto> {
		return this.notifications.list({ category: query.category, read: query.read }, toPageRequest(query));
	}

	@ApiOperation({ summary: 'Mark every unread notification as read' })
	@ApiNoContentResponse()
	@Post('read-all')
	@HttpCode(HttpStatus.NO_CONTENT)
	async markAllRead(): Promise<void> {
		await this.notifications.markAllRead();
	}

	@ApiOperation({ summary: 'Mark one notification as read' })
	@ApiNoContentResponse()
	@Post(':id/read')
	@HttpCode(HttpStatus.NO_CONTENT)
	markRead(@Param() { id }: UuidParamDto): Promise<void> {
		return this.notifications.setRead(id, true);
	}

	@ApiOperation({ summary: 'Mark one notification as unread again' })
	@ApiNoContentResponse()
	@Post(':id/unread')
	@HttpCode(HttpStatus.NO_CONTENT)
	markUnread(@Param() { id }: UuidParamDto): Promise<void> {
		return this.notifications.setRead(id, false);
	}
}
