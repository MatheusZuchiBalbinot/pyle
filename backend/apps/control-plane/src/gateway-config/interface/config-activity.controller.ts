import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { toPageRequest, type Page } from '../../common/pagination.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { ConfigActivityService } from '../application/config-activity.service.js';
import { ConfigActivityQueryDto } from './dto/config-activity-query.dto.js';
import { ConfigChangeEventPageDto, type ConfigChangeEventDto } from './dto/gateway-config-responses.js';

@ApiTags('gateway-config')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@Controller('admin/activity')
export class ConfigActivityController {
	constructor(private readonly activity: ConfigActivityService) {}

	@ApiOperation({ summary: 'The configuration audit trail, newest first, optionally for one entity (cursor pagination)' })
	@ApiOkResponse({ type: ConfigChangeEventPageDto })
	@Get()
	list(@Query() query: ConfigActivityQueryDto): Promise<Page<ConfigChangeEventDto>> {
		return this.activity.list({ entityType: query.entityType, entityId: query.entityId }, toPageRequest(query));
	}
}
